"use client";
import { useState, useEffect } from "react";
import AppShell from "@/components/layout/AppShell";
import WhatsAppCoexistencePanel from "@/components/admin/WhatsAppCoexistencePanel";
import AdminSupportWorkspace from "@/components/admin/AdminSupportWorkspace";
import { api, formatTZS, getCurrentSession } from "@/lib/api";
import { useLang } from "@/lib/i18n";
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
  MessageCircle,
  Trash2,
  ArrowRight,
  BadgeCheck,
  BellRing,
  CreditCard,
  Gift,
  RefreshCw,
  MessageSquareText,
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
    debts: number;
    expenses: number;
    paidShops: number;
    auditLogs: number;
  };
  launchAnalytics?: {
    registrations: number;
    merchantShops: number;
    firstProductProgress: number;
    firstSaleProgress: number;
    firstDebtProgress: number;
    expenseTrackingProgress: number;
    paidShops: number;
    paymentsConfirmed7d: number;
  };
  onboardingAnalytics?: {
    totalShops: number;
    new: number;
    contacted: number;
    needsHelp: number;
    setupDone: number;
    activated: number;
    paid: number;
    converted: number;
    churnRisk: number;
    contactedShops: number;
    shopsWithNotes: number;
    recentlyContactedShops: number;
    followUpCoverage: number;
    noteCoverage: number;
  };
  marketingAnalytics?: {
    storeClicks30d: number;
    signupsStarted30d: number;
    trialsStarted30d: number;
    whatsappStarted30d: number;
    topSources: Array<{ source: string; registrations: number; activated: number }>;
  };
  assistantAnalytics?: {
    summary: {
      total: number;
      open: number;
      opened: number;
      completed: number;
      dismissed: number;
      completedRate: number;
      dismissedRate: number;
      openedRate: number;
    };
    topActions: Array<{ actionKey: string; count: number; title: string; href: string }>;
  };
  pushAnalytics?: {
    activeDevices: number;
    queued: number;
    retrying: number;
    sent30d: number;
    failed30d: number;
    shortcuts30d: Array<{ action: string; count: number }>;
  };
}

