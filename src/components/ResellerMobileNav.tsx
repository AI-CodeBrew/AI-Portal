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
];

export function ResellerMobileNav() {
  const pathname = usePathname();

  return (
    <nav className="-mx-1 mt-4 flex gap-1 overflow-x-auto pb-1 lg:hidden">
      {links.map((link) => {
        const active =
          link.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold ${
              active
                ? "bg-emerald-500 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
