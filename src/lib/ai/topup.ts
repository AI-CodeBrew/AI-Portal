import type { PlanId } from "./plans";

/** AI message credit top-up packs (available on every plan including Basic). */
export type TopupPackId = "credits_100" | "credits_500" | "credits_2000";

export interface AiTopupPack {
  id: TopupPackId;
  credits: number;
  priceAed: number;
  label: string;
  description: string;
}

export const AI_TOPUP_PACKS: Record<TopupPackId, AiTopupPack> = {
  credits_100: {
    id: "credits_100",
    credits: 100,
    priceAed: 49,
    label: "100 AI messages",
    description: "Add 100 AI replies — works on Basic, Pro, or Max",
  },
  credits_500: {
    id: "credits_500",
    credits: 500,
    priceAed: 199,
    label: "500 AI messages",
    description: "Add 500 AI replies — best value mid pack",
  },
  credits_2000: {
    id: "credits_2000",
    credits: 2000,
    priceAed: 599,
    label: "2,000 AI messages",
    description: "Add 2,000 AI replies without changing your plan",
  },
};

export const TOPUP_PACK_ORDER: TopupPackId[] = [
  "credits_100",
  "credits_500",
  "credits_2000",
];

export function getTopupPack(id: string | null | undefined): AiTopupPack | null {
  if (!id) return null;
  return AI_TOPUP_PACKS[id as TopupPackId] ?? null;
}

export function effectiveMonthlyLimit(
  planId: PlanId | string | null | undefined,
  topupCredits: number,
  planLimit: number
): number {
  void planId;
  return planLimit + Math.max(0, topupCredits);
}
