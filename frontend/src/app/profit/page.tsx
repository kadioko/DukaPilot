"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { api, formatTZS } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { BarChart, Bar, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarDays, Download, TrendingUp } from "lucide-react";

type Period = "today" | "week" | "month" | "quarter" | "year" | "custom";
type Analytics = {
  group: "hour" | "day" | "month";
  from: string;
  to: string;
  compareFrom: string | null;
  compareTo: string | null;
  summary: { salesRevenue: number; cashCollected: number; creditSales: number; costOfGoodsSold: number; grossProfit: number; grossProfitMargin: number; expenses: number; netProfit: number; salesCount: number; unitsSold: number; missingCostSalesRevenue: number; costComplete: boolean };
  production: { batchCount: number; grossOutput: number; brokenEggs: number; usableOutput: number; productionVariance: number; ingredientCost: number; directCost: number; totalCost: number; inputs: Array<{ productId: string; name: string; unit: string; quantity: number; cost: number }> };
  comparison: Record<string, { current: number; previous: number; change: number; changePercent: number | null }> | null;
  debtAging: { overdue: number; dueSoon: number; noDueDate: number; outstanding: number };
  collectionBreakdown: Array<{ paymentMethod: string; amount: number }>;
  products: Array<{ id: string; name: string; unit: string; currentStock: number; quantity: number; revenue: number; grossProfit: number; missingCostSalesRevenue: number; lastSoldAt: string | null }>;
  slowMovingProducts: Array<{ id: string; name: string; unit: string; currentStock: number }>;
  chart: Array<{ label: string; revenue: number; costOfGoodsSold: number; grossProfit: number; expenses: number; netProfit: number }>;
};

const dateValue = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return tanzaniaDate(date);
};

