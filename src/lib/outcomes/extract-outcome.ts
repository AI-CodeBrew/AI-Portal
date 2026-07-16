import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveLlmConfig, normalizeGeminiModel } from "@/lib/platform/llm-settings";
import { phoneVariants, normalizePhone } from "@/lib/phone";
import {
  buildExtractionUserPrompt,
  formatTranscript,
  parseExtractedOutcome,
} from "./transcript";
import { EXTRACTION_SYSTEM_PROMPT } from "./types";

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

async function callGeminiExtract(
  apiKey: string,
  model: string,
  transcript: string
): Promise<string> {
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: EXTRACTION_SYSTEM_PROMPT }] },
      contents: [
        {
          role: "user",
          parts: [{ text: buildExtractionUserPrompt(transcript) }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini extract failed: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() ?? "";

  if (!text) throw new Error("Gemini returned empty extraction");
  return text;
}

export type ExtractionCandidate = {
  conversationId: string;
  storeId: string;
  orderId: string;
};

export async function findOutcomeExtractionCandidates(
  limit = 20,
  storeId?: string
): Promise<ExtractionCandidate[]> {
  const supabase = createAdminClient();

  let ordersQuery = supabase
    .from("orders")
    .select("id, store_id, customer_id, status, source, confirmed_at, shipping_address")
    .eq("status", "confirmed")
    .eq("source", "whatsapp_ai")
    .order("confirmed_at", { ascending: false })
    .limit(limit * 5);

  if (storeId) {
    ordersQuery = ordersQuery.eq("store_id", storeId);
  }

  const { data: orders, error } = await ordersQuery;

  if (error || !orders?.length) return [];

  const candidates: ExtractionCandidate[] = [];

  for (const order of orders) {
    if (candidates.length >= limit) break;

    const orderStoreId = order.store_id as string;
    const customerId = order.customer_id as string | null;

    let phonesToMatch: string[] = [];
    if (customerId) {
      const { data: customer } = await supabase
        .from("customers")
        .select("phone")
        .eq("id", customerId)
        .maybeSingle();
      if (customer?.phone) {
        phonesToMatch = phoneVariants(String(customer.phone));
      }
    }

    const shipping = order.shipping_address as { phone?: string } | null;
    if (shipping?.phone) {
      phonesToMatch = [
        ...new Set([
          ...phonesToMatch,
          ...phoneVariants(String(shipping.phone)),
        ]),
      ];
    }

    if (!phonesToMatch.length) continue;

    const phoneSet = new Set(phonesToMatch.map(normalizePhone));

    const { data: conversations } = await supabase
      .from("whatsapp_conversations")
      .select("id, outcome_extracted, customer_phone, customer_id")
      .eq("store_id", orderStoreId)
      .eq("outcome_extracted", false)
      .order("updated_at", { ascending: false })
      .limit(20);

    const conv = conversations?.find((c) => {
      const convPhones = phoneVariants(String(c.customer_phone ?? ""));
      return convPhones.some((p) => phoneSet.has(normalizePhone(p)));
    });

    if (!conv?.id) continue;

    const { data: existing } = await supabase
      .from("conversation_outcomes")
      .select("id")
      .eq("conversation_id", conv.id)
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from("whatsapp_conversations")
        .update({ outcome_extracted: true, customer_id: customerId ?? conv.customer_id })
        .eq("id", conv.id);
      continue;
    }

    if (customerId && !conv.customer_id) {
      await supabase
        .from("whatsapp_conversations")
        .update({ customer_id: customerId })
        .eq("id", conv.id);
    }

    candidates.push({
      conversationId: conv.id as string,
      storeId: orderStoreId,
      orderId: order.id as string,
    });
  }

  return candidates;
}

export async function extractOutcomeForConversation(
  candidate: ExtractionCandidate
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();

  const { data: messages, error: msgError } = await supabase
    .from("whatsapp_messages")
    .select("direction, content, created_at")
    .eq("conversation_id", candidate.conversationId)
    .order("created_at", { ascending: true });

  if (msgError) return { ok: false, error: msgError.message };
  if (!messages?.length) return { ok: false, error: "No messages in conversation" };

  const transcript = formatTranscript(
    messages as Array<{ direction: string; content: string; created_at?: string }>
  );

  const llm = await getActiveLlmConfig();
  const apiKey = llm.geminiApiKey ?? process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "Gemini API key not configured for extraction" };
  }

  const model = normalizeGeminiModel(llm.geminiModel);

  let raw: string;
  try {
    raw = await callGeminiExtract(apiKey, model, transcript);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Gemini call failed",
    };
  }

  const parsed = parseExtractedOutcome(raw);
  if (!parsed) {
    return { ok: false, error: "Failed to parse extraction JSON" };
  }

  const { error: insertError } = await supabase
    .from("conversation_outcomes")
    .insert({
      conversation_id: candidate.conversationId,
      store_id: candidate.storeId,
      order_id: candidate.orderId,
      closed: true,
      objection_type: parsed.objection_type,
      objection_handling_message: parsed.objection_handling_message,
      messages_to_close: parsed.messages_to_close,
      stages_observed: parsed.stages_observed,
      key_closing_line: parsed.key_closing_line,
      customer_tone: parsed.customer_tone,
      what_worked: parsed.what_worked,
    });

  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  await supabase
    .from("whatsapp_conversations")
    .update({ outcome_extracted: true })
    .eq("id", candidate.conversationId);

  return { ok: true };
}

export async function runOutcomeExtractionBatch(
  limit = 20,
  storeId?: string
): Promise<{
  processed: number;
  succeeded: number;
  failed: Array<{ conversationId: string; error: string }>;
}> {
  const candidates = await findOutcomeExtractionCandidates(limit, storeId);
  let succeeded = 0;
  const failed: Array<{ conversationId: string; error: string }> = [];

  for (const candidate of candidates) {
    const result = await extractOutcomeForConversation(candidate);
    if (result.ok) {
      succeeded += 1;
    } else {
      failed.push({
        conversationId: candidate.conversationId,
        error: result.error,
      });
      console.warn(
        `[outcomes/extract] conversation=${candidate.conversationId}: ${result.error}`
      );
    }
  }

  return { processed: candidates.length, succeeded, failed };
}
