/** Strip internal recovery markers before sending to the customer on WhatsApp. */
export function stripInternalAiMarkers(text: string): string {
  return text
    .replace(/^\s*\[Deal\s+[^\]]+\]\s*\n?/gim, "")
    .replace(/^\s*\[Deal closed\]\s*\n?/gim, "")
    .replace(/\[Ref:\s*[^\]]+\]\s*/gi, "")
    .replace(/\[Image:\s*https?:\/\/[^\]]+\]\s*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Pull image URLs from [Image: …] markers and bare CDN links in LLM text. */
export function extractOutboundMedia(text: string): {
  text: string;
  imageUrls: string[];
} {
  const imageUrls: string[] = [];

  const collect = (url: string) => {
    const cleaned = String(url).trim();
    if (
      /^https:\/\//i.test(cleaned) &&
      !imageUrls.includes(cleaned) &&
      imageUrls.length < 3
    ) {
      imageUrls.push(cleaned);
    }
  };

  let working = text.replace(
    /\[Image:\s*(https?:\/\/[^\]]+)\]\s*/gi,
    (_, url: string) => {
      collect(url);
      return "";
    }
  );

  // LLMs often paste raw CDN links — extract and send as WhatsApp images instead
  working = working.replace(
    /(?:here'?s?\s+(?:the\s+)?(?:product\s+)?(?:image|photo|picture)s?:?\s*)/gi,
    ""
  );
  working = working.replace(
    /https:\/\/[^\s\])<>"]+\.(?:jpe?g|png|webp|gif)(?:\?[^\s\])<>"]*)?/gi,
    (url) => {
      if (
        /(?:cdn\.shopify|shopify\.com|b-cdn\.net|bunnycdn|cloudinary|imgix)/i.test(
          url
        )
      ) {
        collect(url);
        return "";
      }
      return url;
    }
  );

  return {
    text: stripInternalAiMarkers(working),
    imageUrls,
  };
}
