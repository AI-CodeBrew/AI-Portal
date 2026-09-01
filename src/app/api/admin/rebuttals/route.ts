import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  ADMIN_REBUTTALS_PAGE_SIZE,
  REBUTTAL_STATUSES,
  createAdminRebuttal,
  getAdminRebuttalCounts,
  getAdminRebuttals,
  type RebuttalStatus,
} from "@/lib/admin/rebuttals";

export async function GET(request: NextRequest) {
  try {
    await requireAuth("admin");

    const { searchParams } = request.nextUrl;
    const rawStatus = searchParams.get("status");
    const status = REBUTTAL_STATUSES.includes(rawStatus as RebuttalStatus)
      ? (rawStatus as RebuttalStatus)
      : undefined;
    const storeId = searchParams.get("storeId") ?? undefined;
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.min(
      100,
      Math.max(
        1,
        Number(
          searchParams.get("pageSize") ?? String(ADMIN_REBUTTALS_PAGE_SIZE)
        ) || ADMIN_REBUTTALS_PAGE_SIZE
      )
    );

    const [result, counts] = await Promise.all([
      getAdminRebuttals({ status, storeId, page, pageSize }),
      getAdminRebuttalCounts(),
    ]);

    return NextResponse.json({ ...result, counts });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth("admin");

    const body = (await request.json()) as {
      objectionText?: string;
      answerText?: string;
      storeId?: string | null;
    };

    if (!body.objectionText?.trim() || !body.answerText?.trim()) {
      return NextResponse.json(
        { error: "objectionText and answerText are required" },
        { status: 400 }
      );
    }

    const result = await createAdminRebuttal({
      objectionText: body.objectionText,
      answerText: body.answerText,
      storeId: body.storeId ?? null,
      adminUserId: user.id,
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
