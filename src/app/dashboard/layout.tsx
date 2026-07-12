import { ResellerSidebar } from "@/components/ResellerSidebar";
import { MobileNavProvider } from "@/components/MobileNavContext";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MobileNavProvider>
      <div className="flex min-h-screen overflow-x-hidden bg-[#F1F5F9]">
        <ResellerSidebar />
        <main className="min-w-0 flex-1 overflow-x-hidden p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </MobileNavProvider>
  );
}
