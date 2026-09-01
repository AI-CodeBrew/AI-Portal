"use client";

import { MobileMenuButton } from "@/components/MobileNavContext";
import { ResellerUserMenu } from "@/components/ResellerUserMenu";

export function DashboardPageHeader({
  title,
  description,
  children,
  compact = false,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  /** Tighter spacing for full-height screens (inbox) that need the vertical room. */
  compact?: boolean;
}) {
  return (
    <div className={compact ? "mb-3" : "mb-5 md:mb-6 lg:mb-8"}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:gap-3">
          <MobileMenuButton className="mt-0.5" />
          <div className="min-w-0">
            <h1
              className={`font-bold tracking-tight text-slate-900 ${
                compact ? "text-lg sm:text-xl" : "text-xl sm:text-2xl"
              }`}
            >
              {title}
            </h1>
            {description && (
              <p
                className={`text-slate-600 ${
                  compact ? "mt-0.5 text-xs" : "mt-1 text-sm"
                }`}
              >
                {description}
              </p>
            )}
          </div>
        </div>
        <div className="shrink-0">
          <ResellerUserMenu />
        </div>
      </div>

      {children ? <div className={compact ? "mt-2.5" : "mt-4"}>{children}</div> : null}
    </div>
  );
}
