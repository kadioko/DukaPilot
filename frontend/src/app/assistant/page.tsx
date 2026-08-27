"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { TextReveal } from "@/components/ui/cascade-text";
import { api, formatTZS } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { ArrowRight, CheckCircle2, ClipboardCopy, FileText, HandCoins, Package, ReceiptText, ShoppingCart, Sparkles, TrendingDown, TrendingUp } from "lucide-react";

interface DashboardData {
  summary: { totalSales: number; totalProfit: number; totalExpenses?: number; netProfit?: number; lowStockCount: number; outOfStockCount: number; pendingOrders: number; salesCount?: number };
  lowStockAlerts?: Array<{ id: string; name: string; currentStock: number; minimumStock: number; unit: string; buyingPrice?: number; sellingPrice?: number }>;
  topProducts?: Array<{ product?: { name: string; unit?: string }; totalQuantity?: number; totalRevenue?: number }>;
}

interface DebtSummary {
  summary: { openCount: number; totalOwed: number };
  debts?: Array<{ customerName?: string | null; customerPhone: string; amount: number; amountPaid: number; status: string; dueDate?: string | null }>;
}

interface ExpenseSummary {
  summary: { total: number; count: number };
  expenses?: Array<{ title: string; amount: number; category: string; spentAt: string }>;
}

