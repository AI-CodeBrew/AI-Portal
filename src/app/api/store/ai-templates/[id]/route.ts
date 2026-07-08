import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import {
  deleteStoreAiTemplate,
  updateStoreAiTemplate,
} from "@/lib/ai/store-ai-settings";
import type { AiTemplateCategory } from "@/lib/ai/ai-settings-types";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { storeId } = await requireResellerStore();
    const { id } = await params;
    const body = (await request.json()) as {
      name?: string;
      description?: string | null;
      category?: AiTemplateCategory;
      promptContent?: string;
    };

    const result = await updateStoreAiTemplate(storeId, id, {
      name: body.name,
      description: body.description,
      category: body.category,
      promptContent: body.promptContent,
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ template: result });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { storeId } = await requireResellerStore();
    const { id } = await params;

    const result = await deleteStoreAiTemplate(storeId, id);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
