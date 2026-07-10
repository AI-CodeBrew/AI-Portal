export type PlanId = "basic" | "pro" | "max";

export interface AiPlan {
  id: PlanId;
  name: string;
  monthlyLimit: number;
  description: string;
}

export const AI_PLANS: Record<PlanId, AiPlan> = {
  basic: {
    id: "basic",
    name: "Basic",
    monthlyLimit: 200,
    description: "200 AI WhatsApp replies per month",
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyLimit: 2000,
    description: "2,000 AI WhatsApp replies per month",
  },
  max: {
    id: "max",
    name: "Max",
    monthlyLimit: 20000,
    description: "20,000 AI WhatsApp replies per month",
  },
};

export const PLAN_ORDER: PlanId[] = ["basic", "pro", "max"];

export function getPlan(planId: string | null | undefined): AiPlan {
  const id = (planId ?? "basic") as PlanId;
  return AI_PLANS[id] ?? AI_PLANS.basic;
}

export function currentPeriodMonth(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function formatPeriodMonth(period: string): string {
  const [y, m] = period.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleString(undefined, { month: "long", year: "numeric" });
}

export function quotaLimitMessage(plan: AiPlan, used: number): string {
  return (
    `Your monthly AI reply limit has been reached on the ${plan.name} plan ` +
    `(${used.toLocaleString()}/${plan.monthlyLimit.toLocaleString()} used this month). ` +
    `Please upgrade your plan to continue automated WhatsApp replies. ` +
    `Connect PayTabs under Integrations to purchase Pro or Max.`
  );
}
