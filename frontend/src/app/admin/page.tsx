"use client";
import { useState, useEffect } from "react";
import AppShell from "@/components/layout/AppShell";
import { api, formatTZS } from "@/lib/api";
import {
  Users,
  Store,
  Package,
  ShoppingCart,
  Truck,
  ClipboardList,
  Search,
  Shield,
  AlertTriangle,
  Check,
  X,
  Clock,
  CheckCircle,
  XCircle,
} from "lucide-react";

interface AdminOverview {
  summary: {
    users: number;
    merchants: number;
    suppliers: number;
    admins: number;
    shops: number;
    products: number;
    sales: number;
    orders: number;
    auditLogs: number;
  };
}

interface AdminUser {
  id: string;
  phone: string;
  name: string;
  role: string;
  language?: string;
  createdAt: string;
  shop?: { id: string; name: string } | null;
  supplier?: { id: string; name: string } | null;
  isActive?: boolean;
  accountType?: "USER" | "STAFF";
}

interface AuditLog {
  id: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  method: string;
  path: string;
  ipAddress?: string;
  createdAt: string;
  user?: { id: string; name: string; phone: string; role: string } | null;
}

interface Report {
  id: string;
  type: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  adminNotes?: string;
  resolvedAt?: string;
  createdAt: string;
  user?: { id: string; name: string; phone: string; role: string } | null;
}

interface Subscription {
  id: string;
  name: string;
  plan: string;
  trialEndsAt?: string;
  subscriptionEndsAt?: string;
  isActive: boolean;
  computedStatus: string;
  daysLeft: number | null;
  user?: { id: string; name: string; phone: string } | null;
  lastPayment?: { amount: number; method: string; reference?: string | null; paidAt: string } | null;
}

