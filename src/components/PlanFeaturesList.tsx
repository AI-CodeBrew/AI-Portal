import type { AiPlan, PlanId } from "@/lib/ai/plans";
import { AI_PLANS } from "@/lib/ai/plans";
import { formatMoney } from "@/lib/currency";
import Link from "next/link";

export function PlanFeaturesList({
  plan,
  compact,
}: {
  plan: AiPlan;
  compact?: boolean;
}) {
  return (
    <ul className={`space-y-1.5 ${compact ? "text-xs" : "text-sm"}`}>
      {plan.features.map((f) => (
        <li
          key={f.label}
          className={`flex items-start gap-2 ${
            f.included ? "text-slate-700" : "text-slate-400"
          }`}
        >
          <span
            className={`mt-0.5 shrink-0 ${
              f.included ? "text-emerald-600" : "text-slate-300"
            }`}
            aria-hidden
          >
            {f.included ? "✓" : "—"}
          </span>
          <span>
            {f.label}
            {f.included && f.highlight ? (
              <span className="font-semibold text-slate-900">
                {" "}
                · {f.highlight}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PlanPriceLabel({
  planId,
  plan,
  currency = "AED",
}: {
  planId: PlanId;
  plan: AiPlan;
  currency?: string;
}) {
  if (planId === "basic") {
    return <span>Free</span>;
  }
  if (planId === "enterprise") {
    return <span>Custom pricing</span>;
  }
  return <span>{formatMoney(plan.priceAed, currency)}/mo</span>;
}

export function PlanUpgradeLink({ className }: { className?: string }) {
  return (
    <Link
      href="/dashboard/plan"
      className={
        className ??
        "inline-flex items-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
      }
    >
      Upgrade plan
    </Link>
  );
}

export function planDisplayName(planId: string): string {
  return AI_PLANS[planId as PlanId]?.name ?? planId;
}
