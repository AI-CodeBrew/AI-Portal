import { NextRequest, NextResponse } from "next/server";
import { verifyHubSignature256 } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { runSalesAgent, isSalesAgentConfigured } from "@/lib/ai/run-sales-agent";
import {
  tryDirectProductImageReply,
  tryDirectProductReply,
} from "@/lib/ai/product-reply";
import { getRecentChatHistory, getStoreChatContextLimits } from "@/lib/ai/chat-history";
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
import {
  getStoreWhatsAppCredentials,
  resolveMetaSecret,
  sendWhatsAppText,
  sendWhatsAppImage,
  normalizePhone,
} from "@/lib/whatsapp";
import { getPlatformMetaCredentials } from "@/lib/platform/meta-settings";
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
        if (msg.type !== "text" || !msg.text?.body) continue;

        const customerPhone = normalizePhone(msg.from);
        const inboundText = msg.text.body;

        try {
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

          if (!conversation) {
            const { data: newConv } = await supabase
              .from("whatsapp_conversations")
              .insert({
                store_id: activeStore.id,
                customer_phone: customerPhone,
                status: "ai_handling",
              })
              .select("*")
              .single();
            conversation = newConv;
            isNewConversation = true;
          }

          if (!conversation) continue;

          await supabase.from("whatsapp_messages").insert({
            conversation_id: conversation.id,
            direction: "in",
            content: inboundText,
          });

          await supabase
            .from("whatsapp_conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", conversation.id);

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

          if (isNewConversation) {
            try {
              const aiSettings = await resolveStoreAiConfig(activeStore.id);
              const opening = aiSettings.openingMessage?.trim();
              if (opening) {
                const storeName =
                  activeStore.store_name ||
                  activeStore.shop_domain?.replace(/\.myshopify\.com$/i, "") ||
                  "our store";
                const agentName =
                  aiSettings.agentName?.trim() || storeName;
                const openingText = personalizeOpeningMessage(opening, {
                  agentName,
                  storeName,
                });
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

          let replyText: string;

          if (isSalesAgentConfigured()) {
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
                  chatLimits.windowMs
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
                  chatLimits.windowMs
                );
                const agentCtx = {
                  store: activeStore,
                  conversationId: conversation.id,
                  customerPhone,
                  customerId: conversation.customer_id,
                  adProductContext,
                };
                const imageReply = await tryDirectProductImageReply(
                  agentCtx,
                  inboundText,
                  chatHistory
                );
                if (imageReply) {
                  replyText = imageReply;
                } else {
                  const direct = await tryDirectProductReply(
                    agentCtx,
                    inboundText
                  );
                  replyText =
                    direct?.reply ??
                    "Hey — send me the product name or SKU and I'll pull it up for you.";
                }
              } catch (fallbackErr) {
                console.error(
                  "[whatsapp-webhook] direct product fallback failed:",
                  fallbackErr
                );
                replyText =
                  "Hey — send me the product name or SKU and I'll pull it up for you.";
              }
            }
          } else {
            console.error(
              "[whatsapp-webhook] GROQ_API_KEY not set — add it in Vercel env vars and redeploy."
            );
            replyText =
              "Thanks for your message! Our team will get back to you shortly.";
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
