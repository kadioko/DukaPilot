"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { api, formatTZS } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { ArrowRight, HandCoins, Package, ReceiptText, ShoppingCart, Sparkles, TrendingUp } from "lucide-react";

interface DashboardData {
  summary: { totalSales: number; totalProfit: number; lowStockCount: number; outOfStockCount: number; pendingOrders: number; salesCount?: number };
  lowStockAlerts?: Array<{ id: string; name: string; currentStock: number; minimumStock: number; unit: string }>;
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

interface Recommendation {
  id: string;
  rank: number;
  icon: typeof Package;
  tone: string;
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

  useEffect(() => {
    Promise.all([
      api.get<DashboardData>("/dashboard?period=today", lang).then(setDashboard).catch(() => null),
      api.get<DashboardData>("/dashboard?period=all", lang).then(setAllTime).catch(() => null),
      api.get<DebtSummary>("/debts", lang).then(setDebts).catch(() => null),
      api.get<ExpenseSummary>("/expenses", lang).then(setExpenses).catch(() => null),
    ]).catch(console.error);
  }, []);

  const recommendations = buildRecommendations({ dashboard, allTime, debts, expenses, lang });

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-brand-600 p-3 text-white">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-950">{lang === "sw" ? "DukaPilot AI Assistant" : "DukaPilot AI Assistant"}</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-600">
              {lang === "sw"
                ? "Mwelekeo wa DukaPilot ni kuwa msaidizi wa AI anayesoma mauzo, bidhaa, madeni na matumizi ili kukupa hatua za kufanya."
                : "DukaPilot is positioned as an AI assistant that reads sales, inventory, debts, and expenses and turns them into practical next steps."}
            </p>
          </div>
        </div>

        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="font-semibold text-gray-950">{lang === "sw" ? "Mapendekezo ya sasa" : "Current recommendations"}</h2>
          <div className="mt-4 grid gap-3">
            {recommendations.length === 0 ? (
              <p className="text-sm text-gray-500">{lang === "sw" ? "Ongeza mauzo, bidhaa, madeni au matumizi ili msaidizi aanze kutoa mapendekezo." : "Add sales, inventory, debts, or expenses so the assistant can start producing recommendations."}</p>
            ) : recommendations.map((item, index) => (
              <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${item.tone}`}>
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-400">
                      {lang === "sw" ? `Kipaumbele ${index + 1}` : `Priority ${index + 1}`}
                    </p>
                    <h3 className="mt-1 font-semibold text-gray-950">{item.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-gray-600">{item.body}</p>
                    <p className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                      {item.action}
                      <ArrowRight className="h-4 w-4" />
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          {[
            [lang === "sw" ? "Tambua hatari" : "Spot risk", lang === "sw" ? "Bidhaa kuisha, madeni kuchelewa, na matumizi kupanda." : "Low stock, slow collections, and rising expenses."],
            [lang === "sw" ? "Panga hatua" : "Plan action", lang === "sw" ? "Pendekeza cha kuagiza, nani wa kumpigia, na gharama zipi kupunguza." : "Suggest what to reorder, who to follow up with, and which costs to review."],
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
  lang,
}: {
  dashboard: DashboardData | null;
  allTime: DashboardData | null;
  debts: DebtSummary | null;
  expenses: ExpenseSummary | null;
  lang: "sw" | "en";
}): Recommendation[] {
  const items: Recommendation[] = [];
  const lowStock = dashboard?.lowStockAlerts || [];
  const mostUrgentStock = lowStock[0];

  if (mostUrgentStock) {
    items.push({
      id: "stock",
      rank: 100,
      icon: Package,
      tone: "bg-red-50 text-red-700",
      title: lang === "sw"
        ? `Agiza ${mostUrgentStock.name} kabla haijaisha`
        : `Restock ${mostUrgentStock.name} before it runs out`,
      body: lang === "sw"
        ? `Imebaki ${mostUrgentStock.currentStock} ${mostUrgentStock.unit}; kiwango cha chini ni ${mostUrgentStock.minimumStock}. Bidhaa nyingine ${Math.max(0, lowStock.length - 1)} pia zinahitaji kuangaliwa.`
        : `${mostUrgentStock.currentStock} ${mostUrgentStock.unit} left; minimum is ${mostUrgStockMinimum(mostUrgentStock)}. ${Math.max(0, lowStock.length - 1)} other products also need attention.`,
      action: lang === "sw" ? "Fungua inventory na agiza tena" : "Open inventory and reorder",
    });
  }

  if (debts?.summary.totalOwed) {
    const openDebt = debts.debts?.find((debt) => debt.status === "OPEN" || debt.status === "PARTIAL");
    const customer = openDebt?.customerName || openDebt?.customerPhone;
    items.push({
      id: "debt",
      rank: 90,
      icon: HandCoins,
      tone: "bg-amber-50 text-amber-700",
      title: lang === "sw"
        ? `Fuatilia madeni ya ${formatTZS(debts.summary.totalOwed)}`
        : `Follow up on ${formatTZS(debts.summary.totalOwed)} in unpaid debt`,
      body: lang === "sw"
        ? customer ? `Anza na ${customer}. Kuna madeni ${debts.summary.openCount} ambayo bado hayajafungwa.` : `Kuna madeni ${debts.summary.openCount} ambayo bado hayajafungwa.`
        : customer ? `Start with ${customer}. ${debts.summary.openCount} debt records are still open.` : `${debts.summary.openCount} debt records are still open.`,
      action: lang === "sw" ? "Fungua madeni na rekodi malipo" : "Open debts and record payment",
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
    });
  }

  return items.sort((a, b) => b.rank - a.rank).slice(0, 5);
}

function mostUrgStockMinimum(product: { minimumStock: number }) {
  return product.minimumStock;
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
