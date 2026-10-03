"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Archive, ArrowRightLeft, Download, Phone, Plus, RotateCcw, Save } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import BranchTransferForm from "@/components/BranchTransferForm";
import { api, formatTZS, switchBranch } from "@/lib/api";
import { useLang } from "@/lib/i18n";

interface Branch { id: string; name: string; location: string; contactPhone: string | null; effectiveContactPhone: string | null; branchArchived: boolean }
interface Listing { branches: Branch[]; mainId: string; selectedId: string; pro: boolean; limit: number; monthlyAmount: number }
interface Metric extends Branch { sales: number; saleCount: number; grossProfit: number; missingCostSalesRevenue: number; expenses: number; netProfit: number; receivables: number; previousSales: number; previousSaleCount: number; previousGrossProfit: number; previousExpenses: number; previousNetProfit: number }
type Comparison = Record<string, { current: number; previous: number; change: number; changePercent: number | null }>;

function businessDate(value: Date | string = new Date(), inclusiveEnd = false) {
  const date = new Date(value);
  if (inclusiveEnd) date.setTime(date.getTime() - 1);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function downloadCsv(rows: Array<Array<string | number>>, filename: string) {
  const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function BranchesPage() {
  const lang = useLang(), sw = lang === "sw";
  const today = businessDate();
  const [data, setData] = useState<Listing | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [compareDates, setCompareDates] = useState({ from: "", to: "" });
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [range, setRange] = useState({ from: `${today.slice(0, 7)}-01`, to: today });
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [contactDrafts, setContactDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  async function load() {
    const result = await api.get<Listing>("/branches", lang);
    setData(result);
    setContactDrafts(Object.fromEntries(result.branches.map((branch) => [branch.id, branch.contactPhone || ""])));
    if (result.pro) {
      const report = await api.get<{ branches: Metric[]; comparison: Comparison; compareFrom: string; compareTo: string }>(`/branches/overview?from=${range.from}&to=${range.to}`, lang);
      setMetrics(report.branches);
      setCompareDates({ from: businessDate(report.compareFrom), to: businessDate(report.compareTo, true) });
    } else { setMetrics([]); }
  }

  useEffect(() => { load().catch((e) => setError(e.message)); }, [lang, range]);

  async function save(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try { await action(); await load(); setMessage(sw ? "Imehifadhiwa." : "Saved."); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to save"); }
    finally { setBusy(false); }
  }

  const filtered = data?.branches.filter((b) => `${b.name} ${b.location} ${b.effectiveContactPhone || ""}`.toLowerCase().includes(search.toLowerCase())) || [];
  const filteredMetrics = metrics.filter((b) => `${b.name} ${b.location}`.toLowerCase().includes(search.toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pages);
  const visibleBranches = filtered.slice((currentPage - 1) * 10, currentPage * 10);
  const visibleMetrics = filteredMetrics.slice((currentPage - 1) * 10, currentPage * 10);
  const totals = filteredMetrics.reduce((total, row) => ({
    sales: total.sales + row.sales, saleCount: total.saleCount + row.saleCount,
    grossProfit: total.grossProfit + row.grossProfit, missingCostSalesRevenue: total.missingCostSalesRevenue + row.missingCostSalesRevenue, expenses: total.expenses + row.expenses,
    netProfit: total.netProfit + row.netProfit, receivables: total.receivables + row.receivables,
  }), { sales: 0, saleCount: 0, grossProfit: 0, missingCostSalesRevenue: 0, expenses: 0, netProfit: 0, receivables: 0 });
  const previousTotals = filteredMetrics.reduce((total, row) => ({
    sales: total.sales + Number(row.previousSales || 0),
    saleCount: total.saleCount + Number(row.previousSaleCount || 0),
    grossProfit: total.grossProfit + Number(row.previousGrossProfit || 0),
    expenses: total.expenses + Number(row.previousExpenses || 0),
    netProfit: total.netProfit + Number(row.previousNetProfit || 0),
  }), { sales: 0, saleCount: 0, grossProfit: 0, expenses: 0, netProfit: 0 });
  const comparison = Object.fromEntries(["sales", "saleCount", "grossProfit", "expenses", "netProfit"].map((key) => {
    const current = totals[key as keyof typeof totals];
    const previous = previousTotals[key as keyof typeof previousTotals];
    return [key, { current, previous, change: current - previous, changePercent: previous === 0 ? null : Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1)) }];
  })) as Comparison;

  const totalCards: Array<[string, number, boolean?]> = sw
    ? [["Mauzo", totals.sales], ["Idadi", totals.saleCount, true], ["Faida ghafi", totals.grossProfit], ["Matumizi", totals.expenses], ["Faida halisi", totals.netProfit], ["Madeni", totals.receivables]]
    : [["Sales", totals.sales], ["Transactions", totals.saleCount, true], ["Gross profit", totals.grossProfit], ["Expenses", totals.expenses], ["Net profit", totals.netProfit], ["Receivables", totals.receivables]];

  return <AppShell><main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
    <header className="border-b pb-4"><h1 className="text-2xl font-bold">{sw ? "Matawi" : "Branches"}</h1>
      <p className="mt-2 text-sm text-gray-600">{sw ? "Pro inajumuisha maeneo 4, pamoja na duka kuu. Kila eneo la ziada ni TZS 10,000 kwa mwezi." : "Pro includes 4 locations, including your main shop. Each extra location is TZS 10,000 per month."}</p>
      <p className="mt-2 text-sm text-gray-600">{sw ? "Tumia namba moja ya akaunti kubadilisha matawi. Namba ya mawasiliano ya wateja ni tofauti na namba ya kuingia; kila tawi linaweza kurithi au kuweka namba yake." : "Use the same owner login to switch locations. Customer contact is separate from your sign-in number; each location can inherit the main number or set its own."}</p>
      <Link href="/billing" className="mt-2 inline-block font-medium text-brand-700">{sw ? "Usajili na malipo" : "Subscription and payments"}</Link>
    </header>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {message && <p role="status" className="text-green-700">{message}</p>}
    {!data && !error && <p>{sw ? "Inapakia..." : "Loading..."}</p>}
    {data && <>
      <p className="text-sm">{sw ? "Maeneo yanayotumika" : "Active locations"}: {data.branches.filter((b) => !b.branchArchived).length} / {data.limit}</p>
      {data.pro && <form className="grid items-end gap-3 border-b pb-5 sm:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); void save(async () => { await api.post("/branches", { name, location, contactPhone: newContactPhone.trim() || null }, lang); setName(""); setLocation(""); setNewContactPhone(""); }); }}>
        <label className="grid gap-1 text-sm">{sw ? "Jina la tawi" : "Branch name"}<input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className="min-w-0 rounded-lg border p-3" /></label>
        <label className="grid gap-1 text-sm">{sw ? "Eneo" : "Location"}<input required maxLength={200} value={location} onChange={(e) => setLocation(e.target.value)} className="min-w-0 rounded-lg border p-3" /></label>
        <label className="grid gap-1 text-sm">{sw ? "Simu ya wateja (hiari)" : "Customer contact (optional)"}<input type="tel" maxLength={30} value={newContactPhone} onChange={(e) => setNewContactPhone(e.target.value)} placeholder={sw ? "Tupu = namba kuu" : "Blank = main number"} className="min-w-0 rounded-lg border p-3" /></label>
        <button disabled={busy} className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-white disabled:opacity-50"><Plus size={18} />{sw ? "Ongeza tawi" : "Add branch"}</button>
      </form>}
      <label className="grid max-w-md gap-1 text-sm">{sw ? "Tafuta tawi" : "Search branches"}<input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="rounded-lg border p-3" /></label>
      <ul className="divide-y">{visibleBranches.map((b) => <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="min-w-0 flex-1 break-words"><h2 className="font-semibold">{b.name}</h2><p className="text-sm text-gray-600">{b.location} {b.id === data.mainId ? (sw ? "(Duka kuu)" : "(Main shop)") : ""}</p>{b.branchArchived && <p className="text-sm">{sw ? "Limehifadhiwa" : "Archived"}</p>}
          <form className="mt-3 grid gap-2 sm:max-w-2xl sm:grid-cols-[minmax(180px,1fr)_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); void save(() => api.patch(`/branches/${b.id}`, { contactPhone: contactDrafts[b.id]?.trim() || null }, lang)); }}>
            <label className="grid gap-1 text-xs font-medium text-gray-700"><span className="flex items-center gap-1"><Phone size={14} />{sw ? "Namba ya kuwasiliana na wateja" : "Customer contact number"}</span><input type="tel" maxLength={30} value={contactDrafts[b.id] ?? ""} onChange={(event) => setContactDrafts((current) => ({ ...current, [b.id]: event.target.value }))} placeholder={sw ? "Tupu = tumia namba ya akaunti/duka kuu" : "Blank = use account/main shop number"} className="min-w-0 rounded-lg border p-2.5 text-sm" /><span className="font-normal text-gray-500">{contactDrafts[b.id]?.trim() ? (sw ? "Namba hii itaonekana kwenye catalog na ujumbe wa oda wa tawi hili." : "Shown on this location's catalog and WhatsApp orders.") : `${sw ? "Inatumika sasa" : "Currently using"}: ${b.effectiveContactPhone || (sw ? "Hakuna namba" : "No number set")} · ${sw ? "Kuacha tupu hurithi namba kuu." : "Blank inherits the main business number."}`}</span></label>
            <button disabled={busy || (contactDrafts[b.id] || "").trim() === (b.contactPhone || "")} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-semibold disabled:opacity-40"><Save size={16} />{sw ? "Hifadhi namba" : "Save number"}</button>
          </form>
        </div>
        <div className="flex flex-wrap gap-2">{!b.branchArchived && <button disabled={b.id === data.selectedId || busy} onClick={() => { try { switchBranch(b.id); } catch (e) { setError((e as Error).message); } }} className="flex min-h-11 items-center gap-2 rounded-lg border px-3 disabled:opacity-50"><ArrowRightLeft size={16} />{b.id === data.selectedId ? (sw ? "Tawi la sasa" : "Current location") : (sw ? "Fungua" : "Open")}</button>}
        {b.id !== data.mainId && <button disabled={busy || b.id === data.selectedId} onClick={() => { if (window.confirm(sw ? "Badilisha hali ya tawi hili? Rekodi zitahifadhiwa." : "Change this branch's status? Records will be retained.")) void save(() => api.patch(`/branches/${b.id}`, { branchArchived: !b.branchArchived }, lang)); }} className="flex min-h-11 items-center gap-2 rounded-lg border px-3 disabled:opacity-50">{b.branchArchived ? <RotateCcw size={16} /> : <Archive size={16} />}{b.branchArchived ? (sw ? "Rejesha" : "Restore") : (sw ? "Hifadhi" : "Archive")}</button>}</div>
      </li>)}</ul>
      <nav className="flex items-center justify-between gap-3"><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="min-h-11 rounded-lg border px-3 disabled:opacity-40">{sw ? "Nyuma" : "Previous"}</button><span>{currentPage} / {pages}</span><button disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} className="min-h-11 rounded-lg border px-3 disabled:opacity-40">{sw ? "Mbele" : "Next"}</button></nav>
      {data.pro && <section className="border-t pt-5">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">{sw ? "Muhtasari wa matawi" : "Branch performance"}</h2><p className="mt-1 text-xs text-gray-500">{range.from} – {range.to} ({sw ? "Saa za Tanzania" : "Tanzania time"})</p></div>
          <div className="flex flex-wrap items-end gap-2"><label className="grid gap-1 text-xs">{sw ? "Kuanzia" : "From"}<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} className="min-h-10 border p-2" /></label><label className="grid gap-1 text-xs">{sw ? "Mpaka" : "To"}<input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className="min-h-10 border p-2" /></label>
            <button onClick={() => { setPage(1); setRange({ from, to }); }} className="min-h-10 bg-brand-700 px-3 text-sm font-semibold text-white">{sw ? "Tumia" : "Apply"}</button>
            <button onClick={() => downloadCsv([["DukaPilot branch report"], ["Reporting period (Africa/Dar_es_Salaam)", `${range.from} to ${range.to}`], ["Comparison period", `${compareDates.from} to ${compareDates.to}`], ["Current filtered sales TZS", totals.sales], ["Previous filtered sales TZS", previousTotals.sales], ["Current filtered net profit TZS", totals.netProfit], ["Previous filtered net profit TZS", previousTotals.netProfit], ["Profit note", "Known-cost sale items only; net profit subtracts non-stock expenses."], ["Receivables note", "Current outstanding balance, not an as-of-period balance."], [], ["Branch", "Sales TZS", "Sales count", "Known-cost gross profit TZS", "Uncosted sales TZS", "Expenses TZS", "Known-cost net profit TZS", "Outstanding receivables TZS"], ...filteredMetrics.map((b) => [b.name, b.sales, b.saleCount, b.grossProfit, b.missingCostSalesRevenue, b.expenses, b.netProfit, b.receivables])], `dukapilot-branches-${range.from}-to-${range.to}.csv`)} className="inline-flex min-h-10 items-center gap-2 border px-3 text-sm font-semibold"><Download size={16} />{sw ? "Pakua CSV" : "Export CSV"}</button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">{totalCards.map(([label, value, count]) => <div key={label} className="border bg-white p-3"><p className="text-xs text-gray-500">{label}</p><p className="mt-1 break-words text-sm font-bold">{count ? value : formatTZS(value)}</p></div>)}</div>
        {comparison && <p className="mt-2 text-xs text-gray-600">{sw ? `Mabadiliko dhidi ya ${compareDates.from} – ${compareDates.to}:` : `Change vs ${compareDates.from} – ${compareDates.to}:`} {sw ? "Mauzo" : "Sales"} {comparison.sales.change >= 0 ? "+" : ""}{formatTZS(comparison.sales.change)} ({comparison.sales.changePercent === null ? "-" : `${comparison.sales.changePercent}%`}), {sw ? "faida halisi" : "net profit"} {comparison.netProfit.change >= 0 ? "+" : ""}{formatTZS(comparison.netProfit.change)} ({comparison.netProfit.changePercent === null ? "-" : `${comparison.netProfit.changePercent}%`}).</p>}
        {filteredMetrics.some((row) => row.missingCostSalesRevenue > 0) && <p role="status" className="mt-3 border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">{sw ? "Baadhi ya mauzo hayana gharama iliyorekodiwa; faida ghafi na halisi zinaonyesha bidhaa zenye gharama pekee." : "Some sales have no recorded item cost; gross and net profit include costed items only."}</p>}
        <div className="mt-3 overflow-x-auto border"><table className="w-full text-left text-sm"><thead className="bg-gray-50"><tr>{(sw ? ["Tawi", "Mauzo", "Idadi", "Faida ghafi", "Matumizi", "Faida halisi", "Madeni ya sasa"] : ["Branch", "Sales", "Count", "Gross profit", "Expenses", "Net profit", "Outstanding receivables"]).map((s) => <th key={s} className="whitespace-nowrap p-3">{s}</th>)}</tr></thead><tbody>
          {visibleMetrics.map((b) => <tr key={b.id} className="border-t"><td className="p-3">{b.name}</td>{[b.sales, b.saleCount, b.grossProfit, b.expenses, b.netProfit, b.receivables].map((v, i) => <td key={i} className="whitespace-nowrap p-3">{i === 1 ? v : formatTZS(v)}</td>)}</tr>)}
          {!visibleMetrics.length && <tr><td colSpan={7} className="p-5 text-center text-sm text-gray-500">{sw ? "Hakuna matawi yanayolingana." : "No matching branches."}</td></tr>}
        </tbody></table></div>
        <p className="mt-2 text-xs text-gray-500">{sw ? "Faida halisi ni faida ghafi inayojulikana ukiondoa matumizi yasiyo ya stock; madeni yanayoonekana ni salio la sasa." : "Net profit is known-cost gross profit less non-stock expenses; receivables show the current balance, not only debt created during this period."}</p>
      </section>}
      {data.pro && <BranchTransferForm branches={data.branches.filter((b) => !b.branchArchived)} lang={lang} />}
    </>}
  </main></AppShell>;
}
