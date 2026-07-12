"use client";

import { MobileMenuButton } from "@/components/MobileNavContext";
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
    <div className="mb-5 md:mb-6 lg:mb-8">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:gap-3">
          <MobileMenuButton className="mt-0.5" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              {title}
            </h1>
            {description && (
              <p className="mt-1 text-sm text-slate-600">{description}</p>
            )}
          </div>
        </div>
        <div className="shrink-0">
          <ResellerUserMenu />
        </div>
      </div>

      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
