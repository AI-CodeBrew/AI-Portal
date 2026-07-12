import { createAdminClient } from "@/lib/supabase/admin";
import {
  getStoreWhatsAppCredentials,
  normalizePhone,
  sendWhatsAppTemplate,
} from "@/lib/whatsapp";

export type BroadcastStatus = "draft" | "sending" | "completed" | "failed";
export type RecipientStatus = "pending" | "sent" | "failed";

export type BroadcastContact = {
  phone: string;
  name: string | null;
  source: "inbox" | "customer" | "csv";
};

export type BroadcastListItem = {
  id: string;
  name: string;
  template_name: string;
  template_language: string;
  status: BroadcastStatus;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  completed_at: string | null;
};

export type BroadcastRecipient = {
  id: string;
  phone: string;
  name: string | null;
  status: RecipientStatus;
  error: string | null;
  sent_at: string | null;
};

const MAX_RECIPIENTS = 500;

export function parseBroadcastCsv(text: string): BroadcastContact[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const header = lines[0].toLowerCase();
  const hasHeader = header.includes("phone") || header.includes("name");
  const rows = hasHeader ? lines.slice(1) : lines;

  const contacts: BroadcastContact[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const cols = splitCsvLine(row);
    if (cols.length === 0) continue;

    let name: string | null = null;
    let phoneRaw = "";

    if (hasHeader) {
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const nameIdx = headers.findIndex((h) => h === "name" || h === "customer_name");
      const phoneIdx = headers.findIndex(
        (h) => h === "phone" || h === "phone_number" || h === "mobile"
      );
      if (phoneIdx < 0) continue;
      phoneRaw = cols[phoneIdx] ?? "";
      name = nameIdx >= 0 ? (cols[nameIdx]?.trim() || null) : null;
    } else if (cols.length >= 2) {
      name = cols[0]?.trim() || null;
      phoneRaw = cols[1] ?? "";
    } else {
      phoneRaw = cols[0] ?? "";
    }

    const phone = normalizePhone(phoneRaw);
    if (phone.length < 8 || seen.has(phone)) continue;
    seen.add(phone);
    contacts.push({ phone, name, source: "csv" });
  }

  return contacts;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export async function listInboxContacts(
  storeId: string
): Promise<BroadcastContact[]> {
  const supabase = createAdminClient();
  const byPhone = new Map<string, BroadcastContact>();

  const [{ data: customers }, { data: conversations }] = await Promise.all([
    supabase
      .from("customers")
      .select("phone, name")
      .eq("store_id", storeId)
      .order("name", { ascending: true }),
    supabase
      .from("whatsapp_conversations")
      .select("customer_phone, customer_id")
      .eq("store_id", storeId)
      .order("updated_at", { ascending: false }),
  ]);

  for (const c of customers ?? []) {
    const phone = normalizePhone(String(c.phone ?? ""));
    if (phone.length < 8) continue;
    byPhone.set(phone, {
      phone,
      name: (c.name as string | null) ?? null,
      source: "customer",
    });
  }

  for (const conv of conversations ?? []) {
    const phone = normalizePhone(String(conv.customer_phone ?? ""));
    if (phone.length < 8) continue;
    const existing = byPhone.get(phone);
    if (!existing) {
      byPhone.set(phone, {
        phone,
        name: null,
        source: "inbox",
      });
    } else if (!existing.name) {
      byPhone.set(phone, { ...existing, source: "inbox" });
    }
  }

  return Array.from(byPhone.values()).sort((a, b) => {
    const an = (a.name || a.phone).toLowerCase();
    const bn = (b.name || b.phone).toLowerCase();
    return an.localeCompare(bn);
  });
}

function templateBodyParamCount(bodyText: string): number {
  const matches = bodyText.match(/\{\{\d+\}\}/g);
  if (!matches) return 0;
  const nums = matches.map((m) => Number(m.replace(/\D/g, "")));
  return nums.length ? Math.max(...nums) : 0;
}

function bodyParamsForRecipient(
  bodyText: string,
  name: string | null,
  phone: string
): string[] | undefined {
  const count = templateBodyParamCount(bodyText);
  if (count <= 0) return undefined;
  const displayName = name?.trim() || "Customer";
  const params: string[] = [];
  for (let i = 0; i < count; i++) {
    if (i === 0) params.push(displayName);
    else if (i === 1) params.push(phone);
    else params.push(displayName);
  }
  return params;
}

export async function createAndSendBroadcast(input: {
  storeId: string;
  name: string;
  templateId: string;
  recipients: BroadcastContact[];
}): Promise<
  | { ok: true; broadcast: BroadcastListItem }
  | { error: string; status: number }
> {
  const supabase = createAdminClient();
  const name = input.name.trim() || "Broadcast";
  const unique = new Map<string, BroadcastContact>();
  for (const r of input.recipients) {
    const phone = normalizePhone(r.phone);
    if (phone.length < 8) continue;
    if (!unique.has(phone)) {
      unique.set(phone, {
        phone,
        name: r.name?.trim() || null,
        source: r.source,
      });
    }
  }
  const recipients = Array.from(unique.values());
  if (recipients.length === 0) {
    return { error: "Add at least one contact with a valid phone number", status: 400 };
  }
  if (recipients.length > MAX_RECIPIENTS) {
    return {
      error: `Maximum ${MAX_RECIPIENTS} recipients per broadcast`,
      status: 400,
    };
  }

  const { data: template } = await supabase
    .from("whatsapp_message_templates")
    .select("id, name, language, status, body_text")
    .eq("id", input.templateId)
    .eq("store_id", input.storeId)
    .maybeSingle();

  if (!template) {
    return { error: "Template not found", status: 404 };
  }
  if (template.status !== "approved") {
    return {
      error: "Only Meta-approved templates can be used for broadcasts",
      status: 400,
    };
  }

  const { data: store } = await supabase
    .from("stores")
    .select(
      "whatsapp_phone_number_id, whatsapp_access_token, store_name, shop_domain"
    )
    .eq("id", input.storeId)
    .single();

  const waCreds = getStoreWhatsAppCredentials({
    whatsapp_phone_number_id: store?.whatsapp_phone_number_id ?? null,
    whatsapp_access_token: store?.whatsapp_access_token ?? null,
  });
  if (!waCreds) {
    return { error: "WhatsApp is not connected", status: 400 };
  }

  const { data: broadcast, error: createError } = await supabase
    .from("whatsapp_broadcasts")
    .insert({
      store_id: input.storeId,
      name,
      template_id: template.id,
      template_name: template.name,
      template_language: template.language || "en",
      status: "sending",
      total_recipients: recipients.length,
      sent_count: 0,
      failed_count: 0,
    })
    .select("*")
    .single();

  if (createError || !broadcast) {
    const hint = createError?.message.includes("whatsapp_broadcasts")
      ? " — Run migration 024_whatsapp_broadcasts.sql in Supabase"
      : "";
    return {
      error: (createError?.message ?? "Failed to create broadcast") + hint,
      status: 500,
    };
  }

  const { error: recipError } = await supabase
    .from("whatsapp_broadcast_recipients")
    .insert(
      recipients.map((r) => ({
        broadcast_id: broadcast.id,
        phone: r.phone,
        name: r.name,
        status: "pending",
      }))
    );

  if (recipError) {
    await supabase
      .from("whatsapp_broadcasts")
      .update({ status: "failed" })
      .eq("id", broadcast.id);
    return { error: recipError.message, status: 500 };
  }

  let sent = 0;
  let failed = 0;
  const bodyText = String(template.body_text ?? "");

  for (const r of recipients) {
    try {
      await sendWhatsAppTemplate({
        phoneNumberId: waCreds.phoneNumberId,
        accessToken: waCreds.accessToken,
        to: r.phone,
        templateName: template.name,
        languageCode: template.language || "en",
        bodyParams: bodyParamsForRecipient(bodyText, r.name, r.phone),
      });
      sent += 1;
      await supabase
        .from("whatsapp_broadcast_recipients")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          error: null,
        })
        .eq("broadcast_id", broadcast.id)
        .eq("phone", r.phone);
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : "Send failed";
      await supabase
        .from("whatsapp_broadcast_recipients")
        .update({ status: "failed", error: message.slice(0, 500) })
        .eq("broadcast_id", broadcast.id)
        .eq("phone", r.phone);
    }
  }

  const finalStatus: BroadcastStatus =
    sent === 0 ? "failed" : "completed";

  const { data: updated } = await supabase
    .from("whatsapp_broadcasts")
    .update({
      status: finalStatus,
      sent_count: sent,
      failed_count: failed,
      completed_at: new Date().toISOString(),
    })
    .eq("id", broadcast.id)
    .select("*")
    .single();

  return {
    ok: true,
    broadcast: mapBroadcast(updated ?? { ...broadcast, sent_count: sent, failed_count: failed, status: finalStatus }),
  };
}

