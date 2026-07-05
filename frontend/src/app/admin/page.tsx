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
  MessageCircle,
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
  user?: { id: string; name: string; phone: string; role: string; shop?: { id: string; name: string } | null } | null;
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
  onboardingStatus: "NEW" | "CONTACTED" | "SETUP_DONE" | "ACTIVATED" | "CONVERTED" | "CHURN_RISK";
  lastContactedAt?: string | null;
  followUpNotes?: string | null;
  activation: {
    productCount: number;
    salesCount: number;
    orderCount: number;
    secondDayReturn: boolean;
    activated: boolean;
  };
  user?: { id: string; name: string; phone: string } | null;
  lastPayment?: { amount: number; method: string; reference?: string | null; paidAt: string } | null;
}

interface AdminMetric {
  label: string;
  value: number;
  tone: string;
}

interface Supplier {
  id: string;
  name: string;
  phone: string;
  address?: string | null;
  verificationStatus?: "UNVERIFIED" | "NEEDS_REVIEW" | "VERIFIED" | "REJECTED";
  verifiedAt?: string | null;
  adminNotes?: string | null;
  _count?: { products: number; orders: number };
}

type Tab = "overview" | "users" | "audit" | "reset" | "reports" | "subscriptions" | "suppliers";

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

function MiniMetric({ label, value, tone }: AdminMetric) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${tone}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-xl font-bold">{value.toLocaleString()}</p>
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
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [subFilter, setSubFilter] = useState("ALL");
  const [updatingSub, setUpdatingSub] = useState<string | null>(null);
  const [updatingSupplier, setUpdatingSupplier] = useState<string | null>(null);
  const [followUpDrafts, setFollowUpDrafts] = useState<Record<string, string>>({});
  const [supplierNotes, setSupplierNotes] = useState<Record<string, string>>({});
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
      api.get<{ suppliers: Supplier[] }>("/suppliers"),
    ])
      .then(([ov, u, al, rp, sub, supplierData]) => {
        setOverview(ov);
        setUsers(u.users);
        setAuditLogs(al.logs);
        setReports(rp.reports);
        setSubscriptions(sub.shops);
        setSuppliers(supplierData.suppliers);
        setFollowUpDrafts(Object.fromEntries(sub.shops.map((shop) => [shop.id, shop.followUpNotes || ""])));
        setSupplierNotes(Object.fromEntries(supplierData.suppliers.map((supplier) => [supplier.id, supplier.adminNotes || ""])));
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
    setFollowUpDrafts(Object.fromEntries(data.shops.map((shop) => [shop.id, shop.followUpNotes || ""])));
  }

  async function refreshSuppliers() {
    const data = await api.get<{ suppliers: Supplier[] }>("/suppliers");
    setSuppliers(data.suppliers);
    setSupplierNotes(Object.fromEntries(data.suppliers.map((supplier) => [supplier.id, supplier.adminNotes || ""])));
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

  async function handleVerifyBillingReport(report: Report, plan: "BASIC" | "PRO") {
    const shopId = report.user?.shop?.id;
    if (!shopId) return;
    setUpdatingReport(report.id);
    try {
      const referenceMatch = report.description.match(/Reference:\s*([^\n]+)/i);
      await api.post(`/subscription/admin/${shopId}/payments`, {
        plan,
        months: 1,
        amount: plan === "PRO" ? 35000 : 15000,
        method: "MPESA",
        reference: referenceMatch?.[1]?.trim() || `REPORT-${report.id.slice(-6)}`,
        note: `Verified from billing report ${report.id}`,
      });
      const data = await api.patch<{ report: Report }>(`/reports/admin/${report.id}`, {
        status: "RESOLVED",
        adminNotes: `Payment verified. Activated ${plan}.`,
      });
      setReports((prev) => prev.map((r) => (r.id === report.id ? data.report : r)));
      await refreshSubscriptions();
    } catch (err) {
      console.error("Failed to verify billing report:", err);
    } finally {
      setUpdatingReport(null);
    }
  }

  async function handleUpdateSupplier(supplier: Supplier, patch: Partial<Pick<Supplier, "verificationStatus" | "adminNotes">>) {
    setUpdatingSupplier(supplier.id);
    try {
      await api.patch(`/suppliers/${supplier.id}`, patch);
      await refreshSuppliers();
    } catch (err) {
      console.error("Failed to update supplier:", err);
    } finally {
      setUpdatingSupplier(null);
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

  async function handleUpdateFollowUp(
    shop: Subscription,
    patch: Partial<Pick<Subscription, "onboardingStatus" | "lastContactedAt" | "followUpNotes">>
  ) {
    setUpdatingSub(shop.id);
    try {
      await api.patch(`/subscription/admin/${shop.id}`, patch);
      await refreshSubscriptions();
    } catch (err) {
      console.error("Failed to update follow-up:", err);
    } finally {
      setUpdatingSub(null);
    }
  }

  function whatsappLeadHref(shop: Subscription) {
    const phone = shop.user?.phone?.replace(/[^\d]/g, "") || "";
    const text = encodeURIComponent(`Habari ${shop.user?.name || ""}, hapa ni DukaPilot. Tunaweza kukusaidia kumalizia setup ya ${shop.name}: bidhaa 10, mauzo 10, na kurudi siku ya pili.`);
    return `https://wa.me/${phone}?text=${text}`;
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "users", label: "Users" },
    { id: "reset", label: "PIN Reset" },
    { id: "audit", label: "Audit Log" },
    { id: "reports", label: "Reports" },
    { id: "subscriptions", label: "Subscriptions" },
    { id: "suppliers", label: "Suppliers" },
  ];
  const activeShops = subscriptions.filter((shop) => shop.computedStatus === "active").length;
  const trialShops = subscriptions.filter((shop) => shop.computedStatus === "trial").length;
  const unpaidShops = subscriptions.filter((shop) => shop.computedStatus === "expired").length;
  const suspendedShops = subscriptions.filter((shop) => shop.computedStatus === "suspended").length;
  const expiringTrials = subscriptions.filter((shop) => shop.computedStatus === "trial" && shop.daysLeft !== null && shop.daysLeft <= 3).length;
  const activatedTrials = subscriptions.filter((shop) => shop.activation?.activated).length;
  const supportIssues = reports.filter((report) => report.status === "OPEN" || report.status === "IN_PROGRESS").length;
  const billingIssues = reports.filter((report) => report.type === "BILLING" && report.status !== "RESOLVED").length;
  const suspiciousErrors = auditLogs.filter((log) =>
    log.action.toLowerCase().includes("failed") ||
    log.action.toLowerCase().includes("error") ||
    log.path.includes("/auth/login")
  ).length;
  const openReports = reports.filter((report) => report.status === "OPEN" || report.status === "IN_PROGRESS");
  const urgentReports = openReports.filter((report) => report.priority === "HIGH" || report.priority === "URGENT");
  const stalledTrials = subscriptions.filter((shop) => !shop.activation?.activated && shop.computedStatus === "trial").length;
  const suppliersNeedingReview = suppliers.filter((supplier) => supplier.verificationStatus !== "VERIFIED").length;
  const verifiedSuppliers = suppliers.filter((supplier) => supplier.verificationStatus === "VERIFIED").length;
  const shopsNeedingFollowUp = subscriptions
    .filter((shop) =>
      shop.computedStatus === "expired" ||
      shop.computedStatus === "suspended" ||
      shop.onboardingStatus === "CHURN_RISK" ||
      (shop.computedStatus === "trial" && shop.daysLeft !== null && shop.daysLeft <= 3) ||
      (!shop.activation?.activated && shop.computedStatus === "trial")
    )
    .sort((a, b) => supportPriority(b) - supportPriority(a))
    .slice(0, 5);

  function supportPriority(shop: Subscription) {
    if (shop.computedStatus === "suspended") return 100;
    if (shop.computedStatus === "expired") return 90;
    if (shop.onboardingStatus === "CHURN_RISK") return 80;
    if (shop.computedStatus === "trial" && shop.daysLeft !== null && shop.daysLeft <= 1) return 70;
    if (shop.computedStatus === "trial" && shop.daysLeft !== null && shop.daysLeft <= 3) return 60;
    if (!shop.activation?.activated) return 40;
    return 0;
  }

  function supportReason(shop: Subscription) {
    if (shop.computedStatus === "suspended") return "Suspended shop";
    if (shop.computedStatus === "expired") return "Unpaid or expired";
    if (shop.onboardingStatus === "CHURN_RISK") return "Churn risk";
    if (shop.computedStatus === "trial" && shop.daysLeft !== null && shop.daysLeft <= 3) return `Trial ends in ${shop.daysLeft}d`;
    if (!shop.activation?.activated) return "Needs activation help";
    return "Follow up";
  }

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
        <div className="mb-6 flex w-full gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1 sm:w-fit">
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
          <div className="space-y-4">
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
            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-gray-900">Business Operations</h2>
                <span className="text-xs text-gray-400">Live support view</span>
              </div>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <MiniMetric label="Active shops" value={activeShops} tone="border-green-200 bg-green-50 text-green-800" />
                <MiniMetric label="Trials" value={trialShops} tone="border-yellow-200 bg-yellow-50 text-yellow-800" />
                <MiniMetric label="Trials <=3d" value={expiringTrials} tone="border-orange-200 bg-orange-50 text-orange-800" />
                <MiniMetric label="Activated" value={activatedTrials} tone="border-emerald-200 bg-emerald-50 text-emerald-800" />
                <MiniMetric label="Unpaid" value={unpaidShops} tone="border-red-200 bg-red-50 text-red-800" />
                <MiniMetric label="Suspended" value={suspendedShops} tone="border-gray-200 bg-gray-50 text-gray-800" />
                <MiniMetric label="Support issues" value={supportIssues} tone="border-blue-200 bg-blue-50 text-blue-800" />
                <MiniMetric label="Billing requests" value={billingIssues} tone="border-purple-200 bg-purple-50 text-purple-800" />
                <MiniMetric label="Suspicious errors" value={suspiciousErrors} tone="border-amber-200 bg-amber-50 text-amber-800" />
                <MiniMetric label="Suppliers review" value={suppliersNeedingReview} tone="border-orange-200 bg-orange-50 text-orange-800" />
                <MiniMetric label="Verified suppliers" value={verifiedSuppliers} tone="border-green-200 bg-green-50 text-green-800" />
              </div>
            </section>
            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Support Queue</h2>
                  <p className="text-xs text-gray-500">Prioritized shops and reports that need admin attention today.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setTab("subscriptions")} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
                    Open subscriptions
                  </button>
                  <button onClick={() => setTab("reports")} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                    Open reports
                  </button>
                  <button onClick={() => setTab("suppliers")} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                    Verify suppliers
                  </button>
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Next shops to contact</p>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-500">{shopsNeedingFollowUp.length}</span>
                  </div>
                  {shopsNeedingFollowUp.length === 0 ? (
                    <p className="rounded-lg bg-white px-3 py-4 text-sm text-gray-500">No urgent shop follow-ups right now.</p>
                  ) : (
                    <div className="space-y-2">
                      {shopsNeedingFollowUp.map((shop) => (
                        <div key={shop.id} className="rounded-lg bg-white p-3 shadow-sm">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{shop.name}</p>
                              <p className="text-xs text-gray-500">{shop.user?.name || "Owner"} · {shop.user?.phone || "No phone"}</p>
                              <p className="mt-1 text-xs font-semibold text-amber-700">{supportReason(shop)}</p>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              <a href={whatsappLeadHref(shop)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-green-100 px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-200">
                                <MessageCircle className="h-3 w-3" /> WhatsApp
                              </a>
                              <button onClick={() => setTab("subscriptions")} className="rounded-lg bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-200">
                                View
                              </button>
                            </div>
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-gray-500">
                            <span>Products {shop.activation?.productCount || 0}/10</span>
                            <span>Sales {shop.activation?.salesCount || 0}/10</span>
                            <span>Last contact {shop.lastContactedAt ? new Date(shop.lastContactedAt).toLocaleDateString() : "never"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid gap-2">
                  <MiniMetric label="High-priority reports" value={urgentReports.length} tone="border-red-200 bg-red-50 text-red-800" />
                  <MiniMetric label="Open reports" value={openReports.length} tone="border-blue-200 bg-blue-50 text-blue-800" />
                  <MiniMetric label="Stalled trials" value={stalledTrials} tone="border-orange-200 bg-orange-50 text-orange-800" />
                  <MiniMetric label="Needs billing action" value={billingIssues + unpaidShops + suspendedShops} tone="border-purple-200 bg-purple-50 text-purple-800" />
                  <MiniMetric label="Suppliers to verify" value={suppliersNeedingReview} tone="border-amber-200 bg-amber-50 text-amber-800" />
                </div>
              </div>
            </section>
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
                          <span className={`px-2 py-0.5 rounded text-xs ${report.type === "BILLING" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"}`}>{report.type}</span>
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
                          <p className="text-xs text-gray-500 mt-1">
                            From: {report.user.name} ({report.user.phone}) — {report.user.role}
                            {report.user.shop?.name ? ` · ${report.user.shop.name}` : ""}
                          </p>
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
                        {report.type === "BILLING" && report.user?.shop?.id && (
                          <>
                            <button
                              onClick={() => handleVerifyBillingReport(report, "BASIC")}
                              disabled={updatingReport === report.id}
                              className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium hover:bg-blue-200 disabled:opacity-50"
                            >
                              Verify Basic
                            </button>
                            <button
                              onClick={() => handleVerifyBillingReport(report, "PRO")}
                              disabled={updatingReport === report.id}
                              className="px-3 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium hover:bg-purple-200 disabled:opacity-50"
                            >
                              Verify Pro
                            </button>
                          </>
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
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Activation</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Follow-up</th>
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
                      <td className="px-4 py-2.5 text-xs">
                        <div className="space-y-1.5">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${
                            shop.activation?.activated ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                          }`}>
                            {shop.activation?.activated ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                            {shop.activation?.activated ? "Activated" : "In progress"}
                          </span>
                          <div className="grid gap-1 text-gray-500">
                            <span className={shop.activation?.productCount >= 10 ? "text-green-700" : ""}>
                              Products: {shop.activation?.productCount || 0}/10
                            </span>
                            <span className={shop.activation?.salesCount >= 10 ? "text-green-700" : ""}>
                              Sales: {shop.activation?.salesCount || 0}/10
                            </span>
                            <span className={shop.activation?.secondDayReturn ? "text-green-700" : ""}>
                              2nd day: {shop.activation?.secondDayReturn ? "yes" : "no"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        <div className="min-w-[220px] space-y-2">
                          <select
                            value={shop.onboardingStatus}
                            onChange={(e) => handleUpdateFollowUp(shop, { onboardingStatus: e.target.value as Subscription["onboardingStatus"] })}
                            disabled={updatingSub === shop.id}
                            className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-semibold text-gray-700"
                          >
                            <option value="NEW">NEW</option>
                            <option value="CONTACTED">CONTACTED</option>
                            <option value="SETUP_DONE">SETUP DONE</option>
                            <option value="ACTIVATED">ACTIVATED</option>
                            <option value="CONVERTED">CONVERTED</option>
                            <option value="CHURN_RISK">CHURN RISK</option>
                          </select>
                          <p className="text-gray-500">
                            Last contact: {shop.lastContactedAt ? new Date(shop.lastContactedAt).toLocaleDateString() : "never"}
                          </p>
                          <textarea
                            value={followUpDrafts[shop.id] || ""}
                            onChange={(e) => setFollowUpDrafts((prev) => ({ ...prev, [shop.id]: e.target.value }))}
                            placeholder="Notes: owner objection, next action, setup status..."
                            className="h-16 w-full resize-none rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                          />
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              onClick={() => handleUpdateFollowUp(shop, { lastContactedAt: new Date().toISOString() })}
                              disabled={updatingSub === shop.id}
                              className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium hover:bg-green-200 disabled:opacity-50"
                            >
                              Contacted today
                            </button>
                            <button
                              onClick={() => handleUpdateFollowUp(shop, { followUpNotes: followUpDrafts[shop.id] || "" })}
                              disabled={updatingSub === shop.id}
                              className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium hover:bg-gray-200 disabled:opacity-50"
                            >
                              Save notes
                            </button>
                            {shop.user?.phone && (
                              <a
                                href={whatsappLeadHref(shop)}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-brand-100 text-brand-700 rounded text-xs font-medium hover:bg-brand-200"
                              >
                                <MessageCircle className="h-3 w-3" /> WhatsApp
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
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

        {/* SUPPLIERS */}
        {tab === "suppliers" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <MiniMetric label="Total suppliers" value={suppliers.length} tone="border-gray-200 bg-gray-50 text-gray-800" />
              <MiniMetric label="Verified" value={verifiedSuppliers} tone="border-green-200 bg-green-50 text-green-800" />
              <MiniMetric label="Needs review" value={suppliers.filter((s) => s.verificationStatus === "NEEDS_REVIEW" || s.verificationStatus === "UNVERIFIED").length} tone="border-amber-200 bg-amber-50 text-amber-800" />
              <MiniMetric label="Rejected" value={suppliers.filter((s) => s.verificationStatus === "REJECTED").length} tone="border-red-200 bg-red-50 text-red-800" />
            </div>
            {suppliers.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
                No suppliers have been added yet.
              </div>
            ) : (
              suppliers.map((supplier) => (
                <div key={supplier.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-gray-950">{supplier.name}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          supplier.verificationStatus === "VERIFIED" ? "bg-green-100 text-green-700" :
                          supplier.verificationStatus === "REJECTED" ? "bg-red-100 text-red-700" :
                          "bg-amber-100 text-amber-700"
                        }`}>
                          {supplier.verificationStatus || "UNVERIFIED"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">{supplier.phone} {supplier.address ? `· ${supplier.address}` : ""}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        Products {supplier._count?.products || 0} · Orders {supplier._count?.orders || 0}
                        {supplier.verifiedAt ? ` · Verified ${new Date(supplier.verifiedAt).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a href={`https://wa.me/${supplier.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-200">
                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                      </a>
                      {(["VERIFIED", "NEEDS_REVIEW", "REJECTED"] as const).map((status) => (
                        <button
                          key={status}
                          onClick={() => handleUpdateSupplier(supplier, { verificationStatus: status })}
                          disabled={updatingSupplier === supplier.id}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                            status === "VERIFIED" ? "bg-green-100 text-green-700 hover:bg-green-200" :
                            status === "REJECTED" ? "bg-red-100 text-red-700 hover:bg-red-200" :
                            "bg-amber-100 text-amber-700 hover:bg-amber-200"
                          }`}
                        >
                          {status === "VERIFIED" ? "Verify" : status === "REJECTED" ? "Reject" : "Needs review"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <textarea
                      value={supplierNotes[supplier.id] || ""}
                      onChange={(e) => setSupplierNotes((prev) => ({ ...prev, [supplier.id]: e.target.value }))}
                      placeholder="Supplier notes: areas served, delivery terms, owner contact, issue history..."
                      className="min-h-16 resize-none rounded-lg border border-gray-200 px-3 py-2 text-xs"
                    />
                    <button
                      onClick={() => handleUpdateSupplier(supplier, { adminNotes: supplierNotes[supplier.id] || "" })}
                      disabled={updatingSupplier === supplier.id}
                      className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                    >
                      Save notes
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
