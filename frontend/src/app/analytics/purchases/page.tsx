"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { api, formatTZS } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { ArrowLeft, Download, RefreshCw, Search } from "lucide-react";

type Period = "today" | "week" | "month" | "quarter" | "year" | "all" | "custom";
type PurchaseReport = {
  period: Period;
  from: string | null;
  to: string | null;
  summary: { receiptCount: number; productCost: number; transportCost: number; otherCost: number; landedCost: number; estimatedReceiptCount: number };
  paymentBreakdown: Array<{ paymentMethod: string; receiptCount: number; amount: number }>;
  suppliers: Array<{ id: string; name: string; receiptCount: number; amount: number }>;
  supplierOptions: Array<{ id: string; name: string; receiptCount: number }>;
  products: Array<{ id: string; name: string; unit: string; quantity: number; productCost: number; allocatedAdditionalCost: number; landedCost: number }>;
  receipts: Array<{ id: string; receivedAt: string; invoiceNumber: string | null; paymentMethod: string; totalProductCost: number; transportCost: number; otherCost: number; totalLandedCost: number; estimatedAllocation: boolean; supplier?: { id: string; name: string } | null; items?: Array<{ id: string; quantity: number; landedUnitCost: number; product: { id: string; name: string; unit: string } }> }>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number } | null;
};

function todayValue() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function startOfMonthValue() {
  const today = todayValue();
  return `${today.slice(0, 8)}01`;
}

