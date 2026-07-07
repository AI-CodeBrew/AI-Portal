import { InboxPanel } from "@/components/InboxPanel";

export default function ResellerInboxPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Inbox</h1>
        <p className="mt-1 text-sm text-slate-600">
          Conversations escalated by the AI agent. Reply directly to customers
          via WhatsApp.
        </p>
      </div>
      <InboxPanel />
    </div>
  );
}
