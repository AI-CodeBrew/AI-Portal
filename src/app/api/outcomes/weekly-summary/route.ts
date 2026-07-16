import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import {
  buildWeeklyOutcomeSummaries,
  logWeeklyOutcomeSummaries,
} from "@/lib/outcomes/weekly-summary";

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summaries = await buildWeeklyOutcomeSummaries();
    logWeeklyOutcomeSummaries(summaries);
    return NextResponse.json({ ok: true, summaries });
  } catch (err) {
    console.error("[outcomes/weekly-summary]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Weekly summary failed",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
