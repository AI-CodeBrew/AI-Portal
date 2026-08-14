"use client";

export const ADMIN_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type AdminPageSize = (typeof ADMIN_PAGE_SIZE_OPTIONS)[number];

export function adminPageWindow(current: number, total: number): number[] {
  if (total <= 1) return total === 1 ? [1] : [];
  const start = Math.max(1, current - 2);
  const end = Math.min(total, current + 2);
  const pages: number[] = [];
  for (let p = start; p <= end; p++) pages.push(p);
  return pages;
}

export function AdminPaginationBar({
  page,
  totalPages,
  pageSize,
  totalItems,
  itemLabel = "items",
  loading,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  itemLabel?: string;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: AdminPageSize) => void;
}) {
  if (totalItems === 0 && totalPages <= 1) return null;

  const rangeStart = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-slate-600">
          Showing {rangeStart}–{rangeEnd} of {totalItems.toLocaleString()}{" "}
          {itemLabel}
          {totalPages > 0 ? ` · Page ${page} of ${totalPages}` : ""}
        </p>
        {onPageSizeChange && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span className="font-medium">Rows</span>
            <select
              value={pageSize}
              onChange={(e) =>
                onPageSizeChange(
                  Number(e.target.value) as AdminPageSize
                )
              }
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold text-slate-800"
            >
              {ADMIN_PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || loading}
          className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-100"
        >
          Back
        </button>
        {adminPageWindow(page, Math.max(1, totalPages)).map((p) => (
          <button
            key={p}
            type="button"
            disabled={loading}
            onClick={() => onPageChange(p)}
            className={`min-w-9 rounded-lg px-2.5 py-1.5 text-sm font-semibold ${
              p === page
                ? "bg-violet-600 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || loading || totalPages <= 1}
          className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-100"
        >
          Next
        </button>
      </div>
    </div>
  );
}
