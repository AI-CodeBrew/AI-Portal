"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/resellers", label: "Resellers" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/chats", label: "Chats" },
  { href: "/admin/support", label: "Support" },
];

export function AdminMobileNav() {
  const pathname = usePathname();

  return (
    <nav className="-mx-1 mt-4 flex gap-1 overflow-x-auto pb-1 lg:hidden">
      {links.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold ${
              active
                ? "bg-violet-600 text-white"
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
