"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, clearToken, formatTZS } from "@/lib/api";
import { LogOut, Check, X, Truck, Clock, ChevronDown, ChevronUp, BarChart2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import LogoMark from "@/components/brand/LogoMark";

interface Order {
  id: string;
  status: string;
  totalAmount?: number;
  note?: string;
  createdAt: string;
  shop: { name: string; location: string; district?: string };
  items: Array<{ product: { name: string; unit: string }; quantity: number }>;
}

interface DashboardData {
  ordersByStatus: Record<string, number>;
  pendingOrders: Order[];
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Inasubiri",
  CONFIRMED: "Imethibitishwa",
  OUT_FOR_DELIVERY: "Imesafirishwa",
  DELIVERED: "Imepokelewa",
  CANCELLED: "Imefutwa",
};

// Supplier advances orders up to OUT_FOR_DELIVERY only.
// The merchant confirms delivery (which also restocks their inventory).
const STATUS_NEXT: Record<string, { action: string; label: string; color: string }> = {
  PENDING: { action: "CONFIRMED", label: "Thibitisha", color: "bg-blue-600" },
  CONFIRMED: { action: "OUT_FOR_DELIVERY", label: "Safirishwa", color: "bg-purple-600" },
};

export default function SupplierPortal() {
  const router = useRouter();
  const { toast } = useToast();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<DashboardData>("/suppliers/portal/dashboard"),
      api.get<{ orders: Order[] }>("/suppliers/portal/orders"),
    ])
      .then(([d, o]) => { setDashboard(d); setOrders(o.orders); })
      .catch(() => router.push("/"))
      .finally(() => setLoading(false));
  }, [router]);

  async function updateStatus(orderId: string, status: string) {
    setUpdating(orderId);
    try {
      await api.patch(`/suppliers/portal/orders/${orderId}/status`, { status });
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status } : o));
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Hitilafu imetokea", "error");
    } finally {
      setUpdating(null);
    }
  }

  const filtered = statusFilter === "all" ? orders : orders.filter((o) => o.status === statusFilter);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-brand-800 text-white px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LogoMark className="h-9 w-9 rounded-xl bg-white shadow-sm" />
            <div>
              <p className="font-bold">DukaOS - Msambazaji</p>
              <p className="text-brand-300 text-xs">Portal ya Wasambazaji</p>
            </div>
          </div>
          <button onClick={async () => { try { await api.post("/auth/logout", {}); } catch {} clearToken(); router.push("/"); }}
            className="flex items-center gap-1.5 text-brand-300 hover:text-white text-sm min-h-0">
            <LogOut className="w-4 h-4" /> Toka
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-4 pb-10">
        {/* Stats */}
        {dashboard && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Zinazosubiri", value: dashboard.ordersByStatus["PENDING"] || 0, color: "text-yellow-600" },
              { label: "Zilizothibitishwa", value: dashboard.ordersByStatus["CONFIRMED"] || 0, color: "text-blue-600" },
              { label: "Zinakwenda", value: dashboard.ordersByStatus["OUT_FOR_DELIVERY"] || 0, color: "text-purple-600" },
              { label: "Zimepokelewa", value: dashboard.ordersByStatus["DELIVERED"] || 0, color: "text-green-600" },
            ].map((stat) => (
              <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {[
            { v: "all", label: "Yote" },
            { v: "PENDING", label: "Zinazosubiri" },
            { v: "CONFIRMED", label: "Zilizothibitishwa" },
            { v: "OUT_FOR_DELIVERY", label: "Zinakwenda" },
            { v: "DELIVERED", label: "Zimepokelewa" },
          ].map(({ v, label }) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium min-h-0 ${
                statusFilter === v ? "bg-brand-600 text-white" : "bg-white border border-gray-200 text-gray-600"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Orders */}
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Hakuna maagizo</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((order) => {
              const nextAction = STATUS_NEXT[order.status];
              return (
                <div key={order.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900">{order.shop.name}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          order.status === "PENDING" ? "bg-yellow-100 text-yellow-700" :
                          order.status === "CONFIRMED" ? "bg-blue-100 text-blue-700" :
                          order.status === "OUT_FOR_DELIVERY" ? "bg-purple-100 text-purple-700" :
                          order.status === "DELIVERED" ? "bg-green-100 text-green-700" :
                          "bg-gray-100 text-gray-500"
                        }`}>
                          {STATUS_LABEL[order.status]}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {order.shop.location}{order.shop.district ? `, ${order.shop.district}` : ""} •{" "}
                        #{order.id.slice(-6).toUpperCase()}
                      </p>
                      {order.totalAmount && (
                        <p className="text-sm font-bold text-brand-700 mt-1">{formatTZS(order.totalAmount)}</p>
                      )}
                    </div>
                    <button onClick={() => setExpanded(expanded === order.id ? null : order.id)}
                      aria-label={`${expanded === order.id ? "Collapse" : "Expand"} order ${order.shop.name}`}
                      className="text-gray-400 min-h-0">
                      {expanded === order.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  {expanded === order.id && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="space-y-1 mb-3">
                        {order.items.map((item, i) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span className="text-gray-600">{item.product.name}</span>
                            <span className="font-medium">{item.quantity} {item.product.unit}</span>
                          </div>
                        ))}
                      </div>
                      {order.note && <p className="text-xs text-gray-400 italic mb-3">"{order.note}"</p>}

                      {nextAction && (
                        <button
                          onClick={() => updateStatus(order.id, nextAction.action)}
                          disabled={updating === order.id}
                          aria-label={`${nextAction.label} ${order.shop.name}`}
                          className={`w-full ${nextAction.color} text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2`}
                        >
                          {updating === order.id ? (
                            "Inasasisha..."
                          ) : (
                            <>
                              <Check className="w-4 h-4" />
                              {nextAction.label}
                            </>
                          )}
                        </button>
                      )}

                      {order.status === "OUT_FOR_DELIVERY" && (
                        <p className="text-xs text-gray-400 text-center mt-2">
                          Inasubiri uthibitisho wa mpokeaji
                        </p>
                      )}
                      {order.status === "PENDING" && (
                        <button onClick={() => updateStatus(order.id, "CANCELLED")}
                          aria-label={`Kataa Agizo ${order.shop.name}`}
                          className="w-full mt-2 border border-red-200 text-red-600 py-2 rounded-lg text-sm hover:bg-red-50 flex items-center justify-center gap-2">
                          <X className="w-3.5 h-3.5" /> Kataa Agizo
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
