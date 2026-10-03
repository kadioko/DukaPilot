"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { api, formatTZS } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { ArrowLeft, RotateCw } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Period = "today" | "week" | "month" | "quarter" | "year" | "custom";
type Report = {
  from: string; to: string; group: "hour" | "day" | "month";
  summary: { netSalesRevenue: number; salesCount: number; netProfit: number; costOfGoodsSold: number; grossProfit: number; grossProfitMargin: number; unitsSold: number; missingCostSalesRevenue: number; knownCostRevenue: number };
  chart: Array<{ label: string; revenue: number; salesCount: number; unitsSold: number; costOfGoodsSold: number; grossProfit: number; grossProfitMargin: number | null; netProfit: number }>;
  products: Array<{ id: string; name: string; unit: string; quantity: number; revenue: number; grossProfit: number; missingCostSalesRevenue: number }>;
  topSuppliers?: Array<{ id: string; name: string; receiptCount: number; amount: number }>;
  topCustomers?: Array<{ name: string; phoneLast4: string | null; salesCount: number; amount: number }>;
  salesPaymentBreakdown?: Array<{ paymentMethod: string; salesCount: number; amount: number }>;
  collectionBreakdown?: Array<{ paymentMethod: string; amount: number }>;
  salesByStaff?: Array<{ id: string | null; name: string; salesCount: number; amount: number; unitsSold: number }>;
};

const metrics = ["revenue", "sales", "profits", "top-products", "top-suppliers", "payment-method", "cogs", "top-customers", "gross-profit", "sales-by-staff", "gross-margin", "units-sold"] as const;
type Metric = typeof metrics[number];
type RankingRow = { key: string; name: string; count: string; amount: number; units?: number; detail?: string; missing?: number };
const titles: Record<Metric, [string, string]> = {
  revenue: ["Revenue", "Mapato halisi"], sales: ["Sales", "Mauzo"], profits: ["Profits", "Faida halisi"],
  "top-products": ["Top products", "Bidhaa zinazoongoza"], "top-suppliers": ["Top suppliers", "Wasambazaji wakuu"],
  "payment-method": ["Payment method", "Njia za malipo"], cogs: ["Cost of goods sold", "Gharama ya bidhaa zilizouzwa"],
  "top-customers": ["Top customers", "Wateja wakuu"], "gross-profit": ["Gross profit", "Faida ghafi"],
  "sales-by-staff": ["Sales by staff", "Mauzo kwa wafanyakazi"], "gross-margin": ["Gross profit margin", "Asilimia ya faida ghafi"],
  "units-sold": ["Units sold", "Vipimo vilivyouzwa"],
};
const periodLabels: Record<Period, [string, string]> = {
  today: ["Today", "Leo"], week: ["This week", "Wiki hii"], month: ["This month", "Mwezi huu"],
  quarter: ["This quarter", "Robo hii"], year: ["This year", "Mwaka huu"], custom: ["Custom range", "Kipindi maalum"],
};

function localToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function paymentName(method: string, sw: boolean) {
  const labels: Record<string, [string, string]> = { CASH: ["Cash", "Taslimu"], MPESA: ["M-Pesa", "M-Pesa"], TIGOPESA: ["Tigo Pesa", "Tigo Pesa"], AIRTEL_MONEY: ["Airtel Money", "Airtel Money"], HALOPESA: ["HaloPesa", "HaloPesa"], BANK: ["Bank", "Benki"], CREDIT: ["Credit", "Mkopo"] };
  return labels[method]?.[sw ? 1 : 0] || method;
}

