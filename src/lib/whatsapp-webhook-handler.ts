import { NextRequest, NextResponse } from "next/server";
import { verifyHubSignature256 } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { runSalesAgent, isSalesAgentConfigured } from "@/lib/ai/run-sales-agent";
import { getRecentChatHistory } from "@/lib/ai/chat-history";
import {
  getAiSessionResetAt,
  resolveAiContextSinceIso,
} from "@/lib/ai/session-reset";
import {
  buildAgentMemoryContext,
  updateProfileFromTurn,
} from "@/lib/memory/agent-memory-context";
import { resolveAgentChatHistory } from "@/lib/memory/conversation-compaction";
import { extractAndStoreMemories } from "@/lib/memory/mem0-client";
import { buildSalesSessionKey } from "@/lib/memory/session-key";
import { MEMORY_DEFAULTS } from "@/lib/memory/types";
import { quotaLimitMessage } from "@/lib/ai/plans";
import { tryConsumeAiQuota } from "@/lib/ai/quota";
import {
  getStoreSpamLimits,
  isConversationAiExhausted,
  nextAiReplySpamState,
} from "@/lib/ai/conversation-spam";
import {
  resolveStoreAiConfig,
  personalizeOpeningMessage,
} from "@/lib/ai/store-ai-settings";
import {
  resolveAdProductContext,
  resolveAdLinkBySlug,
} from "@/lib/ads/ad-links-service";
import { parseAdRefFromMessage } from "@/lib/ads/whatsapp-ad-links";
import { extractOutboundMedia } from "@/lib/ai/message-markers";
import { looksLikeExactGreetingOnly } from "@/lib/ai/greeting-reply";
import {
  getStoreWhatsAppCredentials,
  resolveMetaSecret,
  sendWhatsAppText,
  sendWhatsAppImage,
  normalizePhone,
} from "@/lib/whatsapp";
import { startTypingIndicatorRefresh } from "@/lib/whatsapp/sendTypingIndicator";
import { getPlatformMetaCredentials } from "@/lib/platform/meta-settings";
import { recordInboundWhatsappMessage, claimWhatsappWebhookDelivery } from "@/lib/whatsapp-inbound-message";
import { resolveInboundText } from "@/lib/whatsapp/resolve-inbound-text";
import { VOICE_NOTE_UNCLEAR_REPLY } from "@/lib/ai/transcribe-audio";
import {
  isCtwaReferral,
  resolveWindowTypeOnInbound,
} from "@/lib/whatsapp-window/conversation-window";
import type { WindowType } from "@/lib/whatsapp-window/window-status";
import type { Store } from "@/lib/types";

function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  appSecret: string | null
): boolean {
  if (!appSecret) return false;
  if (!signature?.startsWith("sha256=")) return false;
  return verifyHubSignature256(rawBody, signature, appSecret);
}

async function sendReply(
  activeStore: Store,
  customerPhone: string,
  text: string,
  imageUrls: string[] = []
): Promise<
  | { ok: true; metaMessageId: string | null }
  | { ok: false; error: string }
> {
  const waCreds = getStoreWhatsAppCredentials(activeStore);
  if (!waCreds) {
    const error =
      "Cannot send reply — missing phone ID or access token. Reconnect WhatsApp in Integrations.";
    console.error(`[whatsapp-webhook] ${error}`);
    return { ok: false, error };
  }

  const to = normalizePhone(customerPhone);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  let metaMessageId: string | null = null;
  try {
    let imagesSent = 0;
    for (const imageUrl of imageUrls.slice(0, 3)) {
      try {
        const imgResult = await sendWhatsAppImage({
          phoneNumberId: waCreds.phoneNumberId,
          accessToken: waCreds.accessToken,
          to,
          imageUrl,
        });
        metaMessageId = imgResult.id;
        imagesSent += 1;
        // Meta accepts image async — wait so it usually lands before the text
        await sleep(1500);
      } catch (imgErr) {
        console.error(
          `[whatsapp-webhook] image send failed (${imageUrl}):`,
          imgErr
        );
      }
    }

    if (text.trim()) {
      if (imagesSent > 0) {
        await sleep(500);
      }
      const textResult = await sendWhatsAppText({
        phoneNumberId: waCreds.phoneNumberId,
        accessToken: waCreds.accessToken,
        to,
        text,
      });
      metaMessageId = textResult.id;
    }
    return { ok: true, metaMessageId };
  } catch (err) {
    const error = err instanceof Error ? err.message : "WhatsApp send failed";
    console.error("[whatsapp-webhook] sendWhatsAppText failed:", error);
    return { ok: false, error };
  }
}

