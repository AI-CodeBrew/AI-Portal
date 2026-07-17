export type PlanId = "basic" | "growth" | "pro" | "enterprise";

/** @deprecated Legacy plan id — mapped to enterprise */
export type LegacyPlanId = "max";

export type PlanFeatureRow = {
  label: string;
  included: boolean;
  highlight?: string;
};

export interface AiPlan {
  id: PlanId;
  name: string;
  priceAed: number;
  monthlyLimit: number;
  /** null = unlimited portal products */
  productLimit: number | null;
  shopifyIntegration: boolean;
  adminChat: boolean;
  /** Reseller can buy via PayTabs checkout */
  selfCheckout: boolean;
  description: string;
  tagline: string;
  features: PlanFeatureRow[];
}

export const AI_PLANS: Record<PlanId, AiPlan> = {
  basic: {
    id: "basic",
    name: "Basic",
    priceAed: 0,
    monthlyLimit: 200,
    productLimit: 3,
    shopifyIntegration: false,
    adminChat: false,
    selfCheckout: false,
    tagline: "Get started free",
    description: "Up to 3 portal products · WhatsApp AI agent",
    features: [
      { label: "Portal products on your site", included: true, highlight: "Up to 3" },
      { label: "WhatsApp AI sales agent", included: true, highlight: "200 replies / mo" },
      { label: "AI credit top-ups", included: true },
      { label: "Shopify integration", included: false },
      { label: "Priority support", included: false },
      { label: "Chat with admin", included: false },
    ],
  },
  growth: {
    id: "growth",
    name: "Growth",
    priceAed: 49,
    monthlyLimit: 1000,
    productLimit: 7,
    shopifyIntegration: true,
    adminChat: false,
    selfCheckout: true,
    tagline: "Sync Shopify orders",
    description: "Up to 7 products · Shopify connected",
    features: [
      { label: "Portal products on your site", included: true, highlight: "Up to 7" },
      { label: "WhatsApp AI sales agent", included: true, highlight: "1,000 replies / mo" },
      { label: "Shopify integration", included: true },
      { label: "Order sync & catalog search", included: true },
      { label: "AI credit top-ups", included: true },
      { label: "Priority support", included: false },
      { label: "Chat with admin", included: false },
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceAed: 199,
    monthlyLimit: 5000,
    productLimit: 25,
    shopifyIntegration: true,
    adminChat: false,
    selfCheckout: true,
    tagline: "All features included",
    description: "Up to 25 products · priority support",
    features: [
      { label: "Portal products on your site", included: true, highlight: "Up to 25" },
      { label: "WhatsApp AI sales agent", included: true, highlight: "5,000 replies / mo" },
      { label: "Shopify integration", included: true },
      { label: "All portal features", included: true },
      { label: "Closed-deal learning & outcomes", included: true },
      { label: "Broadcasts & advanced AI settings", included: true },
      { label: "Priority support", included: true },
      { label: "Chat with admin", included: false },
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    priceAed: 0,
    monthlyLimit: 50000,
    productLimit: null,
    shopifyIntegration: true,
    adminChat: true,
    selfCheckout: false,
    tagline: "Custom — talk to us",
    description: "Unlimited products · dedicated support",
    features: [
      { label: "Portal products on your site", included: true, highlight: "Unlimited" },
      { label: "WhatsApp AI sales agent", included: true, highlight: "High volume" },
      { label: "Shopify integration", included: true },
      { label: "All portal features", included: true },
      { label: "Direct chat with admin", included: true },
      { label: "Dedicated support", included: true },
      { label: "Custom integrations", included: true },
      { label: "Face-to-face live session", included: true },
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ["basic", "growth", "pro", "enterprise"];

export const PLAN_PRICES_AED: Record<PlanId, number> = {
  basic: AI_PLANS.basic.priceAed,
  growth: AI_PLANS.growth.priceAed,
  pro: AI_PLANS.pro.priceAed,
  enterprise: AI_PLANS.enterprise.priceAed,
};

export function normalizePlanId(
  planId: string | null | undefined
): PlanId {
  if (planId === "max") return "enterprise";
  if (planId && planId in AI_PLANS) return planId as PlanId;
  return "basic";
}

export function getPlan(planId: string | null | undefined): AiPlan {
  return AI_PLANS[normalizePlanId(planId)];
}

export function getProductLimit(planId: string | null | undefined): number | null {
  return getPlan(planId).productLimit;
}

export function planAllowsShopify(planId: string | null | undefined): boolean {
  return getPlan(planId).shopifyIntegration;
}

export function planAllowsAdminChat(planId: string | null | undefined): boolean {
  return getPlan(planId).adminChat;
}

export function planAllowsSelfCheckout(planId: PlanId): boolean {
  return AI_PLANS[planId].selfCheckout;
}

export function formatProductLimit(planId: string | null | undefined): string {
  const limit = getProductLimit(planId);
  if (limit == null) return "Unlimited";
  return String(limit);
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
    `Upgrade your plan or buy AI top-ups in Plan & Usage to continue automated WhatsApp replies.`
  );
}

export function shopifyUpgradeMessage(planId: string | null | undefined): string {
  const plan = getPlan(planId);
  if (plan.shopifyIntegration) return "";
  return `Shopify integration is not included on the ${plan.name} plan. Upgrade to Growth or higher to connect Shopify and sync orders.`;
}

export function productLimitMessage(
  planId: string | null | undefined,
  currentCount: number
): string {
  const plan = getPlan(planId);
  const limit = plan.productLimit;
  if (limit == null) return "";
  if (currentCount < limit) return "";
  return `You've reached the ${limit}-product limit on the ${plan.name} plan. Upgrade to add more products on your site.`;
}
