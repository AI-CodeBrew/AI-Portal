"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArabiaAILogo } from "@/components/ArabiaAILogo";
import { useMobileNav } from "@/components/MobileNavContext";
import { prefetchJson } from "@/lib/client-fetch-cache";

function prefetchTab(href: string) {
  if (href === "/dashboard") {
    prefetchJson("dashboard:stats:all", "/api/dashboard/stats?period=all");
    return;
  }
  if (href === "/dashboard/inbox") {
    prefetchJson(
      "inbox:list:filter=all&page=1&limit=10",
      "/api/inbox?filter=all&page=1&limit=10"
    );
    return;
  }
  if (href === "/dashboard/products") {
    prefetchJson("store:products", "/api/store/products");
    return;
  }
  if (href === "/dashboard/ai") {
    prefetchJson("store:ai-settings", "/api/store/ai-settings");
    return;
  }
  if (href === "/dashboard/ads") {
    prefetchJson(
      "shopify-products::1:10",
      "/api/store/shopify-products?limit=10&page=1"
    );
  }
}

type NavItem = {
  href: string;
  label: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard" }],
  },
  {
    label: "Commerce",
    items: [
      { href: "/dashboard/orders", label: "Orders" },
      { href: "/dashboard/products", label: "Products" },
      { href: "/dashboard/inbox", label: "Inbox" },
    ],
  },
  {
    label: "Growth",
    items: [{ href: "/dashboard/ads", label: "Shopify Products" }],
  },
  {
    label: "Settings",
    items: [
      { href: "/dashboard/ai", label: "AI Settings" },
      { href: "/dashboard/whatsapp-templates", label: "WA Templates" },
      { href: "/dashboard/integrations", label: "Integrations" },
      { href: "/dashboard/plan", label: "Plan & Usage" },
      { href: "/dashboard/support", label: "Support" },
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
    case "Dashboard":
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
          />
        </svg>
      );
    case "Orders":
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
          />
        </svg>
      );
    case "Products":
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          />
        </svg>
      );
    case "Inbox":
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      );
    case "Shopify Products":
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"
          />
        </svg>
      );
    case "AI Settings":
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      );
    case "WA Templates":
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      );
    case "Integrations":
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z"
          />
        </svg>
      );
    case "Plan & Usage":
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"
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
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      );
  }
}

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/dashboard/integrations") {
    return pathname.startsWith("/dashboard/integrations");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      <div className="border-b border-slate-800 px-4 py-5">
        <ArabiaAILogo size="md" />
        <p className="mt-3 text-xs font-medium text-slate-400">
          Commerce portal
        </p>
      </div>

      <nav
        className="flex-1 overflow-y-auto px-3 py-4"
        aria-label="Reseller navigation"
      >
        {navGroups.map((group, index) => (
          <div key={group.label} className={index > 0 ? "mt-6" : undefined}>
            <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {group.label}
            </p>
            <ul className="space-y-0.5" role="list">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={onNavigate}
                      onMouseEnter={() => prefetchTab(item.href)}
                      onFocus={() => prefetchTab(item.href)}
                      className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                        active
                          ? "bg-emerald-600 text-white"
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
        <p className="text-xs text-slate-500">Powered by FynkTech</p>
      </div>
    </>
  );
}

export function ResellerSidebar() {
  const { open, closeNav } = useMobileNav();

  return (
    <>
      {/* Desktop — unchanged fixed sidebar */}
      <aside
        className="hidden w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-950 lg:flex"
        aria-label="Reseller navigation"
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
          aria-label="Reseller navigation drawer"
          aria-hidden={!open}
        >
          <SidebarNav onNavigate={closeNav} />
        </aside>
      </div>
    </>
  );
}
