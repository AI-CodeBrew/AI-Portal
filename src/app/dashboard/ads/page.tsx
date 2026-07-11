import { ShopifyProductsPanel } from "@/components/ShopifyProductsPanel";
import { DashboardPageHeader } from "@/components/DashboardPageHeader";

export default function AdsPage() {
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
