import { ArabiaAILogo } from "@/components/ArabiaAILogo";
import { ResellerMobileNav } from "@/components/ResellerMobileNav";
import { ResellerUserMenu } from "@/components/ResellerUserMenu";

export function DashboardPageHeader({
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
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {title}
              </h1>
              {description && (
                <p className="mt-1 text-sm text-slate-600">{description}</p>
              )}
            </div>
          </div>
        </div>
        <ResellerUserMenu />
      </div>

      <ResellerMobileNav />

      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
