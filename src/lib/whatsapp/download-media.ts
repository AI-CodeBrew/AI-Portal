const GRAPH_API = "https://graph.facebook.com/v21.0";

const MAX_VOICE_BYTES = 16 * 1024 * 1024;

/** Download inbound WhatsApp media (voice notes, etc.) before the URL expires. */
export async function downloadWhatsAppMedia(
  mediaId: string,
  accessToken: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  const metaRes = await fetch(`${GRAPH_API}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!metaRes.ok) {
    const detail = await metaRes.text().catch(() => "");
    throw new Error(
      `WhatsApp media lookup failed (${metaRes.status}): ${detail.slice(0, 200)}`
    );
  }

  const meta = (await metaRes.json()) as {
    url?: string;
    mime_type?: string;
    file_size?: number;
  };

  if (!meta.url) {
    throw new Error("WhatsApp media lookup did not return a download URL");
  }

  if (meta.file_size && meta.file_size > MAX_VOICE_BYTES) {
    throw new Error("Voice note exceeds size limit");
  }

  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!fileRes.ok) {
    const detail = await fileRes.text().catch(() => "");
    throw new Error(
      `WhatsApp media download failed (${fileRes.status}): ${detail.slice(0, 200)}`
    );
  }

  const buffer = Buffer.from(await fileRes.arrayBuffer());
  if (buffer.length > MAX_VOICE_BYTES) {
    throw new Error("Voice note exceeds size limit");
  }

  const mimeType =
    (meta.mime_type ?? fileRes.headers.get("content-type") ?? "audio/ogg")
      .split(";")[0]
      .trim() || "audio/ogg";

  return { buffer, mimeType };
}
