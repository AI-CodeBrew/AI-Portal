import { InboxPanel } from "@/components/InboxPanel";

export default function ResellerInboxPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Inbox</h1>
        <p className="mt-1 text-sm text-slate-600">
          All WhatsApp conversations with your customers. Filter by AI-handled or
          chats that need your reply.
        </p>
      </div>
      <InboxPanel />
    </div>
  );
}