function dateLabel(value: string, sw: boolean) {
  return new Intl.DateTimeFormat(sw ? "sw-TZ" : "en-TZ", { timeZone: "Africa/Dar_es_Salaam", dateStyle: "medium" }).format(new Date(value));
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function paymentLabel(method: string, sw: boolean) {
  const labels: Record<string, [string, string]> = {
    CASH: ["Cash", "Taslimu"], MPESA: ["M-Pesa", "M-Pesa"], TIGOPESA: ["Mix by Yas", "Mix by Yas"],
    AIRTEL_MONEY: ["Airtel Money", "Airtel Money"], HALOPESA: ["HaloPesa", "HaloPesa"], BANK: ["Bank", "Benki"],
  };
  return labels[method]?.[sw ? 1 : 0] || method;
}

export default function PurchasesAnalyticsPage() {
  const lang = useLang();
  const sw = lang === "sw";
  const [period, setPeriod] = useState<Period>("month");
  const [routeReady, setRouteReady] = useState(false);
  const [from, setFrom] = useState(startOfMonthValue);
  const [to, setTo] = useState(todayValue);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<PurchaseReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => { setPage(1); setSearch(searchInput.trim()); }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requestedPeriod = query.get("period");
    if (["today", "week", "month", "quarter", "year", "all", "custom"].includes(requestedPeriod || "")) {
      setPeriod(requestedPeriod as Period);
    }
    const requestedFrom = query.get("from");
    const requestedTo = query.get("to");
    if (requestedFrom && /^\d{4}-\d{2}-\d{2}$/.test(requestedFrom)) setFrom(requestedFrom);
    if (requestedTo && /^\d{4}-\d{2}-\d{2}$/.test(requestedTo)) setTo(requestedTo);
    setRouteReady(true);
  }, []);

  const params = useMemo(() => {
    const query = new URLSearchParams({ period, page: String(page), pageSize: "25" });
    if (period === "custom") { query.set("from", from); query.set("to", to); }
    if (search) query.set("search", search);
    if (supplierId) query.set("supplierId", supplierId);
    if (paymentMethod) query.set("paymentMethod", paymentMethod);
    return query;
  }, [period, page, from, to, search, supplierId, paymentMethod]);

  const loadReport = useCallback(async () => {
    if (!routeReady) return;
    setLoading(true);
    setError("");
    try {
      const result = await api.get<PurchaseReport>(`/dashboard/purchases?${params}`, lang);
      setReport(result);
    } catch (value) {
      setError(value instanceof Error ? value.message : (sw ? "Imeshindikana kupakia manunuzi." : "Could not load purchases."));
    } finally {
      setLoading(false);
    }
  }, [params, lang, sw, routeReady]);

  useEffect(() => { if (routeReady) void loadReport(); }, [loadReport, routeReady]);

  async function exportCsv() {
    setExporting(true);
    setExportError("");
    try {
      const exportParams = new URLSearchParams(params);
      exportParams.delete("page");
      exportParams.delete("pageSize");
      exportParams.set("export", "1");
      const result = await api.get<PurchaseReport>(`/dashboard/purchases?${exportParams}`, lang);
      const supplierFilterLabel = supplierId
        ? report?.supplierOptions.find((supplier) => supplier.id === supplierId)?.name || (supplierId === "__unassigned__" ? (sw ? "Bila msambazaji" : "No supplier") : supplierId)
        : (sw ? "Wasambazaji wote" : "All suppliers");
      const rangeStart = result.from ? dateLabel(result.from, false) : (sw ? "Mwanzo" : "Beginning");
      const rangeEnd = result.to ? dateLabel(new Date(new Date(result.to).getTime() - 1).toISOString(), false) : (sw ? "Hakuna mwisho" : "No end");
      const rows = [
        ["DukaPilot purchase report"],
        ["Period", period, "From", rangeStart, "To", rangeEnd, "Timezone", "Africa/Dar_es_Salaam"],
        ["Supplier filter", supplierFilterLabel],
        ["Payment method filter", paymentMethod || (sw ? "Zote" : "All")],
        ["Search", search || (sw ? "Hakuna" : "None")],
        ["Total landed purchases TZS", result.summary.landedCost],
        ["Product cost TZS", result.summary.productCost],
        ["Transport and other costs TZS", result.summary.transportCost + result.summary.otherCost],
        ["Receipt count", result.summary.receiptCount],
        ["Note", "Stock purchases are inventory costs, not operating expenses; costs flow to COGS when stock is sold."],
        [],
        ["Received at", "Supplier", "Invoice", "Payment method", "Product cost TZS", "Transport TZS", "Other costs TZS", "Landed purchase TZS", "Estimated allocation"],
        ...result.receipts.map((receipt) => [receipt.receivedAt, receipt.supplier?.name || (sw ? "Bila msambazaji" : "No supplier"), receipt.invoiceNumber || "", paymentLabel(receipt.paymentMethod, false), receipt.totalProductCost, receipt.transportCost, receipt.otherCost, receipt.totalLandedCost, receipt.estimatedAllocation ? "Yes" : "No"]),
      ];
      const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
      const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `dukapilot-purchases-${period}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (value) {
      setExportError(value instanceof Error ? value.message : (sw ? "Imeshindikana kupakua CSV." : "Could not export CSV."));
    } finally {
      setExporting(false);
    }
  }

  const periodOptions: Array<[Period, string, string]> = [["today", "Today", "Leo"], ["week", "This week", "Wiki hii"], ["month", "This month", "Mwezi huu"], ["quarter", "This quarter", "Robo hii"], ["year", "This year", "Mwaka huu"], ["all", "All time", "Tangu mwanzo"], ["custom", "Custom range", "Tarehe maalum"]];
  const visibleReceipts = report?.receipts || [];

  return <AppShell><main className="mx-auto max-w-6xl space-y-5 pb-20 lg:pb-6">
    <header className="border-b border-gray-200 pb-4"><Link href="/analytics" className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-brand-700"><ArrowLeft className="h-4 w-4" />{sw ? "Uchambuzi" : "Analytics"}</Link><div className="mt-3 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold text-gray-950">{sw ? "Manunuzi" : "Purchases"}</h1><p className="mt-1 text-sm leading-5 text-gray-600">{sw ? "Thamani ya bidhaa zilizopokelewa, ikijumuisha usafiri na gharama nyingine." : "Value of stock received, including transport and other landed costs."}</p></div><button type="button" onClick={() => void exportCsv()} disabled={exporting || !report?.summary.receiptCount} className="inline-flex min-h-10 items-center gap-2 border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 disabled:opacity-50"><Download className="h-4 w-4" />{exporting ? (sw ? "Inapakua..." : "Exporting...") : "CSV"}</button></div></header>

    <section className="space-y-3 border-b border-gray-200 pb-5" aria-label={sw ? "Vichujio" : "Filters"}>
      <div className="flex max-w-full gap-1 overflow-x-auto bg-gray-100 p-1">{periodOptions.map(([key, en, swLabel]) => <button type="button" key={key} onClick={() => { setPeriod(key); setPage(1); }} aria-pressed={period === key} className={`min-h-10 whitespace-nowrap px-3 text-sm font-semibold ${period === key ? "bg-white text-brand-800 shadow-sm" : "text-gray-600"}`}>{sw ? swLabel : en}</button>)}</div>
      {period === "custom" && <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium text-gray-700">{sw ? "Kuanzia" : "From"}<input type="date" value={from} max={to} onChange={(event) => { setFrom(event.target.value); setPage(1); }} className="min-h-10 border border-gray-300 bg-white px-3" /></label><label className="grid gap-1 text-sm font-medium text-gray-700">{sw ? "Mpaka" : "To"}<input type="date" value={to} min={from} onChange={(event) => { setTo(event.target.value); setPage(1); }} className="min-h-10 border border-gray-300 bg-white px-3" /></label></div>}
      <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_minmax(170px,0.65fr)_minmax(150px,0.55fr)]">
        <label className="relative"><span className="sr-only">{sw ? "Tafuta risiti, bidhaa au msambazaji" : "Search receipts, products, or suppliers"}</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={sw ? "Tafuta risiti, bidhaa, msambazaji" : "Search receipt, product, supplier"} className="min-h-10 w-full border border-gray-300 bg-white pl-9 pr-3 text-sm" /></label>
        <label><span className="sr-only">{sw ? "Msambazaji" : "Supplier"}</span><select aria-label={sw ? "Msambazaji" : "Supplier"} value={supplierId} onChange={(event) => { setSupplierId(event.target.value); setPage(1); }} className="min-h-10 w-full border border-gray-300 bg-white px-3 text-sm"><option value="">{sw ? "Wasambazaji wote" : "All suppliers"}</option>{report?.supplierOptions.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.id === "__unassigned__" ? (sw ? "Bila msambazaji" : "No supplier") : supplier.name}</option>)}</select></label>
        <label><span className="sr-only">{sw ? "Njia ya malipo" : "Payment method"}</span><select aria-label={sw ? "Njia ya malipo" : "Payment method"} value={paymentMethod} onChange={(event) => { setPaymentMethod(event.target.value); setPage(1); }} className="min-h-10 w-full border border-gray-300 bg-white px-3 text-sm"><option value="">{sw ? "Njia zote" : "All payment methods"}</option>{[["CASH", "Cash", "Taslimu"], ["MPESA", "M-Pesa", "M-Pesa"], ["TIGOPESA", "Mix by Yas", "Mix by Yas"], ["AIRTEL_MONEY", "Airtel Money", "Airtel Money"], ["HALOPESA", "HaloPesa", "HaloPesa"], ["BANK", "Bank", "Benki"]].map(([value, en, swLabel]) => <option key={value} value={value}>{sw ? swLabel : en}</option>)}</select></label>
      </div>
      <p className="text-xs text-gray-500">{period === "all" ? (sw ? "Kipindi: tangu manunuzi ya kwanza yaliyorekodiwa." : "Period: all recorded purchase history.") : period === "custom" ? `${sw ? "Kipindi" : "Period"}: ${from} – ${to} · Africa/Dar_es_Salaam` : `${sw ? "Kipindi" : "Period"}: ${sw ? periodOptions.find(([key]) => key === period)?.[2] : periodOptions.find(([key]) => key === period)?.[1]} · Africa/Dar_es_Salaam`}</p>
    </section>

    {error ? <section role="alert" className="border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{error}</p><button type="button" onClick={() => void loadReport()} className="mt-2 inline-flex min-h-9 items-center gap-1 font-semibold underline"><RefreshCw className="h-4 w-4" />{sw ? "Jaribu tena" : "Retry"}</button></section> : <>
      {exportError && <p role="alert" className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">{exportError}</p>}
      {report?.summary.estimatedReceiptCount ? <p role="status" className="border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{sw ? `${report.summary.estimatedReceiptCount} risiti zina gharama zilizokadiriwa; jumla inazijumuisha.` : `${report.summary.estimatedReceiptCount} receipts use estimated cost allocation; totals include them.`}</p> : null}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[[sw ? "Jumla ya manunuzi" : "Total landed purchases", report ? formatTZS(report.summary.landedCost) : "–"], [sw ? "Gharama za bidhaa" : "Product costs", report ? formatTZS(report.summary.productCost) : "–"], [sw ? "Usafiri na nyingine" : "Transport and other", report ? formatTZS(report.summary.transportCost + report.summary.otherCost) : "–"], [sw ? "Risiti zilizopokelewa" : "Receipts received", report ? String(report.summary.receiptCount) : "–"]].map(([label, value]) => <div key={label} className="border border-gray-200 bg-white p-4"><p className="text-xs font-semibold text-gray-600">{label}</p><p className="mt-2 break-words text-xl font-bold text-gray-950">{loading && !report ? "…" : value}</p></div>)}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div><h2 className="mb-2 text-sm font-semibold text-gray-900">{sw ? "Manunuzi kwa msambazaji" : "Purchases by supplier"}</h2><div className="overflow-x-auto border-y border-gray-200"><table className="w-full min-w-[390px] text-left text-sm"><thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="px-3 py-2">{sw ? "Msambazaji" : "Supplier"}</th><th className="px-3 py-2">{sw ? "Risiti" : "Receipts"}</th><th className="px-3 py-2 text-right">{sw ? "Jumla" : "Total"}</th></tr></thead><tbody>{report?.suppliers.map((supplier) => <tr key={supplier.id} className="border-t border-gray-100"><td className="px-3 py-2 font-medium">{supplier.name}</td><td className="px-3 py-2">{supplier.receiptCount}</td><td className="whitespace-nowrap px-3 py-2 text-right font-semibold">{formatTZS(supplier.amount)}</td></tr>)}{!report?.suppliers.length && <tr><td colSpan={3} className="px-3 py-8 text-center text-sm text-gray-500">{sw ? "Hakuna risiti katika kipindi hiki." : "No receipts in this period."}</td></tr>}</tbody></table></div></div>
        <div><h2 className="mb-2 text-sm font-semibold text-gray-900">{sw ? "Manunuzi kwa njia ya malipo" : "Purchases by payment method"}</h2><div className="divide-y divide-gray-100 border-y border-gray-200">{report?.paymentBreakdown.map((entry) => <div key={entry.paymentMethod} className="flex items-center justify-between gap-3 py-3 text-sm"><span>{paymentLabel(entry.paymentMethod, sw)} <span className="text-xs text-gray-500">· {entry.receiptCount}</span></span><strong>{formatTZS(entry.amount)}</strong></div>)}{!report?.paymentBreakdown.length && <p className="py-8 text-center text-sm text-gray-500">{sw ? "Hakuna malipo katika kipindi hiki." : "No payments in this period."}</p>}</div></div>
      </section>

      <section><h2 className="mb-2 text-sm font-semibold text-gray-900">{sw ? "Bidhaa zilizonunuliwa" : "Purchased products"}</h2><div className="overflow-x-auto border-y border-gray-200"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="px-3 py-2">{sw ? "Bidhaa" : "Product"}</th><th className="px-3 py-2">{sw ? "Kiasi" : "Quantity"}</th><th className="px-3 py-2 text-right">{sw ? "Bidhaa" : "Items"}</th><th className="px-3 py-2 text-right">{sw ? "Gharama zilizogawiwa" : "Allocated costs"}</th><th className="px-3 py-2 text-right">{sw ? "Jumla ya landed cost" : "Landed total"}</th></tr></thead><tbody>{report?.products.map((product) => <tr key={product.id} className="border-t border-gray-100"><td className="px-3 py-2 font-medium">{product.name}</td><td className="px-3 py-2">{product.quantity} {product.unit}</td><td className="whitespace-nowrap px-3 py-2 text-right">{formatTZS(product.productCost)}</td><td className="whitespace-nowrap px-3 py-2 text-right">{formatTZS(product.allocatedAdditionalCost)}</td><td className="whitespace-nowrap px-3 py-2 text-right font-semibold">{formatTZS(product.landedCost)}</td></tr>)}{!report?.products.length && <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-gray-500">{sw ? "Hakuna bidhaa zilizopokelewa." : "No received products in this period."}</td></tr>}</tbody></table></div></section>

      <section><div className="mb-2 flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-sm font-semibold text-gray-900">{sw ? "Historia ya risiti" : "Receipt history"}</h2><p className="mt-1 text-xs text-gray-500">{report?.pagination ? `${report.pagination.total} ${sw ? "risiti" : "receipts"}` : ""}</p></div>{loading && <span className="text-xs text-gray-500">{sw ? "Inasasisha…" : "Updating…"}</span>}</div><div className="space-y-2">{visibleReceipts.map((receipt) => <details key={receipt.id} className="border border-gray-200 bg-white"><summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3 py-3"><span className="min-w-0"><strong className="block truncate text-sm text-gray-950">{receipt.supplier?.name || (sw ? "Bila msambazaji" : "No supplier")}</strong><span className="block text-xs text-gray-500">{dateLabel(receipt.receivedAt, sw)}{receipt.invoiceNumber ? ` · ${receipt.invoiceNumber}` : ""} · {paymentLabel(receipt.paymentMethod, sw)}</span></span><span className="flex items-center gap-2"><strong className="text-sm text-brand-800">{formatTZS(receipt.totalLandedCost)}</strong>{receipt.estimatedAllocation && <span className="text-[10px] font-semibold text-amber-800">{sw ? "MAKADIRIO" : "EST."}</span>}</span></summary><div className="border-t border-gray-100 px-3 py-2"><div className="divide-y divide-gray-100">{receipt.items?.map((item) => <div key={item.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{item.product.name} · {item.quantity} {item.product.unit}</span><span>{formatTZS(item.landedUnitCost)} / {item.product.unit}</span></div>)}</div><div className="mt-2 grid grid-cols-2 gap-2 border-t border-gray-100 pt-2 text-xs text-gray-600 sm:grid-cols-4"><span>{sw ? "Bidhaa" : "Products"}: {formatTZS(receipt.totalProductCost)}</span><span>{sw ? "Usafiri" : "Transport"}: {formatTZS(receipt.transportCost)}</span><span>{sw ? "Nyingine" : "Other"}: {formatTZS(receipt.otherCost)}</span><span>{sw ? "Jumla" : "Landed total"}: {formatTZS(receipt.totalLandedCost)}</span></div></div></details>)}{!loading && !visibleReceipts.length && <p className="border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">{sw ? "Hakuna risiti zinazolingana na vichujio." : "No receipts match these filters."}</p>}</div>
        {report?.pagination && report.pagination.totalPages > 1 && <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-3"><p className="text-xs text-gray-500">{sw ? `Ukurasa ${page} / ${report.pagination.totalPages}` : `Page ${page} of ${report.pagination.totalPages}`}</p><div className="flex gap-2"><button type="button" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)} className="min-h-10 border border-gray-300 px-3 text-sm disabled:opacity-40">{sw ? "Iliyotangulia" : "Previous"}</button><button type="button" disabled={loading || page >= report.pagination.totalPages} onClick={() => setPage((value) => value + 1)} className="min-h-10 border border-gray-300 px-3 text-sm disabled:opacity-40">{sw ? "Inayofuata" : "Next"}</button></div></div>}
      </section>
      <p className="text-xs leading-5 text-gray-500">{sw ? "Manunuzi hujumlishwa kwa tarehe stock ilipopokelewa. Hii ni thamani ya bidhaa pamoja na usafiri na gharama nyingine zilizogawiwa; si matumizi ya uendeshaji wala COGS. Gharama huingia COGS bidhaa inapouzwa. DukaPilot bado haifuatilii salio la supplier credit." : "Purchases are grouped by the date stock was received. Totals include product cost plus allocated transport and other charges; they are not operating expenses or COGS. Costs enter COGS when stock sells. Supplier-credit balances are not tracked yet."}</p>
    </>}
  </main></AppShell>;
}
