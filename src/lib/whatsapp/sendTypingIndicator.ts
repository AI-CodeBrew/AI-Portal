import { GRAPH_API } from "@/lib/whatsapp/graph";

/**
 * Mark inbound message read + show "typing…" on the customer's device.
 * Auto-dismisses after ~25s or when a reply is sent. Never throws.
 */
export async function sendTypingIndicator(
  phoneNumberId: string,
  messageId: string,
  accessToken: string
): Promise<void> {
  if (!phoneNumberId || !messageId || !accessToken) return;

  try {
    const res = await fetch(`${GRAPH_API}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
        typing_indicator: { type: "text" },
      }),
    });

    if (!res.ok) {
      console.error(
        "[whatsapp] Failed to send typing indicator:",
        await res.text()
      );
    }
  } catch (err) {
    console.error("[whatsapp] Failed to send typing indicator:", err);
  }
}

/** Fire typing indicator now and once more at ~20s if still processing. */
export function startTypingIndicatorRefresh(params: {
  phoneNumberId: string;
  messageId: string;
  accessToken: string;
}): () => void {
  const { phoneNumberId, messageId, accessToken } = params;
  void sendTypingIndicator(phoneNumberId, messageId, accessToken);

  const timer = setTimeout(() => {
    void sendTypingIndicator(phoneNumberId, messageId, accessToken);
  }, 20_000);

  return () => clearTimeout(timer);
}