interface QuotationSummary {
  id: string;
  quotationNumber: string;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "CONVERTED" | "ARCHIVED" | "CANCELLED";
  projectTitle: string;
  totalAmount: number;
  amountPaid: number;
  depositRequiredAmount: number;
  depositDueDate?: string | null;
  expiryDate?: string | null;
  customer: { name: string };
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

export default function AssistantPage() {
  const lang = useLang();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [allTime, setAllTime] = useState<DashboardData | null>(null);
  const [debts, setDebts] = useState<DebtSummary | null>(null);
  const [expenses, setExpenses] = useState<ExpenseSummary | null>(null);
  const quotations: QuotationSummary[] = [];
  const [quotationActions, setQuotationActions] = useState<QuotationAssistantAction[]>([]);
  const [actions, setActions] = useState<AssistantAction[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<DashboardData>("/dashboard?period=today", lang).then(setDashboard).catch(() => null),
      api.get<DashboardData>("/dashboard?period=all", lang).then(setAllTime).catch(() => null),
      api.get<DebtSummary>("/debts", lang).then(setDebts).catch(() => null),
      api.get<ExpenseSummary>("/expenses", lang).then(setExpenses).catch(() => null),
      api.get<{ actions: QuotationAssistantAction[] }>("/assistant/quotations", lang).then((data) => setQuotationActions(data.actions)).catch(() => null),
      api.get<{ actions: AssistantAction[] }>("/assistant/actions", lang).then((data) => setActions(data.actions)).catch(() => null),
    ]).catch(console.error);
  }, [lang]);

  const recommendations = [
    ...quotationActions.map((item) => ({ ...item, icon: FileText, tone: item.rank >= 90 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700", why: lang === "sw" ? "Hii imetolewa na server kwa ruhusa za akaunti yako na data ya nukuu za duka lako." : "This is generated on the server from quotation data your account is allowed to view.", impact: lang === "sw" ? "Kamilisha hatua bila kuchanganya nukuu na mapato yaliyothibitishwa." : "Complete the next step without confusing quotation value with confirmed revenue." })),
    ...buildRecommendations({ dashboard, allTime, debts, expenses, quotations, lang }).filter((item) => !item.id.startsWith("quotation-")),
  ].sort((a, b) => b.rank - a.rank).slice(0, 5);
  const ownerSummary = buildOwnerSummary(recommendations, lang);
  const urgentCount = recommendations.filter((item) => item.rank >= 80).length;
  const actionCount = recommendations.length;

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
    const data = await api.post<{ action: AssistantAction }>("/assistant/actions", {
      actionKey: item.id,
      title: item.title,
      href: item.href,
      status,
    }, lang);
    setActions((prev) => {
      const next = prev.filter((action) => action.actionKey !== item.id);
      return [data.action, ...next];
    });
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
              <Link href="/assistant/history" className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl border border-brand-200 bg-white px-3 py-3 text-xs font-bold text-brand-700 hover:bg-brand-50 sm:col-span-3">
                {lang === "sw" ? "Historia ya hatua za AI" : "AI action history"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>

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
              <p className="text-sm text-gray-500">{lang === "sw" ? "Ongeza mauzo, bidhaa, madeni, matumizi au nukuu za bei ili msaidizi aanze kutoa mapendekezo." : "Add sales, inventory, debts, expenses, or quotations so the assistant can start producing recommendations."}</p>
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
                        onClick={() => {
                          trackRecommendation(item, "OPENED").catch(console.error);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                      >
                        {item.action}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => trackRecommendation(item, "COMPLETED").catch(console.error)}
                        className="rounded-lg bg-green-100 px-3 py-2 text-sm font-semibold text-green-700 hover:bg-green-200"
                      >
                        {lang === "sw" ? "Nimefanya" : "Mark done"}
                      </button>
                      <button
                        type="button"
                        onClick={() => trackRecommendation(item, "DISMISSED").catch(console.error)}
                        className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200"
                      >
                        {lang === "sw" ? "Acha" : "Dismiss"}
                      </button>
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
  allTime,
  debts,
  expenses,
  quotations,
  lang,
}: {
  dashboard: DashboardData | null;
  allTime: DashboardData | null;
  debts: DebtSummary | null;
  expenses: ExpenseSummary | null;
  quotations: QuotationSummary[];
  lang: "sw" | "en";
}): Recommendation[] {
  const items: Recommendation[] = [];
  const salesByProduct = new Map((allTime?.topProducts || []).map((item) => [item.product?.name || "", {
    quantity: item.totalQuantity || 0,
    revenue: item.totalRevenue || 0,
  }]));
  const recentSalesByProduct = new Map((dashboard?.topProducts || []).map((item) => [item.product?.name || "", item.totalQuantity || 0]));
  const lowStock = [...(dashboard?.lowStockAlerts || [])].sort((a, b) => {
    const aSales = salesByProduct.get(a.name) || { quantity: 0, revenue: 0 };
    const bSales = salesByProduct.get(b.name) || { quantity: 0, revenue: 0 };
    const score = (product: typeof a, sales: { quantity: number; revenue: number }) => {
      const recentQuantity = recentSalesByProduct.get(product.name) || 0;
      const hasSalesHistory = sales.quantity > 0 || recentQuantity > 0;
      return (hasSalesHistory ? 1000000 : 0) +
        (hasSalesHistory && product.currentStock === 0 ? 100000 : 0) +
        sales.revenue +
        (sales.quantity * 1000) +
        (recentQuantity * 5000) +
        Math.max(0, (product.sellingPrice || 0) - (product.buyingPrice || 0)) * 10;
    };
    return score(b, bSales) - score(a, aSales);
  });
  const mostUrgentStock = lowStock[0];
  const todaySalesCount = dashboard?.summary.salesCount || 0;
  const hasBusinessHistory = Boolean((allTime?.summary.salesCount || 0) > 0 || (allTime?.summary.totalSales || 0) > 0);

  const acceptedQuotation = quotations
    .filter((quotation) => quotation.status === "ACCEPTED")
    .sort((a, b) => (b.totalAmount - b.amountPaid) - (a.totalAmount - a.amountPaid))[0];
  if (acceptedQuotation) {
    const outstanding = Math.max(0, acceptedQuotation.totalAmount - acceptedQuotation.amountPaid);
    items.push({
      id: `quotation-convert-${acceptedQuotation.id}`,
      rank: 93,
      icon: FileText,
      tone: "bg-emerald-50 text-emerald-700",
      title: lang === "sw"
        ? `Badilisha ${acceptedQuotation.quotationNumber} kuwa mauzo`
        : `Convert ${acceptedQuotation.quotationNumber} to a sale`,
      body: lang === "sw"
        ? `${acceptedQuotation.customer.name} amekubali ${acceptedQuotation.projectTitle}. Nukuu ina salio la ${formatTZS(outstanding)}.`
        : `${acceptedQuotation.customer.name} accepted ${acceptedQuotation.projectTitle}. The quotation has ${formatTZS(outstanding)} outstanding.`,
      action: lang === "sw" ? "Fungua nukuu zilizokubaliwa" : "Open accepted quotations",
      href: "/quotations?status=ACCEPTED",
      why: lang === "sw"
        ? "Nukuu iliyokubaliwa bado si mauzo wala mapato mpaka ibadilishwe kwa uthibitisho wa biashara."
        : "An accepted quotation is still not a sale or revenue until the business confirms conversion.",
      impact: lang === "sw"
        ? "Rekodi mauzo mara moja, weka salio kama deni ikihitajika, na punguza stock ya mistari iliyolinkiwa tu."
        : "Record the sale once, keep any balance as a receivable, and deduct stock only for linked inventory lines.",
    });
  }

  const depositFollowUp = quotations
    .filter((quotation) => ["SENT", "ACCEPTED"].includes(quotation.status) && quotation.depositRequiredAmount > quotation.amountPaid)
    .sort((a, b) => quotationDate(a.depositDueDate || a.expiryDate) - quotationDate(b.depositDueDate || b.expiryDate))[0];
  if (depositFollowUp) {
    const remainingDeposit = Math.max(0, depositFollowUp.depositRequiredAmount - depositFollowUp.amountPaid);
    const dueDate = depositFollowUp.depositDueDate ? new Date(depositFollowUp.depositDueDate) : null;
    const overdue = dueDate ? daysUntil(depositFollowUp.depositDueDate!) < 0 : false;
    items.push({
      id: `quotation-deposit-${depositFollowUp.id}`,
      rank: overdue ? 91 : 79,
      icon: HandCoins,
      tone: overdue ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700",
      title: lang === "sw"
        ? `${overdue ? "Fuatilia amana ya" : "Kumbuka amana ya"} ${depositFollowUp.quotationNumber}`
        : `${overdue ? "Follow up the deposit for" : "Track the deposit for"} ${depositFollowUp.quotationNumber}`,
      body: lang === "sw"
        ? `${depositFollowUp.customer.name} anahitaji kulipa ${formatTZS(remainingDeposit)} kabla ya kazi kuendelea.`
        : `${depositFollowUp.customer.name} still needs to pay ${formatTZS(remainingDeposit)} before work proceeds.`,
      action: lang === "sw" ? "Fungua nukuu na rekodi malipo" : "Open quotation and record payment",
      href: `/quotations?status=${depositFollowUp.status}`,
      why: lang === "sw"
        ? "Amana hulinda cash ya kuanza kazi; malipo yasiwekwe kama mauzo mara mbili."
        : "A deposit protects the cash needed to start work; it must not be counted as revenue twice.",
      impact: lang === "sw"
        ? "Kuweka malipo kwenye nukuu, kisha salio libaki wazi mpaka mauzo yathibitishwe."
        : "Keep the payment on the quotation and leave the balance clear until the sale is confirmed.",
    });
  }

  const expiringQuotation = quotations
    .filter((quotation) => quotation.status === "SENT" && quotation.expiryDate && daysUntil(quotation.expiryDate) >= 0 && daysUntil(quotation.expiryDate) <= 3)
    .sort((a, b) => quotationDate(a.expiryDate) - quotationDate(b.expiryDate))[0];
  if (expiringQuotation) {
    const days = daysUntil(expiringQuotation.expiryDate!);
    items.push({
      id: `quotation-expiring-${expiringQuotation.id}`,
      rank: 84,
      icon: FileText,
      tone: "bg-amber-50 text-amber-700",
      title: lang === "sw"
        ? `${expiringQuotation.quotationNumber} inaisha ${days === 0 ? "leo" : "hivi karibuni"}`
        : `${expiringQuotation.quotationNumber} ${days === 0 ? "expires today" : "is expiring soon"}`,
      body: lang === "sw"
        ? `Fuatilia ${expiringQuotation.customer.name} kuhusu ${expiringQuotation.projectTitle} kabla bei haijaisha muda.`
        : `Follow up with ${expiringQuotation.customer.name} about ${expiringQuotation.projectTitle} before the price expires.`,
      action: lang === "sw" ? "Fungua nukuu zilizotumwa" : "Open sent quotations",
      href: "/quotations?status=SENT",
      why: lang === "sw"
        ? "Nukuu iliyotumwa ikikaa bila mawasiliano inaweza kupoteza mradi bila sababu."
        : "A sent quotation without follow-up can lose a project for no good reason.",
      impact: lang === "sw"
        ? "Pata jibu, rekebisha toleo kama scope imebadilika, au ruhusu nukuu iishe kwa kumbukumbu sahihi."
        : "Get an answer, issue a revision if scope changed, or let the quotation expire with a clean record.",
    });
  }

  const expiredQuotation = quotations.find((quotation) => quotation.status === "EXPIRED");
  if (expiredQuotation) {
    items.push({
      id: `quotation-expired-${expiredQuotation.id}`,
      rank: 64,
      icon: FileText,
      tone: "bg-gray-100 text-gray-700",
      title: lang === "sw" ? `Amua hatua kwa ${expiredQuotation.quotationNumber}` : `Decide what to do with ${expiredQuotation.quotationNumber}`,
      body: lang === "sw"
        ? `${expiredQuotation.customer.name} hajakubali ${expiredQuotation.projectTitle} kabla ya tarehe ya mwisho.`
        : `${expiredQuotation.customer.name} did not accept ${expiredQuotation.projectTitle} before its expiry date.`,
      action: lang === "sw" ? "Fungua nukuu zilizoisha" : "Open expired quotations",
      href: "/quotations?status=EXPIRED",
      why: lang === "sw" ? "Nukuu zilizoisha zinahitaji follow-up, toleo jipya, au kufungwa kwa kumbukumbu sahihi." : "Expired quotations need follow-up, a fresh revision, or a clean close-out.",
      impact: lang === "sw" ? "Orodha ya mauzo ya baadaye ibaki sahihi, si mkusanyiko wa kazi zilizokwama." : "Keep the future-sales pipeline meaningful instead of filling it with stale work.",
    });
  }

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

  if (hasBusinessHistory && todaySalesCount === 0) {
    items.push({
      id: "quiet-sales",
      rank: 85,
      icon: TrendingDown,
      tone: "bg-red-50 text-red-700",
      title: lang === "sw" ? "Hakuna mauzo yaliyorekodiwa leo" : "No sale recorded today yet",
      body: lang === "sw"
        ? "Angalia kama mauzo hayajaingizwa au tumia bidhaa inayouza sana kuvutia wateja."
        : "Check whether sales were missed or use a proven product to pull customers in.",
      action: lang === "sw" ? "Rekodi sale ya kwanza" : "Record first sale",
      href: "/sales?intent=first-sale",
      why: lang === "sw"
        ? "Duka likikaa bila sale, ni vigumu kujua kama tatizo ni wateja, stock, au kurekodi."
        : "A quiet sales day makes it hard to know whether the issue is demand, stock, or missing records.",
      impact: lang === "sw"
        ? "Kuanza siku kwa data sahihi ili mapendekezo yawe makali zaidi."
        : "Start the day with clean data so recommendations become sharper.",
    });
  }

  if (mostUrgentStock) {
    const outOfStock = mostUrgentStock.currentStock === 0;
    const productSales = salesByProduct.get(mostUrgentStock.name) || { quantity: 0, revenue: 0 };
    const recentQuantity = recentSalesByProduct.get(mostUrgentStock.name) || 0;
    const hasSalesHistory = productSales.quantity > 0 || recentQuantity > 0;
    const marginPerUnit = Math.max(0, (mostUrgentStock.sellingPrice || 0) - (mostUrgentStock.buyingPrice || 0));
    const stockRank = hasSalesHistory
      ? Math.min(100, 78 + (outOfStock ? 12 : 0) + (productSales.revenue > 0 ? 5 : 0) + (marginPerUnit > 0 ? 3 : 0))
      : 35;
    items.push({
      id: "stock",
      rank: stockRank,
      icon: Package,
      tone: hasSalesHistory ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700",
      title: lang === "sw"
        ? (!hasSalesHistory ? `Kagua mahitaji ya ${mostUrgentStock.name} kabla ya kuagiza` : outOfStock ? `Stock ya ${mostUrgentStock.name} imeisha - agiza leo` : `Agiza ${mostUrgentStock.name} kabla stock haijaisha`)
        : (!hasSalesHistory ? `Verify demand for ${mostUrgentStock.name} before reordering` : outOfStock ? `${mostUrgentStock.name} is out of stock - reorder today` : `Restock ${mostUrgentStock.name} before it runs out`),
      body: lang === "sw"
        ? (!hasSalesHistory
          ? `Imebaki ${mostUrgentStock.currentStock} ${mostUrgentStock.unit}, lakini hakuna mauzo yaliyorekodiwa kwa bidhaa hii. Thibitisha mahitaji kabla ya kufunga pesa kwenye stock.`
          : `Imebaki ${mostUrgentStock.currentStock} ${mostUrgentStock.unit}; kiwango cha chini ni ${mostUrgentStock.minimumStock}. Imeuza ${productSales.quantity} na kuleta ${formatTZS(productSales.revenue)}. Bidhaa nyingine ${Math.max(0, lowStock.length - 1)} pia zinahitaji kuangaliwa.`)
        : (!hasSalesHistory
          ? `${mostUrgentStock.currentStock} ${mostUrgentStock.unit} remain, but this product has no recorded sales. Verify demand before tying up cash in more stock.`
          : `${mostUrgentStock.currentStock} ${mostUrgentStock.unit} left; minimum is ${mostUrgStockMinimum(mostUrgentStock)}. It sold ${productSales.quantity} units for ${formatTZS(productSales.revenue)}. ${Math.max(0, lowStock.length - 1)} other products also need attention.`),
      action: lang === "sw" ? (hasSalesHistory ? "Fungua Hifadhi ya Bidhaa na agiza tena" : "Kagua bidhaa kwenye Hifadhi") : (hasSalesHistory ? "Open inventory and reorder" : "Review product in inventory"),
      href: `/inventory?search=${encodeURIComponent(mostUrgentStock.name)}&action=restock`,
      why: lang === "sw"
        ? (hasSalesHistory ? `Kipaumbele kinatumia stock, kasi ya mauzo, mapato na faida ya ${formatTZS(marginPerUnit)} kwa unit.` : "Bidhaa zisizo na historia ya mauzo huwekwa chini ya bidhaa ambazo tayari zina mahitaji yaliyothibitishwa.")
        : (hasSalesHistory ? `Priority combines stock, sales velocity, revenue, and ${formatTZS(marginPerUnit)} margin per unit.` : "Products with no sales history rank below products with proven demand."),
      impact: lang === "sw"
        ? (!hasSalesHistory ? "Epuka kununua stock ambayo haijathibitisha kuwa inahitajika." : outOfStock ? "Rudisha bidhaa inayouzwa ili mauzo yaanze tena." : "Kulinda mauzo ya bidhaa inayohitajika kabla wiki haijaisha.")
        : (!hasSalesHistory ? "Avoid buying stock before demand is proven." : outOfStock ? "Restore a sellable item so sales can resume." : "Protect sales from a needed item before the week ends."),
    });
  }

  if (debts?.summary.totalOwed) {
    const openDebt = debts.debts?.find((debt) => debt.status === "OPEN" || debt.status === "PARTIAL");
    const customer = openDebt?.customerName || openDebt?.customerPhone;
    const debtBalance = openDebt ? Math.max(0, openDebt.amount - openDebt.amountPaid) : debts.summary.totalOwed;
    const debtParams = new URLSearchParams();
    if (openDebt?.customerName) debtParams.set("customer", openDebt.customerName);
    if (openDebt?.customerPhone) debtParams.set("phone", openDebt.customerPhone);
    if (debtBalance) debtParams.set("amount", String(debtBalance));
    items.push({
      id: "debt",
      rank: 90,
      icon: HandCoins,
      tone: "bg-amber-50 text-amber-700",
      title: lang === "sw"
        ? `Fuatilia madeni ya ${formatTZS(debts.summary.totalOwed)}`
        : `Follow up on ${formatTZS(debts.summary.totalOwed)} in unpaid debt`,
      body: lang === "sw"
        ? customer ? `Anza na ${customer}. ${debts.summary.openCount === 1 ? "Kuna deni 1 ambalo bado halijafungwa." : `Kuna madeni ${debts.summary.openCount} ambayo bado hayajafungwa.`}` : `${debts.summary.openCount === 1 ? "Kuna deni 1 ambalo bado halijafungwa." : `Kuna madeni ${debts.summary.openCount} ambayo bado hayajafungwa.`}`
        : customer ? `Start with ${customer}. ${debts.summary.openCount} debt records are still open.` : `${debts.summary.openCount} debt records are still open.`,
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

  const expenseTrend = getExpenseTrend(expenses?.expenses || []);
  if (expenseTrend.current > 0) {
    const rose = expenseTrend.previous > 0 && expenseTrend.current > expenseTrend.previous;
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

  const topProduct = allTime?.topProducts?.[0];
  if (topProduct?.product?.name && topProduct.totalRevenue) {
    items.push({
      id: "top-product",
      rank: 60,
      icon: TrendingUp,
      tone: "bg-green-50 text-green-700",
      title: lang === "sw"
        ? `Promote ${topProduct.product.name}`
        : `Promote ${topProduct.product.name}`,
      body: lang === "sw"
        ? `Bidhaa hii imeleta ${formatTZS(topProduct.totalRevenue)} kwenye mauzo. Iweke mbele kwenye duka na catalog.`
        : `This product has generated ${formatTZS(topProduct.totalRevenue)} in sales. Feature it in the shop and catalog.`,
      action: lang === "sw" ? "Tumia kama bidhaa ya kuvutia wateja" : "Use it as a customer magnet",
      href: `/inventory?search=${encodeURIComponent(topProduct.product.name)}&action=promote`,
      why: lang === "sw"
        ? "Bidhaa inayouza vizuri inaweza kuvuta wateja wanunue bidhaa nyingine pia."
        : "A strong seller can bring customers in and lift other basket items too.",
      impact: lang === "sw"
        ? "Kuongeza basket size kwa kuweka bidhaa inayopendwa mbele."
        : "Increase basket size by putting a proven seller in front.",
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

function mostUrgStockMinimum(product: { minimumStock: number }) {
  return product.minimumStock;
}

function quotationDate(value?: string | null) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function daysUntil(value: string) {
  const target = new Date(value);
  const today = new Date();
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
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
