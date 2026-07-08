"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShopifyIcon, WhatsAppIcon } from "@/components/BrandIcons";

const tabs = [
  { href: "/dashboard/integrations", label: "All apps", exact: true, icon: null },
  {
    href: "/dashboard/integrations/shopify",
    label: "Shopify",
    exact: false,
    icon: <ShopifyIcon className="h-4 w-4" />,
  },
  {
    href: "/dashboard/integrations/whatsapp",
    label: "WhatsApp",
    exact: false,
    icon: <WhatsAppIcon className="h-4 w-4" />,
  },
];

export function IntegrationsNav() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-1 border-b border-slate-200">
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "border-emerald-500 text-emerald-700"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            {tab.icon}
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
