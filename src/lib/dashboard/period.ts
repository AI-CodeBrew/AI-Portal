export const DASHBOARD_PERIODS = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
] as const;

export type DashboardPeriodId = (typeof DASHBOARD_PERIODS)[number]["id"];

export function parseDashboardPeriod(
  value: string | null | undefined
): DashboardPeriodId {
  if (DASHBOARD_PERIODS.some((p) => p.id === value)) {
    return value as DashboardPeriodId;
  }
  return "all";
}
