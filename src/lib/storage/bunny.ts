const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function bunnyConfig() {
  const storageZone = process.env.BUNNY_STORAGE_ZONE?.trim();
  const accessKey = process.env.BUNNY_STORAGE_PASSWORD?.trim();
  const cdnHostname = process.env.BUNNY_CDN_HOSTNAME?.trim();
  const region = (process.env.BUNNY_STORAGE_REGION ?? "").trim();

  if (!storageZone || !accessKey || !cdnHostname) {
    return null;
  }

  const host = region
    ? `${region}.storage.bunnycdn.com`
    : "storage.bunnycdn.com";

  return { storageZone, accessKey, cdnHostname, host };
}

export function isBunnyConfigured(): boolean {
  return bunnyConfig() !== null;
}

function extFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

export async function uploadProductImage(
  storeId: string,
  file: File
): Promise<{ url: string } | { error: string }> {
  const config = bunnyConfig();
  if (!config) {
    return {
      error:
        "Image storage is not configured. Set BUNNY_STORAGE_ZONE, BUNNY_STORAGE_PASSWORD, and BUNNY_CDN_HOSTNAME.",
    };
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return { error: "Only JPEG, PNG, WebP, or GIF images are allowed." };
  }

  if (file.size > MAX_BYTES) {
    return { error: "Image must be 5 MB or smaller." };
  }

  const ext = extFromMime(file.type);
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const path = `products/${storeId}/${fileName}`;
  const uploadUrl = `https://${config.host}/${config.storageZone}/${path}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      AccessKey: config.accessKey,
      "Content-Type": file.type,
    },
    body: buffer,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[bunny] upload failed", res.status, text);
    return { error: `Image upload failed (${res.status}). Check Bunny credentials.` };
  }

  const cdnBase = config.cdnHostname.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return { url: `https://${cdnBase}/${path}` };
}
