import { AdminSidebar } from "@/components/AdminSidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[#F1F5F9]">
      <AdminSidebar />
      <main className="min-w-0 flex-1 overflow-auto p-6 sm:p-8">{children}</main>
    </div>
  );
}
