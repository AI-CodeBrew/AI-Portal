"use client";

import { useState } from "react";
import { InboxPanel } from "@/components/InboxPanel";
import { BroadcastsPanel } from "@/components/BroadcastsPanel";

type Tab = "chats" | "broadcasts";

export function InboxWorkspace() {
  const [tab, setTab] = useState<Tab>("chats");

  return (
    <div className="space-y-2.5">
      <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 sm:w-fit">
        <button
          type="button"
          onClick={() => setTab("chats")}
          className={`rounded-md px-3.5 py-1.5 text-sm font-semibold transition-colors ${
            tab === "chats"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Chats
        </button>
        <button
          type="button"
          onClick={() => setTab("broadcasts")}
          className={`rounded-md px-3.5 py-1.5 text-sm font-semibold transition-colors ${
            tab === "broadcasts"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Broadcasts
        </button>
      </div>

      {tab === "chats" ? <InboxPanel /> : <BroadcastsPanel />}
    </div>
  );
}
