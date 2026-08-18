import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { uploadProductImage } from "@/lib/storage/bunny";

export async function POST(request: NextRequest) {
  let storeId: string;
  try {
    ({ storeId } = await requireResellerStore());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const result = await uploadProductImage(storeId, file);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ url: result.url });
  } catch (err) {
    console.error("[products/upload]", err);
    const message =
      err instanceof Error ? err.message : "Image upload failed unexpectedly.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
