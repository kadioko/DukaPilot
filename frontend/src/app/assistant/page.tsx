"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { TextReveal } from "@/components/ui/cascade-text";
import { api, formatTZS, getCurrentSession } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { ArrowRight, CheckCircle2, ClipboardCopy, FileText, HandCoins, LoaderCircle, MessageCircle, Package, ReceiptText, RotateCw, Send, ShoppingCart, Sparkles, Sprout, Tractor } from "lucide-react";

interface DashboardData {
  summary: { totalSales: number; netSales?: number; totalProfit: number; totalExpenses?: number; netProfit?: number; lowStockCount: number; outOfStockCount: number; pendingOrders: number; salesCount?: number };
  lowStockAlerts?: Array<{ id: string; name: string; currentStock: number; minimumStock: number; unit: string; buyingPrice?: number; sellingPrice?: number; hasReliablePace?: boolean; dailySalesRate?: number; daysOfCoverage?: number; reorderQuantity14d?: number; estimatedReorderCost?: number; saleDays28d?: number; observedDays?: number }>;
  topProducts?: Array<{ product?: { name: string; unit?: string }; totalQuantity?: number; totalRevenue?: number }>;
}

interface DebtSummary {
  summary: { openCount: number; totalOwed: number };
  debts?: Array<{ customerName?: string | null; customerPhone: string; amount: number; amountPaid: number; status: string; dueDate?: string | null; createdAt?: string }>;
}

interface ExpenseSummary {
  summary: { total: number; count: number };
  expenses?: Array<{ title: string; amount: number; category: string; spentAt: string }>;
  trend?: { current: number; previous: number; currentCount: number; previousCount: number };
}

interface Recommendation {
  id: string;
  rank: number;
  icon: typeof Package;
  tone: string;
  title: string;
  body: string;
  action: string;
  href: string;
  why: string;
  impact: string;
}

interface AssistantAction {
  id: string;
  actionKey: string;
  title: string;
  href: string;
  status: "OPEN" | "OPENED" | "COMPLETED" | "DISMISSED";
  openedAt?: string | null;
  completedAt?: string | null;
  dismissedAt?: string | null;
  outcomeVerifiedAt?: string | null;
  updatedAt: string;
}

interface QuotationAssistantAction {
  id: string;
  rank: number;
  href: string;
  title: string;
  body: string;
  action: string;
}

interface StockAssistantAction {
  id: string;
  rank: number;
  href: string;
  title: string;
  body: string;
  action: string;
}

interface FarmAssistantAction {
  id: string;
  rank: number;
  href: string;
  title: string;
  body: string;
  action: string;
}

interface AssistantAccess {
  loaded: boolean;
  isStaff: boolean;
  canViewReports: boolean;
  canManageStock: boolean;
  canManageFarm: boolean;
  canSell: boolean;
}

type AssistantSourceKey = "salesToday" | "inventory" | "debts" | "expenses" | "quotations" | "farm" | "actionHistory";
type AssistantSourceStatus = { status: "ready" | "unavailable" | "not_permitted"; checkedAt: string; dataThrough?: string | null; errorCode?: string };
interface AssistantSnapshotResponse {
  generatedAt: string;
  snapshotKey: string;
  sections: Partial<Record<AssistantSourceKey, AssistantSourceStatus & { data?: Record<string, unknown> }>>;
}
interface AssistantSnapshotData {
  dashboard: DashboardData | null;
  debts: DebtSummary | null;
  expenses: ExpenseSummary | null;
  quotationActions: QuotationAssistantAction[];
  stockActions: StockAssistantAction[];
  stockProducts: NonNullable<DashboardData["lowStockAlerts"]>;
  farmActions: FarmAssistantAction[];
  actions: AssistantAction[];
}
interface AssistantAnswer {
  message: string;
  href: string;
  evidence: Array<{ source: string; checkedAt: string; dataThrough?: string | null }>;
  privacy: string;
}

const SOURCE_KEYS: AssistantSourceKey[] = ["salesToday", "inventory", "debts", "expenses", "quotations", "farm", "actionHistory"];

function emptyAssistantData(): AssistantSnapshotData {
  return { dashboard: null, debts: null, expenses: null, quotationActions: [], stockActions: [], stockProducts: [], farmActions: [], actions: [] };
}

function applySnapshotToData(previous: AssistantSnapshotData, snapshot: AssistantSnapshotResponse): AssistantSnapshotData {
  const next = { ...previous };
  const ready = (key: AssistantSourceKey) => snapshot.sections[key]?.status === "ready" ? snapshot.sections[key]?.data : null;
  const today = ready("salesToday")?.dashboard as DashboardData | undefined;
  if (today) next.dashboard = today;
  const inventory = ready("inventory");
  if (inventory) {
    next.stockActions = (inventory.actions || []) as StockAssistantAction[];
    next.stockProducts = (inventory.products || []) as AssistantSnapshotData["stockProducts"];
  }
  const debts = ready("debts");
  if (debts) next.debts = debts as unknown as DebtSummary;
  const expenses = ready("expenses");
  if (expenses) next.expenses = expenses as unknown as ExpenseSummary;
  const quotations = ready("quotations");
  if (quotations) next.quotationActions = (quotations.actions || []) as QuotationAssistantAction[];
  const farm = ready("farm");
  if (farm) next.farmActions = (farm.actions || []) as FarmAssistantAction[];
  const historyActions = ready("actionHistory");
  if (historyActions) next.actions = (historyActions.actions || []) as AssistantAction[];
  if (next.dashboard) {
    next.dashboard = {
      ...next.dashboard,
      lowStockAlerts: next.stockProducts,
    };
  }
  return next;
}