type Tab = "overview" | "users" | "audit" | "reset" | "reports" | "subscriptions";

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-4`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>{icon}</div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
    </div>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [reportFilter, setReportFilter] = useState("OPEN");
  const [updatingReport, setUpdatingReport] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [subFilter, setSubFilter] = useState("ALL");
  const [updatingSub, setUpdatingSub] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // User search / PIN reset
  const [searchPhone, setSearchPhone] = useState("");
  const [searchResult, setSearchResult] = useState<AdminUser | null>(null);
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(false);
  const [resetPin, setResetPin] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<AdminOverview>("/admin/overview"),
      api.get<{ users: AdminUser[] }>("/admin/users"),
      api.get<{ logs: AuditLog[] }>("/admin/audit-logs?limit=50"),
      api.get<{ reports: Report[] }>("/reports/admin?limit=200"),
      api.get<{ shops: Subscription[] }>("/subscription/admin"),
    ])
      .then(([ov, u, al, rp, sub]) => {
        setOverview(ov);
        setUsers(u.users);
        setAuditLogs(al.logs);
        setReports(rp.reports);
        setSubscriptions(sub.shops);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchError("");
    setSearchResult(null);
    setResetMsg("");
    setResetError("");
    if (!searchPhone.trim()) return;
    setSearching(true);
    try {
      const data = await api.get<{ user: AdminUser }>(`/admin/users/search?phone=${encodeURIComponent(searchPhone.trim())}`);
      setSearchResult({ ...data.user, accountType: "USER" });
    } catch (err: unknown) {
      try {
        const data = await api.get<{ staff: AdminUser }>(`/admin/staff/search?phone=${encodeURIComponent(searchPhone.trim())}`);
        setSearchResult({ ...data.staff, accountType: "STAFF" });
      } catch {
        setSearchError(err instanceof Error ? err.message : "User or staff member not found");
      }
    } finally {
      setSearching(false);
    }
  }

  async function handleResetPin(e: React.FormEvent) {
    e.preventDefault();
    if (!searchResult || !resetPin) return;
    if (!/^\d{4,8}$/.test(resetPin)) {
      setResetError("PIN must be 4-8 digits");
      return;
    }
    setResetting(true);
    setResetError("");
    setResetMsg("");
    try {
      const endpoint = searchResult.accountType === "STAFF"
        ? `/admin/staff/${searchResult.id}/reset-pin`
        : `/admin/users/${searchResult.id}/reset-pin`;
      await api.post(endpoint, { newPin: resetPin });
      setResetMsg(`PIN for ${searchResult.name} (${searchResult.phone}) has been reset.`);
      setResetPin("");
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  }

  async function handleUpdateReport(reportId: string, status: string, adminNotes?: string) {
    setUpdatingReport(reportId);
    try {
      const data = await api.patch<{ report: Report }>(`/reports/admin/${reportId}`, { status, adminNotes });
      setReports((prev) => prev.map((r) => (r.id === reportId ? data.report : r)));
    } catch (err: unknown) {
      console.error("Failed to update report:", err);
    } finally {
      setUpdatingReport(null);
    }
  }

  async function handleExtendTrial(shopId: string, days: number) {
    setUpdatingSub(shopId);
    try {
      await api.post(`/subscription/admin/${shopId}/extend-trial`, { days });
      await refreshSubscriptions();
    } catch (err) {
      console.error("Failed to extend trial:", err);
    } finally {
      setUpdatingSub(null);
    }
  }

  async function refreshSubscriptions() {
    const data = await api.get<{ shops: Subscription[] }>("/subscription/admin");
    setSubscriptions(data.shops);
  }

  async function handleRecordPayment(shop: Subscription, plan: "BASIC" | "PRO") {
    setUpdatingSub(shop.id);
    try {
      await api.post(`/subscription/admin/${shop.id}/payments`, {
        plan,
        months: 1,
        amount: plan === "PRO" ? 35000 : 15000,
        method: "MPESA",
        reference: `MANUAL-${Date.now().toString().slice(-6)}`,
        note: "Marked paid by admin",
      });
      await refreshSubscriptions();
    } catch (err) {
      console.error("Failed to record subscription payment:", err);
    } finally {
      setUpdatingSub(null);
    }
  }

  async function handleToggleShopActive(shop: Subscription) {
    setUpdatingSub(shop.id);
    try {
      await api.patch(`/subscription/admin/${shop.id}`, { isActive: !shop.isActive });
      await refreshSubscriptions();
    } catch (err) {
      console.error("Failed to update shop status:", err);
    } finally {
      setUpdatingSub(null);
    }
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "users", label: "Users" },
    { id: "reset", label: "PIN Reset" },
    { id: "audit", label: "Audit Log" },
    { id: "reports", label: "Reports" },
    { id: "subscriptions", label: "Subscriptions" },
  ];

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto pb-24 lg:pb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors min-h-0 ${
                tab === t.id ? "bg-white text-brand-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* OVERVIEW */}
        {tab === "overview" && overview && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Total Users" value={overview.summary.users} icon={<Users className="w-4 h-4 text-blue-600" />} color="bg-blue-50" />
            <StatCard label="Merchants" value={overview.summary.merchants} icon={<Store className="w-4 h-4 text-brand-600" />} color="bg-brand-50" />
            <StatCard label="Suppliers" value={overview.summary.suppliers} icon={<Truck className="w-4 h-4 text-orange-600" />} color="bg-orange-50" />
            <StatCard label="Shops" value={overview.summary.shops} icon={<Store className="w-4 h-4 text-purple-600" />} color="bg-purple-50" />
            <StatCard label="Active Products" value={overview.summary.products} icon={<Package className="w-4 h-4 text-green-600" />} color="bg-green-50" />
            <StatCard label="Total Sales" value={overview.summary.sales} icon={<ShoppingCart className="w-4 h-4 text-sky-600" />} color="bg-sky-50" />
            <StatCard label="Supplier Orders" value={overview.summary.orders} icon={<ClipboardList className="w-4 h-4 text-indigo-600" />} color="bg-indigo-50" />
            <StatCard label="Audit Events" value={overview.summary.auditLogs} icon={<Shield className="w-4 h-4 text-gray-600" />} color="bg-gray-100" />
          </div>
        )}

        {/* USERS */}
        {tab === "users" && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 text-sm">All Users ({users.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Name</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Phone</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Role</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Shop / Supplier</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{u.name}</td>
                      <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{u.phone}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          u.role === "ADMIN" ? "bg-red-100 text-red-700"
                          : u.role === "MERCHANT" ? "bg-brand-100 text-brand-700"
                          : "bg-orange-100 text-orange-700"
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">
                        {u.shop?.name || u.supplier?.name || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">
                        {new Date(u.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PIN RESET */}
        {tab === "reset" && (
          <div className="max-w-md space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 flex items-start gap-2 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>Only reset PINs for users who have verified their identity. All resets are audit-logged.</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
              <h2 className="font-semibold text-gray-800 text-sm">Find User by Phone</h2>
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="tel"
                    value={searchPhone}
                    onChange={(e) => setSearchPhone(e.target.value)}
                    placeholder="+255 7XX XXX XXX"
                    className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={searching}
                  className="bg-brand-600 text-white text-sm px-3 py-2 rounded-lg disabled:opacity-60"
                >
                  {searching ? "..." : "Find"}
                </button>
              </form>
              {searchError && (
                <p className="text-red-600 text-sm flex items-center gap-1.5"><X className="w-3.5 h-3.5" />{searchError}</p>
              )}

              {searchResult && (
                <div className="border border-gray-200 rounded-lg p-3 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center">
                      <Users className="w-4 h-4 text-brand-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{searchResult.name}</p>
                      <p className="text-xs text-gray-500">
                        {searchResult.phone} - {searchResult.role}
                        {searchResult.accountType === "STAFF" ? " (Staff)" : ""}
                      </p>
                      {searchResult.shop && <p className="text-xs text-gray-400">{searchResult.shop.name}</p>}
                    </div>
                  </div>

                  <form onSubmit={handleResetPin} className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">New PIN (4-8 digits)</label>
                      <input
                        type="password"
                        inputMode="numeric"
                        value={resetPin}
                        onChange={(e) => setResetPin(e.target.value)}
                        placeholder="••••"
                        maxLength={8}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        required
                      />
                    </div>
                    {resetMsg && (
                      <p className="text-green-700 text-sm flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1.5">
                        <Check className="w-3.5 h-3.5" />{resetMsg}
                      </p>
                    )}
                    {resetError && <p className="text-red-600 text-sm">{resetError}</p>}
                    <button
                      type="submit"
                      disabled={resetting}
                      className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                    >
                      {resetting ? "Resetting..." : "Reset PIN"}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}

        {/* AUDIT LOG */}
        {tab === "audit" && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="font-semibold text-gray-800 text-sm">Recent Audit Events (last 50)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Action</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">User</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Path</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">{log.action}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-600">
                        {log.user ? `${log.user.name} (${log.user.phone})` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">
                        {log.method} {log.path}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">
                        {new Date(log.createdAt).toLocaleString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* REPORTS */}
        {tab === "reports" && (
          <div>
            <div className="flex gap-2 mb-4 flex-wrap">
              {["OPEN", "IN_PROGRESS", "RESOLVED", "REJECTED", "ALL"].map((s) => (
                <button
                  key={s}
                  onClick={() => setReportFilter(s)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    reportFilter === s ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {s} ({s === "ALL" ? reports.length : reports.filter((r) => r.status === s).length})
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {(reportFilter === "ALL" ? reports : reports.filter((r) => r.status === reportFilter)).length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-500 text-sm">
                  No reports in this category
                </div>
              ) : (
                (reportFilter === "ALL" ? reports : reports.filter((r) => r.status === reportFilter)).map((report) => (
                  <div key={report.id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            report.priority === "URGENT" ? "bg-red-100 text-red-700" :
                            report.priority === "HIGH" ? "bg-orange-100 text-orange-700" :
                            report.priority === "MEDIUM" ? "bg-yellow-100 text-yellow-700" :
                            "bg-gray-100 text-gray-600"
                          }`}>{report.priority}</span>
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{report.type}</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            report.status === "OPEN" ? "bg-blue-100 text-blue-700" :
                            report.status === "IN_PROGRESS" ? "bg-yellow-100 text-yellow-700" :
                            report.status === "RESOLVED" ? "bg-green-100 text-green-700" :
                            "bg-red-100 text-red-700"
                          }`}>{report.status}</span>
                        </div>
                        <h3 className="font-semibold text-gray-900 text-sm">{report.title}</h3>
                        <p className="text-xs text-gray-600 mt-1">{report.description}</p>
                        {report.user && (
                          <p className="text-xs text-gray-500 mt-1">From: {report.user.name} ({report.user.phone}) — {report.user.role}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">{new Date(report.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                    {report.adminNotes && (
                      <div className="mb-3 p-2 bg-blue-50 rounded-lg">
                        <p className="text-xs text-blue-800"><strong>Note:</strong> {report.adminNotes}</p>
                      </div>
                    )}
                    {report.status !== "RESOLVED" && report.status !== "REJECTED" && (
                      <div className="flex gap-2 flex-wrap mt-3 pt-3 border-t border-gray-100">
                        {report.status === "OPEN" && (
                          <button
                            onClick={() => handleUpdateReport(report.id, "IN_PROGRESS")}
                            disabled={updatingReport === report.id}
                            className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-medium hover:bg-yellow-200 disabled:opacity-50"
                          >
                            Mark In Progress
                          </button>
                        )}
                        <button
                          onClick={() => handleUpdateReport(report.id, "RESOLVED")}
                          disabled={updatingReport === report.id}
                          className="px-3 py-1 bg-green-100 text-green-700 rounded text-xs font-medium hover:bg-green-200 disabled:opacity-50"
                        >
                          Resolve
                        </button>
                        <button
                          onClick={() => handleUpdateReport(report.id, "REJECTED")}
                          disabled={updatingReport === report.id}
                          className="px-3 py-1 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* SUBSCRIPTIONS */}
        {tab === "subscriptions" && (
          <div>
            <div className="flex gap-2 mb-4 flex-wrap">
              {["ALL", "trial", "active", "expired", "suspended"].map((s) => (
                <button
                  key={s}
                  onClick={() => setSubFilter(s)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    subFilter === s ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {s.toUpperCase()} ({s === "ALL" ? subscriptions.length : subscriptions.filter((x) => x.computedStatus === s).length})
                </button>
              ))}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Shop</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Owner</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Plan</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Status</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Days Left</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Last Payment</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(subFilter === "ALL" ? subscriptions : subscriptions.filter((x) => x.computedStatus === subFilter)).map((shop) => (
                    <tr key={shop.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{shop.name}</td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{shop.user?.name}<br />{shop.user?.phone}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          shop.plan === "PRO" ? "bg-purple-100 text-purple-700" :
                          shop.plan === "BASIC" ? "bg-blue-100 text-blue-700" :
                          "bg-gray-100 text-gray-600"
                        }`}>{shop.plan}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          shop.computedStatus === "active" ? "bg-green-100 text-green-700" :
                          shop.computedStatus === "trial" ? "bg-yellow-100 text-yellow-700" :
                          shop.computedStatus === "expired" ? "bg-red-100 text-red-700" :
                          "bg-gray-100 text-gray-600"
                        }`}>{shop.computedStatus}</span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{shop.daysLeft !== null ? `${shop.daysLeft}d` : "-"}</td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">
                        {shop.lastPayment ? `${formatTZS(shop.lastPayment.amount)} ${shop.lastPayment.method}` : "None"}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            onClick={() => handleRecordPayment(shop, "BASIC")}
                            disabled={updatingSub === shop.id}
                            className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium hover:bg-blue-200 disabled:opacity-50"
                          >
                            Paid Basic
                          </button>
                          <button
                            onClick={() => handleRecordPayment(shop, "PRO")}
                            disabled={updatingSub === shop.id}
                            className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium hover:bg-purple-200 disabled:opacity-50"
                          >
                            Paid Pro
                          </button>
                          <button
                            onClick={() => handleExtendTrial(shop.id, 14)}
                            disabled={updatingSub === shop.id}
                            className="px-2 py-1 bg-brand-100 text-brand-700 rounded text-xs font-medium hover:bg-brand-200 disabled:opacity-50"
                          >
                            +14d trial
                          </button>
                          <button
                            onClick={() => handleToggleShopActive(shop)}
                            disabled={updatingSub === shop.id}
                            className={`px-2 py-1 rounded text-xs font-medium disabled:opacity-50 ${
                              shop.isActive ? "bg-red-100 text-red-700 hover:bg-red-200" : "bg-green-100 text-green-700 hover:bg-green-200"
                            }`}
                          >
                            {shop.isActive ? "Suspend" : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
