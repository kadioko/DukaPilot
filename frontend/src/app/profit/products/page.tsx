"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { api, formatTZS } from "@/lib/api";
import { useLang } from "@/lib/i18n";

type Period = "today" | "week" | "month" | "quarter" | "year" | "custom";
type ProductMetric = {
  id: string; name: string; sku: string | null; unit: string; isActive: boolean; isInternalUse: boolean;
  currentStock: number; minimumStock: number; buyingPrice: number; sellingPrice: number; wholesalePrice: number | null;
  saleCount: number; unitsSold: number; revenue: number; knownCostOfGoodsSold: number;
  knownCostRevenue: number; grossProfit: number; missingCostSalesRevenue: number;
  retailUnits: number; wholesaleUnits: number; lastSoldAt: string | null;
  returnedUnits?: number; returnedRevenue?: number;
  grossMargin: number | null; averageSalePrice: number | null; costCoveragePercent: number | null;
};
type ProductList = { from: string; to: string; products: ProductMetric[]; page: number; limit: number; total: number };
type ProductDetail = {
  product: ProductMetric; previous: ProductMetric | null;
  trend: Array<{ label: string; units: number; revenue: number; grossProfit: number }>;
  recentSales: Array<{
    id: string; saleId: string; receiptNumber: number | null; createdAt: string; quantity: number;
    unitPrice: number; totalPrice: number; knownCostGrossProfit: number | null;
    paymentMethod: string; pricingTier: string; channel: string;
  }>;
  recentReturns: Array<{ id: string; receiptNumber: number | null; reason: string; createdAt: string; quantity: number; restockQuantity: number; damagedQuantity: number; amount: number; refundAmount: number; debtReduction: number; refundMethod: string | null }>;
};

