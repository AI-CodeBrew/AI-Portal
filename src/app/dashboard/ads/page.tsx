import { ShopifyProductsPanel } from "@/components/ShopifyProductsPanel";
import { DashboardPageHeader } from "@/components/DashboardPageHeader";

export default function AdsPage() {
  return (
    <div>
      <DashboardPageHeader
        title="Shopify Products"
        description="Browse your Shopify catalog, view product details, and generate WhatsApp ad links to copy for Meta ads."
      />
      <ShopifyProductsPanel />
    </div>
  );
}
