import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ConversationOutcomeRow } from "@/lib/outcomes/types";

const VALID_OBJECTIONS = [
  "all",
  "price",
  "authenticity",
  "delivery_time",
  "none",
  "other",
] as const;

export async function GET(req: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const supabase = createAdminClient();

    const objection = req.nextUrl.searchParams.get("objection_type") ?? "all";
    const sort = req.nextUrl.searchParams.get("sort") ?? "messages_asc";

    let query = supabase
      .from("conversation_outcomes")
      .select("*")
      .eq("store_id", storeId)
      .eq("closed", true);

    if (objection !== "all" && VALID_OBJECTIONS.includes(objection as typeof VALID_OBJECTIONS[number])) {
      query = query.eq("objection_type", objection);
    }

    if (sort === "messages_desc") {
      query = query.order("messages_to_close", {
        ascending: false,
        nullsFirst: false,
      });
    } else {
      query = query.order("messages_to_close", {
        ascending: true,
        nullsFirst: false,
      });
    }

    query = query.order("extracted_at", { ascending: false });

    const { data, error } = await query.limit(200);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const outcomes = (data ?? []) as ConversationOutcomeRow[];

    const topByObjection: Record<string, ConversationOutcomeRow[]> = {};
    for (const row of outcomes) {
      const key = row.objection_type ?? "none";
      if (!topByObjection[key]) topByObjection[key] = [];
      if (topByObjection[key].length < 10) {
        topByObjection[key].push(row);
      }
    }

    const { data: examples } = await supabase
      .from("prompt_examples")
      .select("id, outcome_id, objection_type, promoted_at, active")
      .eq("store_id", storeId)
      .order("promoted_at", { ascending: false });

    return NextResponse.json({
      outcomes,
      topByObjection,
      promptExamples: examples ?? [],
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