export default function AnalyticsMetricPage() {
  const lang = useLang();
  const params = useParams<{ metric: string }>();
  const metric = metrics.includes(params.metric as Metric) ? params.metric as Metric : "revenue";
  const [period, setPeriod] = useState<Period>("today");
  const [from, setFrom] = useState(localToday());
  const [to, setTo] = useState(localToday());
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const sw = lang === "sw";

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requestedPeriod = query.get("period");
    if (requestedPeriod && ["today", "week", "month", "quarter", "year", "custom"].includes(requestedPeriod)) setPeriod(requestedPeriod as Period);
    if (query.get("from")) setFrom(query.get("from")!);
    if (query.get("to")) setTo(query.get("to")!);
  }, []);

  useEffect(() => {
    const query = new URLSearchParams({ period });
    if (period === "custom") { query.set("from", from); query.set("to", to); }
    let active = true;
    setReport(null);
    setLoading(true);
    setError("");
    api.get<Report>(`/dashboard/profit?${query}`, lang)
      .then((value) => { if (active) setReport(value); })
      .catch((value: unknown) => { if (active) setError(value instanceof Error ? value.message : (sw ? "Imeshindikana kupakia taarifa." : "Could not load this report.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [period, from, to, lang, sw, retry]);

  const summaryValue = useMemo(() => {
    if (!report) return "–";
    const amount = (value: number) => formatTZS(value);
    switch (metric) {
      case "revenue": return amount(report.summary.netSalesRevenue);
      case "sales": return String(report.summary.salesCount);
      case "profits": return amount(report.summary.netProfit);
      case "cogs": return amount(report.summary.costOfGoodsSold);
      case "gross-profit": return amount(report.summary.grossProfit);
      case "gross-margin": return report.summary.knownCostRevenue > 0 ? `${report.summary.grossProfitMargin}%` : "–";
      case "units-sold": return String(report.summary.unitsSold);
      case "top-products": return report.products?.[0]?.name || (sw ? "Hakuna data" : "No data");
      case "top-suppliers": return report.topSuppliers?.[0]?.name || (sw ? "Hakuna data" : "No data");
      case "top-customers": return report.topCustomers?.[0]?.name || (sw ? "Hakuna data" : "No data");
      case "payment-method": return report.collectionBreakdown?.[0] ? paymentName(report.collectionBreakdown[0].paymentMethod, sw) : (sw ? "Hakuna data" : "No data");
      case "sales-by-staff": return report.salesByStaff?.[0]?.name || (sw ? "Hakuna data" : "No data");
    }
  }, [report, metric, sw]);

  const ranking = useMemo<RankingRow[]>(() => {
    if (!report) return [];
    if (metric === "top-products") return report.products.map((item) => ({ key: item.id, name: item.name, count: `${item.quantity} ${item.unit}`, amount: item.revenue, units: item.quantity, detail: `${sw ? "Faida ghafi" : "Gross profit"}: ${formatTZS(item.grossProfit)}`, missing: item.missingCostSalesRevenue }));
    if (metric === "top-suppliers") return (report.topSuppliers || []).map((item) => ({ key: item.id, name: item.name, count: `${item.receiptCount} ${sw ? "stakabadhi" : "receipts"}`, amount: item.amount }));
    if (metric === "top-customers") return (report.topCustomers || []).map((item, index) => ({ key: `${item.phoneLast4 || item.name}-${index}`, name: item.phoneLast4 ? `${item.name} · •••• ${item.phoneLast4}` : item.name, count: `${item.salesCount} ${sw ? "mauzo" : "sales"}`, amount: item.amount }));
    if (metric === "sales-by-staff") return (report.salesByStaff || []).map((item, index) => ({ key: item.id || `owner-${index}`, name: item.name, count: `${item.salesCount} ${sw ? "mauzo" : "sales"}`, amount: item.amount, units: item.unitsSold }));
    if (metric === "payment-method") {
      const rows = report.collectionBreakdown || [];
      const total = rows.reduce((sum, item) => sum + item.amount, 0);
      return rows.map((item) => ({ key: item.paymentMethod, name: paymentName(item.paymentMethod, sw), count: total > 0 ? `${(item.amount / total * 100).toFixed(1)}%` : "0%", amount: item.amount }));
    }
    return [];
  }, [report, metric, sw]);

  const chartKey = metric === "revenue" ? "revenue" : metric === "sales" ? "salesCount" : metric === "profits" ? "netProfit" : metric === "cogs" ? "costOfGoodsSold" : metric === "gross-profit" ? "grossProfit" : metric === "gross-margin" ? "grossProfitMargin" : "unitsSold";
  const trendLabel = metric === "gross-margin" ? (sw ? "Faida ghafi %" : "Gross margin %") : ["sales", "units-sold"].includes(metric) ? (metric === "sales" ? (sw ? "Mauzo" : "Sales") : (sw ? "Vipimo" : "Units")) : titles[metric][sw ? 1 : 0];
  const isMoney = !["sales", "gross-margin", "units-sold"].includes(metric);
  const chartValue = (value: number) => metric === "gross-margin" ? `${value}%` : isMoney ? formatTZS(value) : String(value);

  return <AppShell><main className="mx-auto max-w-6xl pb-20 lg:pb-8">
    <header className="border-b border-gray-200 pb-4">
      <Link href="/analytics" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-700"><ArrowLeft className="h-4 w-4" />{sw ? "Uchambuzi" : "Analytics"}</Link>
      <h1 className="mt-2 text-2xl font-bold text-gray-950">{titles[metric][sw ? 1 : 0]}</h1>
      <div className="mt-4 flex max-w-full gap-1 overflow-x-auto bg-gray-100 p-1" aria-label={sw ? "Kipindi cha ripoti" : "Reporting period"}>
        {(Object.keys(periodLabels) as Period[]).map((value) => <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)} className={`min-h-10 whitespace-nowrap px-3 text-sm font-semibold ${period === value ? "bg-white text-brand-800 shadow-sm" : "text-gray-600"}`}>{periodLabels[value][sw ? 1 : 0]}</button>)}
      </div>
      {period === "custom" && <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-gray-700">{sw ? "Kuanzia" : "From"}<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} className="mt-1 block min-h-11 w-full border border-gray-300 px-3" /></label><label className="text-sm font-medium text-gray-700">{sw ? "Mpaka" : "To"}<input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className="mt-1 block min-h-11 w-full border border-gray-300 px-3" /></label></div>}
      {report && <p className="mt-3 text-xs text-gray-500">{sw ? "Kipindi" : "Period"}: {new Intl.DateTimeFormat(sw ? "sw-TZ" : "en-TZ", { timeZone: "Africa/Dar_es_Salaam", dateStyle: "medium" }).format(new Date(report.from))} – {new Intl.DateTimeFormat(sw ? "sw-TZ" : "en-TZ", { timeZone: "Africa/Dar_es_Salaam", dateStyle: "medium" }).format(new Date(new Date(report.to).getTime() - 1))} · Africa/Dar_es_Salaam</p>}
    </header>

      {loading && !report ? <div className="flex h-56 items-center justify-center"><span className="h-8 w-8 animate-spin border-2 border-brand-200 border-t-brand-700" /></div> : error && !report ? <div role="alert" className="mt-5 border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<button type="button" onClick={() => setRetry((value) => value + 1)} className="ml-3 inline-flex items-center gap-1 font-semibold underline"><RotateCw className="h-4 w-4" />{sw ? "Jaribu tena" : "Retry"}</button></div> : report && <>
      <section className="mt-5 border-b border-gray-200 pb-5"><p className="text-sm font-semibold text-gray-600">{sw ? "Jumla ya kipindi" : "Period total"}</p><p className="mt-1 break-words text-3xl font-bold text-teal-600">{summaryValue}</p>{metric === "gross-margin" && <p className="mt-1 text-xs text-gray-500">{sw ? `Hesabu inatumia mauzo yenye gharama inayojulikana pekee: ${formatTZS(report.summary.knownCostRevenue)}.` : `Calculated only on sales with known cost: ${formatTZS(report.summary.knownCostRevenue)}.`}</p>}</section>
      {report.summary.missingCostSalesRevenue > 0 && ["profits", "gross-profit", "gross-margin", "top-products"].includes(metric) && <p role="status" className="mt-4 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{sw ? `Mauzo ya ${formatTZS(report.summary.missingCostSalesRevenue)} hayana gharama iliyorekodiwa; faida na margin zinaonyesha sehemu yenye gharama inayojulikana pekee.` : `${formatTZS(report.summary.missingCostSalesRevenue)} of sales have no recorded cost. Profit and margin cover known-cost sales only.`}</p>}
      {ranking.length > 0 ? <section className="mt-5" aria-label={sw ? "Nafasi" : "Rankings"}><h2 className="mb-2 text-sm font-semibold text-gray-800">{metric === "payment-method" ? (sw ? "Makusanyo kwa njia" : "Collections by method") : (sw ? "Orodha" : "Ranking")}</h2><div className="overflow-x-auto border-y border-gray-200"><table className="w-full min-w-[520px] text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="w-12 px-3 py-3">#</th><th className="px-3 py-3">{sw ? "Jina" : "Name"}</th><th className="px-3 py-3">{sw ? "Idadi" : "Count"}</th><th className="px-3 py-3 text-right">{sw ? "Kiasi" : "Amount"}</th></tr></thead><tbody>{ranking.map((row, index) => <tr key={row.key} className="border-t border-gray-100"><td className="px-3 py-3 text-gray-500">{index + 1}</td><td className="px-3 py-3 font-medium text-gray-900">{row.name}{row.detail && <span className="block text-xs font-normal text-gray-500">{row.detail}</span>}{row.missing ? <span className="block text-xs text-amber-800">{sw ? "Gharama pungufu" : "Cost incomplete"}: {formatTZS(row.missing)}</span> : null}</td><td className="px-3 py-3 text-gray-600">{row.count}{row.units !== undefined && metric === "sales-by-staff" ? ` · ${row.units} ${sw ? "vipimo" : "units"}` : ""}</td><td className="whitespace-nowrap px-3 py-3 text-right font-semibold">{formatTZS(row.amount)}</td></tr>)}</tbody></table></div></section> : ["top-products", "top-suppliers", "top-customers", "payment-method", "sales-by-staff"].includes(metric) && <p className="mt-5 border-y border-gray-200 py-10 text-center text-sm text-gray-500">{sw ? "Hakuna data ya kuonyesha kwenye kipindi hiki." : "No data to show for this period."}</p>}
      {!ranking.length && !["top-products", "top-suppliers", "top-customers", "payment-method", "sales-by-staff"].includes(metric) && <section className="mt-5 border border-gray-200 bg-white p-4"><h2 className="mb-3 text-sm font-semibold text-gray-800">{sw ? "Mwenendo" : "Trend"} · {trendLabel}</h2>{report.chart.length ? <ResponsiveContainer width="100%" height={290}><LineChart data={report.chart} margin={{ top: 12, right: 12, bottom: 4, left: 4 }}><CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => metric === "gross-margin" ? `${value}%` : `${Math.round(Number(value) / (isMoney ? 1000 : 1))}${isMoney ? "k" : ""}`} /><Tooltip formatter={(value) => chartValue(Number(value || 0))} /><Line type="monotone" dataKey={chartKey} name={trendLabel} stroke="#0f9f86" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer> : <p className="py-12 text-center text-sm text-gray-500">{sw ? "Hakuna data ya mwenendo." : "No trend data for this period."}</p>}</section>}
      {metric === "payment-method" && ranking.length > 0 && <p className="mt-3 text-xs text-gray-500">{sw ? "Kiasi kinaonyesha makusanyo kwa tarehe yalipopokelewa, ukiondoa marejesho." : "Amounts use collections on the dates received, less refunds."}</p>}
    </>}
  </main></AppShell>;
}
