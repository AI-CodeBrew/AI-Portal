import { NextRequest, NextResponse } from "next/server";
import { verifyHubSignature256 } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { runSalesAgent, isSalesAgentConfigured } from "@/lib/ai/run-sales-agent";
import {
  getStoreWhatsAppCredentials,
  resolveMetaSecret,
  sendWhatsAppText,
  normalizePhone,
} from "@/lib/whatsapp";
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
  text: string
): Promise<boolean> {
  const waCreds = getStoreWhatsAppCredentials(activeStore);
  if (!waCreds) {
    console.error(
      "[whatsapp-webhook] Cannot send reply — missing phone ID or access token. Reconnect WhatsApp in Integrations."
    );
    return false;
  }

  try {
    await sendWhatsAppText({
      phoneNumberId: waCreds.phoneNumberId,
      accessToken: waCreds.accessToken,
      to: customerPhone,
      text,
    });
    return true;
  } catch (err) {
    console.error("[whatsapp-webhook] sendWhatsAppText failed:", err);
    return false;
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
      const envSecret = process.env.META_APP_SECRET ?? null;
      const verified =
        (storeSecret && verifyWebhookSignature(rawBody, signature, storeSecret)) ||
        (envSecret && verifyWebhookSignature(rawBody, signature, envSecret));

      if ((storeSecret || envSecret) && !verified) {
        console.error(
          "[whatsapp-webhook] Invalid signature — check Meta App Secret in Integrations → WhatsApp matches your Meta app."
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

          let replyText: string;

          if (isSalesAgentConfigured()) {
            try {
              const { data: history } = await supabase
                .from("whatsapp_messages")
                .select("direction, content")
                .eq("conversation_id", conversation.id)
                .order("created_at", { ascending: true })
                .limit(20);

              const chatHistory = (history ?? []).map((m) => ({
                role: (m.direction === "in" ? "user" : "assistant") as
                  | "user"
                  | "assistant",
                content: m.content,
              }));

              replyText = await runSalesAgent(
                {
                  store: activeStore,
                  conversationId: conversation.id,
                  customerPhone,
                  customerId: conversation.customer_id,
                },
                chatHistory
              );
            } catch (agentErr) {
              console.error("[whatsapp-webhook] AI agent error:", agentErr);
              replyText =
                "Thanks for your message! How can I help you today? Ask me about our products or your order.";
            }
          } else {
            console.error(
              "[whatsapp-webhook] GROQ_API_KEY not set — add it in Vercel env vars and redeploy."
            );
            replyText =
              "Thanks for your message! Our team will get back to you shortly.";
          }

          const sent = await sendReply(activeStore, customerPhone, replyText);

          await supabase.from("whatsapp_messages").insert({
            conversation_id: conversation.id,
            direction: "out",
            content: replyText,
          });

          if (!sent) {
            console.error(
              `[whatsapp-webhook] Reply saved to inbox but not sent to ${customerPhone}`
            );
          }
        } catch (err) {
          console.error("[whatsapp-webhook] Message processing error:", err);
          await sendReply(
            activeStore,
            customerPhone,
            "Thanks for your message! Our team will respond shortly."
          );
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
