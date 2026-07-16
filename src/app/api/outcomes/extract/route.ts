import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runOutcomeExtractionBatch } from "@/lib/outcomes/extract-outcome";

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const limit = Math.min(
      50,
      Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 20))
    );
    const result = await runOutcomeExtractionBatch(limit);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[outcomes/extract]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Extraction failed",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