interface OperationsSummary {
  openReports: number;
  billingReports: number;
  urgentReports: number;
  qualifiedReferrals: number;
  supplierReview: number;
  loginFailures24h: number;
  loginFailures7d: number;
  shopsNeedingAction: number;
  dueFollowUps: number;
  reviewCheckouts: number;
  recentNotes: Array<{ id: string; body: string; createdAt: string; shop: { id: string; name: string }; author: { name: string } | null }>;
  latestAdminAction: AuditLog | null;
  paymentReviewQueue: Report[];
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

interface AdminReportsResponse {
  reports: Report[];
  total: number;
  page: number;
  totalPages: number;
  statusCounts: Record<string, number>;
}

interface AdminPagedResponse {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Subscription {
  additionalBranchSlots?: number;
  id: string;
  name: string;
  plan: string;
  trialEndsAt?: string;
  subscriptionEndsAt?: string;
  validUntil?: string | null;
  isActive: boolean;
  computedStatus: string;
  daysLeft: number | null;
  reminderStage?: string | null;
  onboardingStatus: "NEW" | "CONTACTED" | "NEEDS_HELP" | "SETUP_DONE" | "ACTIVATED" | "PAID" | "CONVERTED" | "CHURN_RISK";
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

interface SubscriptionListResponse {
  shops: Subscription[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  statusCounts: Record<"trial" | "active" | "expired" | "suspended", number>;
  supportQueue: Subscription[];
  operationalCounts: { expiringTrials: number; stalledTrials: number; activatedTrials: number };
}

interface CheckoutException {
  id: string;
  plan: string;
  amount: number;
  status: string;
  phone: string;
  providerId?: string | null;
  updatedAt: string;
  shop: { id: string; name: string; user?: { name: string; phone: string } | null };
}

interface CheckoutExceptionListResponse extends AdminPagedResponse {
  checkouts: CheckoutException[];
}

interface AdminReferral {
  id: string;
  status: "PENDING" | "QUALIFIED" | "REWARDED" | "REJECTED";
  salesCount: number;
  salesRemaining: number;
  rewardEligible: boolean;
  createdAt: string;
  qualifiedAt?: string | null;
  rewardedAt?: string | null;
  note?: string | null;
  referrerShop: {
    id: string;
    name: string;
    plan: string;
    trialEndsAt?: string | null;
    subscriptionEndsAt?: string | null;
    user?: { name: string; phone: string } | null;
  };
  referredShop: {
    id: string;
    name: string;
    createdAt: string;
    user?: { name: string; phone: string } | null;
  };
}

interface AdminReferralListResponse {
  referrals: AdminReferral[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  statusCounts?: Record<string, number>;
}

interface AdminMetric {
  label: string;
  value: number | string;
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

interface AdminSupplierListResponse extends AdminPagedResponse {
  suppliers: Supplier[];
  statusCounts?: Record<string, number>;
  globalStatusCounts?: Record<string, number>;
}

interface SyncShopSummary {
  shop: { id: string; name: string; user?: { name: string; phone: string } | null };
  queued: number;
  synced: number;
  failed: number;
  removed: number;
  lastEventAt: string | null;
  recentFailures?: Array<{
    id: string;
    deviceId?: string | null;
    deviceLabel?: string | null;
    total?: number | null;
    message?: string | null;
    attempts: number;
    localId?: string | null;
    resolutionStatus?: "OPEN" | "CONTACTED" | "RESOLVED";
    resolutionNote?: string | null;
    contactedAt?: string | null;
    resolvedAt?: string | null;
    createdAt: string;
  }>;
}

interface AdminSyncEvent {
  id: string;
  shopId: string;
  deviceId?: string | null;
  deviceLabel?: string | null;
  status: "QUEUED" | "SYNCED" | "FAILED" | "REMOVED";
  total?: number | null;
  message?: string | null;
  attempts: number;
  localId?: string | null;
  operationKind?: "SALE" | "CROP_FIELD";
  resolutionStatus?: "OPEN" | "CONTACTED" | "RESOLVED";
  resolutionNote?: string | null;
  contactedAt?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  shop?: { id: string; name: string; user?: { name: string; phone: string } | null };
}

interface AdminSyncEventsResponse extends AdminPagedResponse {
  events: AdminSyncEvent[];
  devices: AdminSyncDeviceRow[];
}

interface AdminSyncDeviceRow {
  shopId: string;
  shop?: { id: string; name: string; user?: { name: string; phone: string } | null } | null;
  deviceId?: string | null;
  deviceLabel?: string | null;
  status: "QUEUED" | "SYNCED" | "FAILED" | "REMOVED";
  _count: { id: number };
  _max: { createdAt: string | null };
}

interface SmsMonitoring {
  provider: "NEXTSMS";
  fetchedAt: string;
  balance: { smsCredits: number; balanceTzs: number; display: string; channel: string };
  summary: { total: number; delivered: number; failed: number; pending: number };
  reports: Array<{
    messageId: string;
    reference: string;
    to: string;
    sender: string;
    channel: string;
    smsCount: number;
    status: string;
    sentAt: string | null;
    doneAt: string | null;
  }>;
}

interface BillingDraft {
  extraBranches?: string;
  kind?: string;
  plan: "BASIC" | "PRO";
  months: string;
  amount: string;
  method: string;
  reference: string;
  note: string;
}

interface BillingFeedback {
  tone: "success" | "error";
  message: string;
}

type Tab = "overview" | "support" | "users" | "audit" | "reset" | "reports" | "subscriptions" | "referrals" | "suppliers" | "sync" | "sms" | "whatsapp";

async function optionalAdminLoad<T>(label: string, request: Promise<T>, fallback: T, onFailure: (label: string, error: unknown) => void): Promise<T> {
  try {
    return await request;
  } catch (error) {
    console.warn(`Admin optional load failed: ${label}`, error);
    onFailure(label, error);
    return fallback;
  }
}

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

function ActionCard({
  icon,
  title,
  detail,
  value,
  tone,
  action,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  value: number | string;
  tone: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group rounded-xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${tone}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/80">
            {icon}
          </div>
          <div>
            <p className="text-sm font-bold">{title}</p>
            <p className="mt-1 text-xs leading-5 opacity-80">{detail}</p>
          </div>
        </div>
        <span className="text-2xl font-black">{value}</span>
      </div>
      <div className="mt-3 inline-flex items-center gap-1 text-xs font-bold">
        {action}
        <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}

function AdminPager({ page, totalPages, total, pageSize = 25, sw, onPage }: { page: number; totalPages: number; total: number; pageSize?: number; sw: boolean; onPage: (page: number) => void }) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-white px-3 py-3 text-xs">
      <span className="text-gray-500">{from}-{to} {sw ? "kati ya" : "of"} {total.toLocaleString()}</span>
      <div className="flex items-center gap-2">
        <span className="mr-1 text-gray-500">{sw ? "Ukurasa" : "Page"} {page} / {totalPages}</span>
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="min-h-9 rounded border border-gray-200 px-3 font-semibold text-gray-700 disabled:opacity-40">{sw ? "Nyuma" : "Previous"}</button>
        <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)} className="min-h-9 rounded border border-gray-200 px-3 font-semibold text-gray-700 disabled:opacity-40">{sw ? "Mbele" : "Next"}</button>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const sw = useLang() === "sw";
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [assistantAnalytics, setAssistantAnalytics] = useState<NonNullable<AdminOverview["assistantAnalytics"]> | null>(null);
  const [operationsSummary, setOperationsSummary] = useState<OperationsSummary | null>(null);
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({});
  const [sectionLoading, setSectionLoading] = useState<Record<string, boolean>>({});
  const [pageError, setPageError] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotalPages, setUsersTotalPages] = useState(1);
  const [usersSearch, setUsersSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("ALL");
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditSearchDraft, setAuditSearchDraft] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [reportTotal, setReportTotal] = useState(0);
  const [reportPage, setReportPage] = useState(1);
  const [reportTotalPages, setReportTotalPages] = useState(1);
  const [reportStatusCounts, setReportStatusCounts] = useState<Record<string, number>>({});
  const [reportFilter, setReportFilter] = useState("OPEN");
  const [reportSearch, setReportSearch] = useState("");
  const [reportSearchDraft, setReportSearchDraft] = useState("");
  const [reportTypeFilter, setReportTypeFilter] = useState("ALL");
  const [reportPriorityFilter, setReportPriorityFilter] = useState("ALL");
  const [updatingReport, setUpdatingReport] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [subscriptionSupportQueue, setSubscriptionSupportQueue] = useState<Subscription[]>([]);
  const [selectedSupportShop, setSelectedSupportShop] = useState<Subscription | null>(null);
  const [subscriptionOperationalCounts, setSubscriptionOperationalCounts] = useState({ expiringTrials: 0, stalledTrials: 0, activatedTrials: 0 });
  const [checkoutExceptions, setCheckoutExceptions] = useState<CheckoutException[]>([]);
  const [checkoutExceptionTotal, setCheckoutExceptionTotal] = useState(0);
  const [checkoutExceptionPage, setCheckoutExceptionPage] = useState(1);
  const [checkoutExceptionTotalPages, setCheckoutExceptionTotalPages] = useState(1);
  const [checkoutExceptionSearch, setCheckoutExceptionSearch] = useState("");
  const [checkoutExceptionSearchDraft, setCheckoutExceptionSearchDraft] = useState("");
  const [retryingCheckout, setRetryingCheckout] = useState<string | null>(null);
  const [subscriptionTotal, setSubscriptionTotal] = useState(0);
  const [subscriptionPage, setSubscriptionPage] = useState(1);
  const [subscriptionPageSize, setSubscriptionPageSize] = useState(24);
  const [subscriptionTotalPages, setSubscriptionTotalPages] = useState(1);
  const [subscriptionStatusCounts, setSubscriptionStatusCounts] = useState<SubscriptionListResponse["statusCounts"]>({ trial: 0, active: 0, expired: 0, suspended: 0 });
  const [referrals, setReferrals] = useState<AdminReferral[]>([]);
  const [referralPage, setReferralPage] = useState(1);
  const [referralTotal, setReferralTotal] = useState(0);
  const [referralTotalPages, setReferralTotalPages] = useState(1);
  const [referralSearch, setReferralSearch] = useState("");
  const [referralSearchDraft, setReferralSearchDraft] = useState("");
  const [referralStatusFilter, setReferralStatusFilter] = useState("ALL");
  const [referralStatusCounts, setReferralStatusCounts] = useState<Record<string, number>>({});
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierTotal, setSupplierTotal] = useState(0);
  const [supplierPage, setSupplierPage] = useState(1);
  const [supplierTotalPages, setSupplierTotalPages] = useState(1);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierSearchDraft, setSupplierSearchDraft] = useState("");
  const [supplierStatusFilter, setSupplierStatusFilter] = useState("ALL");
  const [supplierStatusCounts, setSupplierStatusCounts] = useState<Record<string, number>>({});
  const [supplierGlobalStatusCounts, setSupplierGlobalStatusCounts] = useState<Record<string, number>>({});
  const [syncSummaries, setSyncSummaries] = useState<SyncShopSummary[]>([]);
  const [syncEvents, setSyncEvents] = useState<AdminSyncEvent[]>([]);
  const [syncDevices, setSyncDevices] = useState<AdminSyncDeviceRow[]>([]);
  const [syncShopFilter, setSyncShopFilter] = useState("");
  const [syncDeviceFilter, setSyncDeviceFilter] = useState("");
  const [syncStatusFilter, setSyncStatusFilter] = useState("");
  const [syncOperationFilter, setSyncOperationFilter] = useState("");
  const [syncSearch, setSyncSearch] = useState("");
  const [syncSearchDraft, setSyncSearchDraft] = useState("");
  const [syncPage, setSyncPage] = useState(1);
  const [syncTotal, setSyncTotal] = useState(0);
  const [syncTotalPages, setSyncTotalPages] = useState(1);
  const [loadingSyncEvents, setLoadingSyncEvents] = useState(false);
  const [smsMonitoring, setSmsMonitoring] = useState<SmsMonitoring | null>(null);
  const [loadingSmsMonitoring, setLoadingSmsMonitoring] = useState(false);
  const [smsMonitoringError, setSmsMonitoringError] = useState("");
  const [subFilter, setSubFilter] = useState("ALL");
  const [subscriptionSearch, setSubscriptionSearch] = useState("");
  const [updatingSub, setUpdatingSub] = useState<string | null>(null);
  const [updatingReferral, setUpdatingReferral] = useState<string | null>(null);
  const [recoveringReferral, setRecoveringReferral] = useState(false);
  const [referralRecovery, setReferralRecovery] = useState({ referralCode: "", referredPhone: "", note: "" });
  const [referralRecoveryMessage, setReferralRecoveryMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [updatingSupplier, setUpdatingSupplier] = useState<string | null>(null);
  const [followUpDrafts, setFollowUpDrafts] = useState<Record<string, string>>({});
  const [billingDrafts, setBillingDrafts] = useState<Record<string, BillingDraft>>({});
  const [billingFeedback, setBillingFeedback] = useState<Record<string, BillingFeedback>>({});
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
    let cancelled = false;
    const failed = (label: string, error: unknown) => {
      if (!cancelled) setSectionErrors((previous) => ({ ...previous, [label]: error instanceof Error ? error.message : "Request failed" }));
    };
    const start = <T,>(label: string, request: Promise<T>, fallback: T, accept: (data: T) => void) => {
      setSectionLoading((previous) => ({ ...previous, [label]: true }));
      void optionalAdminLoad(label, request, fallback, failed)
        .then((data) => { if (!cancelled) accept(data); })
        .finally(() => { if (!cancelled) setSectionLoading((previous) => ({ ...previous, [label]: false })); });
    };
    getCurrentSession<{ user: { role: string } }>()
      .then(({ user }) => {
        if (user.role !== "ADMIN") throw new Error("Admin access required");
        setLoading(false);
        start<AdminOverview | null>("overview", api.get<AdminOverview>("/admin/overview"), null, setOverview);
        start<OperationsSummary | null>("operations summary", api.get<OperationsSummary>("/admin/operations-summary"), null, setOperationsSummary);
        start("users", api.get<{ users: AdminUser[] } & AdminPagedResponse>("/admin/users?page=1&limit=25"), { users: [], total: 0, page: 1, limit: 25, totalPages: 1 }, (data) => { setUsers(data.users); setUsersTotal(data.total); setUsersPage(data.page); setUsersTotalPages(data.totalPages); });
        start("audit logs", api.get<{ logs: AuditLog[] } & AdminPagedResponse>("/admin/audit-logs?page=1&limit=25"), { logs: [], total: 0, page: 1, limit: 25, totalPages: 1 }, (data) => { setAuditLogs(data.logs); setAuditTotal(data.total); setAuditPage(data.page); setAuditTotalPages(data.totalPages); });
        start<AdminReportsResponse>("reports", api.get<AdminReportsResponse>("/reports/admin?limit=25&status=OPEN"), { reports: [], total: 0, page: 1, totalPages: 1, statusCounts: {} }, (data) => { setReports(data.reports); setReportTotal(data.total); setReportPage(data.page); setReportTotalPages(data.totalPages); setReportStatusCounts(data.statusCounts); });
        start<SubscriptionListResponse>("subscriptions", api.get<SubscriptionListResponse>("/subscription/admin?page=1&limit=24"), { shops: [], supportQueue: [], operationalCounts: { expiringTrials: 0, stalledTrials: 0, activatedTrials: 0 }, total: 0, page: 1, limit: 24, totalPages: 1, statusCounts: { trial: 0, active: 0, expired: 0, suspended: 0 } }, (data) => { setSubscriptions(data.shops); setSubscriptionSupportQueue(data.supportQueue || []); setSubscriptionOperationalCounts(data.operationalCounts || { expiringTrials: 0, stalledTrials: 0, activatedTrials: 0 }); setSubscriptionTotal(data.total); setSubscriptionPage(data.page); setSubscriptionPageSize(data.limit); setSubscriptionTotalPages(data.totalPages); setSubscriptionStatusCounts(data.statusCounts); setFollowUpDrafts(Object.fromEntries(data.shops.map((shop) => [shop.id, shop.followUpNotes || ""]))); });
        start<AdminReferralListResponse>("referrals", api.get<AdminReferralListResponse>("/admin/referrals?page=1&limit=25"), { referrals: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 1 } }, (data) => { setReferrals(data.referrals); setReferralPage(data.pagination.page); setReferralTotal(data.pagination.total); setReferralTotalPages(data.pagination.totalPages); setReferralStatusCounts(data.statusCounts || {}); });
        start<AdminSupplierListResponse>("suppliers", api.get<AdminSupplierListResponse>("/suppliers?page=1&limit=25"), { suppliers: [], total: 0, page: 1, limit: 25, totalPages: 1 }, (data) => { setSuppliers(data.suppliers); setSupplierTotal(data.total); setSupplierPage(data.page); setSupplierTotalPages(data.totalPages); setSupplierStatusCounts(data.statusCounts || {}); setSupplierGlobalStatusCounts(data.globalStatusCounts || {}); setSupplierNotes(Object.fromEntries(data.suppliers.map((supplier) => [supplier.id, supplier.adminNotes || ""]))); });
        start("sync summary", api.get<{ shops: SyncShopSummary[] }>("/sync/admin/summary"), { shops: [] }, (data) => setSyncSummaries(data.shops));
        start<AdminSyncEventsResponse>("sync events", api.get<AdminSyncEventsResponse>("/sync/admin/events?page=1&limit=50"), { events: [], devices: [], total: 0, page: 1, limit: 50, totalPages: 1 }, (data) => { setSyncEvents(data.events); setSyncDevices(data.devices); setSyncTotal(data.total); setSyncPage(data.page); setSyncTotalPages(data.totalPages); });
        start<NonNullable<AdminOverview["assistantAnalytics"]> | null>("assistant analytics", api.get<NonNullable<AdminOverview["assistantAnalytics"]>>("/assistant/admin/analytics"), null, setAssistantAnalytics);
        start<CheckoutExceptionListResponse>("payment exceptions", api.get<CheckoutExceptionListResponse>("/subscription/admin-checkouts/review?page=1&limit=25"), { checkouts: [], total: 0, page: 1, limit: 25, totalPages: 1 }, (data) => { setCheckoutExceptions(data.checkouts); setCheckoutExceptionTotal(data.total); setCheckoutExceptionPage(data.page); setCheckoutExceptionTotalPages(data.totalPages); });
      })
      .catch((error) => {
        if (!cancelled) setPageError(error instanceof Error ? error.message : "Could not verify admin access");
        if (!cancelled && error instanceof Error && !error.message.includes("Session expired")) console.error(error);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function retrySection(section: string) {
    setSectionLoading((previous) => ({ ...previous, [section]: true }));
    setSectionErrors((previous) => { const next = { ...previous }; delete next[section]; return next; });
    try {
      switch (section) {
        case "overview": setOverview(await api.get<AdminOverview>("/admin/overview")); break;
        case "operations summary": setOperationsSummary(await api.get<OperationsSummary>("/admin/operations-summary")); break;
        case "users": await refreshUsers(); break;
        case "audit logs": await refreshAuditLogs(); break;
        case "reports": await refreshReports(); break;
        case "subscriptions": await refreshSubscriptions(); break;
        case "referrals": await refreshReferrals(); break;
        case "suppliers": await refreshSuppliers(); break;
        case "sync summary": setSyncSummaries((await api.get<{ shops: SyncShopSummary[] }>("/sync/admin/summary")).shops); break;
        case "sync events": await refreshSyncEvents(); break;
        case "assistant analytics": {
          setAssistantAnalytics(await api.get<NonNullable<AdminOverview["assistantAnalytics"]>>("/assistant/admin/analytics"));
          break;
        }
        case "payment exceptions": await refreshCheckoutExceptions(); break;
      }
    } catch (error) {
      setSectionErrors((previous) => ({ ...previous, [section]: error instanceof Error ? error.message : "Request failed" }));
    } finally { setSectionLoading((previous) => ({ ...previous, [section]: false })); }
  }

  async function refreshUsers(page = usersPage, role = userRoleFilter, search = usersSearch) {
    const params = new URLSearchParams({ page: String(page), limit: "25", role });
    if (search.trim()) params.set("search", search.trim());
    const data = await api.get<{ users: AdminUser[] } & AdminPagedResponse>(`/admin/users?${params}`);
    setUsers(data.users);
    setUsersTotal(data.total);
    setUsersPage(data.page);
    setUsersTotalPages(data.totalPages);
  }

  async function refreshAuditLogs(page = auditPage, search = auditSearch) {
    const params = new URLSearchParams({ page: String(page), limit: "25" });
    if (search.trim()) params.set("search", search.trim());
    const data = await api.get<{ logs: AuditLog[] } & AdminPagedResponse>(`/admin/audit-logs?${params}`);
    setAuditLogs(data.logs);
    setAuditTotal(data.total);
    setAuditPage(data.page);
    setAuditTotalPages(data.totalPages);
  }

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

  async function refreshReports(status = reportFilter, page = reportPage, search = reportSearch, type = reportTypeFilter, priority = reportPriorityFilter) {
    const params = new URLSearchParams({ limit: "25", page: String(page) });
    if (status !== "ALL") params.set("status", status);
    if (search.trim()) params.set("search", search.trim());
    if (type !== "ALL") params.set("type", type);
    if (priority !== "ALL") params.set("priority", priority);
    const data = await api.get<AdminReportsResponse>(`/reports/admin?${params.toString()}`);
    setReports(data.reports);
    setReportTotal(data.total);
    setReportPage(data.page);
    setReportTotalPages(data.totalPages);
    setReportStatusCounts(data.statusCounts);
  }

  function submitUsersSearch(event: React.FormEvent) {
    event.preventDefault();
    setUsersSearch(usersSearch.trim());
    refreshUsers(1, userRoleFilter, usersSearch.trim()).catch((error) => setSectionErrors((previous) => ({ ...previous, users: error instanceof Error ? error.message : "Could not search users" })));
  }

  function submitAuditSearch(event: React.FormEvent) {
    event.preventDefault();
    setAuditSearch(auditSearchDraft.trim());
    refreshAuditLogs(1, auditSearchDraft.trim()).catch((error) => setSectionErrors((previous) => ({ ...previous, "audit logs": error instanceof Error ? error.message : "Could not search audit logs" })));
  }

  function submitReportsSearch(event: React.FormEvent) {
    event.preventDefault();
    setReportSearch(reportSearchDraft.trim());
    refreshReports(reportFilter, 1, reportSearchDraft.trim()).catch((error) => setSectionErrors((previous) => ({ ...previous, reports: error instanceof Error ? error.message : "Could not search reports" })));
  }

  function submitReferralsSearch(event: React.FormEvent) {
    event.preventDefault();
    setReferralSearch(referralSearchDraft.trim());
    refreshReferrals(1, referralSearchDraft.trim()).catch((error) => setSectionErrors((previous) => ({ ...previous, referrals: error instanceof Error ? error.message : "Could not search referrals" })));
  }

  function submitSuppliersSearch(event: React.FormEvent) {
    event.preventDefault();
    setSupplierSearch(supplierSearchDraft.trim());
    refreshSuppliers(1, supplierSearchDraft.trim()).catch((error) => setSectionErrors((previous) => ({ ...previous, suppliers: error instanceof Error ? error.message : "Could not search suppliers" })));
  }

  function submitSyncSearch(event: React.FormEvent) {
    event.preventDefault();
    setSyncSearch(syncSearchDraft.trim());
    refreshSyncEvents({ search: syncSearchDraft.trim(), page: 1 }).catch(console.error);
  }

  async function handleUpdateReport(reportId: string, status: string, adminNotes?: string) {
    setUpdatingReport(reportId);
    try {
      await api.patch<{ report: Report }>(`/reports/admin/${reportId}`, { status, adminNotes });
      await Promise.all([refreshReports(), api.get<OperationsSummary>("/admin/operations-summary").then(setOperationsSummary)]);
    } catch (err: unknown) {
      setSectionErrors((previous) => ({ ...previous, reports: err instanceof Error ? err.message : "Could not update report" }));
    } finally {
      setUpdatingReport(null);
    }
  }

  async function handleExtendTrial(shopId: string, days: number) {
    setUpdatingSub(shopId);
    setBillingFeedback((prev) => ({ ...prev, [shopId]: { tone: "success", message: "" } }));
    try {
      const data = await api.post<{ message: string }>(`/subscription/admin/${shopId}/extend-trial`, { days });
      await refreshSubscriptions();
      setBillingFeedback((prev) => ({ ...prev, [shopId]: { tone: "success", message: data.message } }));
    } catch (err) {
      setBillingFeedback((prev) => ({ ...prev, [shopId]: { tone: "error", message: err instanceof Error ? err.message : "Could not extend the trial." } }));
    } finally {
      setUpdatingSub(null);
    }
  }

  async function handleExtendSubscription(shop: Subscription, days: number) {
    setUpdatingSub(shop.id);
    setBillingFeedback((prev) => ({ ...prev, [shop.id]: { tone: "success", message: "" } }));
    try {
      const data = await api.post<{ message: string; shop: Subscription }>(`/subscription/admin/${shop.id}/extend-subscription`, {
        days,
        plan: shop.plan === "PRO" ? "PRO" : "BASIC",
      });
      await refreshSubscriptions();
      setBillingFeedback((prev) => ({ ...prev, [shop.id]: { tone: "success", message: `${data.message}. ${data.shop.name} is now active.` } }));
    } catch (err) {
      setBillingFeedback((prev) => ({ ...prev, [shop.id]: { tone: "error", message: err instanceof Error ? err.message : "Could not grant paid access." } }));
    } finally {
      setUpdatingSub(null);
    }
  }

  async function handleRemoveSubscription(shop: Subscription) {
    const confirmed = window.confirm(
      `Remove the paid subscription for ${shop.name}?\n\nThis will clear the active paid plan and paid valid-until date. The shop, customer account, products, sales, and payment history will stay in DukaPilot.\n\nUse this only for reversals, mistakes, or support cases.`
    );
    if (!confirmed) return;

    setUpdatingSub(shop.id);
    try {
      await api.delete(`/subscription/admin/${shop.id}`);
      await refreshSubscriptions();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to remove subscription");
    } finally {
      setUpdatingSub(null);
    }
  }

  async function refreshSubscriptions(options: { page?: number; status?: string; search?: string } = {}) {
    const page = options.page ?? subscriptionPage;
    const status = options.status ?? subFilter;
    const search = options.search ?? subscriptionSearch;
    const params = new URLSearchParams({ page: String(page), limit: String(subscriptionPageSize) });
    if (status !== "ALL") params.set("status", status);
    if (search.trim()) params.set("search", search.trim());
    const data = await api.get<SubscriptionListResponse>(`/subscription/admin?${params.toString()}`);
    setSubscriptions(data.shops);
    setSubscriptionSupportQueue(data.supportQueue || []);
    setSubscriptionOperationalCounts(data.operationalCounts || { expiringTrials: 0, stalledTrials: 0, activatedTrials: 0 });
    setSubscriptionTotal(data.total);
    setSubscriptionPage(data.page);
    setSubscriptionPageSize(data.limit);
    setSubscriptionTotalPages(data.totalPages);
    setSubscriptionStatusCounts(data.statusCounts);
    setFollowUpDrafts(Object.fromEntries(data.shops.map((shop) => [shop.id, shop.followUpNotes || ""])));
  }

  async function refreshCheckoutExceptions(page = checkoutExceptionPage, search = checkoutExceptionSearch) {
    const params = new URLSearchParams({ page: String(page), limit: "25" });
    if (search.trim()) params.set("search", search.trim());
    const data = await api.get<CheckoutExceptionListResponse>(`/subscription/admin-checkouts/review?${params}`);
    setCheckoutExceptions(data.checkouts);
    setCheckoutExceptionTotal(data.total);
    setCheckoutExceptionPage(data.page);
    setCheckoutExceptionTotalPages(data.totalPages);
  }

  function submitCheckoutExceptionSearch(event: React.FormEvent) {
    event.preventDefault();
    const search = checkoutExceptionSearchDraft.trim();
    setCheckoutExceptionSearch(search);
    refreshCheckoutExceptions(1, search).catch((error) => setSectionErrors((previous) => ({ ...previous, "payment exceptions": error instanceof Error ? error.message : "Could not search payment exceptions" })));
  }

  async function retryCheckoutException(id: string) {
    setRetryingCheckout(id);
    try {
      const data = await api.post<{ checkout: { status: string } }>(`/subscription/admin-checkouts/${id}/retry`, {});
      if (data.checkout.status !== "REVIEW") setCheckoutExceptions((current) => current.filter((item) => item.id !== id));
      await Promise.all([refreshSubscriptions(), refreshCheckoutExceptions()]);
    } finally {
      setRetryingCheckout(null);
    }
  }

  function updateSubscriptionFilter(status: string) {
    setSubFilter(status);
    refreshSubscriptions({ status, page: 1 }).catch(console.error);
  }

  function submitSubscriptionSearch(event: React.FormEvent) {
    event.preventDefault();
    refreshSubscriptions({ page: 1 }).catch(console.error);
  }

  async function refreshReferrals(page = referralPage, search = referralSearch, status = referralStatusFilter) {
    const params = new URLSearchParams({ page: String(page), limit: "25", status });
    if (search.trim()) params.set("search", search.trim());
    const data = await api.get<AdminReferralListResponse>(`/admin/referrals?${params}`);
    setReferrals(data.referrals);
    setReferralPage(data.pagination.page);
    setReferralTotal(data.pagination.total);
    setReferralTotalPages(data.pagination.totalPages);
    setReferralStatusCounts(data.statusCounts || {});
  }

  async function handleRewardReferral(referral: AdminReferral) {
    const confirmed = window.confirm(
      `Give ${referral.referrerShop.name} one free week for referring ${referral.referredShop.name}?\n\nThis reward can only be granted once.`
    );
    if (!confirmed) return;

    setUpdatingReferral(referral.id);
    try {
      const data = await api.post<{ message: string }>(`/admin/referrals/${referral.id}/reward`, {});
      window.alert(data.message);
      await Promise.all([refreshReferrals(), refreshSubscriptions()]);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not grant referral reward");
    } finally {
      setUpdatingReferral(null);
    }
  }

  async function handleRecoverReferral(event: React.FormEvent) {
    event.preventDefault();
    setReferralRecoveryMessage(null);
    setRecoveringReferral(true);
    try {
      const data = await api.post<{ message: string }>("/admin/referrals/recover", referralRecovery);
      setReferralRecovery({ referralCode: "", referredPhone: "", note: "" });
      setReferralRecoveryMessage({ tone: "success", text: data.message });
      await refreshReferrals();
    } catch (error) {
      setReferralRecoveryMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not recover referral" });
    } finally {
      setRecoveringReferral(false);
    }
  }

  async function handleRejectReferral(referral: AdminReferral) {
    const confirmed = window.confirm(`Mark the referral from ${referral.referrerShop.name} to ${referral.referredShop.name} as not valid?`);
    if (!confirmed) return;

    setUpdatingReferral(referral.id);
    try {
      await api.post(`/admin/referrals/${referral.id}/reject`, {});
      await refreshReferrals();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not update referral");
    } finally {
      setUpdatingReferral(null);
    }
  }

  async function refreshSuppliers(page = supplierPage, search = supplierSearch, status = supplierStatusFilter) {
    const params = new URLSearchParams({ page: String(page), limit: "25", status });
    if (search.trim()) params.set("search", search.trim());
    const data = await api.get<AdminSupplierListResponse>(`/suppliers?${params}`);
    setSuppliers(data.suppliers);
    setSupplierTotal(data.total);
    setSupplierPage(data.page);
    setSupplierTotalPages(data.totalPages);
    setSupplierStatusCounts(data.statusCounts || {});
    setSupplierGlobalStatusCounts(data.globalStatusCounts || {});
    setSupplierNotes(Object.fromEntries(data.suppliers.map((supplier) => [supplier.id, supplier.adminNotes || ""])));
  }

  async function refreshSyncEvents(patch?: { shopId?: string; deviceId?: string; status?: string; operationKind?: string; search?: string; page?: number }) {
    const nextShopId = patch?.shopId ?? syncShopFilter;
    const nextDeviceId = patch?.deviceId ?? syncDeviceFilter;
    const nextStatus = patch?.status ?? syncStatusFilter;
    const nextOperationKind = patch?.operationKind ?? syncOperationFilter;
    const nextSearch = patch?.search ?? syncSearch;
    const nextPage = patch?.page ?? syncPage;
    setLoadingSyncEvents(true);
    try {
      const params = new URLSearchParams({ limit: "50", page: String(nextPage) });
      if (nextShopId) params.set("shopId", nextShopId);
      if (nextDeviceId) params.set("deviceId", nextDeviceId);
      if (nextStatus) params.set("status", nextStatus);
      if (nextOperationKind) params.set("operationKind", nextOperationKind);
      if (nextSearch.trim()) params.set("search", nextSearch.trim());
      const data = await api.get<AdminSyncEventsResponse>(`/sync/admin/events?${params.toString()}`);
      setSyncEvents(data.events);
      setSyncDevices(data.devices);
      setSyncTotal(data.total);
      setSyncPage(data.page);
      setSyncTotalPages(data.totalPages);
    } finally {
      setLoadingSyncEvents(false);
    }
  }

  async function refreshSmsMonitoring(force = false) {
    setLoadingSmsMonitoring(true);
    setSmsMonitoringError("");
    try {
      const suffix = force ? "?refresh=true" : "";
      const data = await api.get<SmsMonitoring>(`/admin/sms-monitoring${suffix}`);
      setSmsMonitoring(data);
    } catch (error) {
      setSmsMonitoringError(error instanceof Error ? error.message : "Could not load SMS monitoring");
    } finally {
      setLoadingSmsMonitoring(false);
    }
  }

  function openSyncHistory(shopId?: string, deviceId?: string) {
    const nextShop = shopId || "";
    const nextDevice = deviceId || "";
    setSyncShopFilter(nextShop);
    setSyncDeviceFilter(nextDevice);
    setSyncStatusFilter("");
    setSyncOperationFilter("");
    setSyncSearch("");
    setSyncSearchDraft("");
    setTab("sync");
    refreshSyncEvents({ shopId: nextShop, deviceId: nextDevice, status: "", operationKind: "", search: "", page: 1 }).catch(console.error);
  }

  function displayDeviceLabel(deviceId?: string | null, label?: string | null, ownerName?: string | null) {
    if (label) return label;
    if (ownerName) return `${ownerName.split(" ")[0]} phone`;
    if (!deviceId) return "Unknown device";
    return `Device ${deviceId.slice(0, 6)}`;
  }

  async function handleUpdateSyncEvent(event: AdminSyncEvent, patch: { resolutionStatus?: "OPEN" | "CONTACTED" | "RESOLVED"; resolutionNote?: string }) {
    const data = await api.patch<{ event: AdminSyncEvent }>(`/sync/admin/events/${event.id}`, patch);
    setSyncEvents((prev) => prev.map((item) => (item.id === event.id ? data.event : item)));
    const summary = await api.get<{ shops: SyncShopSummary[] }>("/sync/admin/summary");
    setSyncSummaries(summary.shops);
  }

  async function handleSaveDeviceLabel(device: AdminSyncDeviceRow, label: string) {
    if (!device.deviceId || !label.trim()) return;
    await api.patch("/sync/admin/device-label", {
      shopId: device.shopId,
      deviceId: device.deviceId,
      deviceLabel: label.trim(),
    });
    await refreshSyncEvents();
    const summary = await api.get<{ shops: SyncShopSummary[] }>("/sync/admin/summary");
    setSyncSummaries(summary.shops);
  }

  function defaultBillingDraft(plan: "BASIC" | "PRO" = "BASIC"): BillingDraft {
    return {
      plan,
      months: "1",
      amount: plan === "PRO" ? "35000" : "15000",
      method: "MPESA",
      reference: "",
      note: "",
    };
  }

  function billingDraftFor(shop: Subscription) {
    return billingDrafts[shop.id] || { ...defaultBillingDraft(shop.plan === "PRO" ? "PRO" : "BASIC"), extraBranches: String(shop.additionalBranchSlots || 0), amount: String(shop.plan === "PRO" ? 35000 + 10000 * (shop.additionalBranchSlots || 0) : 15000) };
  }

  function formatDate(value?: string | null) {
    if (!value) return "-";
    return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  function validityLabel(shop: Subscription) {
    if (!shop.isActive) return "Suspended";
    if (shop.computedStatus === "trial") return `Trial until ${formatDate(shop.validUntil || shop.trialEndsAt)}`;
    if (shop.computedStatus === "active") return `Active until ${formatDate(shop.validUntil || shop.subscriptionEndsAt)}`;
    return shop.subscriptionEndsAt ? `Expired ${formatDate(shop.subscriptionEndsAt)}` : "No paid subscription";
  }

  function updateBillingDraft(shop: Subscription, patch: Partial<BillingDraft>) {
    setBillingDrafts((prev) => {
      const current = prev[shop.id] || billingDraftFor(shop);
      const next = { ...current, ...patch };
      if (patch.plan && !patch.amount) next.amount = patch.plan === "PRO" ? "35000" : "15000";
      return { ...prev, [shop.id]: next };
    });
  }

  async function handleRecordPayment(shop: Subscription, plan?: "BASIC" | "PRO", customDraft?: BillingDraft) {
    const draft = customDraft || (plan ? defaultBillingDraft(plan) : billingDraftFor(shop));
    const selectedPlan = plan || draft.plan;
    let reference = draft.reference.trim();
    if (!reference) {
      setBillingFeedback((prev) => ({
        ...prev,
        [shop.id]: { tone: "error", message: "Enter the payment reference above before recording a paid plan. For a support or demo renewal, use Grant 30-day access instead." },
      }));
      return;
    }
    setUpdatingSub(shop.id);
    setBillingFeedback((prev) => ({ ...prev, [shop.id]: { tone: "success", message: "" } }));
    try {
      const data = await api.post<{ message?: string; reused?: boolean; shop: Subscription }>(`/subscription/admin/${shop.id}/payments`, {
        plan: selectedPlan,
        kind: draft.kind || "RENEWAL",
        extraBranches: selectedPlan === "PRO" ? Number(draft.extraBranches ?? shop.additionalBranchSlots ?? 0) : 0,
        months: Number(draft.months) || 1,
        amount: Number(draft.amount) || (selectedPlan === "PRO" ? 35000 : 15000),
        method: draft.method || "MPESA",
        reference,
        note: draft.note.trim() || "Marked paid by admin",
      });
      await refreshSubscriptions();
      setBillingDrafts((prev) => ({ ...prev, [shop.id]: defaultBillingDraft(selectedPlan) }));
      setBillingFeedback((prev) => ({
        ...prev,
        [shop.id]: { tone: "success", message: data.reused ? "That payment reference was already recorded. The subscription is active." : `${shop.name} is now active on ${selectedPlan}.` },
      }));
    } catch (err) {
      setBillingFeedback((prev) => ({ ...prev, [shop.id]: { tone: "error", message: err instanceof Error ? err.message : "Could not record this payment." } }));
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
        sourceReportId: report.id,
      });
      await api.patch<{ report: Report }>(`/reports/admin/${report.id}`, {
        status: "RESOLVED",
        adminNotes: `Payment verified. Activated ${plan}.`,
      });
      await Promise.all([refreshReports(), refreshSubscriptions(), api.get<OperationsSummary>("/admin/operations-summary").then(setOperationsSummary)]);
    } catch (err) {
      setSectionErrors((previous) => ({ ...previous, reports: err instanceof Error ? err.message : "Could not verify billing report" }));
    } finally {
      setUpdatingReport(null);
    }
  }

  async function handleUpdateSupplier(supplier: Supplier, patch: Partial<Pick<Supplier, "verificationStatus" | "adminNotes">>) {
    setUpdatingSupplier(supplier.id);
    try {
      await api.patch(`/suppliers/${supplier.id}`, patch);
      await Promise.all([refreshSuppliers(), api.get<OperationsSummary>("/admin/operations-summary").then(setOperationsSummary)]);
    } catch (err) {
      setSectionErrors((previous) => ({ ...previous, suppliers: err instanceof Error ? err.message : "Could not update supplier" }));
    } finally {
      setUpdatingSupplier(null);
    }
  }

  async function handleDeleteUser(user: AdminUser) {
    const relationship = user.shop?.name
      ? `\n\nThis will also remove shop data for ${user.shop.name}.`
      : user.supplier?.name
        ? `\n\nThis removes the supplier login for ${user.supplier.name}. The supplier profile stays available for product/order history.`
        : "";
    const confirmed = window.confirm(`Remove ${user.name} (${user.phone}) from DukaPilot?${relationship}\n\nThis action cannot be undone.`);
    if (!confirmed) return;

    try {
      await api.delete(`/admin/users/${user.id}`);
      await refreshUsers(usersPage);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to remove user");
    }
  }

  async function handleDeleteSupplier(supplier: Supplier) {
    const orderCount = supplier._count?.orders || 0;
    const productCount = supplier._count?.products || 0;
    if (orderCount > 0) {
      window.alert("This supplier has order history, so DukaPilot will not delete it. Reject the supplier instead to keep order records safe.");
      return;
    }
    const confirmed = window.confirm(
      `Remove supplier ${supplier.name} (${supplier.phone})?\n\n${productCount} product(s) will be detached from this supplier. Any linked supplier login will also be removed.\n\nThis action cannot be undone.`
    );
    if (!confirmed) return;

    setUpdatingSupplier(supplier.id);
    try {
      await api.delete(`/suppliers/${supplier.id}`);
      await refreshSuppliers();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to remove supplier");
    } finally {
      setUpdatingSupplier(null);
    }
  }

  async function handleToggleShopActive(shop: Subscription) {
    setUpdatingSub(shop.id);
    try {
      await api.patch(`/subscription/admin/${shop.id}`, { isActive: !shop.isActive });
      await Promise.all([refreshSubscriptions(), api.get<OperationsSummary>("/admin/operations-summary").then(setOperationsSummary)]);
    } catch (err) {
      setSectionErrors((previous) => ({ ...previous, subscriptions: err instanceof Error ? err.message : "Could not update shop status" }));
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
      if (patch.followUpNotes !== undefined) {
        const body = (patch.followUpNotes || "").trim();
        if (!body) throw new Error("Enter a support note before saving.");
        await api.post(`/admin/support/shops/${shop.id}/notes`, { body });
      } else {
        await api.patch(`/subscription/admin/${shop.id}`, patch);
      }
      await Promise.all([refreshSubscriptions(), api.get<OperationsSummary>("/admin/operations-summary").then(setOperationsSummary)]);
    } catch (err) {
      setSectionErrors((previous) => ({ ...previous, subscriptions: err instanceof Error ? err.message : "Could not update follow-up" }));
    } finally {
      setUpdatingSub(null);
    }
  }

  function whatsappLeadHref(shop: Subscription) {
    const phone = shop.user?.phone?.replace(/[^\d]/g, "") || "";
    const text = encodeURIComponent(`Habari ${shop.user?.name || ""}, hapa ni DukaPilot. Tunaweza kukusaidia kumalizia setup ya ${shop.name}: bidhaa 10, mauzo 10, na kurudi siku ya pili.`);
    return `https://wa.me/${phone}?text=${text}`;
  }

  const primaryTabs: { id: Tab; en: string; sw: string }[] = [
    { id: "overview", en: "Overview", sw: "Muhtasari" },
    { id: "support", en: "Needs Action", sw: "Zinahitaji Hatua" },
    { id: "subscriptions", en: "Payments", sw: "Malipo" },
    { id: "reports", en: "Support", sw: "Msaada" },
  ];
  const moreTabs: { id: Tab; en: string; sw: string }[] = [
    { id: "users", en: "Users", sw: "Watumiaji" },
    { id: "suppliers", en: "Suppliers", sw: "Wasambazaji" },
    { id: "referrals", en: "Referrals", sw: "Rufaa" },
    { id: "sync", en: "Sync History", sw: "Historia ya Usawazishaji" },
    { id: "sms", en: "SMS", sw: "SMS" },
    { id: "whatsapp", en: "WhatsApp API", sw: "WhatsApp API" },
    { id: "audit", en: "Audit Log", sw: "Kumbukumbu ya Ukaguzi" },
    { id: "reset", en: "PIN Reset", sw: "Badili PIN" },
  ];
  const activeShops = subscriptionStatusCounts.active;
  const trialShops = subscriptionStatusCounts.trial;
  const unpaidShops = subscriptionStatusCounts.expired;
  const suspendedShops = subscriptionStatusCounts.suspended;
  const expiringTrials = subscriptionOperationalCounts.expiringTrials;
  const activatedTrials = subscriptionOperationalCounts.activatedTrials;
  const supportIssues = operationsSummary?.openReports ?? 0;
  const billingIssues = operationsSummary?.billingReports ?? 0;
  const urgentReports = operationsSummary?.urgentReports ?? 0;
  const failedLogins = operationsSummary?.loginFailures24h ?? 0;
  const failedSyncShops = syncSummaries.filter((shop) => shop.failed > 0).length;
  const failedSyncEvents = syncSummaries.reduce((sum, shop) => sum + shop.failed, 0);
  const stalledTrials = subscriptionOperationalCounts.stalledTrials;
  const suppliersNeedingReview = operationsSummary?.supplierReview ?? 0;
  const verifiedSuppliers = supplierGlobalStatusCounts.VERIFIED || 0;
  const qualifiedReferrals = operationsSummary?.qualifiedReferrals ?? 0;
  const shopsNeedingFollowUp = subscriptionSupportQueue
    .filter((shop) =>
      shop.computedStatus === "expired" ||
      shop.computedStatus === "suspended" ||
      shop.onboardingStatus === "CHURN_RISK" ||
      shop.onboardingStatus === "NEEDS_HELP" ||
      (shop.computedStatus === "trial" && shop.daysLeft !== null && shop.daysLeft <= 3) ||
      (!shop.activation?.activated && shop.computedStatus === "trial")
    )
    .sort((a, b) => supportPriority(b) - supportPriority(a))
    .slice(0, 5);
  const paymentReviewQueue = operationsSummary?.paymentReviewQueue || [];
  const latestAdminAction = operationsSummary?.latestAdminAction || null;
  const recentShopNotes = operationsSummary?.recentNotes || [];
  const tabSections: Record<Tab, string[]> = {
    overview: ["overview", "operations summary", "assistant analytics", "subscriptions", "reports", "sync summary"],
    support: [], subscriptions: ["subscriptions", "payment exceptions", "operations summary"], reports: ["reports"],
    users: ["users"], reset: [], audit: ["audit logs"], referrals: ["referrals", "operations summary"],
    suppliers: ["suppliers", "operations summary"], sync: ["sync events", "sync summary"], sms: [], whatsapp: [],
  };

  function supportPriority(shop: Subscription) {
    if (shop.computedStatus === "suspended") return 100;
    if (shop.computedStatus === "expired") return 90;
    if (shop.onboardingStatus === "NEEDS_HELP") return 85;
    if (shop.onboardingStatus === "CHURN_RISK") return 80;
    if (shop.computedStatus === "trial" && shop.daysLeft !== null && shop.daysLeft <= 1) return 70;
    if (shop.computedStatus === "trial" && shop.daysLeft !== null && shop.daysLeft <= 3) return 60;
    if (!shop.activation?.activated) return 40;
    return 0;
  }

  function supportReason(shop: Subscription) {
    if (shop.computedStatus === "suspended") return "Suspended shop";
    if (shop.computedStatus === "expired") return "Unpaid or expired";
    if (shop.onboardingStatus === "NEEDS_HELP") return "Needs help";
    if (shop.onboardingStatus === "CHURN_RISK") return "Churn risk";
    if (shop.computedStatus === "trial" && shop.daysLeft !== null && shop.daysLeft <= 3) return `Trial ends in ${shop.daysLeft}d`;
    if (!shop.activation?.activated) return "Needs activation help";
    return "Follow up";
  }
  const filteredSubscriptions = subscriptions;
  const subscriptionFrom = subscriptionTotal ? ((subscriptionPage - 1) * subscriptionPageSize) + 1 : 0;
  const subscriptionTo = Math.min(subscriptionPage * subscriptionPageSize, subscriptionTotal);

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      </AppShell>
    );
  }

