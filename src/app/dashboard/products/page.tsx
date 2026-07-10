import { DashboardPageHeader } from "@/components/DashboardPageHeader";
import { ProductsPanel } from "@/components/ProductsPanel";

export default function ProductsPage() {
  return (
    <div>
      <DashboardPageHeader
        title="Products"
        description="Add catalog products, upload images, and generate WhatsApp ad links the AI can recognize by SKU."
      />
      <ProductsPanel />
    </div>
  );
}
