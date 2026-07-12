"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArabiaAILogo } from "@/components/ArabiaAILogo";
import { useMobileNav } from "@/components/MobileNavContext";

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: "Platform",
    items: [
      { href: "/admin", label: "Overview", exact: true },
      { href: "/admin/resellers", label: "Resellers" },
      { href: "/admin/subscriptions", label: "Subscriptions" },
      { href: "/admin/ai-defaults", label: "AI Defaults" },
      { href: "/admin/whatsapp", label: "WhatsApp Platform" },
      { href: "/admin/billing", label: "Billing" },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { href: "/admin/orders", label: "All Orders" },
      { href: "/admin/chats", label: "All Chats" },
      { href: "/admin/support", label: "Support" },
    ],
  },
];

function NavIcon({ name }: { name: string }) {
  const props = {
    className: "h-5 w-5",
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    strokeWidth: 1.75,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "Overview":
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 13h8V3H3v10zm10 8h8V3h-8v18zM3 21h8v-6H3v6z"
          />
        </svg>
      );
    case "Resellers":
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      );
    case "Subscriptions":
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
          />
        </svg>
      );
    case "AI Defaults":
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      );
    case "WhatsApp Platform":
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      );
    case "Billing":
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
          />
        </svg>
      );
    case "All Orders":
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
          />
        </svg>
      );
    case "Support":
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M18.364 5.636l-1.414 1.414A7 7 0 1012 19h8.5M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      );
  }
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      <div className="border-b border-slate-800 px-4 py-5">
        <ArabiaAILogo size="md" />
        <p className="mt-3 text-xs font-medium text-slate-400">Admin console</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Admin navigation">
        {navGroups.map((group, index) => (
          <div key={group.label} className={index > 0 ? "mt-6" : undefined}>
            <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {group.label}
            </p>
            <ul className="space-y-0.5" role="list">
              {group.items.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={onNavigate}
                      className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                        active
                          ? "bg-violet-600 text-white"
                          : "text-slate-300 hover:bg-slate-800 hover:text-white"
                      }`}
                    >
                      <span className={active ? "text-white" : "text-slate-400"}>
                        <NavIcon name={item.label} />
                      </span>
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-800 px-4 py-3">
        <p className="text-xs text-slate-500">Arabia AI</p>
      </div>
    </>
  );
}

export function AdminSidebar() {
  const { open, closeNav } = useMobileNav();

  return (
    <>
      {/* Desktop — unchanged fixed sidebar */}
      <aside
        className="hidden w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-950 lg:flex"
        aria-label="Admin navigation"
      >
        <SidebarNav />
      </aside>

      {/* Mobile / tablet drawer */}
      <div className="lg:hidden" aria-hidden={!open}>
        <div
          className={`fixed inset-0 z-40 bg-slate-900/50 transition-opacity duration-200 ${
            open
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0"
          }`}
          onClick={closeNav}
        />
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-[min(18rem,85vw)] flex-col border-r border-slate-800 bg-slate-950 shadow-xl transition-transform duration-200 ease-out ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
          aria-label="Admin navigation drawer"
          aria-hidden={!open}
        >
          <SidebarNav onNavigate={closeNav} />
        </aside>
      </div>
    </>
  );
}
