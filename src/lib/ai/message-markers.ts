/** Strip internal recovery markers before sending to the customer on WhatsApp. */
export function stripInternalAiMarkers(text: string): string {
  return text
    .replace(/^\s*\[Deal\s+[^\]]+\]\s*\n?/gim, "")
    .replace(/^\s*\[Deal closed\]\s*\n?/gim, "")
    .replace(/\[Ref:\s*[^\]]+\]\s*/gi, "")
    .replace(/\[OOS:\s*[^\]]+\]\s*/gi, "")
    .replace(/\[Image:\s*https?:\/\/[^\]]+\]\s*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Pull image URLs embedded as [Image: https://...] and return clean customer text. */
export function extractOutboundMedia(text: string): {
  text: string;
  imageUrls: string[];
} {
  const imageUrls: string[] = [];
  const withoutImages = text.replace(
    /\[Image:\s*(https?:\/\/[^\]]+)\]\s*/gi,
    (_, url: string) => {
      const cleaned = String(url).trim();
      if (/^https:\/\//i.test(cleaned) && !imageUrls.includes(cleaned)) {
        imageUrls.push(cleaned);
      }
      return "";
    }
  );
  return {
    text: stripInternalAiMarkers(withoutImages),
    imageUrls: imageUrls.slice(0, 3),
  };
}
