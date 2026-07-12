import { extractOutboundMedia } from "@/lib/ai/sales-recovery";

export function ChatMessageBody({ content }: { content: string }) {
  const { text, imageUrls } = extractOutboundMedia(content);

  return (
    <div className="space-y-2">
      {imageUrls.map((url) => (
        <img
          key={url}
          src={url}
          alt=""
          className="max-h-48 w-full rounded-lg object-cover"
        />
      ))}
      {text ? <p className="whitespace-pre-wrap">{text}</p> : null}
    </div>
  );
}
