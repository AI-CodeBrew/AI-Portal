import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import {
  createAdWhatsAppLink,
  listAdWhatsAppLinks,
} from "@/lib/ads/ad-links-service";

export async function GET() {
  try {
    const { storeId } = await requireResellerStore();
    const links = await listAdWhatsAppLinks(storeId);
    return NextResponse.json({ links });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const body = (await request.json()) as {
      productId?: number;
      variantId?: number | null;
    };

    if (!body.productId) {
      return NextResponse.json(
        { error: "productId is required" },
        { status: 400 }
      );
    }

    const result = await createAdWhatsAppLink(storeId, {
      productId: body.productId,
      variantId: body.variantId,
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ link: result });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
