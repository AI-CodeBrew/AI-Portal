import { PlanUsageCard } from "@/components/PlanUsageCard";
import { AI_PLANS, PLAN_ORDER } from "@/lib/ai/plans";
import { DashboardPageHeader } from "@/components/DashboardPageHeader";

export default function ResellerPlanPage() {
  return (
    <div>
      <DashboardPageHeader
        title="Plan & AI Usage"
        description="Each incoming WhatsApp message that gets an AI reply counts as one usage. Counter resets every month (UTC)."
      />

      <PlanUsageCard />

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">Available plans</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {PLAN_ORDER.map((id) => {
            const plan = AI_PLANS[id];
            return (
              <div
                key={id}
                className="rounded-lg border border-slate-200 p-4"
              >
                <p className="text-lg font-bold text-slate-900">{plan.name}</p>
                <p className="mt-1 text-2xl font-bold text-blue-600">
                  {plan.monthlyLimit.toLocaleString()}
                  <span className="text-sm font-normal text-slate-600">
                    {" "}
                    / month
                  </span>
                </p>
                <p className="mt-2 text-sm text-slate-600">{plan.description}</p>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-sm text-slate-600">
          To upgrade, contact your platform administrator.
        </p>
      </div>
    </div>
  );
}