function tanzaniaDate(value: Date | string, inclusiveEnd = false) {
  const date = new Date(value);
  if (inclusiveEnd) date.setTime(date.getTime() - 1);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function csvCell(value: string | number) { return `"${String(value).replaceAll('"', '""')}"`; }

function paymentLabel(method: string, sw: boolean) {
  const labels: Record<string, [string, string]> = {
    CASH: ["Cash", "Taslimu"], MPESA: ["M-Pesa", "M-Pesa"], TIGOPESA: ["Tigo Pesa", "Tigo Pesa"],
    AIRTEL_MONEY: ["Airtel Money", "Airtel Money"], HALOPESA: ["HaloPesa", "HaloPesa"], BANK: ["Bank", "Benki"],
  };
  return labels[method]?.[sw ? 1 : 0] || method;
}

export default function ProfitPage() {
  const lang = useLang();
  const [period, setPeriod] = useState<Period>("today");
  const [from, setFrom] = useState(() => dateValue(-29));
  const [to, setTo] = useState(() => dateValue());
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const labels = useMemo(() => ({
    title: lang === "sw" ? "Uchambuzi wa Faida" : "Profit Analytics",
    subtitle: lang === "sw" ? "Faida hutumia bei ya kuuza na gharama iliyohifadhiwa wakati wa mauzo." : "Profit uses the selling price and cost saved when each sale was recorded.",
    today: lang === "sw" ? "Leo" : "Today", week: lang === "sw" ? "Wiki hii" : "This week", month: lang === "sw" ? "Mwezi huu" : "This month", quarter: lang === "sw" ? "Robo hii" : "This quarter", year: lang === "sw" ? "Mwaka huu" : "This year", custom: lang === "sw" ? "Chagua tarehe" : "Custom range",
  }), [lang]);

  useEffect(() => {
    const params = new URLSearchParams({ period });
    if (period === "custom") { params.set("from", from); params.set("to", to); }
    setLoading(true);
    setError("");
    api.get<Analytics>(`/dashboard/profit?${params}`, lang)
      .then(setData)
      .catch((value: unknown) => setError(value instanceof Error ? value.message : (lang === "sw" ? "Imeshindikana kupakia uchambuzi." : "Could not load analytics.")))
      .finally(() => setLoading(false));
  }, [period, from, to, lang]);

  const cards: Array<[string, string, string, string?]> = data ? [
    [lang === "sw" ? "Mauzo" : "Sales revenue", formatTZS(data.summary.salesRevenue), "text-sky-700 bg-sky-50 border-sky-100", "salesRevenue"],
    [lang === "sw" ? "Pesa zilizokusanywa" : "Cash collected", formatTZS(data.summary.cashCollected), "text-teal-700 bg-teal-50 border-teal-100", "cashCollected"],
    [lang === "sw" ? "Mauzo ya mkopo" : "Credit sales", formatTZS(data.summary.creditSales), "text-orange-700 bg-orange-50 border-orange-100", "creditSales"],
    [lang === "sw" ? "Gharama ya Bidhaa" : "Cost of goods sold", formatTZS(data.summary.costOfGoodsSold), "text-amber-700 bg-amber-50 border-amber-100", "costOfGoodsSold"],
    [lang === "sw" ? "Faida ghafi (gharama zilizojulikana)" : "Gross profit (known costs)", formatTZS(data.summary.grossProfit), "text-emerald-700 bg-emerald-50 border-emerald-100", "grossProfit"],
    [lang === "sw" ? "Asilimia ya Faida" : "Gross profit margin", `${data.summary.grossProfitMargin}%`, "text-violet-700 bg-violet-50 border-violet-100", "grossProfitMargin"],
    [lang === "sw" ? "Matumizi" : "Operating expenses", formatTZS(data.summary.expenses), "text-rose-700 bg-rose-50 border-rose-100", "expenses"],
    [lang === "sw" ? "Faida halisi (gharama zilizojulikana)" : "Net profit (known costs)", formatTZS(data.summary.netProfit), "text-green-700 bg-green-50 border-green-100", "netProfit"],
    [lang === "sw" ? "Miamala" : "Completed sales", String(data.summary.salesCount), "text-gray-700 bg-gray-50 border-gray-200", "salesCount"],
    [lang === "sw" ? "Vipande vilivyouzwa" : "Units sold", String(data.summary.unitsSold), "text-gray-700 bg-gray-50 border-gray-200"],
  ] : [];

  return <AppShell><div className="mx-auto max-w-6xl pb-20 lg:pb-6">
    <section className="mb-6 border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><div className="flex items-center gap-2 text-brand-700"><TrendingUp className="h-5 w-5" /><span className="text-sm font-bold">DukaPilot</span></div><h1 className="mt-2 text-2xl font-bold text-gray-950">{labels.title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">{labels.subtitle}</p></div>
        <div className="flex items-center gap-2 text-sm font-medium text-gray-500"><CalendarDays className="h-4 w-4" />Africa/Dar_es_Salaam</div>
      </div>
      <div className="mt-5 flex max-w-full gap-1 overflow-x-auto bg-gray-100 p-1">
        {(["today", "week", "month", "quarter", "year", "custom"] as Period[]).map((key) => <button key={key} onClick={() => setPeriod(key)} className={`whitespace-nowrap px-3 py-2 text-sm font-semibold ${period === key ? "bg-white text-brand-800 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>{labels[key]}</button>)}
      </div>
      {period === "custom" && <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-gray-700">{lang === "sw" ? "Kuanzia" : "From"}<input aria-label={lang === "sw" ? "Kuanzia" : "From"} type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} className="mt-1 block w-full border border-gray-300 px-3 py-2" /></label><label className="text-sm font-medium text-gray-700">{lang === "sw" ? "Mpaka" : "To"}<input aria-label={lang === "sw" ? "Mpaka" : "To"} type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className="mt-1 block w-full border border-gray-300 px-3 py-2" /></label></div>}
    </section>
    {loading && !data ? <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin border-2 border-brand-200 border-t-brand-700" /></div> : error ? <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500"><span>{lang === "sw" ? "Kipindi" : "Period"}: {data ? tanzaniaDate(data.from) : "-"} – {data ? tanzaniaDate(data.to, true) : "-"} ({lang === "sw" ? "Saa za Tanzania" : "Tanzania time"})</span><button onClick={() => {
        if (!data) return;
        const rows = [
          ["DukaPilot owner report"],
          ["Reporting period (Africa/Dar_es_Salaam)", `${tanzaniaDate(data.from)} to ${tanzaniaDate(data.to, true)}`],
          ["Comparison period", data.compareFrom && data.compareTo ? `${tanzaniaDate(data.compareFrom)} to ${tanzaniaDate(data.compareTo, true)}` : "Not available"],
          ["Profit note", "Known-cost sale items only; zero-cost or no-item sales are flagged as uncosted. Net profit subtracts non-stock expenses."],
          ["Collections note", "Non-credit sales, quotation payments/refunds by original paid date, and ordinary debt payments; quotation debt copies are excluded to prevent double counting."],
          [],
          ["Metric", "Value"],
          ["Sales revenue (TZS)", data.summary.salesRevenue], ["Cash collected: sales + debt payments (TZS)", data.summary.cashCollected],
          ["Credit sales (TZS)", data.summary.creditSales], ["COGS, known cost lines (TZS)", data.summary.costOfGoodsSold],
          ["Gross profit, known cost lines (TZS)", data.summary.grossProfit], ["Uncosted sales revenue (TZS)", data.summary.missingCostSalesRevenue],
          ["Operating expenses, excluding stock purchases (TZS)", data.summary.expenses], ["Net profit, known cost lines (TZS)", data.summary.netProfit],
          ["Production costs incurred (already included in output stock cost; not subtracted twice)", data.production?.totalCost || 0],
          ["Production input cost (TZS)", data.production?.ingredientCost || 0], ["Production direct cost (TZS)", data.production?.directCost || 0],
          ...(data.production?.inputs || []).map((input) => [`Production input: ${input.name} (${input.unit})`, `${input.quantity} units; TZS ${input.cost}`]),
          ["Outstanding receivables (TZS)", data.debtAging.outstanding], ["Overdue receivables (TZS)", data.debtAging.overdue],
          ...data.collectionBreakdown.map((entry) => [`Collected via ${entry.paymentMethod} (TZS)`, entry.amount]),
          [], ["Product", "Units sold", "Revenue TZS", "Known-cost gross profit TZS", "Uncosted revenue TZS", "Current stock"],
          ...data.products.map((product) => [product.name, product.quantity, product.revenue, product.grossProfit, product.missingCostSalesRevenue, product.currentStock]),
          [], ["Time bucket", "Revenue TZS", "COGS TZS", "Known-cost gross profit TZS", "Operating expenses TZS", "Known-cost net profit TZS"],
          ...data.chart.map((bucket) => [bucket.label, bucket.revenue, bucket.costOfGoodsSold, bucket.grossProfit, bucket.expenses, bucket.netProfit]),
        ];
        const csv = rows.map((row) => row.map((value) => csvCell(value ?? "")).join(",")).join("\r\n");
        const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
        const anchor = document.createElement("a"); anchor.href = url; anchor.download = `dukapilot-owner-report-${tanzaniaDate(data.from)}-to-${tanzaniaDate(data.to, true)}.csv`; anchor.click(); URL.revokeObjectURL(url);
      }} className="inline-flex min-h-10 items-center gap-2 border border-gray-300 bg-white px-3 font-semibold text-gray-700"><Download className="h-4 w-4" />{lang === "sw" ? "Pakua CSV" : "Export CSV"}</button></div>
      {data?.summary.missingCostSalesRevenue ? <p role="status" className="mb-3 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{lang === "sw" ? `Gharama haipo kwa mauzo yenye thamani ya ${formatTZS(data.summary.missingCostSalesRevenue)}. Faida inayoonyeshwa inahusu bidhaa zenye gharama iliyorekodiwa pekee.` : `${formatTZS(data.summary.missingCostSalesRevenue)} in sales has no recorded cost. Profit shown covers costed items only and is incomplete.`}</p> : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{cards.map(([label, value, tone, key]) => { const comparison = key ? data?.comparison?.[key] : null; return <div key={label} className={`border p-4 ${tone}`}><p className="break-words text-lg font-bold">{value}</p><p className="mt-1 text-xs font-medium">{label}</p>{comparison && <p className={`mt-1 text-[11px] ${comparison.change >= 0 ? "text-emerald-700" : "text-red-700"}`}>{comparison.changePercent === null ? "-" : `${comparison.changePercent}%`} {lang === "sw" ? "dhidi ya kipindi kilichopita" : "vs previous period"}</p>}</div>; })}</div>
      <section className="mt-5 border border-emerald-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-gray-950">{lang === "sw" ? "Gharama na pembejeo za uzalishaji" : "Production costs and inputs"}</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-gray-600">{lang === "sw" ? "Hizi ni gharama za batches zilizorekodiwa kwenye kipindi hiki. Gharama inaingia kwenye gharama ya stock iliyozalishwa na hutambuliwa kama COGS bidhaa inapouzwa; haijapunguzwa tena hapa ili kuepuka kuhesabu mara mbili." : "These are costs from batches recorded in this period. They are capitalized into produced stock and recognized as COGS when the output sells; they are not subtracted again here, avoiding double counting."}</p></div><a href="/farm" className="text-sm font-semibold text-brand-700">{lang === "sw" ? "Fungua uzalishaji" : "Open production"}</a></div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="border border-gray-200 p-3"><p className="text-xs text-gray-500">{lang === "sw" ? "Batches" : "Batches"}</p><p className="mt-1 font-bold text-gray-950">{data?.production?.batchCount || 0}</p></div>
          <div className="border border-gray-200 p-3"><p className="text-xs text-gray-500">{lang === "sw" ? "Gharama za pembejeo" : "Input costs"}</p><p className="mt-1 font-bold text-gray-950">{formatTZS(data?.production?.ingredientCost || 0)}</p></div>
          <div className="border border-gray-200 p-3"><p className="text-xs text-gray-500">{lang === "sw" ? "Gharama za moja kwa moja" : "Direct costs"}</p><p className="mt-1 font-bold text-gray-950">{formatTZS(data?.production?.directCost || 0)}</p></div>
          <div className="border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs text-emerald-800">{lang === "sw" ? "Jumla ya gharama za uzalishaji" : "Total production cost"}</p><p className="mt-1 font-bold text-emerald-950">{formatTZS(data?.production?.totalCost || 0)}</p></div>
        </div>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b text-xs text-gray-500"><th className="py-2 pr-3">{lang === "sw" ? "Pembejeo" : "Input"}</th><th className="p-2">{lang === "sw" ? "Kiasi kilichotumika" : "Quantity used"}</th><th className="p-2">{lang === "sw" ? "Gharama (TZS)" : "Cost (TZS)"}</th></tr></thead><tbody>{data?.production?.inputs.map((input) => <tr key={input.productId} className="border-b last:border-0"><td className="py-2 pr-3 font-medium">{input.name}</td><td className="p-2">{input.quantity} {input.unit}</td><td className="p-2">{formatTZS(input.cost)}</td></tr>)}</tbody></table>{!data?.production?.inputs.length && <p className="py-4 text-sm text-gray-500">{lang === "sw" ? "Hakuna pembejeo za uzalishaji zilizorekodiwa kwenye kipindi hiki." : "No production inputs were recorded in this period."}</p>}</div>
        <p className="mt-3 text-xs text-gray-500">{lang === "sw" ? `Output inayoweza kutumika: ${data?.production?.usableOutput || 0}; mayai yaliyovunjika: ${data?.production?.brokenEggs || 0}; upungufu dhidi ya matarajio: ${data?.production?.productionVariance || 0}.` : `Usable output: ${data?.production?.usableOutput || 0}; broken eggs: ${data?.production?.brokenEggs || 0}; shortfall against expected output: ${data?.production?.productionVariance || 0}.`}</p>
      </section>
      {data?.comparison && <p className="mt-2 text-xs text-gray-500">{lang === "sw" ? "Mabadiliko yanalinganisha muda uliopita wa urefu sawa; faida ni ya bidhaa zenye gharama iliyorekodiwa." : "Comparisons use the immediately preceding period of equal duration. Profit comparison uses costed sale items."}</p>}
      <section className="mt-6 border border-gray-200 bg-white p-4 sm:p-5"><h2 className="text-sm font-semibold text-gray-900">{lang === "sw" ? "Faida na matumizi kwa muda" : "Profit and expenses over time"}</h2>{data?.chart.length ? <ResponsiveContainer width="100%" height={280}><BarChart data={data.chart} margin={{ top: 20, left: 0, right: 8, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} /><Tooltip formatter={(value) => formatTZS(Number(value || 0))} /><Legend /><Bar dataKey="grossProfit" name={lang === "sw" ? "Faida ghafi (gharama zinazojulikana)" : "Gross profit (known costs)"} fill="#15803d" radius={[3, 3, 0, 0]} /><Bar dataKey="expenses" name={lang === "sw" ? "Matumizi" : "Operating expenses"} fill="#e8790a" radius={[3, 3, 0, 0]} /><Bar dataKey="netProfit" name={lang === "sw" ? "Faida halisi (gharama zinazojulikana)" : "Net profit (known costs)"} fill="#0284c7" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer> : <p className="py-14 text-center text-sm text-gray-500">{lang === "sw" ? "Hakuna mauzo yaliyokamilika kwenye kipindi hiki." : "No completed sales were recorded during this period."}</p>}</section>
      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="border border-gray-200 bg-white p-4 sm:p-5"><h2 className="font-semibold text-gray-950">{lang === "sw" ? "Madeni na makusanyo" : "Receivables and collections"}</h2><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><p>{lang === "sw" ? "Jumla inayodaiwa" : "Outstanding total"}<strong className="mt-1 block">{formatTZS(data?.debtAging.outstanding || 0)}</strong></p><p>{lang === "sw" ? "Yaliyochelewa" : "Overdue"}<strong className="mt-1 block text-red-700">{formatTZS(data?.debtAging.overdue || 0)}</strong></p><p>{lang === "sw" ? "Yanalipwa ndani ya siku 7" : "Due within 7 days"}<strong className="mt-1 block">{formatTZS(data?.debtAging.dueSoon || 0)}</strong></p><p>{lang === "sw" ? "Hayana tarehe ya mwisho" : "No due date"}<strong className="mt-1 block">{formatTZS(data?.debtAging.noDueDate || 0)}</strong></p></div><h3 className="mt-4 border-t pt-3 text-xs font-semibold text-gray-700">{lang === "sw" ? "Makusanyo kwa njia ya malipo" : "Collections by payment method"}</h3><div className="mt-2 space-y-2">{data?.collectionBreakdown.map((entry) => <div key={entry.paymentMethod} className="flex justify-between gap-3 text-sm"><span>{paymentLabel(entry.paymentMethod, lang === "sw")}</span><strong>{formatTZS(entry.amount)}</strong></div>)}{!data?.collectionBreakdown.length && <p className="text-xs text-gray-500">{lang === "sw" ? "Hakuna makusanyo katika kipindi hiki." : "No collections in this period."}</p>}</div></div>
        <div className="border border-gray-200 bg-white p-4 sm:p-5"><h2 className="font-semibold text-gray-950">{lang === "sw" ? "Bidhaa zenye faida ghafi inayojulikana" : "Products by known-cost gross profit"}</h2><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b text-gray-500"><th className="py-2 pr-3">{lang === "sw" ? "Bidhaa" : "Product"}</th><th className="whitespace-nowrap p-2">{lang === "sw" ? "Idadi" : "Units"}</th><th className="whitespace-nowrap p-2">{lang === "sw" ? "Faida" : "Profit"}</th><th className="whitespace-nowrap p-2">{lang === "sw" ? "Stock" : "On hand"}</th></tr></thead><tbody>{data?.products.map((product) => <tr key={product.id} className="border-b last:border-0"><td className="max-w-40 break-words py-2 pr-3">{product.name}{product.missingCostSalesRevenue > 0 && <span className="block text-amber-700">{lang === "sw" ? "Gharama haipo kwa baadhi ya mauzo" : "Some sales lack cost"}</span>}</td><td className="whitespace-nowrap p-2">{product.quantity} {product.unit}</td><td className="whitespace-nowrap p-2">{formatTZS(product.grossProfit)}</td><td className="whitespace-nowrap p-2">{product.currentStock}</td></tr>)}</tbody></table></div></div>
      </section>
      <section className="mt-4 border border-gray-200 bg-white p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-gray-950">{lang === "sw" ? "Stock isiyouzwa siku 30" : "Stock with no sale in 30 days"}</h2><p className="mt-1 text-xs text-gray-500">{lang === "sw" ? "Bidhaa hai zenye stock na bila mauzo yaliyokamilika katika siku 30 zilizopita." : "Active products with stock and no completed sale in the last 30 days."}</p></div><a href="/inventory" className="text-sm font-semibold text-brand-700">{lang === "sw" ? "Fungua stock" : "Open inventory"}</a></div>{data?.slowMovingProducts.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{data.slowMovingProducts.map((product) => <div key={product.id} className="flex items-center justify-between gap-3 border p-3"><span className="min-w-0 break-words text-sm font-medium">{product.name}</span><span className="shrink-0 text-sm text-amber-800">{product.currentStock} {product.unit}</span></div>)}</div> : <p className="mt-3 text-sm text-gray-500">{lang === "sw" ? "Hakuna bidhaa za stock zilizokaa bila mauzo siku 30." : "No in-stock products have gone 30 days without a sale."}</p>}</section>
      <p className="mt-4 text-xs leading-5 text-gray-500">{lang === "sw" ? "Faida ghafi inatumia gharama iliyohifadhiwa kwenye kila bidhaa iliyouzwa; mistari yenye gharama sifuri imetengwa na kuonyeshwa kama mauzo yasiyo na gharama. Pesa zilizokusanywa hujumuisha mauzo yasiyo ya mkopo, malipo ya nukuu kwa tarehe yalipolipwa, na malipo ya madeni ya kawaida. Malipo ya nukuu yaliyonakiliwa kwenye deni hayahesabiwi mara mbili." : "Gross profit uses the cost snapshot on each sale item. Zero-cost lines are excluded from profit and flagged as uncosted revenue. Cash collected includes non-credit sales, quotation payments by their original paid date, and ordinary debt payments. Quotation payments copied into converted debts are not counted twice."}</p>
    </>}
  </div></AppShell>;
}
