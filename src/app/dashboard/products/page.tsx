import { DashboardPageHeader } from "@/components/DashboardPageHeader";
import { ProductsPanel } from "@/components/ProductsPanel";

export default function ProductsPage() {
  return (
    <div>
      <DashboardPageHeader
        title="Products"
        description="Add catalog products with auto-generated unique SKUs the AI uses to identify each product."
      />
      <ProductsPanel />
    </div>
  );
}
