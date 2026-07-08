import { ArabiaAILogo } from "@/components/ArabiaAILogo";
import { AdminMobileNav } from "@/components/AdminMobileNav";
import { AdminUserMenu } from "@/components/AdminUserMenu";

export function AdminPageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 sm:mb-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <div className="shrink-0 lg:hidden">
              <ArabiaAILogo size="sm" variant="light" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-violet-600">
                Arabia AI · Admin
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {title}
              </h1>
              {description && (
                <p className="mt-1 text-sm text-slate-600">{description}</p>
              )}
            </div>
          </div>
        </div>
        <AdminUserMenu />
      </div>

      <AdminMobileNav />

      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
