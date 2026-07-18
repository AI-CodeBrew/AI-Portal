const GRAPH_API = "https://graph.facebook.com/v21.0";

const DEFAULT_SAMPLE_JPEG_URL =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png";

type ImageBytes = {
  buffer: Buffer;
  mimeType: "image/jpeg" | "image/png";
  fileName: string;
};

async function fetchImageBytes(imageUrl: string): Promise<ImageBytes> {
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`Could not fetch sample image (${res.status})`);
  }

  const contentType = (res.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const input = Buffer.from(await res.arrayBuffer());

  if (input.length > 5 * 1024 * 1024) {
    throw new Error("Sample image exceeds Meta 5 MB limit");
  }

  if (contentType === "image/png") {
    return { buffer: input, mimeType: "image/png", fileName: "sample.png" };
  }

  if (contentType === "image/jpeg" || contentType === "image/jpg") {
    return { buffer: input, mimeType: "image/jpeg", fileName: "sample.jpg" };
  }

  const sharp = (await import("sharp")).default;
  const jpeg = await sharp(input).jpeg({ quality: 88 }).toBuffer();
  return { buffer: jpeg, mimeType: "image/jpeg", fileName: "sample.jpg" };
}

/**
 * Meta requires IMAGE template headers to use a resumable-upload handle,
 * not a public URL. See: developers.facebook.com/docs/graph-api/guides/upload
 */
export async function uploadWhatsAppTemplateHeaderHandle(params: {
  appId: string;
  accessToken: string;
  imageUrl?: string | null;
}): Promise<{ handle: string } | { error: string }> {
  const appId = params.appId.trim();
  if (!appId) {
    return { error: "Meta App ID is required to submit image templates." };
  }

  let image: ImageBytes;
  try {
    image = await fetchImageBytes(
      params.imageUrl?.trim() || DEFAULT_SAMPLE_JPEG_URL
    );
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Could not prepare sample image for Meta",
    };
  }

  try {
    const sessionRes = await fetch(`${GRAPH_API}/${appId}/uploads`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        file_length: String(image.buffer.length),
        file_type: image.mimeType,
        file_name: image.fileName,
      }),
    });

    const sessionRaw = await sessionRes.text();
    let sessionParsed: { id?: string; error?: { message?: string } } = {};
    try {
      sessionParsed = JSON.parse(sessionRaw) as typeof sessionParsed;
    } catch {
      /* ignore */
    }

    if (!sessionRes.ok || !sessionParsed.id) {
      const detail =
        sessionParsed.error?.message || sessionRaw.slice(0, 300);
      return { error: `Meta upload session failed: ${detail}` };
    }

    const uploadRes = await fetch(`${GRAPH_API}/${sessionParsed.id}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        file_offset: "0",
        "Content-Type": "application/octet-stream",
      },
      body: new Uint8Array(image.buffer),
    });

    const uploadRaw = await uploadRes.text();
    let uploadParsed: { h?: string; error?: { message?: string } } = {};
    try {
      uploadParsed = JSON.parse(uploadRaw) as typeof uploadParsed;
    } catch {
      /* ignore */
    }

    if (!uploadRes.ok || !uploadParsed.h) {
      const detail = uploadParsed.error?.message || uploadRaw.slice(0, 300);
      return { error: `Meta image upload failed: ${detail}` };
    }

    return { handle: uploadParsed.h };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Meta image upload failed",
    };
  }
}

export async function resolveTemplateSampleImageUrl(
  storeId: string,
  explicitUrl?: string | null
): Promise<string> {
  if (explicitUrl?.trim()) return explicitUrl.trim();

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { getPrimaryProductImageUrl } = await import(
    "@/lib/products/products-service"
  );

  const supabase = createAdminClient();
  const { data: product } = await supabase
    .from("store_products")
    .select("image_url, image_urls")
    .eq("store_id", storeId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const fromProduct = product
    ? getPrimaryProductImageUrl({
        image_url: product.image_url as string | null,
        image_urls: (product.image_urls as string[] | null) ?? [],
      })
    : null;

  return fromProduct || DEFAULT_SAMPLE_JPEG_URL;
}
