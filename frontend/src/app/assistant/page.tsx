"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { api, formatTZS } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { Sparkles } from "lucide-react";

interface DashboardData {
  summary: { totalSales: number; totalProfit: number; lowStockCount: number; outOfStockCount: number; pendingOrders: number };
}

interface DebtSummary {
  summary: { openCount: number; totalOwed: number };
}

interface ExpenseSummary {
  summary: { total: number; count: number };
}

export default function AssistantPage() {
  const lang = useLang();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [debts, setDebts] = useState<DebtSummary | null>(null);
  const [expenses, setExpenses] = useState<ExpenseSummary | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<DashboardData>("/dashboard?period=today", lang).then(setDashboard).catch(() => null),
      api.get<DebtSummary>("/debts", lang).then(setDebts).catch(() => null),
      api.get<ExpenseSummary>("/expenses", lang).then(setExpenses).catch(() => null),
    ]).catch(console.error);
  }, []);

  const insights = [
    dashboard?.summary.lowStockCount ? (lang === "sw" ? `Bidhaa ${dashboard.summary.lowStockCount} zinahitaji kuangaliwa kabla hazijaisha.` : `${dashboard.summary.lowStockCount} products need attention before stock runs out.`) : null,
    debts?.summary.totalOwed ? (lang === "sw" ? `Wateja wanadaiwa ${formatTZS(debts.summary.totalOwed)}. Pangilia kufuatilia malipo.` : `Customers owe ${formatTZS(debts.summary.totalOwed)}. Schedule follow-up for collection.`) : null,
    expenses?.summary.total ? (lang === "sw" ? `Matumizi yaliyorekodiwa ni ${formatTZS(expenses.summary.total)}. Linganisha na faida ya leo.` : `Recorded expenses are ${formatTZS(expenses.summary.total)}. Compare this against today's profit.`) : null,
    dashboard?.summary.pendingOrders ? (lang === "sw" ? `Kuna maagizo ${dashboard.summary.pendingOrders} yanayosubiri hatua.` : `${dashboard.summary.pendingOrders} orders are waiting for action.`) : null,
  ].filter(Boolean);

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
            {insights.length === 0 ? (
              <p className="text-sm text-gray-500">{lang === "sw" ? "Ongeza mauzo, bidhaa, madeni au matumizi ili msaidizi aanze kutoa mapendekezo." : "Add sales, inventory, debts, or expenses so the assistant can start producing recommendations."}</p>
            ) : insights.map((insight) => (
              <div key={insight} className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700">{insight}</div>
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