export async function listBroadcasts(
  storeId: string
): Promise<BroadcastListItem[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("whatsapp_broadcasts")
    .select("*")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    if (error.message.includes("whatsapp_broadcasts")) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map(mapBroadcast);
}

export async function getBroadcastDetail(
  storeId: string,
  broadcastId: string
): Promise<
  | { broadcast: BroadcastListItem; recipients: BroadcastRecipient[] }
  | { error: string; status: number }
> {
  const supabase = createAdminClient();
  const { data: broadcast } = await supabase
    .from("whatsapp_broadcasts")
    .select("*")
    .eq("id", broadcastId)
    .eq("store_id", storeId)
    .maybeSingle();

  if (!broadcast) {
    return { error: "Broadcast not found", status: 404 };
  }

  const { data: recipients } = await supabase
    .from("whatsapp_broadcast_recipients")
    .select("id, phone, name, status, error, sent_at")
    .eq("broadcast_id", broadcastId)
    .order("created_at", { ascending: true });

  return {
    broadcast: mapBroadcast(broadcast),
    recipients: (recipients ?? []).map((r) => ({
      id: r.id as string,
      phone: r.phone as string,
      name: (r.name as string | null) ?? null,
      status: r.status as RecipientStatus,
      error: (r.error as string | null) ?? null,
      sent_at: (r.sent_at as string | null) ?? null,
    })),
  };
}

function mapBroadcast(row: Record<string, unknown>): BroadcastListItem {
  return {
    id: row.id as string,
    name: row.name as string,
    template_name: row.template_name as string,
    template_language: (row.template_language as string) || "en",
    status: row.status as BroadcastStatus,
    total_recipients: Number(row.total_recipients ?? 0),
    sent_count: Number(row.sent_count ?? 0),
    failed_count: Number(row.failed_count ?? 0),
    created_at: row.created_at as string,
    completed_at: (row.completed_at as string | null) ?? null,
  };
}

export const BROADCAST_SAMPLE_CSV = `name,phone
Ahmed Ali,971501234567
Sara Khan,966551112223
Omar Hassan,212612345678
`;
