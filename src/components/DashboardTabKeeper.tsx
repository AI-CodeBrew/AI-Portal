"use client";

import { Suspense, useEffect, useLayoutEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { DashboardPageHeader } from "@/components/DashboardPageHeader";
import { ResellerDashboard } from "@/components/ResellerDashboard";
import { OrdersList } from "@/components/OrdersList";
import { ShopifyProductsPanel } from "@/components/ShopifyProductsPanel";
import { InboxWorkspace } from "@/components/InboxWorkspace";
import { enableClientFetchCacheHydration } from "@/lib/client-fetch-cache";
import { enableOrdersListCacheHydration } from "@/lib/orders-list-cache";

const KEPT_PATHS = new Set([
  "/dashboard",
  "/dashboard/orders",
  "/dashboard/ads",
  "/dashboard/inbox",
]);

function KeptTab({ path }: { path: string }) {
  if (path === "/dashboard") {
    return (
      <div>
        <DashboardPageHeader
          title="Dashboard"
          description="Your store progress, orders, chats, and AI usage at a glance."
        />
        <ResellerDashboard />
      </div>
    );
  }

  if (path === "/dashboard/orders") {
    return (
      <div>
        <DashboardPageHeader title="Orders" />
        <Suspense fallback={<p className="text-slate-600">Loading orders...</p>}>
          <OrdersList />
        </Suspense>
      </div>
    );
  }

  if (path === "/dashboard/ads") {
    return (
      <div>
        <DashboardPageHeader
          title="Shopify Products"
          description="Browse your Shopify catalog, view details, and get a unique portal SKU so the AI can identify each product."
        />
        <ShopifyProductsPanel />
      </div>
    );
  }

  if (path === "/dashboard/inbox") {
    return (
      <div>
        <DashboardPageHeader
          compact
          title="Inbox"
          description="Search by name or phone. Take over a chat to reply yourself."
        />
        <InboxWorkspace />
      </div>
    );
  }

  return null;
}

/**
 * Keeps visited dashboard tabs mounted so switching back does not remount
 * or refetch. Hidden tabs stay subscribed to Supabase and patch only
 * changed rows.
 */
export function DashboardTabKeeper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [visited, setVisited] = useState<string[]>([]);

  useLayoutEffect(() => {
    enableClientFetchCacheHydration();
    enableOrdersListCacheHydration();
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !KEPT_PATHS.has(pathname)) return;
    setVisited((prev) => (prev.includes(pathname) ? prev : [...prev, pathname]));
  }, [pathname, ready]);

  // SSR + first client paint use the page tree so HTML matches.
  if (!ready) {
    return children;
  }

  const showPageChildren = !KEPT_PATHS.has(pathname);

  return (
    <>
      {visited.map((path) => (
        <div
          key={path}
          hidden={path !== pathname}
          className={path === pathname ? undefined : "hidden"}
        >
          <KeptTab path={path} />
        </div>
      ))}
      {showPageChildren ? children : null}
    </>
  );
}
