"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/resellers", label: "Resellers" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/top-products", label: "Products" },
  { href: "/admin/chats", label: "Chats" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/whatsapp", label: "WhatsApp" },
  { href: "/admin/billing", label: "Billing" },
];

export function AdminMobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="-mx-1 mt-4 flex gap-1 overflow-x-auto pb-1 lg:hidden"
      aria-label="Admin mobile navigation"
    >
      {links.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${
              active
                ? "bg-violet-600 text-white"
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
