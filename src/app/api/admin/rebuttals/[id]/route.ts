import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { updateAdminRebuttal } from "@/lib/admin/rebuttals";

const ACTIONS = ["approve", "reject", "save"] as const;
type Action = (typeof ACTIONS)[number];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("admin");
    const { id } = await params;

    const body = (await request.json()) as {
      action?: Action;
      answerText?: string;
      objectionText?: string;
      storeId?: string | null;
    };

    if (!body.action || !ACTIONS.includes(body.action)) {
      return NextResponse.json(
        { error: "action must be approve, reject, or save" },
        { status: 400 }
      );
    }

    if (
      (body.action === "approve" || body.action === "save") &&
      body.answerText !== undefined &&
      !body.answerText.trim()
    ) {
      return NextResponse.json(
        { error: "answerText cannot be empty" },
        { status: 400 }
      );
    }

    if (body.objectionText !== undefined && !body.objectionText.trim()) {
      return NextResponse.json(
        { error: "objectionText cannot be empty" },
        { status: 400 }
      );
    }

    const result = await updateAdminRebuttal(
      id,
      {
        action: body.action,
        answerText: body.answerText,
        objectionText: body.objectionText,
        storeId: body.storeId,
      },
      user.id
    );

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
