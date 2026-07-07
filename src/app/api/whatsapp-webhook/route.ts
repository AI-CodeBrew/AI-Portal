import { NextRequest, NextResponse } from "next/server";
import { verifyHubSignature256 } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { runSalesAgent } from "@/lib/anthropic/agent";
import {
  getStoreWhatsAppCredentials,
  resolveMetaSecret,
  sendWhatsAppText,
  normalizePhone,
} from "@/lib/whatsapp";
import type { Store } from "@/lib/types";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const storeId = request.nextUrl.searchParams.get("store");

  if (mode === "subscribe" && token && challenge) {
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
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  appSecret: string | null
): boolean {
  if (!appSecret) return !signature;
  return verifyHubSignature256(rawBody, signature, appSecret);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("X-Hub-Signature-256") ?? "";

  const body = JSON.parse(rawBody) as {
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

  if (body.object !== "whatsapp_business_account") {
    return NextResponse.json({ ok: true });
  }

  const supabase = createAdminClient();

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      const messages = change.value?.messages ?? [];

      if (!phoneNumberId || messages.length === 0) continue;

      const { data: store } = await supabase
        .from("stores")
        .select("*")
        .eq("whatsapp_phone_number_id", phoneNumberId)
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

      if (!activeStore) continue;

      const storeSecret = resolveMetaSecret(activeStore.meta_app_secret ?? null);
      const envSecret = process.env.META_APP_SECRET ?? null;
      const verified =
        verifyWebhookSignature(rawBody, signature, storeSecret) ||
        (envSecret ? verifyWebhookSignature(rawBody, signature, envSecret) : false);

      if ((storeSecret || envSecret) && !verified) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }

      for (const msg of messages) {
        if (msg.type !== "text" || !msg.text?.body) continue;

        const customerPhone = normalizePhone(msg.from);
        const inboundText = msg.text.body;

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

        if (conversation.status === "human_handoff") {
          continue;
        }

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

        let replyText: string;
        if (process.env.ANTHROPIC_API_KEY) {
          replyText = await runSalesAgent(
            {
              store: activeStore,
              conversationId: conversation.id,
              customerPhone,
              customerId: conversation.customer_id,
            },
            chatHistory
          );
        } else {
          replyText =
            "Thanks for your message! Our AI agent is being configured. A team member will respond shortly.";
        }

        const waCreds = getStoreWhatsAppCredentials(activeStore);
        if (waCreds) {
          await sendWhatsAppText({
            phoneNumberId: waCreds.phoneNumberId,
            accessToken: waCreds.accessToken,
            to: customerPhone,
            text: replyText,
          });
        }

        await supabase.from("whatsapp_messages").insert({
          conversation_id: conversation.id,
          direction: "out",
          content: replyText,
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
