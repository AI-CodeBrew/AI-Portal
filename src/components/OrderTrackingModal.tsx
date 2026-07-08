"use client";

import { useEffect, useState } from "react";
import type { Order } from "@/lib/types";

type TrackingData = {
  trackingNumber: string | null;
  trackingCompany: string | null;
  shopifyOrderId: string | null;
  shopifySynced?: boolean;
};

export function OrderTrackingModal({
  order,
  onClose,
  onSaved,
}: {
  order: Order;
  onClose: () => void;
  onSaved: (tracking: TrackingData) => void;
}) {
  const [trackingNumber, setTrackingNumber] = useState(
    order.tracking_number ?? ""
  );
  const [trackingCompany, setTrackingCompany] = useState(
    order.tracking_company ?? ""
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shopifyOrderId, setShopifyOrderId] = useState<string | null>(
    order.shopify_order_id
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/orders/${order.id}/tracking?refresh=1`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load tracking");

        if (!cancelled) {
          setTrackingNumber(data.tracking?.trackingNumber ?? "");
          setTrackingCompany(data.tracking?.trackingCompany ?? "");
          setShopifyOrderId(data.tracking?.shopifyOrderId ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [order.id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/orders/${order.id}/tracking`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackingNumber,
          trackingCompany: trackingCompany || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");

      onSaved({
        trackingNumber: data.tracking.trackingNumber,
        trackingCompany: data.tracking.trackingCompany,
        shopifyOrderId: data.tracking.shopifyOrderId,
        shopifySynced: data.tracking.shopifySynced,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const customer = order.customers as
    | { phone: string; name: string | null }
    | null
    | undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tracking-modal-title"
      >
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2
                id="tracking-modal-title"
                className="text-lg font-bold text-slate-900"
              >
                Order tracking
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {order.order_number ?? order.id.slice(0, 8)}
                {customer?.name ? ` · ${customer.name}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4 px-6 py-5">
          {loading ? (
            <p className="text-sm text-slate-600">Loading tracking from Shopify...</p>
          ) : (
            <>
              {shopifyOrderId ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  Linked to Shopify order #{shopifyOrderId}. Saving updates
                  tracking in Shopify and notifies the customer.
                </p>
              ) : (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  This order is not linked to Shopify yet. Tracking will be saved
                  here only until the order exists on Shopify.
                </p>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Tracking number
                </label>
                <input
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="e.g. 1Z999AA10123456784"
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Carrier (optional)
                </label>
                <input
                  type="text"
                  value={trackingCompany}
                  onChange={(e) => setTrackingCompany(e.target.value)}
                  placeholder="e.g. UPS, FedEx, TCS"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
              {error.includes("fulfillment") || error.includes("scope") ? (
                <p className="mt-1 text-xs">
                  Reconnect Shopify in Integrations to grant fulfillment
                  permissions.
                </p>
              ) : null}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || saving || !trackingNumber.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save tracking"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
