import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import {
  createWhatsAppTemplate,
  listWhatsAppTemplates,
  syncWhatsAppTemplatesFromMeta,
  templateStats,
  type WaTemplateCategorySelectable,
} from "@/lib/whatsapp/message-templates";

export async function GET(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const sync = request.nextUrl.searchParams.get("sync") === "1";

    if (sync) {
      const result = await syncWhatsAppTemplatesFromMeta(storeId);
      if ("error" in result) {
        // Still return local templates if Meta sync fails
        const templates = await listWhatsAppTemplates(storeId);
        return NextResponse.json({
          templates,
          stats: templateStats(templates),
          syncError: result.error,
        });
      }
      return NextResponse.json({
        templates: result.templates,
        stats: templateStats(result.templates),
        synced: result.synced,
      });
    }

    const templates = await listWhatsAppTemplates(storeId);
    return NextResponse.json({
      templates,
      stats: templateStats(templates),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const body = (await request.json()) as {
      name?: string;
      category?: WaTemplateCategorySelectable;
      language?: string;
      headerText?: string | null;
      bodyText?: string;
      footerText?: string | null;
    };

    const result = await createWhatsAppTemplate(storeId, {
      name: body.name ?? "",
      category: body.category ?? "UTILITY",
      language: body.language ?? "en",
      headerText: body.headerText,
      bodyText: body.bodyText ?? "",
      footerText: body.footerText,
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ template: result });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
