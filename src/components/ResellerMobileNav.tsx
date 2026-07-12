"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Home" },
  { href: "/dashboard/orders", label: "Orders" },
  { href: "/dashboard/products", label: "Products" },
  { href: "/dashboard/inbox", label: "Inbox" },
  { href: "/dashboard/ads", label: "Shopify" },
  { href: "/dashboard/ai", label: "AI" },
  { href: "/dashboard/whatsapp-templates", label: "Templates" },
  { href: "/dashboard/integrations", label: "Setup" },
  { href: "/dashboard/plan", label: "Plan" },
  { href: "/dashboard/support", label: "Support" },
];

export function ResellerMobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="-mx-1 mt-4 flex gap-1 overflow-x-auto pb-1 lg:hidden"
      aria-label="Reseller mobile navigation"
    >
      {links.map((link) => {
        const active =
          link.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${
              active
                ? "bg-emerald-600 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
