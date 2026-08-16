import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import {
  deleteWhatsAppTemplate,
  submitWhatsAppTemplateToMeta,
  updateWhatsAppTemplate,
  type WaTemplateCategorySelectable,
} from "@/lib/whatsapp/message-templates";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { storeId } = await requireResellerStore();
    const { id } = await params;
    const body = (await request.json()) as {
      action?: "update" | "submit";
      name?: string;
      category?: WaTemplateCategorySelectable;
      language?: string;
      headerText?: string | null;
      bodyText?: string;
      footerText?: string | null;
      bodyVariableSamples?: string[] | null;
    };

    if (body.action === "submit") {
      const result = await submitWhatsAppTemplateToMeta(storeId, id);
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ template: result });
    }

    const result = await updateWhatsAppTemplate(storeId, id, {
      name: body.name,
      category: body.category,
      language: body.language,
      headerText: body.headerText,
      bodyText: body.bodyText,
      footerText: body.footerText,
      bodyVariableSamples: body.bodyVariableSamples,
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ template: result });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { storeId } = await requireResellerStore();
    const { id } = await params;
    const result = await deleteWhatsAppTemplate(storeId, id);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
