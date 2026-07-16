import { createAdminClient } from "@/lib/supabase/admin";

export type StoreWeeklyOutcomeSummary = {
  storeId: string;
  storeLabel: string;
  ownerEmail: string | null;
  dealsClosed: number;
  mostCommonObjection: string | null;
  avgMessagesToClose: number | null;
};

export async function buildWeeklyOutcomeSummaries(): Promise<
  StoreWeeklyOutcomeSummary[]
> {
  const supabase = createAdminClient();
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const { data: outcomes } = await supabase
    .from("conversation_outcomes")
    .select(
      "store_id, closed, objection_type, messages_to_close, extracted_at"
    )
    .eq("closed", true)
    .gte("extracted_at", since.toISOString());

  if (!outcomes?.length) return [];

  const byStore = new Map<
    string,
    {
      closed: number;
      objections: Map<string, number>;
      messageCounts: number[];
    }
  >();

  for (const row of outcomes) {
    const storeId = row.store_id as string;
    let bucket = byStore.get(storeId);
    if (!bucket) {
      bucket = { closed: 0, objections: new Map(), messageCounts: [] };
      byStore.set(storeId, bucket);
    }
    bucket.closed += 1;
    const objection = (row.objection_type as string | null) ?? "none";
    bucket.objections.set(
      objection,
      (bucket.objections.get(objection) ?? 0) + 1
    );
    if (typeof row.messages_to_close === "number") {
      bucket.messageCounts.push(row.messages_to_close);
    }
  }

  const storeIds = [...byStore.keys()];
  const { data: stores } = await supabase
    .from("stores")
    .select("id, shop_domain, store_name, owner_email")
    .in("id", storeIds);

  const storeMap = new Map(
    (stores ?? []).map((s) => [
      s.id as string,
      {
        label:
          (s.store_name as string | null)?.trim() ||
          (s.shop_domain as string) ||
          "Store",
        ownerEmail: (s.owner_email as string | null) ?? null,
      },
    ])
  );

  const summaries: StoreWeeklyOutcomeSummary[] = [];

  for (const [storeId, bucket] of byStore) {
    let mostCommonObjection: string | null = null;
    let maxCount = 0;
    for (const [objection, count] of bucket.objections) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonObjection = objection;
      }
    }

    const avgMessagesToClose =
      bucket.messageCounts.length > 0
        ? Math.round(
            (bucket.messageCounts.reduce((a, b) => a + b, 0) /
              bucket.messageCounts.length) *
              10
          ) / 10
        : null;

    const meta = storeMap.get(storeId);
    summaries.push({
      storeId,
      storeLabel: meta?.label ?? storeId,
      ownerEmail: meta?.ownerEmail ?? null,
      dealsClosed: bucket.closed,
      mostCommonObjection,
      avgMessagesToClose,
    });
  }

  return summaries.sort((a, b) => b.dealsClosed - a.dealsClosed);
}

export function logWeeklyOutcomeSummaries(
  summaries: StoreWeeklyOutcomeSummary[]
): void {
  for (const s of summaries) {
    console.log(
      `[weekly-outcomes] store=${s.storeLabel} (${s.storeId}) deals=${s.dealsClosed} top_objection=${s.mostCommonObjection ?? "n/a"} avg_msgs=${s.avgMessagesToClose ?? "n/a"} notify=${s.ownerEmail ?? "no-email"}`
    );
  }
}