const STATUS_RANK: Record<string, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

async function applyStatusUpdate(
  supabase: ReturnType<typeof createAdminClient>,
  status: {
    id: string;
    status: "sent" | "delivered" | "read" | "failed";
    errors?: Array<{
      code?: number;
      title?: string;
      message?: string;
      error_data?: { details?: string };
    }>;
  }
): Promise<void> {
  const { data: existing } = await supabase
    .from("whatsapp_messages")
    .select("id, status")
    .eq("meta_message_id", status.id)
    .maybeSingle();

  if (!existing) return; // no matching outbound message (e.g. sent before this feature existed)

  const currentRank = STATUS_RANK[(existing.status as string) ?? ""] ?? 0;
  const nextRank = STATUS_RANK[status.status] ?? 0;
  if (nextRank < currentRank) return; // ignore out-of-order/duplicate retries

  const firstError = status.errors?.[0];
  await supabase
    .from("whatsapp_messages")
    .update({
      status: status.status,
      status_error_code: firstError?.code ?? null,
      status_error_message: firstError
        ? firstError.error_data?.details || firstError.message || firstError.title || null
        : null,
      status_updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);
}

const AGENT_UNAVAILABLE_REPLY =
  "Sorry, I'm having a bit of trouble — a team member will jump in shortly.";

export async function handleWhatsAppWebhookVerify(
  request: NextRequest,
  storeId?: string
): Promise<NextResponse> {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (storeId) {
    const supabase = createAdminClient();
    const { data: store } = await supabase
      .from("stores")
      .select("whatsapp_verify_token")
      .eq("id", storeId)
      .maybeSingle();

    if (store?.whatsapp_verify_token === token) {
      return new NextResponse(challenge, { status: 200 });
    }
  }

  const platform = await getPlatformMetaCredentials();
  if (platform?.verifyToken && token === platform.verifyToken) {
    return new NextResponse(challenge, { status: 200 });
  }

  if (token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function handleWhatsAppWebhookMessage(
  request: NextRequest
): Promise<NextResponse> {
  const rawBody = await request.text();
  const signature = request.headers.get("X-Hub-Signature-256") ?? "";

  let body: {
    object?: string;
    entry?: Array<{
      id: string;
      changes?: Array<{
        value?: {
          metadata?: { phone_number_id?: string; display_phone_number?: string };
          messages?: Array<{
            from: string;
            id: string;
            type: string;
            text?: { body: string };
            audio?: { id: string; mime_type?: string; voice?: boolean };
            referral?: {
              ctwa_clid?: string;
              source_type?: string;
            };
          }>;
          statuses?: Array<{
            id: string;
            status: "sent" | "delivered" | "read" | "failed";
            timestamp?: string;
            errors?: Array<{
              code?: number;
              title?: string;
              message?: string;
              error_data?: { details?: string };
            }>;
          }>;
        };
      }>;
    }>;
  };

  try {
    body = JSON.parse(rawBody);
  } catch {
    console.error("[whatsapp-webhook] Invalid JSON body");
    return NextResponse.json({ ok: true });
  }

  if (body.object !== "whatsapp_business_account") {
    return NextResponse.json({ ok: true });
  }

  console.log(
    `[whatsapp-webhook] POST received, entries=${body.entry?.length ?? 0}`
  );

  const supabase = createAdminClient();

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      const messages = change.value?.messages ?? [];
      const statuses = change.value?.statuses ?? [];

      if (!phoneNumberId || (messages.length === 0 && statuses.length === 0)) {
        continue;
      }

      const { data: store } = await supabase
        .from("stores")
        .select("*")
        .eq("whatsapp_phone_number_id", String(phoneNumberId))
        .maybeSingle();

      let activeStore = store as Store | null;
      if (!activeStore && process.env.WHATSAPP_PHONE_NUMBER_ID === phoneNumberId) {
        const { data: firstStore } = await supabase
          .from("stores")
          .select("*")
          .limit(1)
          .maybeSingle();
        activeStore = firstStore as Store | null;
      }

      if (!activeStore) {
        console.error(
          `[whatsapp-webhook] No store for phone_number_id=${phoneNumberId}. Reconnect WhatsApp so Phone ID matches.`
        );
        continue;
      }

      const storeSecret = resolveMetaSecret(activeStore.meta_app_secret ?? null);
      const platform = await getPlatformMetaCredentials();
      const platformSecret = platform?.appSecret ?? null;
      const envSecret = process.env.META_APP_SECRET ?? null;
      const verified =
        (platformSecret &&
          verifyWebhookSignature(rawBody, signature, platformSecret)) ||
        (storeSecret &&
          verifyWebhookSignature(rawBody, signature, storeSecret)) ||
        (envSecret && verifyWebhookSignature(rawBody, signature, envSecret));

      if ((platformSecret || storeSecret || envSecret) && !verified) {
        console.error(
          "[whatsapp-webhook] Invalid signature — check Meta App Secret in Admin → WhatsApp Platform Setup."
        );
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }

      for (const status of statuses) {
        try {
          await applyStatusUpdate(supabase, status);
        } catch (err) {
          console.error(
            `[whatsapp-webhook] status update failed wamid=${status.id}:`,
            err
          );
        }
      }

      if (messages.length === 0) continue;

      for (const msg of messages) {
        const customerPhone = normalizePhone(msg.from);
        if (!customerPhone) continue;

        try {
          const claimed = await claimWhatsappWebhookDelivery(supabase, msg.id);
          if (!claimed) {
            console.log(
              `[whatsapp-webhook] duplicate webhook wamid=${msg.id}, skipping`
            );
            continue;
          }

          const { text: inboundText, preview: inboundPreview } =
            await resolveInboundText(msg, activeStore);

          const aiSessionResetAt = await getAiSessionResetAt(
            activeStore.id,
            customerPhone
          );

          let { data: conversation } = await supabase
            .from("whatsapp_conversations")
            .select("*")
            .eq("store_id", activeStore.id)
            .eq("customer_phone", customerPhone)
            .neq("status", "closed")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          let isNewConversation = false;

          if (
            conversation &&
            aiSessionResetAt &&
            new Date(String(conversation.created_at)) <
              new Date(aiSessionResetAt)
          ) {
            await supabase
              .from("whatsapp_conversations")
              .update({
                status: "closed",
                updated_at: new Date().toISOString(),
              })
              .eq("id", conversation.id);
            conversation = null;
          }

          if (!conversation) {
            const { data: newConv } = await supabase
              .from("whatsapp_conversations")
              .insert({
                store_id: activeStore.id,
                customer_phone: customerPhone,
                status: "ai_handling",
                ai_reply_count: 0,
                ai_exhausted: false,
              })
              .select("*")
              .single();
            conversation = newConv;
            isNewConversation = true;
          }

          if (!conversation) continue;

          const aiContextSince = resolveAiContextSinceIso(
            String(conversation.created_at),
            aiSessionResetAt
          );

          const inboundStatus = await recordInboundWhatsappMessage(supabase, {
            conversationId: conversation.id,
            content: inboundPreview,
            metaMessageId: msg.id,
          });

          if (inboundStatus === "duplicate") {
            console.log(
              `[whatsapp-webhook] duplicate wamid=${msg.id ?? "unknown"}, skipping`
            );
            continue;
          }

          if (inboundStatus === "failed") {
            console.error(
              `[whatsapp-webhook] could not persist inbound message — still updating window`
            );
          }

          const windowType = resolveWindowTypeOnInbound({
            isNewConversation,
            lastCustomerMessageAt:
              (conversation.last_customer_message_at as string | null) ?? null,
            currentWindowType:
              (conversation.window_type as WindowType | null) ?? "service",
            isAdReferral: isCtwaReferral(msg.referral),
          });
          const nowIso = new Date().toISOString();

          await supabase
            .from("whatsapp_conversations")
            .update({
              last_customer_message_at: nowIso,
              window_type: windowType,
              updated_at: nowIso,
            })
            .eq("id", conversation.id);

          conversation = {
            ...conversation,
            last_customer_message_at: nowIso,
            window_type: windowType,
          };

          if (!inboundText) {
            if (
              msg.type === "audio" &&
              conversation.status !== "human_handoff"
            ) {
              const unclearSent = await sendReply(
                activeStore,
                customerPhone,
                VOICE_NOTE_UNCLEAR_REPLY
              );
              if (unclearSent.ok) {
                await supabase.from("whatsapp_messages").insert({
                  conversation_id: conversation.id,
                  direction: "out",
                  content: VOICE_NOTE_UNCLEAR_REPLY,
                  meta_message_id: unclearSent.metaMessageId,
                  status: unclearSent.metaMessageId ? "sent" : null,
                });
              }
            }
            continue;
          }

          if (conversation.status === "human_handoff") {
            continue;
          }

          // Per-conversation AI reply limit (+ optional time window) → hand off
          {
            const limits = await getStoreSpamLimits(activeStore.id);
            if (
              isConversationAiExhausted(
                conversation as {
                  ai_reply_count?: number;
                  ai_reply_window_started_at?: string | null;
                },
                limits
              )
            ) {
              await supabase
                .from("whatsapp_conversations")
                .update({
                  status: "human_handoff",
                  ai_exhausted: true,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", conversation.id);
              const handoffText =
                "Thanks for messaging us! A team member will continue this chat with you shortly.";
              const handoffSent = await sendReply(
                activeStore,
                customerPhone,
                handoffText
              );
              if (handoffSent.ok) {
                await supabase.from("whatsapp_messages").insert({
                  conversation_id: conversation.id,
                  direction: "out",
                  content: handoffText,
                  meta_message_id: handoffSent.metaMessageId,
                  status: handoffSent.metaMessageId ? "sent" : null,
                });
              }
              continue;
            }
          }

          const adSlug = parseAdRefFromMessage(inboundText);
          if (adSlug) {
            const adLink = await resolveAdLinkBySlug(activeStore.id, adSlug);
            if (adLink) {
              await supabase
                .from("whatsapp_conversations")
                .update({ ad_link_id: adLink.id })
                .eq("id", conversation.id);
              conversation = { ...conversation, ad_link_id: adLink.id };
            }
          }

          const adProductContext = await resolveAdProductContext(
            activeStore.id,
            {
              messageText: inboundText,
              conversationAdLinkId:
                (conversation as { ad_link_id?: string | null }).ad_link_id ??
                null,
            }
          );

          let openingSentThisTurn = false;
          if (isNewConversation && looksLikeExactGreetingOnly(inboundText)) {
            try {
              // Don't re-send opening if this thread already has an outbound welcome
              const { count: priorOut } = await supabase
                .from("whatsapp_messages")
                .select("id", { count: "exact", head: true })
                .eq("conversation_id", conversation.id)
                .eq("direction", "out");

              const aiSettings = await resolveStoreAiConfig(activeStore.id);
              if (
                !priorOut &&
                aiSettings.sendOpeningMessage &&
                aiSettings.openingMessage?.trim()
              ) {
                const storeName =
                  activeStore.store_name ||
                  activeStore.shop_domain?.replace(/\.myshopify\.com$/i, "") ||
                  "our store";
                const agentName =
                  aiSettings.agentName?.trim() || storeName;
                const openingText = personalizeOpeningMessage(
                  aiSettings.openingMessage.trim(),
                  {
                    agentName,
                    storeName,
                  }
                );
                const openingResult = await sendReply(
                  activeStore,
                  customerPhone,
                  openingText
                );
                if (openingResult.ok) {
                  openingSentThisTurn = true;
                  await supabase.from("whatsapp_messages").insert({
                    conversation_id: conversation.id,
                    direction: "out",
                    content: openingText,
                    meta_message_id: openingResult.metaMessageId,
                    status: openingResult.metaMessageId ? "sent" : null,
                  });
                } else {
                  console.error(
                    `[whatsapp-webhook] Opening message not sent to ${customerPhone}: ${openingResult.error}`
                  );
                }
              }
            } catch (openingErr) {
              console.error("[whatsapp-webhook] Opening message error:", openingErr);
            }
          }

          // Opening / repeat hi — skip agent if only greeting (opening already sent)
          // or let agent return short "How can I help you?" for repeat hellos
          if (
            openingSentThisTurn &&
            looksLikeExactGreetingOnly(inboundText)
          ) {
            continue;
          }

          // Typing indicator + read receipt — before LLM / reply generation
          const waCreds = getStoreWhatsAppCredentials(activeStore);
          const stopTypingRefresh =
            waCreds && msg.id
              ? startTypingIndicatorRefresh({
                  phoneNumberId: waCreds.phoneNumberId,
                  messageId: msg.id,
                  accessToken: waCreds.accessToken,
                })
              : null;

          let replyText: string;

          try {
            if (await isSalesAgentConfigured()) {
              try {
                const quota = await tryConsumeAiQuota(activeStore.id);

                if (!quota.allowed) {
                  replyText = quotaLimitMessage(
                    quota.usage.plan,
                    quota.usage.used
                  );
                  console.log(
                    `[whatsapp-webhook] AI quota exceeded store=${activeStore.id} used=${quota.usage.used}/${quota.usage.limit}`
                  );
                } else {
                  // Full thread until ~70% budget; then summary + last 20 exact
                  const resolvedHistory = await resolveAgentChatHistory({
                    conversationId: conversation.id,
                    sinceIso: aiContextSince,
                  });
                  const chatHistory = resolvedHistory.history;

                  const memoryContext = await buildAgentMemoryContext({
                    storeId: activeStore.id,
                    customerPhone,
                    conversationId: conversation.id,
                    sinceIso: aiContextSince,
                    latestUserMessage: inboundText,
                    storeHistoryLimit: resolvedHistory.historyLimit,
                    rollingSummaryOverride: resolvedHistory.rollingSummary,
                  });

                  replyText = await runSalesAgent(
                    {
                      store: activeStore,
                      conversationId: conversation.id,
                      customerPhone,
                      customerId: conversation.customer_id,
                      adProductContext,
                      memoryContext,
                    },
                    chatHistory
                  );
                }
              } catch (agentErr) {
                console.error("[whatsapp-webhook] AI agent error:", agentErr);
                replyText = AGENT_UNAVAILABLE_REPLY;
              }
            } else {
              console.error(
                "[whatsapp-webhook] No Gemini configured — set GEMINI_API_KEY in env."
              );
              replyText = AGENT_UNAVAILABLE_REPLY;
            }
          } finally {
            stopTypingRefresh?.();
          }

          const { text: customerFacingText, imageUrls } =
            extractOutboundMedia(replyText);
          const sent = await sendReply(
            activeStore,
            customerPhone,
            customerFacingText,
            imageUrls
          );

          if (sent.ok) {
            await supabase.from("whatsapp_messages").insert({
              conversation_id: conversation.id,
              direction: "out",
              // Keep internal markers in stored history so recovery stage still works
              content: replyText,
              meta_message_id: sent.metaMessageId,
              status: sent.metaMessageId ? "sent" : null,
            });

            // Post-reply memory writeback (non-blocking): rules profile + Mem0 extract
            const historyForProfile = await getRecentChatHistory(
              conversation.id,
              MEMORY_DEFAULTS.recent_turn_limit,
              0,
              aiContextSince
            );
            void updateProfileFromTurn({
              storeId: activeStore.id,
              customerPhone,
              userMessage: inboundText,
              assistantReply: replyText,
              history: historyForProfile,
            });
            void extractAndStoreMemories({
              sessionKey: buildSalesSessionKey(activeStore.id, customerPhone),
              userMessage: inboundText,
              assistantReply: customerFacingText,
            });

            // Count AI replies toward per-conversation limit (+ optional window)
            const limitsAfter = await getStoreSpamLimits(activeStore.id);
            const spamNext = nextAiReplySpamState(
              conversation as {
                ai_reply_count?: number;
                ai_reply_window_started_at?: string | null;
              },
              limitsAfter
            );
            await supabase
              .from("whatsapp_conversations")
              .update({
                ai_reply_count: spamNext.ai_reply_count,
                ai_reply_window_started_at: spamNext.ai_reply_window_started_at,
                ...(spamNext.exhausted
                  ? {
                      status: "human_handoff",
                      ai_exhausted: true,
                    }
                  : {}),
                updated_at: new Date().toISOString(),
              })
              .eq("id", conversation.id);
          } else {
            console.error(
              `[whatsapp-webhook] AI reply NOT delivered to WhatsApp (${customerPhone}): ${sent.error}`
            );
            // Save a portal-only note so reseller can see the failure
            await supabase.from("whatsapp_messages").insert({
              conversation_id: conversation.id,
              direction: "out",
              content: `[Not delivered to WhatsApp] ${customerFacingText}\n\nError: ${sent.error}`,
              status: "failed",
              status_error_message: sent.error,
            });
          }
        } catch (err) {
          console.error("[whatsapp-webhook] Message processing error:", err);
          const fallback = await sendReply(
            activeStore,
            customerPhone,
            "Thanks for your message! Our team will respond shortly."
          );
          if (!fallback.ok) {
            console.error(
              `[whatsapp-webhook] Fallback reply also failed: ${fallback.error}`
            );
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
