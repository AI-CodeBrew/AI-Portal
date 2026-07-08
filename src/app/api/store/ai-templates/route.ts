import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import {
  createStoreAiTemplate,
  listAiTemplates,
} from "@/lib/ai/store-ai-settings";
import type { AiTemplateCategory } from "@/lib/ai/ai-settings-types";

export async function GET(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const category = request.nextUrl.searchParams.get(
      "category"
    ) as AiTemplateCategory | null;

    const templates = await listAiTemplates(
      storeId,
      category ?? undefined
    );

    return NextResponse.json({ templates });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const body = (await request.json()) as {
      name?: string;
      description?: string | null;
      category?: AiTemplateCategory;
      promptContent?: string;
    };

    if (!body.category) {
      return NextResponse.json(
        { error: "Template category is required" },
        { status: 400 }
      );
    }

    const result = await createStoreAiTemplate(storeId, {
      name: body.name ?? "",
      description: body.description,
      category: body.category,
      promptContent: body.promptContent ?? "",
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ template: result });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
