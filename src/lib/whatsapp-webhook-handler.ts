import { NextRequest, NextResponse } from "next/server";
import { verifyHubSignature256 } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { runSalesAgent, isSalesAgentConfigured } from "@/lib/ai/run-sales-agent";
import type { AgentContext } from "@/lib/ai/sales-tools";
import {
  tryDirectProductImageReply,
  tryDirectProductReply,
  looksLikeProductInquiry,
  tryDirectVariantSelectionReply,
} from "@/lib/ai/product-reply";
import { tryDirectCheckoutReply } from "@/lib/ai/checkout-reply";
import { looksLikeCheckoutMessage } from "@/lib/ai/checkout-parse";
import {
  looksLikeVariantSelection,
  formatVariantOptionReprompt,
} from "@/lib/ai/variant-selection";
import {
  tryDirectSalesRecoveryReply,
  looksLikeOrderDecline,
} from "@/lib/ai/sales-recovery";
import { getRecentChatHistory, getStoreChatContextLimits } from "@/lib/ai/chat-history";
import {
  getAiSessionResetAt,
  resolveAiContextSinceIso,
} from "@/lib/ai/session-reset";
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
import { buildCasualGreetingReply, tryDirectOffTopicReply } from "@/lib/ai/greeting-reply";
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
import {
  inboundMessagePreview,
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
): Promise<{ ok: true } | { ok: false; error: string }> {
  const waCreds = getStoreWhatsAppCredentials(activeStore);
  if (!waCreds) {
    const error =
      "Cannot send reply — missing phone ID or access token. Reconnect WhatsApp in Integrations.";
    console.error(`[whatsapp-webhook] ${error}`);
    return { ok: false, error };
  }

  const to = normalizePhone(customerPhone);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  try {
    let imagesSent = 0;
    for (const imageUrl of imageUrls.slice(0, 3)) {
      try {
        await sendWhatsAppImage({
          phoneNumberId: waCreds.phoneNumberId,
          accessToken: waCreds.accessToken,
          to,
          imageUrl,
        });
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
      await sendWhatsAppText({
        phoneNumberId: waCreds.phoneNumberId,
        accessToken: waCreds.accessToken,
        to,
        text,
      });
    }
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "WhatsApp send failed";
    console.error("[whatsapp-webhook] sendWhatsAppText failed:", error);
    return { ok: false, error };
  }
}

async function resolveContextualDirectReply(
  agentCtx: AgentContext,
  inboundText: string,
  chatHistory: Array<{ role: "user" | "assistant"; content: string }>,
  greetingCtx: AgentContext
): Promise<string> {
  const imageReply = await tryDirectProductImageReply(
    agentCtx,
    inboundText,
    chatHistory
  );
  if (imageReply) return imageReply;

  if (looksLikeOrderDecline(inboundText)) {
    const recovery = await tryDirectSalesRecoveryReply(
      agentCtx,
      inboundText,
      chatHistory
    );
    if (recovery) return recovery;
  }

  if (looksLikeCheckoutMessage(inboundText, chatHistory)) {
    const checkout = await tryDirectCheckoutReply(
      agentCtx,
      inboundText,
      chatHistory
    );
    if (checkout) return checkout;
  }

  if (looksLikeVariantSelection(inboundText, chatHistory)) {
    const variant = await tryDirectVariantSelectionReply(
      agentCtx,
      inboundText,
      chatHistory
    );
    if (variant) return variant;
    const reprompt = formatVariantOptionReprompt(chatHistory);
    if (reprompt) return reprompt;
  }

  const direct = await tryDirectProductReply(agentCtx, inboundText, chatHistory);
  return (
    direct?.reply ??
    tryDirectOffTopicReply(greetingCtx, inboundText) ??
    buildCasualGreetingReply(greetingCtx)
  );
}

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
            referral?: {
              ctwa_clid?: string;
              source_type?: string;
            };
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

      if (!phoneNumberId || messages.length === 0) continue;

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

          const inboundPreview = inboundMessagePreview(
            msg.type,
            msg.text?.body
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

          if (msg.type !== "text" || !msg.text?.body) {
            continue;
          }

          const inboundText = msg.text.body;

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

          if (isNewConversation && !looksLikeProductInquiry(inboundText)) {
            try {
              const aiSettings = await resolveStoreAiConfig(activeStore.id);
              if (
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
                // Only show in portal if WhatsApp accepted the message
                if (openingResult.ok) {
                  await supabase.from("whatsapp_messages").insert({
                    conversation_id: conversation.id,
                    direction: "out",
                    content: openingText,
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
                  const chatLimits = await getStoreChatContextLimits(
                    activeStore.id
                  );
                  const chatHistory = await getRecentChatHistory(
                    conversation.id,
                    chatLimits.historyLimit,
                    chatLimits.windowMs,
                    aiContextSince
                  );

                  replyText = await runSalesAgent(
                    {
                      store: activeStore,
                      conversationId: conversation.id,
                      customerPhone,
                      customerId: conversation.customer_id,
                      adProductContext,
                    },
                    chatHistory
                  );
                }
              } catch (agentErr) {
                console.error("[whatsapp-webhook] AI agent error:", agentErr);
                try {
                  const chatLimits = await getStoreChatContextLimits(
                    activeStore.id
                  );
                  const chatHistory = await getRecentChatHistory(
                    conversation.id,
                    chatLimits.historyLimit,
                    chatLimits.windowMs,
                    aiContextSince
                  );
                  const agentCtx = {
                    store: activeStore,
                    conversationId: conversation.id,
                    customerPhone,
                    customerId: conversation.customer_id,
                    adProductContext,
                  };
                  const aiSettings = await resolveStoreAiConfig(activeStore.id);
                  const greetingCtx = { ...agentCtx, aiConfig: aiSettings };
                  replyText = await resolveContextualDirectReply(
                    agentCtx,
                    inboundText,
                    chatHistory,
                    greetingCtx
                  );
                } catch (fallbackErr) {
                  console.error(
                    "[whatsapp-webhook] direct product fallback failed:",
                    fallbackErr
                  );
                  const aiSettings = await resolveStoreAiConfig(activeStore.id);
                  replyText = buildCasualGreetingReply({
                    store: activeStore,
                    conversationId: conversation.id,
                    customerPhone,
                    customerId: conversation.customer_id,
                    adProductContext,
                    aiConfig: aiSettings,
                  });
                }
              }
            } else {
              console.error(
                "[whatsapp-webhook] No Gemini configured — set GEMINI_API_KEY or Admin → AI Defaults."
              );
              const chatLimits = await getStoreChatContextLimits(activeStore.id);
              const chatHistory = await getRecentChatHistory(
                conversation.id,
                chatLimits.historyLimit,
                chatLimits.windowMs,
                aiContextSince
              );
              const agentCtx = {
                store: activeStore,
                conversationId: conversation.id,
                customerPhone,
                customerId: conversation.customer_id,
                adProductContext,
              };
              const aiSettings = await resolveStoreAiConfig(activeStore.id);
              replyText = await resolveContextualDirectReply(
                { ...agentCtx, aiConfig: aiSettings },
                inboundText,
                chatHistory,
                { ...agentCtx, aiConfig: aiSettings }
              );
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
