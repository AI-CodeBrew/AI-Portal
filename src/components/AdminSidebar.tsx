"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArabiaAILogo } from "@/components/ArabiaAILogo";

const navGroups = [
  {
    label: "Platform",
    items: [
      { href: "/admin", label: "Overview", exact: true },
      { href: "/admin/resellers", label: "Resellers" },
      { href: "/admin/ai-defaults", label: "AI Defaults" },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { href: "/admin/orders", label: "All Orders" },
      { href: "/admin/chats", label: "All Chats" },
    ],
  },
];

function NavIcon({ name, active }: { name: string; active: boolean }) {
  const c = `h-4 w-4 ${active ? "text-white" : "text-slate-500"}`;
  if (name === "Overview")
    return (
      <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    );
  if (name === "Resellers")
    return (
      <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    );
  if (name === "AI Defaults")
    return (
      <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    );
  if (name === "All Orders")
    return (
      <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
      </svg>
    );
  return (
    <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[260px] shrink-0 flex-col border-r border-slate-200/80 bg-[#0B1120] lg:flex">
      <div className="px-5 py-6">
        <ArabiaAILogo size="md" />
        <p className="mt-3 inline-block rounded-full bg-violet-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-300">
          Admin Console
        </p>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-6 pt-2">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                        active
                          ? "bg-violet-600 text-white shadow-lg shadow-violet-600/25"
                          : "text-slate-400 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                          active ? "bg-violet-700/50" : "bg-white/5 group-hover:bg-white/10"
                        }`}
                      >
                        <NavIcon name={item.label} active={active} />
                      </span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 px-5 py-4">
        <p className="text-[10px] text-slate-600">
          Powered by <span className="font-semibold text-slate-500">Arabia AI</span>
        </p>
      </div>
    </aside>
  );
}
