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
    <div className="mb-8">
      <h1 className="text-2xl font-bold text-slate-900">Integrations</h1>
      <p className="mt-1 text-sm text-slate-600">
        Connect Shopify and WhatsApp as separate apps
      </p>

      <div className="mt-6 flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              {tab.icon}
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
