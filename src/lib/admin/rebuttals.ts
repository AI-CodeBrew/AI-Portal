import { createAdminClient } from "@/lib/supabase/admin";
import { embedRebuttalText } from "@/lib/rebuttals/embeddings";

export const ADMIN_REBUTTALS_PAGE_SIZE = 10;

export type RebuttalStatus = "pending" | "approved" | "rejected";

export const REBUTTAL_STATUSES: RebuttalStatus[] = [
  "pending",
  "approved",
  "rejected",
];

/** Sentinel for the store filter — rows with store_id null. */
export const GLOBAL_STORE_FILTER = "global";

export type AdminRebuttalRow = {
  id: string;
  store_id: string | null;
  status: RebuttalStatus;
  objection_text: string;
  answer_text: string;
  source: "auto" | "manual";
  language: string | null;
  times_served: number;
  last_served_at: string | null;
  created_at: string;
  approved_at: string | null;
  source_conversation_id: string | null;
  stores: { store_name: string | null; shop_domain: string | null } | null;
};

export type AdminRebuttalCounts = {
  pending: number;
  approved: number;
  rejected: number;
};

export type AdminRebuttalsResult = {
  rebuttals: AdminRebuttalRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

// Never select `embedding` — 768 floats per row over the wire for nothing.
const rebuttalSelect = `
  id,
  store_id,
  status,
  objection_text,
  answer_text,
  source,
  language,
  times_served,
  last_served_at,
  created_at,
  approved_at,
  source_conversation_id,
  stores (store_name, shop_domain)
`;

function mapRebuttalRow(row: Record<string, unknown>): AdminRebuttalRow {
  return {
    ...row,
    stores: Array.isArray(row.stores)
      ? (row.stores[0] ?? null)
      : (row.stores as AdminRebuttalRow["stores"]),
  } as AdminRebuttalRow;
}

export async function getAdminRebuttals(options?: {
  status?: RebuttalStatus;
  storeId?: string;
  page?: number;
  pageSize?: number;
}): Promise<AdminRebuttalsResult> {
  const supabase = createAdminClient();
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.min(
    100,
    Math.max(1, options?.pageSize ?? ADMIN_REBUTTALS_PAGE_SIZE)
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("sales_rebuttals")
    .select(rebuttalSelect, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (options?.status) {
    query = query.eq("status", options.status);
  }

  if (options?.storeId === GLOBAL_STORE_FILTER) {
    query = query.is("store_id", null);
  } else if (options?.storeId) {
    query = query.eq("store_id", options.storeId);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[admin/rebuttals]", error.message);
    return { rebuttals: [], total: 0, page, pageSize, totalPages: 0 };
  }

  const total = count ?? 0;

  return {
    rebuttals: (data ?? []).map((row) => mapRebuttalRow(row)),
    total,
    page,
    pageSize,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

export async function getAdminRebuttalCounts(): Promise<AdminRebuttalCounts> {
  const supabase = createAdminClient();

  const results = await Promise.all(
    REBUTTAL_STATUSES.map(async (status) => {
      const { count, error } = await supabase
        .from("sales_rebuttals")
        .select("*", { count: "exact", head: true })
        .eq("status", status);

      if (error) {
        console.error("[admin/rebuttals] count:", error.message);
        return 0;
      }
      return count ?? 0;
    })
  );

  return {
    pending: results[0],
    approved: results[1],
    rejected: results[2],
  };
}

export type UpdateRebuttalPatch = {
  action: "approve" | "reject" | "save";
  answerText?: string;
  objectionText?: string;
  storeId?: string | null;
};

export async function updateAdminRebuttal(
  id: string,
  patch: UpdateRebuttalPatch,
  adminUserId: string
): Promise<{ rebuttal: AdminRebuttalRow } | { error: string; status: number }> {
  const supabase = createAdminClient();

  const { data: current, error: loadError } = await supabase
    .from("sales_rebuttals")
    .select("id, objection_text, embedding")
    .eq("id", id)
    .single();

  if (loadError || !current) {
    return { error: "Rebuttal not found", status: 404 };
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  const nextObjection = patch.objectionText?.trim();
  const objectionChanged =
    Boolean(nextObjection) && nextObjection !== current.objection_text;

  if (nextObjection) {
    update.objection_text = nextObjection;
  }
  if (patch.answerText?.trim()) {
    update.answer_text = patch.answerText.trim();
  }
  if (patch.storeId !== undefined) {
    update.store_id = patch.storeId;
  }

  // Re-embed when the objection text changed, or when approving a row that
  // somehow has no vector. A row whose embedding no longer matches its text
  // would silently serve the wrong rebuttal forever — so this failure is fatal,
  // unlike the soft-fail on the runtime paths.
  const needsEmbedding =
    objectionChanged ||
    (patch.action === "approve" && !current.embedding);

  if (needsEmbedding) {
    const text = nextObjection || current.objection_text;
    const vec = await embedRebuttalText(text, "RETRIEVAL_DOCUMENT");
    if (!vec) {
      return {
        error: "Could not generate embedding — check the Gemini key and retry",
        status: 502,
      };
    }
    update.embedding = vec;
  }

  if (patch.action === "approve") {
    update.status = "approved";
    update.approved_by = adminUserId;
    update.approved_at = new Date().toISOString();
  } else if (patch.action === "reject") {
    // Keep the embedding: a rejected objection should keep deduping future
    // captures rather than being re-queued every time it recurs.
    update.status = "rejected";
  }

  const { data, error } = await supabase
    .from("sales_rebuttals")
    .update(update)
    .eq("id", id)
    .select(rebuttalSelect)
    .single();

  if (error || !data) {
    console.error("[admin/rebuttals] update:", error?.message);
    return { error: error?.message ?? "Update failed", status: 400 };
  }

  return { rebuttal: mapRebuttalRow(data) };
}

export async function createAdminRebuttal(params: {
  objectionText: string;
  answerText: string;
  storeId: string | null;
  adminUserId: string;
}): Promise<{ rebuttal: AdminRebuttalRow } | { error: string; status: number }> {
  const objection = params.objectionText.trim();
  const answer = params.answerText.trim();

  if (!objection || !answer) {
    return { error: "objectionText and answerText are required", status: 400 };
  }

  const vec = await embedRebuttalText(objection, "RETRIEVAL_DOCUMENT");
  if (!vec) {
    return {
      error: "Could not generate embedding — check the Gemini key and retry",
      status: 502,
    };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("sales_rebuttals")
    .insert({
      store_id: params.storeId,
      status: "approved",
      source: "manual",
      objection_text: objection,
      answer_text: answer,
      embedding: vec,
      approved_by: params.adminUserId,
      approved_at: new Date().toISOString(),
    })
    .select(rebuttalSelect)
    .single();

  if (error || !data) {
    console.error("[admin/rebuttals] create:", error?.message);
    return { error: error?.message ?? "Create failed", status: 400 };
  }

  return { rebuttal: mapRebuttalRow(data) };
}
