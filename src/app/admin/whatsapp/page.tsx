import { AdminPageHeader } from "@/components/AdminPageHeader";
import { AdminWhatsAppPlatformPanel } from "@/components/AdminWhatsAppPlatformPanel";

export const dynamic = "force-dynamic";

export default function AdminWhatsAppPlatformPage() {
  return (
    <div>
      <AdminPageHeader
        title="WhatsApp Platform Setup"
        description="Configure the platform Meta app once. Resellers connect their WhatsApp numbers without entering App ID or Secret."
      />
      <AdminWhatsAppPlatformPanel />
    </div>
  );
}
