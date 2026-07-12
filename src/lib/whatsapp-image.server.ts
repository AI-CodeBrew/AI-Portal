const GRAPH_API = "https://graph.facebook.com/v21.0";

function imagePathFromUrl(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.split("?")[0]?.split("#")[0]?.toLowerCase() ?? "";
  }
}

function isDirectWhatsAppImageLink(url: string): boolean {
  return /\.(jpe?g|png)$/i.test(imagePathFromUrl(url));
}

function needsWhatsAppImageConversion(url: string): boolean {
  return /\.(webp|gif|avif|bmp|svg)$/i.test(imagePathFromUrl(url));
}

async function uploadWhatsAppMedia({
  phoneNumberId,
  accessToken,
  buffer,
  mimeType,
  fileName,
}: {
  phoneNumberId: string;
  accessToken: string;
  buffer: Buffer;
  mimeType: "image/jpeg" | "image/png";
  fileName: string;
}): Promise<string> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append(
    "file",
    new Blob([new Uint8Array(buffer)], { type: mimeType }),
    fileName
  );

  const res = await fetch(`${GRAPH_API}/${phoneNumberId}/media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });

  if (!res.ok) {
    const raw = await res.text();
    throw new Error(`WhatsApp media upload failed: ${raw}`);
  }

  const data = (await res.json()) as { id?: string };
  if (!data.id) {
    throw new Error("WhatsApp media upload did not return a media id");
  }
  return data.id;
}

/** WhatsApp image messages only accept JPEG/PNG — convert WebP portal uploads server-side. */
export async function resolveWhatsAppImagePayload({
  phoneNumberId,
  accessToken,
  imageUrl,
}: {
  phoneNumberId: string;
  accessToken: string;
  imageUrl: string;
}): Promise<{ link: string } | { id: string }> {
  if (
    isDirectWhatsAppImageLink(imageUrl) &&
    !needsWhatsAppImageConversion(imageUrl)
  ) {
    return { link: imageUrl };
  }

  const fetched = await fetch(imageUrl);
  if (!fetched.ok) {
    throw new Error(`Could not fetch product image (${fetched.status})`);
  }

  const contentType = (fetched.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const input = Buffer.from(await fetched.arrayBuffer());

  if (input.length > 5 * 1024 * 1024) {
    throw new Error("Product image exceeds WhatsApp 5 MB limit");
  }

  if (
    (contentType === "image/jpeg" || contentType === "image/png") &&
    isDirectWhatsAppImageLink(imageUrl)
  ) {
    return { link: imageUrl };
  }

  const sharp = (await import("sharp")).default;
  const jpeg = await sharp(input).jpeg({ quality: 88 }).toBuffer();
  const id = await uploadWhatsAppMedia({
    phoneNumberId,
    accessToken,
    buffer: jpeg,
    mimeType: "image/jpeg",
    fileName: "product.jpg",
  });
  return { id };
}