function tanzaniaDate(value: Date | string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const dates = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${dates.year}-${dates.month}-${dates.day}`;
}

function reportQuery(period: Period, from: string, to: string) {
  const params = new URLSearchParams({ period });
  if (period === "custom") { params.set("from", from); params.set("to", to); }
  return params;
}

export default function ProductPerformancePage() {
  const lang = useLang();
  const sw = lang === "sw";
  const copy = (english: string, swahili: string) => sw ? swahili : english;
  const [period, setPeriod] = useState<Period>("month");
  const [from, setFrom] = useState(() => tanzaniaDate(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(() => tanzaniaDate(new Date()));
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("revenue");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [listing, setListing] = useState<ProductList | null>(null);
  const [listError, setListError] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [compare, setCompare] = useState<ProductMetric[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let active = true;
    const params = reportQuery(period, from, to);
    params.set("search", search);
    params.set("sort", sort);
    params.set("status", status);
    params.set("page", String(page));
    setListLoading(true);
    setListError("");
    setListing(null);
    api.get<ProductList>(`/dashboard/products/performance?${params}`, lang)
      .then((value) => { if (active) setListing(value); })
      .catch((error: unknown) => { if (active) setListError(error instanceof Error ? error.message : copy("Could not load products.", "Imeshindikana kupakia bidhaa.")); })
      .finally(() => { if (active) setListLoading(false); });
    return () => { active = false; };
  }, [period, from, to, search, sort, status, page, lang, retry]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let active = true;
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    api.get<ProductDetail>(`/dashboard/products/${encodeURIComponent(selectedId)}/performance?${reportQuery(period, from, to)}`, lang)
      .then((value) => { if (active) setDetail(value); })
      .catch((error: unknown) => { if (active) setDetailError(error instanceof Error ? error.message : copy("Could not load product details.", "Imeshindikana kupakia taarifa za bidhaa.")); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedId, period, from, to, lang]);

  function changePeriod(value: Period) { setPeriod(value); setPage(1); setCompare([]); }
  function toggleCompare(product: ProductMetric) {
    setCompare((current) => current.some((item) => item.id === product.id)
      ? current.filter((item) => item.id !== product.id)
      : current.length < 3 ? [...current, product] : current);
  }
  const pages = Math.max(1, Math.ceil((listing?.total || 0) / (listing?.limit || 25)));
  const selected = detail?.product;
  const coverageWarning = selected && selected.missingCostSalesRevenue > 0;
  const durationDays = listing ? (new Date(listing.to).getTime() - new Date(listing.from).getTime()) / 86400000 : 0;
  const stockCover = selected && durationDays >= 7 && selected.unitsSold > 0
    ? Math.round(selected.currentStock * durationDays / selected.unitsSold)
    : null;

  return <AppShell><main className="mx-auto max-w-6xl pb-20 lg:pb-8">
    <header className="border-b border-gray-200 pb-5">
      <Link href="/analytics" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-700"><ArrowLeft className="h-4 w-4" />{copy("Analytics", "Uchambuzi")}</Link>
      <h1 className="mt-2 text-2xl font-bold text-gray-950">{copy("Product performance", "Utendaji wa bidhaa")}</h1>
      <p className="mt-1 text-sm text-gray-600">{copy("Compare products using completed sales and the cost recorded when each item sold.", "Linganisha bidhaa kwa mauzo yaliyokamilika na gharama iliyohifadhiwa wakati wa kuuza.")}</p>
      <div className="mt-4 flex max-w-full gap-1 overflow-x-auto bg-gray-100 p-1" aria-label={copy("Reporting period", "Kipindi cha ripoti")}>
        {(["today", "week", "month", "quarter", "year", "custom"] as Period[]).map((value) => <button key={value} type="button" onClick={() => changePeriod(value)} aria-pressed={period === value} className={`min-h-10 whitespace-nowrap px-3 text-sm font-semibold ${period === value ? "bg-white text-brand-800 shadow-sm" : "text-gray-600"}`}>{({ today: copy("Today", "Leo"), week: copy("This week", "Wiki hii"), month: copy("This month", "Mwezi huu"), quarter: copy("This quarter", "Robo hii"), year: copy("This year", "Mwaka huu"), custom: copy("Custom", "Tarehe maalum") })[value]}</button>)}
      </div>
      {period === "custom" && <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-gray-700">{copy("From", "Kuanzia")}<input type="date" value={from} max={to} onChange={(event) => { setFrom(event.target.value); setPage(1); setCompare([]); }} className="mt-1 block min-h-11 w-full border border-gray-300 px-3" /></label><label className="text-sm font-medium text-gray-700">{copy("To", "Mpaka")}<input type="date" value={to} min={from} onChange={(event) => { setTo(event.target.value); setPage(1); setCompare([]); }} className="mt-1 block min-h-11 w-full border border-gray-300 px-3" /></label></div>}
    </header>

    <section className="py-5" aria-label={copy("Find products", "Tafuta bidhaa")}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px_145px]">
        <label className="relative block"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-500" /><span className="sr-only">{copy("Search products", "Tafuta bidhaa")}</span><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={copy("Search name or SKU", "Tafuta jina au SKU")} className="min-h-11 w-full border border-gray-300 bg-white pl-10 pr-3 text-sm" /></label>
        <label className="block"><span className="sr-only">{copy("Sort products", "Panga bidhaa")}</span><select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} className="min-h-11 w-full border border-gray-300 bg-white px-3 text-sm"><option value="revenue">{copy("Highest revenue", "Mauzo mengi")}</option><option value="profit">{copy("Highest gross profit", "Faida ghafi kubwa")}</option><option value="units">{copy("Most units sold", "Vipande vingi")}</option><option value="margin">{copy("Highest margin", "Asilimia kubwa ya faida")}</option><option value="stock">{copy("Most stock", "Stock nyingi")}</option><option value="name">{copy("Name", "Jina")}</option></select></label>
        <label className="block"><span className="sr-only">{copy("Product status", "Hali ya bidhaa")}</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="min-h-11 w-full border border-gray-300 bg-white px-3 text-sm"><option value="all">{copy("All products", "Bidhaa zote")}</option><option value="active">{copy("Active", "Zinazotumika")}</option><option value="inactive">{copy("Inactive", "Zisizotumika")}</option></select></label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600"><span>{listLoading ? copy("Loading...", "Inapakia...") : `${listing?.total || 0} ${copy("products", "bidhaa")}`}{listing && !listError ? ` · ${tanzaniaDate(listing.from)}–${tanzaniaDate(new Date(new Date(listing.to).getTime() - 1))}` : ""}</span><span>{copy("Tanzania time", "Saa za Tanzania")}</span></div>
      {listError && <div role="alert" className="mt-4 border border-red-200 bg-red-50 p-3 text-sm text-red-800">{listError}<button type="button" onClick={() => setRetry((value) => value + 1)} className="ml-3 font-semibold underline">{copy("Retry", "Jaribu tena")}</button></div>}
      {!listError && <div className="mt-3 divide-y divide-gray-200 border-y border-gray-200 bg-white" aria-busy={listLoading}>
        {listing?.products.map((product) => <article key={product.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_120px_130px_120px_85px] sm:items-center">
          <div className="min-w-0"><button type="button" onClick={() => setSelectedId(product.id)} className="inline-flex min-h-10 max-w-full items-center gap-1 text-left font-semibold text-brand-800 hover:underline"><span className="truncate">{product.name}</span><ArrowRight className="h-4 w-4 shrink-0" /></button><p className="text-xs text-gray-500">{product.sku || copy("No SKU", "Hakuna SKU")} · {product.unit}{!product.isActive ? ` · ${copy("Inactive", "Haitumiki")}` : ""}{product.isInternalUse ? ` · ${copy("Internal use", "Matumizi ya ndani")}` : ""}</p></div>
          <div><p className="text-xs text-gray-500">{copy("Units sold", "Vipande vilivyouzwa")}</p><p className="font-semibold text-gray-900">{product.unitsSold}</p></div>
          <div><p className="text-xs text-gray-500">{copy("Revenue", "Mauzo")}</p><p className="font-semibold text-gray-900">{formatTZS(product.revenue)}</p></div>
          <div><p className="text-xs text-gray-500">{copy("Gross profit", "Faida ghafi")}</p><p className="font-semibold text-gray-900">{product.knownCostRevenue > 0 ? formatTZS(product.grossProfit) : "–"}</p>{product.missingCostSalesRevenue > 0 && <p className="text-xs text-amber-800">{copy("Cost incomplete", "Gharama haijakamilika")}</p>}</div>
          <button type="button" onClick={() => toggleCompare(product)} disabled={compare.length >= 3 && !compare.some((item) => item.id === product.id)} aria-pressed={compare.some((item) => item.id === product.id)} className={`min-h-11 justify-self-start border px-4 text-xs font-semibold sm:justify-self-stretch sm:px-2 ${compare.some((item) => item.id === product.id) ? "border-brand-600 bg-brand-50 text-brand-800" : "border-gray-300 text-gray-700 disabled:opacity-50"}`}>{compare.some((item) => item.id === product.id) ? copy("Selected", "Imechaguliwa") : copy("Compare", "Linganisha")}</button>
        </article>)}
        {!listLoading && !listing?.products.length && <p className="py-10 text-center text-sm text-gray-600">{copy("No products match these filters.", "Hakuna bidhaa kwa vichujio hivi.")}</p>}
      </div>}
      {listing && pages > 1 && <div className="mt-4 flex items-center justify-between gap-3 text-sm"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || listLoading} className="inline-flex min-h-11 items-center gap-1 border border-gray-300 px-3 disabled:opacity-50"><ChevronLeft className="h-4 w-4" />{copy("Previous", "Nyuma")}</button><span>{page} / {pages}</span><button type="button" onClick={() => setPage((value) => Math.min(pages, value + 1))} disabled={page >= pages || listLoading} className="inline-flex min-h-11 items-center gap-1 border border-gray-300 px-3 disabled:opacity-50">{copy("Next", "Mbele")}<ChevronRight className="h-4 w-4" /></button></div>}
    </section>

    {compare.length > 0 && <section className="border-t border-gray-200 py-5"><div className="flex items-center justify-between gap-2"><h2 className="text-lg font-semibold text-gray-950">{copy("Compare products", "Linganisha bidhaa")}</h2><button type="button" onClick={() => setCompare([])} className="min-h-11 px-2 text-sm font-semibold text-gray-600">{copy("Clear", "Ondoa zote")}</button></div><p className="mt-1 text-xs text-gray-600">{copy("Up to three products from the selected period. Profit excludes operating expenses and sales without recorded cost.", "Hadi bidhaa tatu kwa kipindi ulichochagua. Faida haijumuishi matumizi ya uendeshaji wala mauzo yasiyo na gharama iliyorekodiwa.")}</p><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[520px] border-collapse text-left text-sm"><thead><tr className="border-b border-gray-200"><th className="p-2">{copy("Metric", "Kipimo")}</th>{compare.map((item) => <th key={item.id} className="min-w-36 p-2">{item.name}<button type="button" onClick={() => toggleCompare(item)} aria-label={`${copy("Remove", "Ondoa")} ${item.name}`} className="ml-1 align-middle"><X className="h-4 w-4" /></button></th>)}</tr></thead><tbody>{([
          [copy("Units sold", "Vipande vilivyouzwa"), (item: ProductMetric) => String(item.unitsSold)],
          [copy("Revenue", "Mauzo"), (item: ProductMetric) => formatTZS(item.revenue)],
          [copy("Average sale price", "Wastani wa bei"), (item: ProductMetric) => item.averageSalePrice == null ? "–" : formatTZS(item.averageSalePrice)],
          [copy("Known cost", "Gharama inayojulikana"), (item: ProductMetric) => formatTZS(item.knownCostOfGoodsSold)],
          [copy("Gross profit", "Faida ghafi"), (item: ProductMetric) => item.knownCostRevenue ? formatTZS(item.grossProfit) : "–"],
          [copy("Gross margin", "Asilimia ya faida"), (item: ProductMetric) => item.grossMargin == null ? "–" : `${item.grossMargin}%`],
          [copy("Cost coverage", "Uhakika wa gharama"), (item: ProductMetric) => item.costCoveragePercent == null ? "–" : `${item.costCoveragePercent}%`],
          [copy("On hand", "Stock iliyopo"), (item: ProductMetric) => `${item.currentStock} ${item.unit}`],
        ] as Array<[string, (item: ProductMetric) => string]>).map(([label, value]) => <tr key={label} className="border-b border-gray-100"><th className="p-2 font-medium text-gray-600">{label}</th>{compare.map((item) => <td key={item.id} className="p-2 font-semibold text-gray-900">{value(item)}</td>)}</tr>)}</tbody></table></div></section>}

    {selectedId && <section className="border-t border-gray-200 py-5" aria-label={copy("Product details", "Taarifa za bidhaa")}><div className="flex items-start justify-between gap-2"><h2 className="text-lg font-semibold text-gray-950">{selected?.name || copy("Product details", "Taarifa za bidhaa")}</h2><button type="button" onClick={() => setSelectedId(null)} aria-label={copy("Close product details", "Funga taarifa za bidhaa")} className="flex h-11 w-11 shrink-0 items-center justify-center border border-gray-300"><X className="h-4 w-4" /></button></div>
      {detailLoading && <p className="py-5 text-sm text-gray-600">{copy("Loading product details...", "Inapakia taarifa za bidhaa...")}</p>}
      {detailError && <p role="alert" className="mt-3 border border-red-200 bg-red-50 p-3 text-sm text-red-800">{detailError}</p>}
      {selected && detail && <>
        <p className="mt-1 text-xs text-gray-600">{selected.sku || copy("No SKU", "Hakuna SKU")} · {selected.unit} · {selected.saleCount} {copy("sales", "mauzo")}</p>
        {coverageWarning && <p role="status" className="mt-3 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{copy(`${formatTZS(selected.missingCostSalesRevenue)} in sales has no recorded cost. Gross profit and margin cover known-cost sales only.`, `Mauzo ya ${formatTZS(selected.missingCostSalesRevenue)} hayana gharama iliyorekodiwa. Faida ghafi na asilimia yake ni za mauzo yenye gharama inayojulikana pekee.`)}</p>}
        <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 border-y border-gray-200 py-4 text-sm sm:grid-cols-3 lg:grid-cols-4">{([
          [copy("Revenue", "Mauzo"), formatTZS(selected.revenue)], [copy("Units sold", "Vipande vilivyouzwa"), String(selected.unitsSold)],
          [copy("Returned value / units", "Thamani / vipande vilivyorudishwa"), `${formatTZS(selected.returnedRevenue || 0)} / ${selected.returnedUnits || 0}`],
          [copy("Gross profit (known costs)", "Faida ghafi (gharama zinazojulikana)"), selected.knownCostRevenue ? formatTZS(selected.grossProfit) : "–"],
          [copy("Gross margin", "Asilimia ya faida"), selected.grossMargin == null ? "–" : `${selected.grossMargin}%`],
          [copy("Cost of goods sold", "Gharama ya bidhaa zilizouzwa"), formatTZS(selected.knownCostOfGoodsSold)],
          [copy("Cost coverage", "Uhakika wa gharama"), selected.costCoveragePercent == null ? "–" : `${selected.costCoveragePercent}%`],
          [copy("Average sale price", "Wastani wa bei"), selected.averageSalePrice == null ? "–" : formatTZS(selected.averageSalePrice)],
          [copy("Retail / wholesale units", "Vipande rejareja / jumla"), `${selected.retailUnits} / ${selected.wholesaleUnits}`],
          [copy("Current stock", "Stock iliyopo"), `${selected.currentStock} ${selected.unit}`],
          [copy("Minimum stock", "Kiwango cha chini"), `${selected.minimumStock} ${selected.unit}`],
          [copy("Listed selling price", "Bei iliyowekwa"), formatTZS(selected.sellingPrice)],
          [copy("Listed wholesale price", "Bei ya jumla iliyowekwa"), selected.wholesalePrice == null ? "–" : formatTZS(selected.wholesalePrice)],
          [copy("Current buying price", "Bei ya sasa ya kununua"), formatTZS(selected.buyingPrice)],
          [copy("Last sold in period", "Mauzo ya mwisho kipindi hiki"), selected.lastSoldAt ? new Date(selected.lastSoldAt).toLocaleString(sw ? "sw-TZ" : "en-TZ", { timeZone: "Africa/Dar_es_Salaam", dateStyle: "medium" }) : "–"],
          [copy("Estimated stock cover", "Makadirio ya stock kudumu"), stockCover == null ? "–" : `${stockCover} ${copy("days", "siku")}`],
        ] as Array<[string, string]>).map(([label, value]) => <div key={label}><dt className="text-xs text-gray-600">{label}</dt><dd className="mt-1 break-words font-semibold text-gray-950">{value}</dd></div>)}</dl>
        <p className="mt-2 text-xs text-gray-500">{copy("Gross profit is before operating expenses. Current buying price may differ from the cost saved on older sales. Stock cover is estimated only when at least seven days of sales are available.", "Faida ghafi ni kabla ya matumizi ya uendeshaji. Bei ya sasa ya kununua inaweza kutofautiana na gharama ya mauzo ya zamani. Makadirio ya stock hutolewa tu kukiwa na mauzo ya angalau siku saba.")}</p>
        {detail.previous && <p className="mt-3 border-l-2 border-brand-600 pl-3 text-sm text-gray-700">{copy("Previous comparable period", "Kipindi kilichopita kinacholingana")}: {formatTZS(detail.previous.revenue)} {copy("revenue", "mauzo")} · {detail.previous.unitsSold} {copy("units", "vipande")}</p>}
        <div className="mt-6 grid gap-6 lg:grid-cols-2"><div><h3 className="font-semibold text-gray-900">{copy("Sales over time", "Mauzo kwa muda")}</h3>{detail.trend.length ? <div className="mt-3 h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={detail.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" /><XAxis dataKey="label" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} /><Tooltip formatter={(value) => formatTZS(Number(value || 0))} /><Bar dataKey="revenue" name={copy("Revenue", "Mauzo")} fill="#15803d" /></BarChart></ResponsiveContainer></div> : <p className="mt-3 py-10 text-sm text-gray-600">{copy("No completed sales in this period.", "Hakuna mauzo yaliyokamilika kipindi hiki.")}</p>}</div>
          <div><h3 className="font-semibold text-gray-900">{copy("Recent transactions", "Miamala ya karibuni")}</h3><div className="mt-3 divide-y divide-gray-200 border-y border-gray-200">{detail.recentSales.map((sale) => <div key={sale.id} className="flex items-start justify-between gap-3 py-3 text-sm"><div><p className="font-semibold text-gray-900">{sale.receiptNumber ? `DP-${String(sale.receiptNumber).padStart(6, "0")}` : sale.saleId.slice(-8).toUpperCase()}</p><p className="text-xs text-gray-600">{new Date(sale.createdAt).toLocaleString(sw ? "sw-TZ" : "en-TZ", { timeZone: "Africa/Dar_es_Salaam", dateStyle: "medium" })} · {sale.quantity} {selected.unit} · {sale.pricingTier}</p><p className="text-xs text-gray-500">{formatTZS(sale.unitPrice)} / {selected.unit} · {sale.channel}</p></div><div className="text-right"><p className="font-semibold">{formatTZS(sale.totalPrice)}</p><p className="text-xs text-gray-600">{sale.paymentMethod}</p>{sale.knownCostGrossProfit != null && <p className="text-xs text-emerald-700">{copy("Gross profit", "Faida ghafi")}: {formatTZS(sale.knownCostGrossProfit)}</p>}</div></div>)}{!detail.recentSales.length && <p className="py-6 text-sm text-gray-600">{copy("No sales to show.", "Hakuna mauzo ya kuonyesha.")}</p>}</div></div></div>
        <div className="mt-6 border-t border-gray-200 pt-4"><h3 className="font-semibold text-gray-900">{copy("Recent returns", "Marejesho ya karibuni")}</h3><div className="mt-2 divide-y divide-gray-200 border-y border-gray-200">{detail.recentReturns.map((item) => <article key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm"><div><p className="font-semibold text-gray-900">{item.receiptNumber ? `DP-${String(item.receiptNumber).padStart(6, "0")}` : copy("Sale return", "Rejesho la mauzo")}</p><p className="text-xs text-gray-600">{new Date(item.createdAt).toLocaleString(sw ? "sw-TZ" : "en-TZ", { timeZone: "Africa/Dar_es_Salaam", dateStyle: "medium" })} · {item.quantity} {selected.unit} · {item.reason}</p><p className="text-xs text-gray-500">{copy("Restocked", "Zimerudishwa stock")}: {item.restockQuantity} · {copy("Damaged", "Zimeharibika")}: {item.damagedQuantity}</p></div><div className="text-right"><p className="font-semibold">{formatTZS(item.amount)}</p>{item.refundAmount > 0 && <p className="text-xs text-amber-800">{copy("Refund", "Imerejeshwa")}: {formatTZS(item.refundAmount)} ({item.refundMethod})</p>}{item.debtReduction > 0 && <p className="text-xs text-blue-800">{copy("Debt reduced", "Deni limepunguzwa")}: {formatTZS(item.debtReduction)}</p>}</div></article>)}{!detail.recentReturns.length && <p className="py-5 text-sm text-gray-600">{copy("No returns in this period.", "Hakuna marejesho kipindi hiki.")}</p>}</div></div>
      </>}
    </section>}
  </main></AppShell>;
}
