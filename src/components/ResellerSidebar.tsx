"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useStoreStatus } from "@/hooks/useStoreStatus";

const navItems = [
  { href: "/dashboard/orders", label: "Orders" },
  { href: "/dashboard/inbox", label: "Inbox" },
  { href: "/dashboard/integrations", label: "Integrations" },
];

export function ResellerSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { store } = useStoreStatus();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
          Reseller
        </p>
        <h1 className="mt-1 text-lg font-bold text-slate-900">
          {store?.store_name || "My Store"}
        </h1>
        {store?.shop_domain && (
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {store.shop_domain}
          </p>
        )}
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const active =
            pathname === item.href ||
            (item.href === "/dashboard/integrations" &&
              pathname.startsWith("/dashboard/integrations"));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <button
          onClick={signOut}
          className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
