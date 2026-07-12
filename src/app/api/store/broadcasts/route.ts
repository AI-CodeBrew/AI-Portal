import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import {
  BROADCAST_SAMPLE_CSV,
  createAndSendBroadcast,
  listBroadcasts,
  parseBroadcastCsv,
  type BroadcastContact,
} from "@/lib/broadcasts";

export async function GET(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    if (request.nextUrl.searchParams.get("sample") === "1") {
      return new NextResponse(BROADCAST_SAMPLE_CSV, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="broadcast-contacts-sample.csv"',
        },
      });
    }
    const broadcasts = await listBroadcasts(storeId);
    return NextResponse.json({ broadcasts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    if (message === "Unauthorized" || message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const body = (await request.json()) as {
      name?: string;
      templateId?: string;
      recipients?: BroadcastContact[];
      csvText?: string;
    };

    if (!body.templateId?.trim()) {
      return NextResponse.json(
        { error: "Select a Meta-approved template" },
        { status: 400 }
      );
    }

    const fromList = Array.isArray(body.recipients) ? body.recipients : [];
    const fromCsv = body.csvText ? parseBroadcastCsv(body.csvText) : [];
    const merged = [...fromList, ...fromCsv];

    const result = await createAndSendBroadcast({
      storeId,
      name: body.name?.trim() || "Broadcast",
      templateId: body.templateId.trim(),
      recipients: merged,
    });

    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
