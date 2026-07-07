"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/currency";

interface AdminOrder {
  id: string;
  order_number: string | null;
  total: number | null;
  currency: string | null;
  status: string;
  source: string;
  customers: { phone: string; name: string | null } | null;
  stores: { shop_domain: string | null; owner_email: string | null } | null;
}

export function AdminOrdersList({ orders: initial }: { orders: AdminOrder[] }) {
  const [orders, setOrders] = useState(initial);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  async function confirmOrder(id: string) {
    setConfirming(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/orders/${id}/confirm`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Confirm failed");

      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, status: "confirmed" } : o))
      );

      let text = "Order confirmed.";
      if (data.shopify_sync_status === "synced") text += " Synced to Shopify.";
      if (data.whatsapp_sent) {
        text +=
          data.whatsapp_method === "template"
            ? " Customer notified on WhatsApp."
            : " Customer notified on WhatsApp (text message).";
      } else if (data.whatsapp_error) {
        text += ` WhatsApp: ${data.whatsapp_error}`;
      }

      setMessage({ type: "success", text });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Confirm failed",
      });
    } finally {
      setConfirming(null);
    }
  }

  return (
    <div className="space-y-4">
      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm font-medium ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Order
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Reseller / Store
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Customer
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Total
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Status
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-700">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-600">
                  No orders yet
                </td>
              </tr>
            ) : (
              orders.map((order) => {
                const customer = order.customers;
                const store = order.stores;

                return (
                  <tr key={order.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                      {order.order_number ?? order.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {store?.shop_domain ?? store?.owner_email ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      <p>{customer?.name ?? "—"}</p>
                      {customer?.phone && (
                        <p className="text-xs text-slate-500">{customer.phone}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">
                      {formatMoney(
                        Number(order.total ?? 0),
                        order.currency
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          order.status === "confirmed"
                            ? "bg-emerald-100 text-emerald-800"
                            : order.status === "cancelled"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {order.status === "pending" ? (
                        <button
                          onClick={() => confirmOrder(order.id)}
                          disabled={confirming === order.id}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {confirming === order.id ? "..." : "Confirm"}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