  if (pageError) return <AppShell><div role="alert" className="mx-auto max-w-xl rounded border border-red-200 bg-red-50 p-5 text-sm text-red-900"><p className="font-semibold">{sw ? "Imeshindikana kufungua admin" : "Could not open admin"}</p><p className="mt-2">{pageError}</p><button type="button" onClick={() => window.location.reload()} className="mt-3 rounded bg-red-700 px-3 py-2 font-semibold text-white">{sw ? "Jaribu tena" : "Retry"}</button></div></AppShell>;

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto pb-24 lg:pb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">{sw ? "Dashibodi ya Admin" : "Admin Dashboard"}</h1>
        </div>

        <nav aria-label={sw ? "Sehemu za admin" : "Admin sections"} className="mb-5 space-y-2">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1 sm:flex sm:w-fit">
          {primaryTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
              }}
              className={`min-h-11 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                tab === t.id ? "bg-white text-brand-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {sw ? t.sw : t.en}
            </button>
          ))}
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
            <span>{sw ? "Zana zaidi" : "More tools"}</span>
            <select value={moreTabs.some((item) => item.id === tab) ? tab : ""} onChange={(event) => { const next = event.target.value as Tab; setTab(next); if (next === "sms" && !smsMonitoring) refreshSmsMonitoring().catch(console.error); }} className="min-h-10 max-w-full rounded border border-gray-200 bg-white px-3 text-sm text-gray-800" aria-label={sw ? "Zana zaidi za admin" : "More admin tools"}>
              <option value="" disabled>{sw ? "Chagua zana" : "Choose a tool"}</option>
              {moreTabs.map((item) => <option key={item.id} value={item.id}>{sw ? item.sw : item.en}</option>)}
            </select>
          </label>
        </nav>

        {tabSections[tab].filter((section) => sectionErrors[section]).map((section) => <div key={section} role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"><span>{sw ? "Sehemu haijapakiwa" : "Could not load"}: {section}. {sectionErrors[section]}</span><button type="button" disabled={sectionLoading[section]} onClick={() => void retrySection(section)} className="rounded border border-red-300 px-3 py-1 font-semibold disabled:opacity-50">{sectionLoading[section] ? (sw ? "Inapakia..." : "Loading...") : (sw ? "Jaribu tena" : "Retry")}</button></div>)}
        {tabSections[tab].filter((section) => sectionLoading[section] && !sectionErrors[section]).map((section) => <p key={section} role="status" className="mb-2 rounded border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">{sw ? "Inapakia" : "Loading"}: {section}...</p>)}

        {tab === "support" && <AdminSupportWorkspace onOpenBilling={(shop) => { setTab("subscriptions"); setSubscriptionSearch(shop.name); refreshSubscriptions({ search: shop.name, page: 1 }).catch((error) => setSectionErrors((previous) => ({ ...previous, subscriptions: error instanceof Error ? error.message : "Could not open billing" }))); }} />}

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
              <div className="mb-3 flex items-center gap-2">
                <BellRing className="h-4 w-4 text-brand-700" />
                <h2 className="text-sm font-semibold text-gray-900">Push and Android activity</h2>
              </div>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
                <MiniMetric label="Active devices" value={overview.pushAnalytics?.activeDevices || 0} tone="border-brand-200 bg-brand-50 text-brand-800" />
                <MiniMetric label="Sent (30d)" value={overview.pushAnalytics?.sent30d || 0} tone="border-green-200 bg-green-50 text-green-800" />
                <MiniMetric label="Retrying" value={overview.pushAnalytics?.retrying || 0} tone="border-amber-200 bg-amber-50 text-amber-800" />
                <MiniMetric label="Failed (30d)" value={overview.pushAnalytics?.failed30d || 0} tone="border-red-200 bg-red-50 text-red-800" />
                <MiniMetric label="Queued" value={overview.pushAnalytics?.queued || 0} tone="border-gray-200 bg-gray-50 text-gray-800" />
              </div>
              {(overview.pushAnalytics?.shortcuts30d || []).length > 0 && <p className="mt-3 text-xs text-gray-600">Android shortcuts (30 days): {overview.pushAnalytics?.shortcuts30d.map((item) => `${item.action} ${item.count}`).join(" / ")}</p>}
            </section>
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
                <MiniMetric label={sw ? "Ripoti wazi" : "Support issues"} value={operationsSummary ? supportIssues : "—"} tone="border-blue-200 bg-blue-50 text-blue-800" />
                <MiniMetric label={sw ? "Maombi ya malipo" : "Billing requests"} value={operationsSummary ? billingIssues : "—"} tone="border-purple-200 bg-purple-50 text-purple-800" />
                <MiniMetric label={sw ? "Login zilizoshindwa (saa 24)" : "Failed logins (24h)"} value={operationsSummary ? failedLogins : "—"} tone="border-red-200 bg-red-50 text-red-800" />
                <MiniMetric label={sw ? "Login zilizoshindwa (siku 7)" : "Failed logins (7d)"} value={operationsSummary?.loginFailures7d ?? "—"} tone="border-red-200 bg-red-50 text-red-800" />
                <MiniMetric label={sw ? "Ufuatiliaji unaodaiwa" : "Follow-ups due"} value={operationsSummary?.dueFollowUps ?? "—"} tone="border-amber-200 bg-amber-50 text-amber-800" />
                <MiniMetric label="Failed sync shops" value={failedSyncShops} tone="border-red-200 bg-red-50 text-red-800" />
                <MiniMetric label="Suppliers review" value={operationsSummary ? suppliersNeedingReview : "—"} tone="border-orange-200 bg-orange-50 text-orange-800" />
                <MiniMetric label="Verified suppliers" value={verifiedSuppliers} tone="border-green-200 bg-green-50 text-green-800" />
              </div>
            </section>
            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Shops Needing Action Today</h2>
                  <p className="text-xs text-gray-500">A quick support command center for launch operations.</p>
                </div>
                <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">
                  {operationsSummary?.shopsNeedingAction ?? "—"} {sw ? "biashara zinahitaji hatua" : "shops need action"}
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <ActionCard
                  icon={<CreditCard className="h-5 w-5 text-purple-700" />}
                  title="Payment follow-up"
                  detail="Billing requests, unpaid shops, and suspended accounts that need confirmation or renewal."
                  value={operationsSummary ? billingIssues + unpaidShops + suspendedShops : "—"}
                  tone="border-purple-200 bg-purple-50 text-purple-900"
                  action="Open subscriptions"
                  onClick={() => setTab("subscriptions")}
                />
                <ActionCard
                  icon={<BellRing className="h-5 w-5 text-orange-700" />}
                  title="Trial activation"
                  detail="Trials ending soon or shops that still need product/sale setup help."
                  value={sectionErrors.subscriptions ? "—" : expiringTrials + stalledTrials}
                  tone="border-orange-200 bg-orange-50 text-orange-900"
                  action="Contact shops"
                  onClick={() => setTab("support")}
                />
                <ActionCard
                  icon={<BadgeCheck className="h-5 w-5 text-green-700" />}
                  title="Supplier verification"
                  detail="Suppliers waiting for admin review before they become trusted in the ecosystem."
                  value={operationsSummary ? suppliersNeedingReview : "—"}
                  tone="border-green-200 bg-green-50 text-green-900"
                  action="Verify suppliers"
                  onClick={() => setTab("suppliers")}
                />
                <ActionCard
                  icon={<RefreshCw className="h-5 w-5 text-red-700" />}
                  title="Offline sync watch"
                  detail="Shops with failed browser sync events that may need support before data feels stale."
                  value={sectionErrors["sync summary"] ? "—" : failedSyncShops}
                  tone="border-red-200 bg-red-50 text-red-900"
                  action="Review sync issues"
                  onClick={() => setTab("sync")}
                />
                <a href="https://necuva-group.sentry.io/issues/?query=is%3Aunresolved" target="_blank" rel="noopener noreferrer" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950"><AlertTriangle className="h-5 w-5 text-amber-700" /><strong className="mt-2 block text-sm">{sw ? "Makosa ya programu" : "Application errors"}</strong><p className="mt-1 text-xs">{sw ? "Angalia Sentry kwa matukio halisi na hali yake." : "Review real issues and their status in Sentry."}</p><span className="mt-3 block text-xs font-bold underline">{sw ? "Fungua Sentry" : "Open Sentry"}</span></a>
                <ActionCard
                  icon={<ClipboardList className="h-5 w-5 text-blue-700" />}
                  title="Open support reports"
                  detail="Merchant messages, billing reports, and issues that still need an admin decision."
                  value={operationsSummary ? supportIssues : "—"}
                  tone="border-blue-200 bg-blue-50 text-blue-900"
                  action="Open reports"
                  onClick={() => setTab("reports")}
                />
              </div>
            </section>
            <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-xl border border-purple-200 bg-white p-4">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">Payment Review Queue</h2>
                    <p className="text-xs text-gray-500">Billing reports waiting for admin confirmation and plan activation.</p>
                  </div>
                  <button onClick={() => setTab("reports")} className="rounded-lg bg-purple-100 px-3 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-200">
                    Open reports
                  </button>
                </div>
                {paymentReviewQueue.length === 0 ? (
                  <div className="rounded-lg bg-gray-50 px-3 py-4 text-sm text-gray-500">No payment reports need review right now.</div>
                ) : (
                  <div className="space-y-2">
                    {paymentReviewQueue.map((report) => (
                      <div key={report.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-950">{report.user?.shop?.name || report.title}</p>
                            <p className="text-xs text-gray-500">{report.user?.name || "Merchant"} - {report.user?.phone || "No phone"}</p>
                            <p className="mt-1 line-clamp-2 text-xs text-gray-600">{report.description}</p>
                          </div>
                          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-purple-700">{report.status}</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <button
                            onClick={() => handleVerifyBillingReport(report, "BASIC")}
                            disabled={updatingReport === report.id || !report.user?.shop?.id}
                            className="rounded bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-200 disabled:opacity-50"
                          >
                            Confirm Basic
                          </button>
                          <button
                            onClick={() => handleVerifyBillingReport(report, "PRO")}
                            disabled={updatingReport === report.id || !report.user?.shop?.id}
                            className="rounded bg-purple-100 px-2 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-200 disabled:opacity-50"
                          >
                            Confirm Pro
                          </button>
                          <button
                            onClick={() => handleUpdateReport(report.id, "IN_PROGRESS")}
                            disabled={updatingReport === report.id}
                            className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                          >
                            Mark contacted
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <h2 className="text-sm font-semibold text-gray-900">Last Admin Action</h2>
                  {latestAdminAction ? (
                    <div className="mt-3 rounded-lg bg-gray-50 p-3 text-xs">
                      <p className="font-mono font-semibold text-gray-900">{latestAdminAction.action}</p>
                      <p className="mt-1 font-mono text-gray-500">{latestAdminAction.method} {latestAdminAction.path}</p>
                      <p className="mt-1 text-gray-500">
                        {latestAdminAction.user ? `${latestAdminAction.user.name} (${latestAdminAction.user.phone})` : "System"} - {new Date(latestAdminAction.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 rounded-lg bg-gray-50 px-3 py-4 text-sm text-gray-500">No admin actions recorded yet.</p>
                  )}
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <h2 className="text-sm font-semibold text-gray-900">Notes History</h2>
                  {recentShopNotes.length === 0 ? (
                    <p className="mt-3 rounded-lg bg-gray-50 px-3 py-4 text-sm text-gray-500">No saved shop notes yet.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {recentShopNotes.map((note) => (
                        <div key={note.id} className="rounded-lg bg-gray-50 p-3 text-xs">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-gray-950">{note.shop.name}</p>
                            <span className="rounded-full bg-white px-2 py-0.5 font-semibold text-gray-600">{note.author?.name || "Admin"}</span>
                          </div>
                          <p className="mt-1 text-gray-600">{note.body}</p>
                          <p className="mt-1 text-gray-400">{new Date(note.createdAt).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Launch Analytics</h2>
                  <p className="text-xs text-gray-500">Core activation signals to watch while DukaPilot is live.</p>
                </div>
                <span className="text-xs text-gray-400">Derived from app data</span>
              </div>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <MiniMetric label="Registrations" value={overview.launchAnalytics?.registrations || 0} tone="border-blue-200 bg-blue-50 text-blue-800" />
                <MiniMetric label="Shops created" value={overview.launchAnalytics?.merchantShops || 0} tone="border-brand-200 bg-brand-50 text-brand-800" />
                <MiniMetric label="Products added" value={overview.launchAnalytics?.firstProductProgress || 0} tone="border-green-200 bg-green-50 text-green-800" />
                <MiniMetric label="Sales recorded" value={overview.launchAnalytics?.firstSaleProgress || 0} tone="border-sky-200 bg-sky-50 text-sky-800" />
                <MiniMetric label="Debts tracked" value={overview.launchAnalytics?.firstDebtProgress || 0} tone="border-amber-200 bg-amber-50 text-amber-800" />
                <MiniMetric label="Expenses tracked" value={overview.launchAnalytics?.expenseTrackingProgress || 0} tone="border-orange-200 bg-orange-50 text-orange-800" />
                <MiniMetric label="Paid shops" value={overview.launchAnalytics?.paidShops || 0} tone="border-purple-200 bg-purple-50 text-purple-800" />
                <MiniMetric label="Payments 7d" value={overview.launchAnalytics?.paymentsConfirmed7d || 0} tone="border-emerald-200 bg-emerald-50 text-emerald-800" />
              </div>
            </section>
            <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-indigo-950">Campaign Funnel</h2>
                  <p className="text-xs text-indigo-800">Anonymous web funnel events, then registrations and activation by saved source.</p>
                </div>
                <span className="text-xs text-indigo-700">Last 30 days</span>
              </div>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <MiniMetric label="Store clicks" value={overview.marketingAnalytics?.storeClicks30d || 0} tone="border-indigo-200 bg-white text-indigo-800" />
                <MiniMetric label="Signups started" value={overview.marketingAnalytics?.signupsStarted30d || 0} tone="border-blue-200 bg-white text-blue-800" />
                <MiniMetric label="Trials started" value={overview.marketingAnalytics?.trialsStarted30d || 0} tone="border-amber-200 bg-white text-amber-800" />
                <MiniMetric label="WhatsApp started" value={overview.marketingAnalytics?.whatsappStarted30d || 0} tone="border-green-200 bg-white text-green-800" />
              </div>
              {(overview.marketingAnalytics?.topSources || []).length > 0 && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {overview.marketingAnalytics?.topSources.map((source) => (
                    <div key={source.source} className="rounded-lg border border-indigo-100 bg-white p-3 text-xs text-gray-700">
                      <p className="font-bold text-gray-950">{source.source}</p>
                      <p className="mt-1">{source.registrations} registrations · {source.activated} activated</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Onboarding Follow-up Analytics</h2>
                  <p className="text-xs text-gray-500">Shows whether admin follow-up is moving shops toward setup, payment, and conversion.</p>
                </div>
                <button onClick={() => setTab("subscriptions")} className="rounded-lg bg-brand-100 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-200">
                  Manage follow-up
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
                <MiniMetric label="New shops" value={overview.onboardingAnalytics?.new || 0} tone="border-gray-200 bg-gray-50 text-gray-800" />
                <MiniMetric label="Contacted" value={overview.onboardingAnalytics?.contacted || 0} tone="border-blue-200 bg-blue-50 text-blue-800" />
                <MiniMetric label="Needs help" value={overview.onboardingAnalytics?.needsHelp || 0} tone="border-amber-200 bg-amber-50 text-amber-800" />
                <MiniMetric label="Setup done" value={overview.onboardingAnalytics?.setupDone || 0} tone="border-green-200 bg-green-50 text-green-800" />
                <MiniMetric label="Activated" value={overview.onboardingAnalytics?.activated || 0} tone="border-emerald-200 bg-emerald-50 text-emerald-800" />
                <MiniMetric label="Paid" value={overview.onboardingAnalytics?.paid || 0} tone="border-purple-200 bg-purple-50 text-purple-800" />
                <MiniMetric label="Converted" value={overview.onboardingAnalytics?.converted || 0} tone="border-brand-200 bg-brand-50 text-brand-800" />
                <MiniMetric label="Churn risk" value={overview.onboardingAnalytics?.churnRisk || 0} tone="border-red-200 bg-red-50 text-red-800" />
                <MiniMetric label="Contact 7d" value={overview.onboardingAnalytics?.recentlyContactedShops || 0} tone="border-sky-200 bg-sky-50 text-sky-800" />
                <MiniMetric label="Notes saved" value={overview.onboardingAnalytics?.shopsWithNotes || 0} tone="border-indigo-200 bg-indigo-50 text-indigo-800" />
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  <p className="font-semibold text-gray-900">Follow-up coverage</p>
                  <p className="mt-1">{overview.onboardingAnalytics?.followUpCoverage || 0}% of shops have been contacted at least once.</p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  <p className="font-semibold text-gray-900">Notes coverage</p>
                  <p className="mt-1">{overview.onboardingAnalytics?.noteCoverage || 0}% of shops have saved support notes.</p>
                </div>
              </div>
            </section>
            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Assistant Action Analytics</h2>
                  <p className="text-xs text-gray-500">Tracks whether AI recommendations are opened, completed, or dismissed.</p>
                </div>
                <span className="text-xs text-gray-400">Last 30 days</span>
              </div>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <MiniMetric label="Tracked actions" value={assistantAnalytics?.summary.total ?? "—"} tone="border-brand-200 bg-brand-50 text-brand-800" />
                <MiniMetric label="Opened rate" value={assistantAnalytics?.summary.openedRate ?? "—"} tone="border-blue-200 bg-blue-50 text-blue-800" />
                <MiniMetric label="Completed rate" value={assistantAnalytics?.summary.completedRate ?? "—"} tone="border-green-200 bg-green-50 text-green-800" />
                <MiniMetric label="Dismissed rate" value={assistantAnalytics?.summary.dismissedRate ?? "—"} tone="border-gray-200 bg-gray-50 text-gray-800" />
              </div>
              <div className="mt-3 rounded-lg bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Top action types</p>
                {(assistantAnalytics?.topActions || []).length === 0 ? (
                  <p className="mt-2 text-sm text-gray-500">No assistant actions tracked yet.</p>
                ) : (
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    {assistantAnalytics?.topActions.slice(0, 6).map((action) => (
                      <div key={action.actionKey} className="rounded-lg bg-white px-3 py-2 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-gray-900">{action.title}</p>
                          <span className="rounded-full bg-brand-100 px-2 py-0.5 font-bold text-brand-700">{action.count}</span>
                        </div>
                        <p className="mt-1 font-mono text-[11px] text-gray-400">{action.actionKey}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Support Queue</h2>
                  <p className="text-xs text-gray-500">Prioritized shops and reports that need admin attention today.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setTab("support")} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
                    {sw ? "Fungua biashara" : "Open shop support"}
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
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{sw ? "Biashara za kufuatilia" : "Shops to contact"}</p>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-500">{operationsSummary?.shopsNeedingAction ?? "—"}</span>
                  </div>
                  {shopsNeedingFollowUp.length === 0 ? (
                    <p className="rounded-lg bg-white px-3 py-4 text-sm text-gray-500">{operationsSummary?.shopsNeedingAction ? (sw ? "Fungua orodha kamili ya biashara zinazohitaji hatua." : "Open the full shop support queue to review every case.") : (sw ? "Hakuna biashara ya kufuatilia kwa sasa." : "No urgent shop follow-ups right now.")}</p>
                  ) : (
                    <div className="space-y-2">
                      {shopsNeedingFollowUp.map((shop) => (
                        <div key={shop.id} className="rounded-lg bg-white p-3 shadow-sm">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{shop.name}</p>
                              <p className="text-xs text-gray-500">{shop.user?.name || "Owner"} - {shop.user?.phone || "No phone"}</p>
                              <p className="mt-1 text-xs font-semibold text-amber-700">{supportReason(shop)}</p>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              <a href={whatsappLeadHref(shop)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-green-100 px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-200">
                                <MessageCircle className="h-3 w-3" /> WhatsApp
                              </a>
                              <button onClick={() => setSelectedSupportShop(shop)} className="rounded-lg bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-200">
                                Details
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
                  <MiniMetric label="High-priority reports" value={operationsSummary ? urgentReports : "—"} tone="border-red-200 bg-red-50 text-red-800" />
                  <MiniMetric label="Open reports" value={operationsSummary ? supportIssues : "—"} tone="border-blue-200 bg-blue-50 text-blue-800" />
                  <MiniMetric label="Stalled trials" value={stalledTrials} tone="border-orange-200 bg-orange-50 text-orange-800" />
                  <MiniMetric label="Needs billing action" value={operationsSummary && !sectionErrors.subscriptions ? billingIssues + unpaidShops + suspendedShops : "—"} tone="border-purple-200 bg-purple-50 text-purple-800" />
                  <MiniMetric label="Suppliers to verify" value={operationsSummary ? suppliersNeedingReview : "—"} tone="border-amber-200 bg-amber-50 text-amber-800" />
                  <MiniMetric label="Failed sync events" value={failedSyncEvents} tone="border-red-200 bg-red-50 text-red-800" />
                </div>
              </div>
            </section>
            {syncSummaries.some((item) => item.failed > 0) && (
              <section className="rounded-xl border border-red-200 bg-red-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-red-950">Offline Sync Watchlist</h2>
                    <p className="text-xs text-red-700">Shops with failed browser sync events in the last 7 days.</p>
                  </div>
                </div>
                <div className="grid gap-2 lg:grid-cols-2">
                  {syncSummaries.filter((item) => item.failed > 0).slice(0, 6).map((item) => (
                    <div key={item.shop.id} className="rounded-lg bg-white p-3 text-sm shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-gray-950">{item.shop.name}</p>
                          <p className="text-xs text-gray-500">{item.shop.user?.name || "Owner"} - {item.shop.user?.phone || "No phone"}</p>
                        </div>
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">{item.failed} failed</span>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">Queued {item.queued} - Synced {item.synced} - Last {item.lastEventAt ? new Date(item.lastEventAt).toLocaleString() : "-"}</p>
                      {item.recentFailures?.[0] && (
                        <div className="mt-2 rounded-lg border border-red-100 bg-red-50 px-2 py-1.5 text-xs text-red-800">
                          <p className="font-semibold">Last failure: {item.recentFailures[0].message || "No message recorded"}</p>
                          <p className="mt-0.5 text-red-700">
                            {displayDeviceLabel(item.recentFailures[0].deviceId, item.recentFailures[0].deviceLabel, item.shop.user?.name)} - {item.recentFailures[0].resolutionStatus || "OPEN"} - Attempts {item.recentFailures[0].attempts} - {item.recentFailures[0].total ? formatTZS(item.recentFailures[0].total) : "No total"} - {new Date(item.recentFailures[0].createdAt).toLocaleString()}
                          </p>
                        </div>
                      )}
                      {item.shop.user?.phone && (
                        <a href={`https://wa.me/${item.shop.user.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 rounded-lg bg-green-100 px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-200">
                          <MessageCircle className="h-3 w-3" /> Contact owner
                        </a>
                      )}
                      <button
                        onClick={() => openSyncHistory(item.shop.id)}
                        className="ml-2 mt-2 inline-flex items-center gap-1 rounded-lg bg-red-100 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-200"
                      >
                        View history
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* USERS */}
        {tab === "users" && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="border-b border-gray-100 bg-gray-50 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-gray-800 text-sm">All Users ({usersTotal.toLocaleString()})</h2><span className="text-xs text-gray-500">Search by name, phone, shop, or supplier</span></div>
              <form onSubmit={submitUsersSearch} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <input aria-label="Search users" value={usersSearch} onChange={(event) => setUsersSearch(event.target.value)} placeholder="Search users, phone, or business" className="min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                <select aria-label="Filter users by role" value={userRoleFilter} onChange={(event) => { const role = event.target.value; setUserRoleFilter(role); refreshUsers(1, role).catch((error) => setSectionErrors((previous) => ({ ...previous, users: error instanceof Error ? error.message : "Could not filter users" }))); }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="ALL">All roles</option><option value="MERCHANT">Merchants</option><option value="SUPPLIER">Suppliers</option><option value="ADMIN">Admins</option>
                </select>
                <button type="submit" className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-gray-950 px-3 py-2 text-sm font-semibold text-white"><Search className="h-4 w-4" /> Search</button>
              </form>
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
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">No users match these filters.</td></tr>}
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
                        {u.shop?.name || u.supplier?.name || "-"}
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">
                        {new Date(u.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => handleDeleteUser(u)}
                          className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <AdminPager page={usersPage} totalPages={usersTotalPages} total={usersTotal} sw={sw} onPage={(page) => refreshUsers(page).catch((error) => setSectionErrors((previous) => ({ ...previous, users: error instanceof Error ? error.message : "Could not load users" })))} />
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
            <div className="border-b border-gray-100 bg-gray-50 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-gray-800 text-sm">Audit Events ({auditTotal.toLocaleString()})</h2><span className="text-xs text-gray-500">Search by action, account, resource, or path</span></div>
              <form onSubmit={submitAuditSearch} className="flex gap-2">
                <input aria-label="Search audit events" value={auditSearchDraft} onChange={(event) => setAuditSearchDraft(event.target.value)} placeholder="Search audit history" className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                <button type="submit" className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-gray-950 px-3 py-2 text-sm font-semibold text-white"><Search className="h-4 w-4" /> Search</button>
              </form>
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
                  {auditLogs.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-500">No audit events match this search.</td></tr>}
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">{log.action}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-600">
                        {log.user ? `${log.user.name} (${log.user.phone})` : "-"}
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
            <AdminPager page={auditPage} totalPages={auditTotalPages} total={auditTotal} sw={sw} onPage={(page) => refreshAuditLogs(page).catch((error) => setSectionErrors((previous) => ({ ...previous, "audit logs": error instanceof Error ? error.message : "Could not load audit history" })))} />
          </div>
        )}

        {/* REPORTS */}
        {tab === "reports" && (
          <div>
            <div className="flex gap-2 mb-4 flex-wrap">
              {["OPEN", "IN_PROGRESS", "RESOLVED", "REJECTED", "ALL"].map((s) => (
                <button
                  key={s}
                  onClick={() => { setReportFilter(s); refreshReports(s, 1).catch((error) => setSectionErrors((previous) => ({ ...previous, reports: error instanceof Error ? error.message : "Could not load reports" }))); }}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    reportFilter === s ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {s} ({s === "ALL" ? Object.values(reportStatusCounts).reduce((sum, count) => sum + count, 0) : reportStatusCounts[s] || 0})
                </button>
              ))}
            </div>
            <form onSubmit={submitReportsSearch} className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
              <input aria-label="Search support reports" value={reportSearchDraft} onChange={(event) => setReportSearchDraft(event.target.value)} placeholder="Search title, message, owner, phone, or shop" className="min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <select aria-label="Filter reports by type" value={reportTypeFilter} onChange={(event) => { const type = event.target.value; setReportTypeFilter(type); refreshReports(reportFilter, 1, reportSearch, type).catch(console.error); }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="ALL">All types</option><option value="BUG">Bug</option><option value="FEATURE_REQUEST">Feature request</option><option value="ACCOUNT_ISSUE">Account issue</option><option value="BILLING">Billing</option><option value="OTHER">Other</option>
              </select>
              <select aria-label="Filter reports by priority" value={reportPriorityFilter} onChange={(event) => { const priority = event.target.value; setReportPriorityFilter(priority); refreshReports(reportFilter, 1, reportSearch, reportTypeFilter, priority).catch(console.error); }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="ALL">All priorities</option><option value="URGENT">Urgent</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option>
              </select>
              <button type="submit" className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-gray-950 px-3 py-2 text-sm font-semibold text-white"><Search className="h-4 w-4" /> Search</button>
            </form>
            <div className="space-y-3">
              {reports.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-500 text-sm">
                  No reports in this category
                </div>
              ) : (
                reports.map((report) => (
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
                            From: {report.user.name} ({report.user.phone}) - {report.user.role}
                            {report.user.shop?.name ? ` - ${report.user.shop.name}` : ""}
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
            <AdminPager page={reportPage} totalPages={reportTotalPages} total={reportTotal} sw={sw} onPage={(page) => refreshReports(reportFilter, page).catch((error) => setSectionErrors((previous) => ({ ...previous, reports: error instanceof Error ? error.message : "Could not load reports" })))} />
          </div>
        )}

        {/* REFERRALS */}
        {tab === "referrals" && (
          <div className="space-y-4">
            <section className="rounded-xl border border-brand-200 bg-brand-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-white">
                    <Gift className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-brand-950">Referral rewards</h2>
                    <p className="mt-1 max-w-2xl text-xs leading-5 text-brand-800">
                      A shop is linked automatically when the new owner registers through its referral link. After 10 completed sales, grant the referrer one free week exactly once.
                    </p>
                  </div>
                </div>
                <button onClick={() => refreshReferrals().catch(console.error)} className="inline-flex items-center justify-center gap-1 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-brand-700 shadow-sm hover:bg-brand-100">
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-white px-2.5 py-1 text-gray-700">{referralTotal} tracked</span>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">{operationsSummary ? qualifiedReferrals : "—"} ready overall</span>
                <span className="rounded-full bg-green-100 px-2.5 py-1 text-green-800">{referralStatusCounts.REWARDED || 0} rewarded</span>
              </div>
              <form onSubmit={submitReferralsSearch} className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input aria-label="Search referrals" value={referralSearchDraft} onChange={(event) => setReferralSearchDraft(event.target.value)} placeholder="Search shops, owners, phones, or referral code" className="min-w-0 flex-1 rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm" />
                <button type="submit" className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white"><Search className="h-4 w-4" /> Search</button>
              </form>
              <div className="mt-3 flex flex-wrap gap-2">
                {["ALL", "PENDING", "QUALIFIED", "REWARDED", "REJECTED"].map((status) => <button key={status} type="button" onClick={() => { setReferralStatusFilter(status); refreshReferrals(1, referralSearch, status).catch(console.error); }} className={`min-h-9 rounded-full px-3 py-1.5 text-xs font-semibold ${referralStatusFilter === status ? "bg-brand-700 text-white" : "bg-white text-gray-700 hover:bg-brand-100"}`}>{status} ({status === "ALL" ? referralTotal : referralStatusCounts[status] || 0})</button>)}
              </div>
            </section>

            <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div>
                <h2 className="text-sm font-semibold text-amber-950">Recover missing referral</h2>
                <p className="mt-1 text-xs leading-5 text-amber-800">Use only when a genuine referral was missed. It creates an audit record and still requires 10 completed sales before the free week can be granted.</p>
              </div>
              <form onSubmit={handleRecoverReferral} className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr_1.5fr_auto] lg:items-end">
                <label className="grid gap-1 text-xs font-semibold text-amber-950"><span>Referrer's code</span><input value={referralRecovery.referralCode} onChange={(event) => setReferralRecovery((current) => ({ ...current, referralCode: event.target.value }))} placeholder="DP-S-..." className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-normal text-gray-900" required /></label>
                <label className="grid gap-1 text-xs font-semibold text-amber-950"><span>New owner phone</span><input value={referralRecovery.referredPhone} onChange={(event) => setReferralRecovery((current) => ({ ...current, referredPhone: event.target.value }))} placeholder="07... or +255..." className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-normal text-gray-900" required /></label>
                <label className="grid gap-1 text-xs font-semibold text-amber-950"><span>Evidence note</span><input value={referralRecovery.note} onChange={(event) => setReferralRecovery((current) => ({ ...current, note: event.target.value }))} placeholder="Confirmed referral link was used" className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-normal text-gray-900" minLength={3} required /></label>
                <button type="submit" disabled={recoveringReferral} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50"><Gift className="h-3.5 w-3.5" /> {recoveringReferral ? "Saving..." : "Recover"}</button>
              </form>
              {referralRecoveryMessage && <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${referralRecoveryMessage.tone === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{referralRecoveryMessage.text}</p>}
            </section>

            {referrals.length === 0 ? (
              <section className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
                <Gift className="mx-auto h-7 w-7 text-brand-600" />
                <h2 className="mt-3 text-sm font-semibold text-gray-900">No tracked referrals yet</h2>
                <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-gray-500">When an owner shares their onboarding referral link and a new shop registers through it, the record appears here.</p>
              </section>
            ) : (
              <div className="grid gap-3">
                {referrals.map((referral) => {
                  const statusTone = referral.status === "REWARDED"
                    ? "bg-green-100 text-green-700"
                    : referral.status === "QUALIFIED"
                      ? "bg-amber-100 text-amber-800"
                      : referral.status === "REJECTED"
                        ? "bg-gray-100 text-gray-600"
                        : "bg-blue-100 text-blue-700";
                  return (
                    <article key={referral.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-sm font-semibold text-gray-950">{referral.referrerShop.name}</h2>
                            <ArrowRight className="h-4 w-4 text-gray-400" />
                            <h3 className="text-sm font-semibold text-gray-950">{referral.referredShop.name}</h3>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone}`}>{referral.status}</span>
                          </div>
                          <p className="mt-1 text-xs text-gray-500">
                            Referrer: {referral.referrerShop.user?.name || "Owner"} ({referral.referrerShop.user?.phone || "No phone"})
                          </p>
                          <p className="text-xs text-gray-500">
                            New owner: {referral.referredShop.user?.name || "Owner"} ({referral.referredShop.user?.phone || "No phone"}) - Joined {formatDate(referral.createdAt)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => handleRewardReferral(referral)}
                            disabled={!referral.rewardEligible || updatingReferral === referral.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-brand-700 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Gift className="h-3.5 w-3.5" /> {updatingReferral === referral.id ? "Saving..." : "Reward 7 days"}
                          </button>
                          {(referral.status === "PENDING" || referral.status === "QUALIFIED") && (
                            <button onClick={() => handleRejectReferral(referral)} disabled={updatingReferral === referral.id} className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50">
                              Not valid
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 rounded-lg bg-gray-50 p-3 text-xs sm:grid-cols-3">
                        <div>
                          <p className="font-semibold text-gray-900">Qualification</p>
                          <p className={referral.salesRemaining === 0 ? "text-green-700" : "text-gray-600"}>{referral.salesCount}/10 completed sales{referral.salesRemaining ? ` - ${referral.salesRemaining} left` : " - ready"}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">Reward applies to</p>
                          <p className="text-gray-600">{referral.referrerShop.subscriptionEndsAt ? "Current paid/trial validity" : "Free-trial validity"}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">Reward status</p>
                          <p className="text-gray-600">{referral.rewardedAt ? `Granted ${formatDate(referral.rewardedAt)}` : referral.qualifiedAt ? `Qualified ${formatDate(referral.qualifiedAt)}` : "Waiting for sales"}</p>
                        </div>
                      </div>
                      {referral.note && <p className="mt-2 text-xs text-gray-500">Admin note: {referral.note}</p>}
                    </article>
                  );
                })}
                {referralTotalPages > 1 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3 text-xs">
                    <p className="text-gray-500">Page {referralPage} of {referralTotalPages}</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => refreshReferrals(referralPage - 1).catch(console.error)} disabled={referralPage <= 1} className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 disabled:opacity-40">Previous</button>
                      <button type="button" onClick={() => refreshReferrals(referralPage + 1).catch(console.error)} disabled={referralPage >= referralTotalPages} className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 disabled:opacity-40">Next</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* SUBSCRIPTIONS */}
        {tab === "subscriptions" && (
          <div>
            {(checkoutExceptionTotal > 0 || checkoutExceptionSearch || checkoutExceptionSearchDraft) && <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h2 className="text-sm font-semibold text-amber-950">Online payments needing review ({checkoutExceptionTotal.toLocaleString()})</h2>
              <p className="mt-1 text-xs text-amber-800">Retry uses the original provider idempotency key, so it does not create a second payment request.</p>
              <form onSubmit={submitCheckoutExceptionSearch} className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input aria-label="Search payment exceptions" value={checkoutExceptionSearchDraft} onChange={(event) => setCheckoutExceptionSearchDraft(event.target.value)} placeholder="Search shop, owner, phone, or provider ID" className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm" />
                <button type="submit" className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-amber-800 px-3 py-2 text-sm font-semibold text-white"><Search className="h-4 w-4" /> Search</button>
              </form>
              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                {checkoutExceptions.length === 0 && <p className="rounded-lg bg-white p-3 text-sm text-gray-600">No payment exceptions match this search.</p>}
                {checkoutExceptions.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-white p-3 text-xs shadow-sm">
                  <div><p className="font-semibold text-gray-950">{item.shop.name} - {item.plan}</p><p className="text-gray-500">{formatTZS(item.amount)} - {item.phone} - {item.providerId ? "Provider payment found" : "Provider ID missing"}</p></div>
                  <button type="button" onClick={() => retryCheckoutException(item.id).catch((error) => window.alert(error instanceof Error ? error.message : "Retry failed"))} disabled={retryingCheckout === item.id} className="shrink-0 rounded-lg bg-amber-700 px-3 py-2 font-semibold text-white disabled:opacity-50">{retryingCheckout === item.id ? "Checking..." : "Retry safely"}</button>
                </div>)}
              </div>
              <div className="mt-3 overflow-hidden rounded-lg border border-amber-200"><AdminPager page={checkoutExceptionPage} totalPages={checkoutExceptionTotalPages} total={checkoutExceptionTotal} sw={sw} onPage={(page) => refreshCheckoutExceptions(page).catch(console.error)} /></div>
            </section>}
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <form onSubmit={submitSubscriptionSearch} className="flex w-full max-w-xl gap-2">
                <label className="sr-only" htmlFor="subscription-search">Search subscriptions</label>
                <input
                  id="subscription-search"
                  value={subscriptionSearch}
                  onChange={(event) => setSubscriptionSearch(event.target.value)}
                  placeholder="Search shop, owner, or phone"
                  className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <button type="submit" className="inline-flex items-center gap-1 rounded-lg bg-gray-950 px-3 py-2 text-xs font-bold text-white hover:bg-gray-800">
                  <Search className="h-4 w-4" />
                  Search
                </button>
              </form>
              <p className="text-xs font-medium text-gray-500">{subscriptionTotal.toLocaleString()} shops found</p>
            </div>
            <div className="mb-4 flex gap-2 flex-wrap">
              {["ALL", "trial", "active", "expired", "suspended"].map((s) => (
                <button
                  key={s}
                  onClick={() => updateSubscriptionFilter(s)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    subFilter === s ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {s.toUpperCase()} ({s === "ALL" ? subscriptionTotal : subscriptionStatusCounts[s as keyof typeof subscriptionStatusCounts]})
                </button>
              ))}
            </div>
            <section className="mb-4 rounded-xl border border-brand-200 bg-brand-50 p-4">
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-brand-950">Plan & renewal controls</h2>
                  <p className="text-xs text-brand-800">Set a shop plan, record M-Pesa/manual payment, and renew for 1-24 months.</p>
                </div>
                <span className="text-xs font-semibold text-brand-700">{subscriptionFrom}-{subscriptionTo} of {subscriptionTotal} shops</span>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {filteredSubscriptions.length === 0 ? (
                  <div className="rounded-lg bg-white p-4 text-sm text-gray-500">No shops match this filter.</div>
                ) : filteredSubscriptions.map((shop) => {
                  const draft = billingDraftFor(shop);
                  const feedback = billingFeedback[shop.id];
                  return (
                    <div key={shop.id} className="rounded-lg border border-brand-100 bg-white p-3 shadow-sm">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-gray-950">{shop.name}</p>
                          <p className="text-xs text-gray-500">{shop.user?.name || "Owner"} - {shop.user?.phone || "No phone"}</p>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            shop.computedStatus === "active" ? "bg-green-100 text-green-700" :
                            shop.computedStatus === "trial" ? "bg-yellow-100 text-yellow-700" :
                            shop.computedStatus === "expired" ? "bg-red-100 text-red-700" :
                            "bg-gray-100 text-gray-700"
                          }`}>{shop.computedStatus}</span>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">{shop.plan}</span>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2 text-xs text-gray-600 sm:grid-cols-3">
                        <div>
                          <p className="font-semibold text-gray-900">{validityLabel(shop)}</p>
                          <p>{shop.daysLeft !== null ? `${shop.daysLeft} day(s) left` : "No expiry date set"}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">Paid subscription</p>
                          <p>{shop.subscriptionEndsAt ? `Until ${formatDate(shop.subscriptionEndsAt)}` : "Not active yet"}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">Trial</p>
                          <p>{shop.trialEndsAt ? `Until ${formatDate(shop.trialEndsAt)}` : "No trial date"}</p>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-6">
                        <label className="grid gap-1 text-xs sm:col-span-3">Payment purpose<select value={draft.kind || "RENEWAL"} onChange={(e) => updateBillingDraft(shop, { kind: e.target.value })} className="rounded-lg border p-2"><option value="RENEWAL">Renew subscription</option><option value="BRANCH_ADDON">Additional branches until current expiry</option></select></label>
                        <label className="grid gap-1 text-xs sm:col-span-3">Total paid extra locations (above 4)<input type="number" min={0} max={100} value={draft.extraBranches ?? shop.additionalBranchSlots ?? 0} onChange={(e) => updateBillingDraft(shop, { extraBranches: e.target.value })} className="rounded-lg border p-2" /></label>
                        <select
                          value={draft.plan}
                          onChange={(e) => updateBillingDraft(shop, { plan: e.target.value as "BASIC" | "PRO" })}
                          className="rounded-lg border border-gray-300 px-2 py-2 text-xs font-semibold sm:col-span-1"
                        >
                          <option value="BASIC">Basic</option>
                          <option value="PRO">Pro</option>
                        </select>
                        <input
                          value={draft.months}
                          onChange={(e) => updateBillingDraft(shop, { months: e.target.value })}
                          type="number"
                          min="1"
                          max="24"
                          inputMode="numeric"
                          placeholder="Months"
                          className="rounded-lg border border-gray-300 px-2 py-2 text-xs sm:col-span-1"
                        />
                        <input
                          value={draft.amount}
                          onChange={(e) => updateBillingDraft(shop, { amount: e.target.value })}
                          type="number"
                          min="1"
                          inputMode="numeric"
                          placeholder="Amount"
                          className="rounded-lg border border-gray-300 px-2 py-2 text-xs sm:col-span-1"
                        />
                        <select
                          value={draft.method}
                          onChange={(e) => updateBillingDraft(shop, { method: e.target.value })}
                          className="rounded-lg border border-gray-300 px-2 py-2 text-xs sm:col-span-1"
                        >
                          <option value="MPESA">M-Pesa</option>
                          <option value="MANUAL">Manual</option>
                          <option value="BANK">Bank</option>
                          <option value="CASH">Cash</option>
                        </select>
                        <input
                          value={draft.reference}
                          onChange={(e) => updateBillingDraft(shop, { reference: e.target.value })}
                          placeholder="Reference"
                          className="rounded-lg border border-gray-300 px-2 py-2 text-xs sm:col-span-2"
                        />
                        <input
                          value={draft.note}
                          onChange={(e) => updateBillingDraft(shop, { note: e.target.value })}
                          placeholder="Admin note"
                          className="rounded-lg border border-gray-300 px-2 py-2 text-xs sm:col-span-4"
                        />
                        <button
                          onClick={() => handleRecordPayment(shop, undefined, draft)}
                          disabled={updatingSub === shop.id}
                          className="rounded-lg bg-brand-700 px-3 py-2 text-xs font-bold text-white hover:bg-brand-800 disabled:opacity-50 sm:col-span-2"
                        >
                          {updatingSub === shop.id ? "Saving..." : "Record payment & activate"}
                        </button>
                      </div>
                      {feedback?.message && (
                        <p role="status" className={`mt-2 rounded-lg border px-2.5 py-2 text-xs font-medium ${
                          feedback.tone === "success"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-red-200 bg-red-50 text-red-800"
                        }`}>
                          {feedback.message}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button onClick={() => handleRecordPayment(shop, "BASIC")} disabled={updatingSub === shop.id} className="rounded bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-200 disabled:opacity-50">
                          Record Basic 1mo
                        </button>
                        <button onClick={() => handleRecordPayment(shop, "PRO")} disabled={updatingSub === shop.id} className="rounded bg-purple-100 px-2 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-200 disabled:opacity-50">
                          Record Pro 1mo
                        </button>
                        <button onClick={() => handleExtendTrial(shop.id, 14)} disabled={updatingSub === shop.id} className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50">
                          +14d trial
                        </button>
                        <button onClick={() => handleExtendSubscription(shop, 30)} disabled={updatingSub === shop.id} className="rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-200 disabled:opacity-50">
                          Grant 30-day access
                        </button>
                        <button onClick={() => handleToggleShopActive(shop)} disabled={updatingSub === shop.id} className={`rounded px-2 py-1 text-xs font-semibold disabled:opacity-50 ${shop.isActive ? "bg-red-100 text-red-700 hover:bg-red-200" : "bg-green-100 text-green-700 hover:bg-green-200"}`}>
                          {shop.isActive ? "Suspend" : "Activate shop"}
                        </button>
                        <button onClick={() => handleRemoveSubscription(shop)} disabled={updatingSub === shop.id || !shop.subscriptionEndsAt} className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-200 disabled:opacity-50">
                          Remove paid plan
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        Last payment: {shop.lastPayment ? `${formatTZS(shop.lastPayment.amount)} ${shop.lastPayment.method} on ${formatDate(shop.lastPayment.paidAt)}` : "None"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs text-gray-600">Page {subscriptionPage} of {subscriptionTotalPages}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => refreshSubscriptions({ page: subscriptionPage - 1 }).catch(console.error)}
                  disabled={subscriptionPage <= 1}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => refreshSubscriptions({ page: subscriptionPage + 1 }).catch(console.error)}
                  disabled={subscriptionPage >= subscriptionTotalPages}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2">
                <p className="text-xs font-semibold text-gray-700">Subscription detail table</p>
                <p className="text-xs text-gray-500">Scroll right to see validity, notes, payment and actions</p>
              </div>
              <div className="max-w-full overflow-x-auto">
              <table className="min-w-[1280px] w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-white">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Shop</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Owner</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Plan</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Status</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Valid Until</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Activation</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Follow-up</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Last Payment</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubscriptions.map((shop) => (
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
                      <td className="px-4 py-2.5 text-gray-600 text-xs">
                        <div className="space-y-1">
                          <p className="font-semibold text-gray-800">{formatDate(shop.validUntil || shop.subscriptionEndsAt || shop.trialEndsAt)}</p>
                          <p>{shop.daysLeft !== null ? `${shop.daysLeft}d left` : "-"}</p>
                          {shop.subscriptionEndsAt && (
                            <p className="text-gray-400">Paid: {formatDate(shop.subscriptionEndsAt)}</p>
                          )}
                          {shop.reminderStage && (
                            <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              {shop.reminderStage.replaceAll("_", " ")}
                            </span>
                          )}
                        </div>
                      </td>
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
                            <option value="NEEDS_HELP">NEEDS HELP</option>
                            <option value="SETUP_DONE">SETUP DONE</option>
                            <option value="ACTIVATED">ACTIVATED</option>
                            <option value="PAID">PAID</option>
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
                        {shop.lastPayment ? (
                          <div>
                            <p className="font-semibold text-gray-800">{formatTZS(shop.lastPayment.amount)} {shop.lastPayment.method}</p>
                            <p className="text-gray-400">{formatDate(shop.lastPayment.paidAt)}</p>
                            {shop.lastPayment.reference && <p className="font-mono text-[10px] text-gray-400">{shop.lastPayment.reference}</p>}
                          </div>
                        ) : "None"}
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
                            onClick={() => handleExtendSubscription(shop, 30)}
                            disabled={updatingSub === shop.id}
                            className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-medium hover:bg-emerald-200 disabled:opacity-50"
                          >
                            +30d paid
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
                          <button
                            onClick={() => handleRemoveSubscription(shop)}
                            disabled={updatingSub === shop.id || !shop.subscriptionEndsAt}
                            className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200 disabled:opacity-50"
                          >
                            Remove paid plan
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        )}

        {/* SYNC HISTORY */}
        {tab === "sync" && (
          <div className="space-y-4">
            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Offline Sync History</h2>
                  <p className="text-xs text-gray-500">Drill into queued, synced, failed, and removed sales or crop-field records by shop and device.</p>
                </div>
                <button
                  onClick={() => refreshSyncEvents().catch(console.error)}
                  disabled={loadingSyncEvents}
                  className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingSyncEvents ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>
              <form onSubmit={submitSyncSearch} className="mb-3 flex flex-col gap-2 sm:flex-row">
                <input aria-label="Search sync history" value={syncSearchDraft} onChange={(event) => setSyncSearchDraft(event.target.value)} placeholder="Search any shop, owner phone, device, or local event ID" className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                <button type="submit" className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-gray-950 px-3 py-2 text-sm font-semibold text-white"><Search className="h-4 w-4" /> Search all shops</button>
              </form>
              <div className="grid gap-2 md:grid-cols-4">
                <input
                  value={syncDeviceFilter}
                  onChange={(e) => setSyncDeviceFilter(e.target.value)}
                  onBlur={() => refreshSyncEvents({ page: 1 }).catch(console.error)}
                  placeholder="Device ID"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <select
                  value={syncStatusFilter}
                  onChange={(e) => {
                    setSyncStatusFilter(e.target.value);
                    refreshSyncEvents({ status: e.target.value, page: 1 }).catch(console.error);
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">All statuses</option>
                  <option value="QUEUED">Queued</option>
                  <option value="SYNCED">Synced</option>
                  <option value="FAILED">Failed</option>
                  <option value="REMOVED">Removed</option>
                </select>
                <select
                  value={syncOperationFilter}
                  onChange={(e) => {
                    setSyncOperationFilter(e.target.value);
                    refreshSyncEvents({ operationKind: e.target.value, page: 1 }).catch(console.error);
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  aria-label="Filter sync operations"
                >
                  <option value="">All operations</option>
                  <option value="SALE">Sales</option>
                  <option value="CROP_FIELD">Crop field</option>
                </select>
                <button
                  onClick={() => {
                    setSyncShopFilter("");
                    setSyncDeviceFilter("");
                    setSyncStatusFilter("");
                    setSyncOperationFilter("");
                    setSyncSearch("");
                    setSyncSearchDraft("");
                    refreshSyncEvents({ shopId: "", deviceId: "", status: "", operationKind: "", search: "", page: 1 }).catch(console.error);
                  }}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Clear filters
                </button>
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-gray-900">Device Rollup</h2>
                <span className="text-xs text-gray-400">{syncDevices.length} rows</span>
              </div>
              {syncDevices.length === 0 ? (
                <p className="rounded-lg bg-gray-50 px-3 py-4 text-sm text-gray-500">No sync device events found for this filter.</p>
              ) : (
                <div className="max-w-full overflow-x-auto">
                  <table className="min-w-[760px] w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Shop</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Device</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Status</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Events</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Last seen</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {syncDevices.map((device, index) => {
                        const shop = device.shop || subscriptions.find((item) => item.id === device.shopId);
                        const deviceLabel = displayDeviceLabel(device.deviceId, device.deviceLabel, shop?.user?.name);
                        return (
                          <tr key={`${device.shopId}-${device.deviceId || "unknown"}-${device.status}-${index}`} className="border-b border-gray-50">
                            <td className="px-3 py-2 font-medium text-gray-900">{shop?.name || device.shopId}</td>
                            <td className="px-3 py-2">
                              <p className="text-xs font-semibold text-gray-800">{deviceLabel}</p>
                              <p className="font-mono text-[11px] text-gray-400">{device.deviceId || "unknown"}</p>
                            </td>
                            <td className="px-3 py-2">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                device.status === "FAILED" ? "bg-red-100 text-red-700" :
                                device.status === "SYNCED" ? "bg-green-100 text-green-700" :
                                device.status === "QUEUED" ? "bg-amber-100 text-amber-700" :
                                "bg-gray-100 text-gray-700"
                              }`}>{device.status}</span>
                            </td>
                            <td className="px-3 py-2 text-gray-600">{device._count.id}</td>
                            <td className="px-3 py-2 text-xs text-gray-500">{device._max.createdAt ? new Date(device._max.createdAt).toLocaleString() : "-"}</td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex justify-end gap-1">
                                <button
                                  onClick={() => openSyncHistory(device.shopId, device.deviceId || "")}
                                  className="rounded-lg bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-200"
                                >
                                  Filter
                                </button>
                                <button
                                  onClick={() => {
                                    const nextLabel = window.prompt("Device label", deviceLabel);
                                    if (nextLabel) handleSaveDeviceLabel(device, nextLabel).catch(console.error);
                                  }}
                                  disabled={!device.deviceId}
                                  className="rounded-lg bg-brand-100 px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-200 disabled:opacity-50"
                                >
                                  Label
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-gray-200 bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-900">Event Timeline</h2>
                <span className="text-xs text-gray-400">{syncEvents.length} of {syncTotal.toLocaleString()} events</span>
              </div>
              {syncEvents.length === 0 ? (
                <p className="p-6 text-sm text-gray-500">No sync events found for this filter.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {syncEvents.map((event) => (
                    <div key={event.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto] lg:items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-gray-950">{event.shop?.name || event.shopId}</p>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            event.status === "FAILED" ? "bg-red-100 text-red-700" :
                            event.status === "SYNCED" ? "bg-green-100 text-green-700" :
                              event.status === "QUEUED" ? "bg-amber-100 text-amber-700" :
                            "bg-gray-100 text-gray-700"
                          }`}>{event.status}</span>
                          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-800">{event.operationKind === "CROP_FIELD" ? "Crop field" : "Sale"}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            event.resolutionStatus === "RESOLVED" ? "bg-green-100 text-green-700" :
                            event.resolutionStatus === "CONTACTED" ? "bg-blue-100 text-blue-700" :
                            "bg-red-100 text-red-700"
                          }`}>{event.resolutionStatus || "OPEN"}</span>
                          <span className="text-xs font-semibold text-gray-500">
                            {displayDeviceLabel(event.deviceId, event.deviceLabel, event.shop?.user?.name)}
                          </span>
                          <span className="font-mono text-[11px] text-gray-400">{event.deviceId || "unknown device"}</span>
                        </div>
                        <p className="mt-1 text-sm text-gray-600">{event.message || "No message recorded"}</p>
                        <p className="mt-1 text-xs text-gray-400">
                          Owner: {event.shop?.user?.name || "Unknown"} {event.shop?.user?.phone ? `- ${event.shop.user.phone}` : ""} - Local record: {event.localId || "-"}
                        </p>
                        {event.resolutionNote && <p className="mt-1 rounded-lg bg-gray-50 px-2 py-1 text-xs text-gray-600">Note: {event.resolutionNote}</p>}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(["OPEN", "CONTACTED", "RESOLVED"] as const).map((status) => (
                            <button
                              key={status}
                              onClick={() => handleUpdateSyncEvent(event, { resolutionStatus: status }).catch(console.error)}
                              className={`rounded px-2 py-1 text-xs font-semibold ${
                                status === "RESOLVED" ? "bg-green-100 text-green-700 hover:bg-green-200" :
                                status === "CONTACTED" ? "bg-blue-100 text-blue-700 hover:bg-blue-200" :
                                "bg-red-100 text-red-700 hover:bg-red-200"
                              }`}
                            >
                              {status === "CONTACTED" ? "Contacted" : status === "RESOLVED" ? "Resolved" : "Open"}
                            </button>
                          ))}
                          <button
                            onClick={() => {
                              const note = window.prompt("Sync support note", event.resolutionNote || "");
                              if (note !== null) handleUpdateSyncEvent(event, { resolutionNote: note }).catch(console.error);
                            }}
                            className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-200"
                          >
                            Note
                          </button>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 lg:text-right">
                        <p className="font-semibold text-gray-800">{event.total ? formatTZS(event.total) : "No total"}</p>
                        <p>Attempts {event.attempts}</p>
                        <p>{new Date(event.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <AdminPager page={syncPage} totalPages={syncTotalPages} total={syncTotal} pageSize={50} sw={sw} onPage={(page) => refreshSyncEvents({ page }).catch(console.error)} />
            </section>
          </div>
        )}

        {/* SMS MONITORING */}
        {tab === "sms" && (
          <div className="space-y-4">
            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <MessageSquareText className="h-4 w-4 text-brand-700" />
                    <h2 className="text-sm font-semibold text-gray-900">NextSMS delivery monitoring</h2>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-gray-500">Live provider balance and recent delivery metadata. PIN codes and full recipient numbers are never shown here.</p>
                </div>
                <button
                  onClick={() => refreshSmsMonitoring(true).catch(console.error)}
                  disabled={loadingSmsMonitoring}
                  className="inline-flex items-center justify-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingSmsMonitoring ? "animate-spin" : ""}`} />
                  Refresh live data
                </button>
              </div>
            </section>

            {smsMonitoringError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{smsMonitoringError}</div>
            )}

            {loadingSmsMonitoring && !smsMonitoring && (
              <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading NextSMS delivery data...</div>
            )}

            {smsMonitoring && (
              <>
                <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <MiniMetric label="SMS credits" value={smsMonitoring.balance.smsCredits} tone="border-brand-200 bg-brand-50 text-brand-800" />
                  <MiniMetric label="Balance (TZS)" value={smsMonitoring.balance.balanceTzs} tone="border-blue-200 bg-blue-50 text-blue-800" />
                  <MiniMetric label="Delivered" value={smsMonitoring.summary.delivered} tone="border-green-200 bg-green-50 text-green-800" />
                  <MiniMetric label="Pending" value={smsMonitoring.summary.pending} tone="border-amber-200 bg-amber-50 text-amber-800" />
                  <MiniMetric label="Failed" value={smsMonitoring.summary.failed} tone="border-red-200 bg-red-50 text-red-800" />
                </section>

                <section className="rounded-xl border border-gray-200 bg-white">
                  <div className="flex flex-col gap-1 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-900">Recent messages</h2>
                      <p className="text-xs text-gray-500">{smsMonitoring.summary.total} provider records. Updated {new Date(smsMonitoring.fetchedAt).toLocaleString()}.</p>
                    </div>
                    <span className="text-xs font-semibold text-gray-500">{smsMonitoring.balance.channel || smsMonitoring.provider}</span>
                  </div>
                  {smsMonitoring.reports.length === 0 ? (
                    <p className="p-6 text-sm text-gray-500">No SMS delivery records returned by NextSMS yet.</p>
                  ) : (
                    <div className="max-w-full overflow-x-auto">
                      <table className="min-w-[760px] w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Recipient</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Type / reference</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Sent</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Completed</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Status</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">SMS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {smsMonitoring.reports.map((message) => {
                            const failed = ["FAILED", "REJECTED", "UNDELIVERABLE", "EXPIRED"].includes(message.status);
                            const delivered = message.status === "DELIVERED";
                            return (
                              <tr key={`${message.messageId}-${message.sentAt || "pending"}`} className="border-b border-gray-50">
                                <td className="px-4 py-3 font-mono text-xs text-gray-700">{message.to}</td>
                                <td className="px-4 py-3">
                                  <p className="font-medium text-gray-900">{message.reference || "Provider message"}</p>
                                  <p className="mt-0.5 text-xs text-gray-500">{message.sender || "-"} - {message.channel || "SMS"}</p>
                                </td>
                                <td className="px-4 py-3 text-xs text-gray-600">{message.sentAt ? new Date(message.sentAt).toLocaleString() : "-"}</td>
                                <td className="px-4 py-3 text-xs text-gray-600">{message.doneAt ? new Date(message.doneAt).toLocaleString() : "-"}</td>
                                <td className="px-4 py-3">
                                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                    delivered ? "bg-green-100 text-green-700" : failed ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                                  }`}>{message.status}</span>
                                </td>
                                <td className="px-4 py-3 text-right text-gray-700">{message.smsCount}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        )}

        {tab === "whatsapp" && <WhatsAppCoexistencePanel />}

        {/* SUPPLIERS */}
        {tab === "suppliers" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <MiniMetric label="Total suppliers" value={supplierTotal.toLocaleString()} tone="border-gray-200 bg-gray-50 text-gray-800" />
              <MiniMetric label="Verified" value={supplierStatusCounts.VERIFIED || 0} tone="border-green-200 bg-green-50 text-green-800" />
              <MiniMetric label="Needs review" value={(supplierStatusCounts.NEEDS_REVIEW || 0) + (supplierStatusCounts.UNVERIFIED || 0)} tone="border-amber-200 bg-amber-50 text-amber-800" />
              <MiniMetric label="Rejected" value={supplierStatusCounts.REJECTED || 0} tone="border-red-200 bg-red-50 text-red-800" />
            </div>
            <section className="rounded-xl border border-gray-200 bg-white p-3">
              <form onSubmit={submitSuppliersSearch} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <input aria-label="Search suppliers" value={supplierSearchDraft} onChange={(event) => setSupplierSearchDraft(event.target.value)} placeholder="Search supplier, phone, or address" className="min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                <select aria-label="Filter suppliers by verification status" value={supplierStatusFilter} onChange={(event) => { const status = event.target.value; setSupplierStatusFilter(status); refreshSuppliers(1, supplierSearch, status).catch(console.error); }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="ALL">All statuses</option><option value="UNVERIFIED">Unverified</option><option value="NEEDS_REVIEW">Needs review</option><option value="VERIFIED">Verified</option><option value="REJECTED">Rejected</option>
                </select>
                <button type="submit" className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-gray-950 px-3 py-2 text-sm font-semibold text-white"><Search className="h-4 w-4" /> Search</button>
              </form>
            </section>
            {suppliers.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
                No suppliers match these filters.
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
                      <p className="mt-1 text-sm text-gray-500">{supplier.phone} {supplier.address ? `- ${supplier.address}` : ""}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        Products {supplier._count?.products || 0} - Orders {supplier._count?.orders || 0}
                        {supplier.verifiedAt ? ` - Verified ${new Date(supplier.verifiedAt).toLocaleDateString()}` : ""}
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
                      <button
                        onClick={() => handleDeleteSupplier(supplier)}
                        disabled={updatingSupplier === supplier.id}
                        className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </button>
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
            <div className="overflow-hidden rounded-xl border border-gray-200"><AdminPager page={supplierPage} totalPages={supplierTotalPages} total={supplierTotal} sw={sw} onPage={(page) => refreshSuppliers(page).catch(console.error)} /></div>
          </div>
        )}
        {selectedSupportShop && <div className="fixed inset-0 z-50 bg-gray-950/40" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedSupportShop(null); }}>
          <aside role="dialog" aria-modal="true" aria-label="Shop support details" className="ml-auto flex h-full w-full max-w-md flex-col bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 pb-4">
              <div><p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Support shop</p><h2 className="mt-1 text-lg font-bold text-gray-950">{selectedSupportShop.name}</h2><p className="text-sm text-gray-500">{selectedSupportShop.user?.name || "Owner"} - {selectedSupportShop.user?.phone || "No phone"}</p></div>
              <button type="button" aria-label="Close details" onClick={() => setSelectedSupportShop(null)} className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto py-4 text-sm">
              <div className="grid grid-cols-2 gap-2"><MiniMetric label="Products" value={selectedSupportShop.activation?.productCount || 0} tone="border-gray-200 bg-gray-50 text-gray-800" /><MiniMetric label="Sales" value={selectedSupportShop.activation?.salesCount || 0} tone="border-gray-200 bg-gray-50 text-gray-800" /></div>
              <div className="rounded-lg border border-gray-200 p-3"><p className="font-semibold text-gray-900">{supportReason(selectedSupportShop)}</p><p className="mt-1 text-gray-500">{validityLabel(selectedSupportShop)}</p><p className="mt-1 text-gray-500">Support status: {selectedSupportShop.onboardingStatus}</p><p className="mt-1 text-gray-500">Last contacted: {selectedSupportShop.lastContactedAt ? new Date(selectedSupportShop.lastContactedAt).toLocaleString() : "Never"}</p></div>
              <div className="rounded-lg border border-gray-200 p-3"><p className="font-semibold text-gray-900">Latest support note</p><p className="mt-1 whitespace-pre-wrap text-gray-600">{selectedSupportShop.followUpNotes || "No note recorded."}</p></div>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-gray-200 pt-4"><a href={whatsappLeadHref(selectedSupportShop)} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1 rounded-lg bg-green-600 px-3 py-3 text-sm font-semibold text-white"><MessageCircle className="h-4 w-4" /> WhatsApp</a><button type="button" onClick={() => { setSelectedSupportShop(null); setTab("subscriptions"); }} className="rounded-lg bg-brand-700 px-3 py-3 text-sm font-semibold text-white">Open billing</button></div>
          </aside>
        </div>}
      </div>
    </AppShell>
  );
}
