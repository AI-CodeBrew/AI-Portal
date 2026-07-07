import { NextRequest } from "next/server";
import {
  handleWhatsAppWebhookMessage,
  handleWhatsAppWebhookVerify,
} from "@/lib/whatsapp-webhook-handler";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  const { storeId } = await params;
  return handleWhatsAppWebhookVerify(request, storeId);
}

export async function POST(request: NextRequest) {
  return handleWhatsAppWebhookMessage(request);
}