function formatCheckedAt(value: string, lang: "sw" | "en") {
  return new Intl.DateTimeFormat(lang === "sw" ? "sw-TZ" : "en-TZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Dar_es_Salaam" }).format(new Date(value));
}

export default function AssistantPage() {
  const lang = useLang();
  const router = useRouter();
  const [snapshotData, setSnapshotData] = useState<AssistantSnapshotData>(emptyAssistantData);
  const [sourceStatuses, setSourceStatuses] = useState<Partial<Record<AssistantSourceKey, AssistantSourceStatus>>>({});
  const [snapshotKey, setSnapshotKey] = useState("");
  const [loadingSnapshot, setLoadingSnapshot] = useState(true);
  const [snapshotError, setSnapshotError] = useState("");
  const [retryingSources, setRetryingSources] = useState<Set<AssistantSourceKey>>(new Set());
  const [copied, setCopied] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const [askError, setAskError] = useState("");
  const [asking, setAsking] = useState(false);
  const impressionKeys = useRef(new Set<string>());
  const [access, setAccess] = useState<AssistantAccess>({ loaded: false, isStaff: false, canViewReports: false, canManageStock: false, canManageFarm: false, canSell: false });

  const dashboard = snapshotData.dashboard;
  const debts = snapshotData.debts;
  const expenses = snapshotData.expenses;
  const quotationActions = snapshotData.quotationActions;
  const stockActions = snapshotData.stockActions;
  const farmActions = snapshotData.farmActions;
  const actions = snapshotData.actions;

  const markSourcesUnavailable = useCallback((source?: AssistantSourceKey) => {
    const checkedAt = new Date().toISOString();
    const failed = (key: AssistantSourceKey, previous?: AssistantSourceStatus): AssistantSourceStatus => previous?.status === "not_permitted"
      ? previous
      : { ...previous, status: "unavailable", checkedAt, errorCode: "REQUEST_FAILED" };
    setSourceStatuses((current) => source
      ? { ...current, [source]: failed(source, current[source]) }
      : { ...current, ...Object.fromEntries(SOURCE_KEYS.map((key) => [key, failed(key, current[key])])) });
  }, []);

  async function requestSnapshot(source?: AssistantSourceKey) {
    if (source) setRetryingSources((current) => new Set(current).add(source));
    else setLoadingSnapshot(true);
    setSnapshotError("");
    try {
      const path = source ? `/assistant/today?source=${encodeURIComponent(source)}` : "/assistant/today";
      const data = await api.get<AssistantSnapshotResponse>(path, lang);
      setSourceStatuses((current) => ({ ...current, ...data.sections }));
      setSnapshotKey(data.snapshotKey || "");
      setSnapshotData((current) => applySnapshotToData(current, data));
    } catch (error) {
      markSourcesUnavailable(source);
      setSnapshotError(error instanceof Error ? error.message : (lang === "sw" ? "Data za msaidizi hazikupatikana." : "Assistant data could not be loaded."));
    } finally {
      if (source) setRetryingSources((current) => { const next = new Set(current); next.delete(source); return next; });
      else setLoadingSnapshot(false);
    }
  }

  useEffect(() => {
    let active = true;
    let sessionLoaded = false;
    async function loadAssistant() {
      try {
        const session = await getCurrentSession<{ user: { shop?: { category?: string | null }; staff?: { permissions?: { canSell?: boolean; canManageStock?: boolean; canManageFarm?: boolean; canViewReports?: boolean } } } }>();
        sessionLoaded = true;
        const isStaff = Boolean(session.user.staff);
        const permissions = session.user.staff?.permissions;
        const nextAccess = {
          loaded: true,
          isStaff,
          canViewReports: !isStaff || Boolean(permissions?.canViewReports),
          canManageStock: !isStaff || Boolean(permissions?.canManageStock),
          canManageFarm: !isStaff || Boolean(permissions?.canManageFarm),
          canSell: !isStaff || Boolean(permissions?.canSell),
        };
        if (!active) return;
        setAccess(nextAccess);
        const data = await api.get<AssistantSnapshotResponse>("/assistant/today", lang);
        if (!active) return;
        setSourceStatuses(data.sections);
        setSnapshotKey(data.snapshotKey || "");
        setSnapshotData((current) => applySnapshotToData(current, data));
      } catch (error) {
        if (active) {
          setAccess((current) => ({ ...current, loaded: true }));
          if (sessionLoaded) markSourcesUnavailable();
          setSnapshotError(error instanceof Error ? error.message : (lang === "sw" ? "Data za msaidizi hazikupatikana." : "Assistant data could not be loaded."));
        }
      } finally {
        if (active) setLoadingSnapshot(false);
      }
    }
    loadAssistant();
    return () => { active = false; };
  }, [lang, markSourcesUnavailable]);

  const cashierGuidance: Recommendation[] = access.loaded && access.isStaff && !access.canViewReports && access.canSell ? [{
    id: "cashier-safe-guidance", rank: 40, icon: ShoppingCart, tone: "bg-blue-50 text-blue-700",
    title: lang === "sw" ? "Rekodi kila mauzo kwa POS" : "Record every sale in POS",
    body: lang === "sw" ? "Tumia bidhaa sahihi na njia sahihi ya malipo kila mteja anaponunua. Hii huweka rekodi za duka zikiwa sahihi." : "Use the correct product and payment method for every customer sale. This keeps the shop records accurate.",
    action: lang === "sw" ? "Fungua Mauzo" : "Open Sales", href: "/sales",
    why: lang === "sw" ? "Rekodi sahihi ya POS humsaidia mmiliki kusimamia biashara bila kukupa taarifa za fedha za duka." : "Accurate POS records help the owner run the business without exposing shop financial data to you.",
    impact: lang === "sw" ? "Mauzo yote yanabaki na kumbukumbu sahihi." : "Every sale has a clean record.",
  }] : [];
  const recommendations = [
    ...(access.canViewReports ? quotationActions.map((item) => ({ ...item, icon: FileText, tone: item.rank >= 90 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700", why: lang === "sw" ? "Hii imetolewa na server kwa ruhusa za akaunti yako na data ya nukuu za duka lako." : "This is generated on the server from quotation data your account is allowed to view.", impact: lang === "sw" ? "Kamilisha hatua bila kuchanganya nukuu na mapato yaliyothibitishwa." : "Complete the next step without confusing quotation value with confirmed revenue." })) : []),
    ...(access.canViewReports ? buildRecommendations({ dashboard, debts, expenses, stockProducts: snapshotData.stockProducts, lang }) : []),
    ...(!access.canViewReports ? stockActions.map((item) => ({ ...item, icon: Package, tone: "bg-amber-50 text-amber-700", why: lang === "sw" ? "Hii inaonyesha stock inayohitaji kuangaliwa; haionyeshi mauzo, bei au faida." : "This highlights stock that needs attention; it does not show sales, prices, or profit.", impact: lang === "sw" ? "Tayarisha stock count au mjulishe mwenye duka mapema." : "Prepare a stock count or alert the owner early." })) : []),
    ...farmActions.map((item) => ({ ...item, icon: item.id.startsWith("crop-") ? Sprout : Tractor, tone: item.rank >= 90 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700", why: lang === "sw" ? "Hii inatokana na rekodi za shamba lako. Haijumuishi ushauri wa afya ya wanyama au kilimo." : "This uses records from your farm. It does not provide animal-health or agronomy advice.", impact: lang === "sw" ? "Rekodi za shamba na stock zinabaki sahihi kabla ya kuuza." : "Keep field records and sellable stock accurate before sales." })),
    ...cashierGuidance,
  ].sort((a, b) => b.rank - a.rank).slice(0, 5);
  const ownerSummary = buildOwnerSummary(recommendations, lang);
  const urgentCount = recommendations.filter((item) => item.rank >= 80).length;
  const actionCount = recommendations.length;
  const canTrackActions = access.canViewReports;
  const hasUnavailableSources = Object.values(sourceStatuses).some((status) => status?.status === "unavailable");

  useEffect(() => {
    if (!canTrackActions || !snapshotKey || !recommendations.length) return;
    const events = recommendations.flatMap((item) => {
      const impressionKey = `${snapshotKey}:${item.id}`;
      if (impressionKeys.current.has(impressionKey)) return [];
      impressionKeys.current.add(impressionKey);
      return [{ actionKey: item.id, impressionKey }];
    });
    if (events.length) api.post("/assistant/actions/impressions", { events }, lang).catch(() => {});
  }, [canTrackActions, lang, recommendations, snapshotKey]);

  async function copyOwnerSummary() {
    const message = lang === "sw"
      ? `DukaPilot leo: ${ownerSummary}`
      : `DukaPilot today: ${ownerSummary}`;
    await navigator.clipboard?.writeText(message);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  }

  function actionStatus(item: Recommendation) {
    return actions.find((action) => action.actionKey === item.id);
  }

  async function trackRecommendation(item: Recommendation, status: AssistantAction["status"]) {
    const impressionKey = `${snapshotKey}:${item.id}`;
    const data = await api.post<{ action: AssistantAction }>("/assistant/actions", {
      actionKey: item.id,
      title: item.title,
      href: item.href,
      status,
      impressionKey,
    }, lang);
    setSnapshotData((prev) => ({ ...prev, actions: [data.action, ...prev.actions.filter((action) => action.actionKey !== item.id)] }));
  }

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim() || asking) return;
    setAsking(true);
    setAskError("");
    try {
      const result = await api.post<{ answer: AssistantAnswer }>("/assistant/ask", { question: question.trim() }, lang);
      setAnswer(result.answer);
    } catch (error) {
      setAskError(error instanceof Error ? error.message : (lang === "sw" ? "Swali halikujibiwa. Jaribu tena." : "The question could not be answered. Try again."));
    } finally {
      setAsking(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-brand-600 p-3 text-white shadow-sm">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-950">
                  <TextReveal text={lang === "sw" ? "Msaidizi wa AI wa DukaPilot" : "DukaPilot AI Assistant"} fontSize="inherit" hoverColor="#15803d" />
                </h1>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-600">
                  {lang === "sw"
                    ? "Kila siku inachambua mauzo, bidhaa, madeni, matumizi na nukuu za bei kisha inapanga hatua za kufanya kwanza."
                    : "Every day it reads sales, inventory, debts, expenses, and quotations, then ranks what to do first."}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 md:min-w-80">
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <p className="text-xs text-gray-500">{lang === "sw" ? "Haraka" : "Urgent"}</p>
                <p className="text-xl font-black text-red-700">{urgentCount}</p>
              </div>
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <p className="text-xs text-gray-500">{lang === "sw" ? "Hatua" : "Actions"}</p>
                <p className="text-xl font-black text-brand-700">{actionCount}</p>
              </div>
              <button
                type="button"
                onClick={copyOwnerSummary}
                className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl bg-gray-950 px-3 py-3 text-xs font-bold text-white sm:col-span-1"
              >
                {copied ? <CheckCircle2 className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
                {copied ? (lang === "sw" ? "Imecopy" : "Copied") : "WhatsApp"}
              </button>
              {canTrackActions && <Link href="/assistant/history" className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl border border-brand-200 bg-white px-3 py-3 text-xs font-bold text-brand-700 hover:bg-brand-50 sm:col-span-3">
                {lang === "sw" ? "Historia ya hatua za AI" : "AI action history"}
                <ArrowRight className="h-4 w-4" />
              </Link>}
            </div>
          </div>
        </div>

        <section className="rounded-lg border border-gray-200 bg-white p-4" aria-labelledby="assistant-data-status">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="assistant-data-status" className="text-sm font-semibold text-gray-950">{lang === "sw" ? "Hali na muda wa data" : "Data status and freshness"}</h2>
              <p className="mt-1 text-xs text-gray-500">{lang === "sw" ? "Kila chanzo kina hali yake; hitilafu moja haifichi mapendekezo mengine." : "Each source reports independently, so one failure does not hide the rest."}</p>
            </div>
            <button type="button" onClick={() => requestSnapshot()} disabled={loadingSnapshot} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50">
              {loadingSnapshot ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
              {lang === "sw" ? "Sasisha zote" : "Refresh all"}
            </button>
          </div>
          {snapshotError && <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{snapshotError}</p>}
          {loadingSnapshot && !Object.keys(sourceStatuses).length && <p className="mt-3 text-sm text-gray-500">{lang === "sw" ? "Inapakia data za biashara..." : "Loading business data..."}</p>}
          {Object.keys(sourceStatuses).length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {SOURCE_KEYS.map((key) => {
              const status = sourceStatuses[key];
              if (!status) return null;
              const label = ({ salesToday: lang === "sw" ? "Mauzo ya leo" : "Today's sales", inventory: lang === "sw" ? "Stock" : "Inventory", debts: lang === "sw" ? "Madeni" : "Debts", expenses: lang === "sw" ? "Matumizi" : "Expenses", quotations: lang === "sw" ? "Nukuu" : "Quotations", farm: lang === "sw" ? "Shamba" : "Farm", actionHistory: lang === "sw" ? "Historia ya hatua" : "Action history" })[key];
              const failed = status.status === "unavailable";
              const restricted = status.status === "not_permitted";
              return <div key={key} className={`flex min-w-0 items-start justify-between gap-2 rounded-md border px-3 py-2 ${failed ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50"}`}>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-gray-800">{label}</p>
                  <p className={`mt-0.5 text-[11px] ${failed ? "text-red-700" : "text-gray-500"}`}>
                    {failed ? (lang === "sw" ? "Haikupatikana · Jaribio " : "Unavailable · Tried ") + formatCheckedAt(status.checkedAt, lang) : restricted ? (lang === "sw" ? "Ruhusa inahitajika" : "Access restricted") : (lang === "sw" ? "Imekaguliwa " : "Checked ") + formatCheckedAt(status.checkedAt, lang)}
                  </p>
                  {!restricted && status.dataThrough && <p className="mt-0.5 text-[10px] text-gray-500">{lang === "sw" ? "Rekodi hadi" : "Records through"} {formatCheckedAt(status.dataThrough, lang)}</p>}
                </div>
                {failed && <button type="button" onClick={() => requestSnapshot(key)} disabled={retryingSources.has(key)} aria-label={`${lang === "sw" ? "Jaribu tena" : "Retry"} ${label}`} className="inline-flex flex-shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50">
                  <RotateCw className={`h-3.5 w-3.5 ${retryingSources.has(key) ? "animate-spin" : ""}`} />{lang === "sw" ? "Jaribu tena" : "Retry"}
                </button>}
              </div>;
            })}
          </div>}
          {canTrackActions && <p className="mt-3 text-[11px] leading-5 text-gray-500">{lang === "sw" ? "Kuweka hatua kuwa imefanyika ni uthibitisho wako tu; matokeo yaliyothibitishwa yanahitaji mabadiliko ya rekodi yanayopimika na hayaonyeshi kuwa AI ndiyo iliyoyasababisha." : "Marking an action done records your confirmation; a verified outcome requires a measurable record change and does not prove the assistant caused it."}</p>}
        </section>

        <section className="rounded-lg border border-brand-200 bg-white p-4" aria-labelledby="ask-dukapilot-heading">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-brand-700" />
            <h2 id="ask-dukapilot-heading" className="font-semibold text-gray-950">{lang === "sw" ? "Muulize DukaPilot" : "Ask DukaPilot"}</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-gray-500">{lang === "sw" ? "Majibu hutumia rekodi unazoruhusiwa kuona. Hayaandiki wala kubadilisha mauzo, malipo au stock." : "Answers use records your account may view. They never create or change sales, payments, or stock."}</p>
          <form onSubmit={submitQuestion} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={240} aria-label={lang === "sw" ? "Uliza kuhusu biashara yako" : "Ask about your business"} placeholder={lang === "sw" ? "Mfano: Ni bidhaa gani inahitaji kuagizwa?" : "For example: Which product may need reordering?"} className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100" />
            <button type="submit" disabled={asking || !question.trim()} className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {asking ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{lang === "sw" ? "Uliza" : "Ask"}
            </button>
          </form>
          {askError && <p role="alert" className="mt-2 text-sm text-red-700">{askError}</p>}
          {answer && <div className="mt-3 rounded-md bg-brand-50 p-3" aria-live="polite">
            <p className="text-sm leading-6 text-gray-800">{answer.message}</p>
            <Link href={answer.href} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-800">{lang === "sw" ? "Fungua rekodi husika" : "Open relevant records"}<ArrowRight className="h-3.5 w-3.5" /></Link>
            {answer.evidence.length > 0 && <p className="mt-2 text-[11px] text-gray-600">{lang === "sw" ? "Chanzo" : "Source"}: {answer.evidence.map((item) => `${item.source} (${formatCheckedAt(item.checkedAt, lang)})`).join(" · ")}</p>}
            <p className="mt-1 text-[11px] text-gray-500">{answer.privacy}</p>
          </div>}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-semibold text-gray-950">{lang === "sw" ? "Orodha ya leo" : "Today's command list"}</h2>
              <p className="mt-1 text-sm text-gray-500">
                {lang === "sw" ? "DukaPilot inapanga hatua muhimu kwanza." : "DukaPilot ranks the most useful next action first."}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-600 whitespace-pre-line sm:max-w-xs">
              <span className="font-semibold text-gray-800">WhatsApp:</span>{"\n"}{ownerSummary}
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            {recommendations.length === 0 ? (
              <p className="text-sm text-gray-500">{hasUnavailableSources
                ? (lang === "sw" ? "Baadhi ya data hazikupatikana; jaribu tena chanzo husika hapo juu ili mapendekezo yakamilike." : "Some data sources are unavailable; retry the affected source above to complete recommendations.")
                : !access.canViewReports
                  ? (lang === "sw" ? "Hakuna hatua ya stock au shamba inayohitaji uangalizi kwa sasa." : "No stock or farm action needs attention right now.")
                  : (lang === "sw" ? "Ongeza mauzo, bidhaa, madeni, matumizi au nukuu za bei ili msaidizi aanze kutoa mapendekezo." : "Add sales, inventory, debts, expenses, or quotations so the assistant can start producing recommendations.")}</p>
            ) : recommendations.map((item, index) => {
              const status = actionStatus(item);
              return (
              <div key={item.id} className={`rounded-xl border bg-white p-4 shadow-sm ${status?.status === "COMPLETED" ? "border-green-200" : status?.status === "DISMISSED" ? "border-gray-200 opacity-75" : "border-gray-200"}`}>
                <div className="flex items-start gap-3">
                  <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${item.tone}`}>
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-400">
                        {lang === "sw" ? `Kipaumbele ${index + 1}` : `Priority ${index + 1}`}
                      </p>
                      {status && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          status.status === "COMPLETED" ? "bg-green-100 text-green-700" :
                          status.status === "OPENED" ? "bg-blue-100 text-blue-700" :
                          status.status === "DISMISSED" ? "bg-gray-100 text-gray-500" :
                          "bg-amber-100 text-amber-700"
                        }`}>
                          {status.status === "COMPLETED" ? (lang === "sw" ? "Imefanyika" : "Done") :
                            status.status === "OPENED" ? (lang === "sw" ? "Imefunguliwa" : "Opened") :
                              status.status === "DISMISSED" ? (lang === "sw" ? "Imeachwa" : "Dismissed") :
                                (lang === "sw" ? "Wazi" : "Open")}
                        </span>
                      )}
                      {status?.outcomeVerifiedAt && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">{lang === "sw" ? "Matokeo yamethibitishwa" : "Outcome verified"}</span>}
                    </div>
                    <h3 className="mt-1 font-semibold text-gray-950">{item.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-gray-600">{item.body}</p>
                    <p className="mt-2 text-xs leading-5 text-gray-500">
                      <span className="font-semibold text-gray-700">{lang === "sw" ? "Kwa nini:" : "Why:"}</span> {item.why}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-gray-500">
                      <span className="font-semibold text-gray-700">{lang === "sw" ? "Matokeo:" : "Expected impact:"}</span> {item.impact}
                    </p>
                    <p className="mt-3 text-xs font-bold uppercase tracking-wide text-gray-500">{lang === "sw" ? "Fanya sasa" : "Do this now"}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Link
                        href={item.href}
                        onClick={(event) => {
                          if (!canTrackActions || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                          event.preventDefault();
                          trackRecommendation(item, "OPENED")
                            .catch(() => {})
                            .finally(() => router.push(item.href));
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                      >
                        {item.action}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                      {canTrackActions && <button
                        type="button"
                        onClick={() => trackRecommendation(item, "COMPLETED").catch(console.error)}
                        className="rounded-lg bg-green-100 px-3 py-2 text-sm font-semibold text-green-700 hover:bg-green-200"
                      >
                        {lang === "sw" ? "Nimefanya" : "Mark done"}
                      </button>}
                      {canTrackActions && <button
                        type="button"
                        onClick={() => trackRecommendation(item, "DISMISSED").catch(console.error)}
                        className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200"
                      >
                        {lang === "sw" ? "Acha" : "Dismiss"}
                      </button>}
                    </div>
                  </div>
                </div>
              </div>
            );
            })}
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          {[
            [lang === "sw" ? "Tambua hatari" : "Spot risk", lang === "sw" ? "Bidhaa kuisha, madeni kuchelewa, matumizi kupanda, au nukuu kuisha muda." : "Low stock, slow collections, rising expenses, or quotations nearing expiry."],
            [lang === "sw" ? "Panga hatua" : "Plan action", lang === "sw" ? "Pendekeza cha kuagiza, nani wa kumpigia, nukuu ipi ifuatiliwe, na gharama zipi kupunguza." : "Suggest what to reorder, who to follow up with, which quotation needs action, and which costs to review."],
            [lang === "sw" ? "Ongea kwa lugha mbili" : "Work bilingually", lang === "sw" ? "Kiingereza na Kiswahili kwenye kurasa zote muhimu." : "English and Swahili across the important product surfaces."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-lg border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-950">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">{body}</p>
            </div>
          ))}
        </section>
      </div>
    </AppShell>
  );
}

function buildRecommendations({
  dashboard,
  debts,
  expenses,
  stockProducts,
  lang,
}: {
  dashboard: DashboardData | null;
  debts: DebtSummary | null;
  expenses: ExpenseSummary | null;
  stockProducts: NonNullable<DashboardData["lowStockAlerts"]>;
  lang: "sw" | "en";
}): Recommendation[] {
  const items: Recommendation[] = [];
  const lowStock = [...stockProducts].sort((a, b) => {
    const score = (product: typeof a) =>
      (product.hasReliablePace ? 1000000 : 0) +
      (product.currentStock === 0 && product.hasReliablePace ? 100000 : 0) +
      (product.hasReliablePace && product.daysOfCoverage !== undefined ? Math.max(0, 1000 - product.daysOfCoverage) : 0) +
      Math.max(0, product.minimumStock - product.currentStock) * 10;
    return score(b) - score(a);
  });
  const mostUrgentStock = lowStock[0];

  if ((dashboard?.summary.totalSales || 0) > 0 && (dashboard?.summary.netProfit || 0) < 0) {
    items.push({
      id: "net-profit",
      rank: 95,
      icon: ReceiptText,
      tone: "bg-red-50 text-red-700",
      title: lang === "sw" ? "Matumizi yamezidi faida ya leo" : "Expenses are above today's profit",
      body: lang === "sw"
        ? `Faida halisi ni ${formatTZS(dashboard?.summary.netProfit || 0)} baada ya matumizi ya ${formatTZS(dashboard?.summary.totalExpenses || 0)}.`
        : `Net profit is ${formatTZS(dashboard?.summary.netProfit || 0)} after ${formatTZS(dashboard?.summary.totalExpenses || 0)} in expenses.`,
      action: lang === "sw" ? "Kagua matumizi" : "Review expenses",
      href: "/expenses?focus=profit",
      why: lang === "sw"
        ? "Duka linaweza kuuza lakini bado lisipate faida kama gharama zimepanda."
        : "A shop can sell well and still lose money when costs rise.",
      impact: lang === "sw"
        ? "Tambua gharama zinazokula faida na punguza mapema."
        : "Find costs eating profit and reduce them early.",
    });
  }

  if (mostUrgentStock) {
    const outOfStock = mostUrgentStock.currentStock === 0;
    const hasReliablePace = Boolean(mostUrgentStock.hasReliablePace && mostUrgentStock.daysOfCoverage !== undefined);
    const stockRank = hasReliablePace
      ? outOfStock ? 96 : mostUrgentStock.daysOfCoverage! <= 7 ? 91 : 82
      : outOfStock ? 50 : 35;
    const reorder = mostUrgentStock.reorderQuantity14d;
    const approximateCost = mostUrgentStock.estimatedReorderCost;
    items.push({
      id: `stock-${mostUrgentStock.id}`,
      rank: stockRank,
      icon: Package,
      tone: hasReliablePace ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700",
      title: lang === "sw"
        ? (!hasReliablePace ? `Kagua mahitaji ya ${mostUrgentStock.name} kabla ya kuagiza` : outOfStock ? `Stock ya ${mostUrgentStock.name} imeisha - agiza leo` : `Kagua kuagiza ${mostUrgentStock.name}`)
        : (!hasReliablePace ? `Verify demand for ${mostUrgentStock.name} before reordering` : outOfStock ? `${mostUrgentStock.name} is out of stock - review a reorder` : `Review a reorder for ${mostUrgentStock.name}`),
      body: lang === "sw"
        ? (!hasReliablePace
          ? `Imebaki ${mostUrgentStock.currentStock} ${mostUrgentStock.unit} dhidi ya kiwango cha chini ${mostUrgentStock.minimumStock}. Data ya siku ${mostUrgentStock.observedDays || 0} na siku ${mostUrgentStock.saleDays28d || 0} zenye mauzo haitoshi kutabiri kuisha au kiasi cha kuagiza.`
          : `Kasi ya mauzo ya siku 28 zilizopita inaonyesha stock inaweza kudumu takriban siku ${Math.max(0, Math.round(mostUrgentStock.daysOfCoverage!))}. Kiasi cha kujaza stock ya siku 14 ni takriban ${reorder} ${mostUrgentStock.unit}${approximateCost !== undefined ? `; gharama ya karibu ${formatTZS(approximateCost)}` : ""}. Makadirio haya hayazingatii muda wa supplier.`)
        : (!hasReliablePace
          ? `${mostUrgentStock.currentStock} ${mostUrgentStock.unit} remain versus a minimum of ${mostUrgentStock.minimumStock}. Only ${mostUrgentStock.observedDays || 0} observed days and ${mostUrgentStock.saleDays28d || 0} selling days are not enough to estimate run-out or reorder quantity.`
          : `Recorded sales over the last 28 days suggest about ${Math.max(0, Math.round(mostUrgentStock.daysOfCoverage!))} days of stock. A 14-day cover is roughly ${reorder} ${mostUrgentStock.unit}${approximateCost !== undefined ? `; estimated cash about ${formatTZS(approximateCost)}` : ""}. This estimate does not include supplier lead time.`),
      action: lang === "sw" ? (hasReliablePace ? "Fungua Hifadhi ya Bidhaa na agiza tena" : "Kagua bidhaa kwenye Hifadhi") : (hasReliablePace ? "Open inventory and reorder" : "Review product in inventory"),
      href: `/inventory?search=${encodeURIComponent(mostUrgentStock.name)}&action=restock`,
      why: lang === "sw"
        ? (hasReliablePace ? `Makadirio yanatumia stock ya sasa na mauzo halisi yaliyobaki baada ya marejesho ndani ya dirisha la siku 28; kuna siku ${mostUrgentStock.saleDays28d} zenye mauzo.` : "Historia ya mauzo haitoshi kutoa utabiri unaoaminika; hakuna kiasi au gharama ya kuagiza kilichokisiwa.")
        : (hasReliablePace ? `Estimate uses current stock and net recorded units after returns over a 28-day window, with sales on ${mostUrgentStock.saleDays28d} distinct days.` : "Sales history is too sparse for a reliable forecast; no reorder quantity or cash estimate is shown."),
      impact: lang === "sw"
        ? (!hasReliablePace ? "Thibitisha mahitaji na uangalie historia kabla ya kutumia pesa." : "Tumia makadirio kama kiashiria cha kupanga tu; thibitisha kiasi na muda wa supplier kabla ya kuagiza.")
        : (!hasReliablePace ? "Check demand and sales history before spending cash." : "Use this estimate only for planning; confirm quantity and supplier lead time before ordering."),
    });
  }

  if (debts?.summary.totalOwed) {
    const openDebt = debts.debts?.find((debt) => debt.status === "OPEN" || debt.status === "PARTIAL");
    const customer = openDebt?.customerName || openDebt?.customerPhone;
    const debtBalance = openDebt ? Math.max(0, openDebt.amount - openDebt.amountPaid) : debts.summary.totalOwed;
    const ageDays = openDebt?.createdAt ? Math.max(0, Math.floor((Date.now() - new Date(openDebt.createdAt).getTime()) / 86400000)) : null;
    const overdueDays = openDebt?.dueDate ? Math.max(0, Math.floor((Date.now() - new Date(openDebt.dueDate).getTime()) / 86400000)) : 0;
    const debtRank = overdueDays >= 30 || (ageDays || 0) >= 90 ? 95 : overdueDays > 0 || (ageDays || 0) >= 30 ? 91 : 84;
    const debtParams = new URLSearchParams();
    if (openDebt?.customerName) debtParams.set("customer", openDebt.customerName);
    if (openDebt?.customerPhone) debtParams.set("phone", openDebt.customerPhone);
    if (debtBalance) debtParams.set("amount", String(debtBalance));
    items.push({
      id: "debt",
      rank: debtRank,
      icon: HandCoins,
      tone: "bg-amber-50 text-amber-700",
      title: lang === "sw"
        ? `Fuatilia madeni ya ${formatTZS(debts.summary.totalOwed)}`
        : `Follow up on ${formatTZS(debts.summary.totalOwed)} in unpaid debt`,
      body: lang === "sw"
        ? `${customer ? `Anza na ${customer}. ` : ""}${debts.summary.openCount === 1 ? "Kuna deni 1 lililo wazi" : `Kuna madeni ${debts.summary.openCount} yaliyo wazi`}${ageDays !== null ? `; rekodi hii ina takriban siku ${ageDays}` : ""}${overdueDays > 0 ? ` na imechelewa siku ${overdueDays}` : ""}. Salio la rekodi hii ni ${formatTZS(debtBalance)}.`
        : `${customer ? `Start with ${customer}. ` : ""}${debts.summary.openCount} debt records remain open${ageDays !== null ? `; this record is about ${ageDays} days old` : ""}${overdueDays > 0 ? ` and ${overdueDays} days overdue` : ""}. Its balance is ${formatTZS(debtBalance)}.`,
      action: lang === "sw" ? "Fungua madeni na rekodi malipo" : "Open debts and record payment",
      href: `/debts${debtParams.toString() ? `?${debtParams.toString()}` : ""}`,
      why: lang === "sw"
        ? "Madeni yakikaa muda mrefu hupunguza cash ya kununua stock mpya."
        : "Old debts reduce the cash available to buy new stock.",
      impact: lang === "sw"
        ? "Kuongeza cash ya kununua stock au kulipa gharama za duka."
        : "Free up cash for stock purchases or shop expenses.",
    });
  }

  const expenseTrend = expenses?.trend || getExpenseTrend(expenses?.expenses || []);
  if (expenseTrend.current > 0) {
    const enoughHistory = Boolean(expenses?.trend && expenses.trend.currentCount >= 3 && expenses.trend.previousCount >= 3);
    const rose = enoughHistory && expenseTrend.previous > 0 && expenseTrend.current >= expenseTrend.previous * 1.25;
    const percent = expenseTrend.previous > 0 ? Math.round(((expenseTrend.current - expenseTrend.previous) / expenseTrend.previous) * 100) : null;
    items.push({
      id: "expenses",
      rank: rose ? 80 : 50,
      icon: ReceiptText,
      tone: rose ? "bg-orange-50 text-orange-700" : "bg-blue-50 text-blue-700",
      title: rose && percent
        ? lang === "sw" ? `Matumizi yamepanda ${percent}% wiki hii` : `Expenses rose ${percent}% this week`
        : lang === "sw" ? `Kagua matumizi ya ${formatTZS(expenseTrend.current)}` : `Review ${formatTZS(expenseTrend.current)} in expenses`,
      body: lang === "sw"
        ? `Matumizi ya siku 7 zilizopita ni ${formatTZS(expenseTrend.current)}. Linganisha na faida ili ujue gharama zinazokula margin.`
        : `Last 7 days expenses are ${formatTZS(expenseTrend.current)}. Compare them against profit to find costs eating margin.`,
      action: lang === "sw" ? "Fungua matumizi" : "Open expenses",
      href: "/expenses?focus=weekly-review",
      why: lang === "sw"
        ? "Gharama ndogo ndogo zikikua bila kufuatiliwa zinaweza kula faida ya duka."
        : "Small costs can quietly eat shop profit when they are not tracked.",
      impact: lang === "sw"
        ? "Kupunguza gharama zisizo muhimu na kulinda margin."
        : "Reduce unnecessary costs and protect margin.",
    });
  }

  if (dashboard?.summary.pendingOrders) {
    items.push({
      id: "orders",
      rank: 70,
      icon: ShoppingCart,
      tone: "bg-purple-50 text-purple-700",
      title: lang === "sw"
        ? `Shughulikia maagizo ${dashboard.summary.pendingOrders} yanayosubiri`
        : `Handle ${dashboard.summary.pendingOrders} pending orders`,
      body: lang === "sw"
        ? "Maagizo yanapochelewa, wateja hupoteza imani. Thibitisha, tuma au futa yaliyozeeka."
        : "Delayed orders reduce customer trust. Confirm, dispatch, or cancel stale orders.",
      action: lang === "sw" ? "Fungua maagizo" : "Open orders",
      href: "/orders/customers?filter=pending",
      why: lang === "sw"
        ? "Order ikichelewa hupunguza uaminifu na inaweza kupoteza mauzo ya kesho."
        : "Slow orders reduce trust and can cost tomorrow's sales.",
      impact: lang === "sw"
        ? "Kuboresha uaminifu wa wateja na kupunguza order zilizokwama."
        : "Improve customer trust and reduce stuck orders.",
    });
  }

  return items.sort((a, b) => b.rank - a.rank).slice(0, 5);
}

function buildOwnerSummary(recommendations: Recommendation[], lang: "sw" | "en") {
  if (recommendations.length === 0) {
    return lang === "sw"
      ? "Ongeza bidhaa na mauzo machache ili DukaPilot itoe hatua za leo."
      : "Add a few products and sales so DukaPilot can produce today's actions.";
  }

  return recommendations
    .slice(0, 3)
    .map((item, index) => `${index + 1}. ${item.title}`)
    .join("\n");
}

function getExpenseTrend(expenses: Array<{ amount: number; spentAt: string }>) {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  return expenses.reduce(
    (totals, expense) => {
      const age = now - new Date(expense.spentAt).getTime();
      if (age >= 0 && age <= sevenDays) totals.current += expense.amount;
      if (age > sevenDays && age <= sevenDays * 2) totals.previous += expense.amount;
      return totals;
    },
    { current: 0, previous: 0 }
  );
}
