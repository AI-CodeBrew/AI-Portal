import { NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { runOutcomeExtractionBatch } from "@/lib/outcomes/extract-outcome";

export async function POST() {
  try {
    const { storeId } = await requireResellerStore();
    const result = await runOutcomeExtractionBatch(10, storeId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[outcomes/run-extract]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Extraction failed",
      },
      { status: 401 }
    );
  }
}
