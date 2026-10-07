"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, History, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";

type MovementType = "IN" | "OUT" | "ADJUSTMENT";
type TypeFilter = "ALL" | MovementType;

interface Movement {
  id: string;
  type: MovementType;
  quantity: number;
  note?: string | null;
  createdAt: string;
  product: { id: string; name: string; sku?: string | null; unit: string; currentStock: number };
  stockReceipt?: { id: string; invoiceNumber?: string | null; supplier?: { id: string; name: string } | null } | null;
}

interface Pagination { page: number; limit: number; total: number; totalPages: number; }

const PAGE_SIZE = 50;

function formatDate(value: string, lang: string) {
  return new Intl.DateTimeFormat(lang === "sw" ? "sw-TZ" : "en-TZ", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dar_es_Salaam",
  }).format(new Date(value));
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("en-TZ", { maximumFractionDigits: 3 }).format(value);
}

function StockHistoryContent() {
  const lang = useLang();
  const sw = lang === "sw";
  const [movements, setMovements] = useState<Movement[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState<TypeFilter>("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), type });
    if (search) params.set("search", search);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    try {
      const result = await api.get<{ movements: Movement[]; pagination: Pagination }>(`/stock/movements?${params}`, lang);
      setMovements(result.movements);
      setPagination(result.pagination);
    } catch (value) {
      setError(value instanceof Error ? value.message : (sw ? "Imeshindikana kupakia historia ya stock." : "Could not load stock history."));
    } finally {
      setLoading(false);
    }
  }, [from, lang, page, search, sw, to, type]);

  useEffect(() => { void load(); }, [load]);

  const hasFilters = Boolean(search || type !== "ALL" || from || to);
  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setType("ALL");
    setFrom("");
    setTo("");
    setPage(1);
  }

  function labelFor(value: MovementType) {
    if (value === "IN") return sw ? "Imeingia" : "Stock in";
    if (value === "OUT") return sw ? "Imetoka" : "Stock out";
    return sw ? "Marekebisho" : "Adjustment";
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><History className="h-5 w-5" /></div>
            <div>
              <h1 className="text-xl font-bold text-gray-950">{sw ? "Historia ya stock" : "Stock history"}</h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-600">{sw ? "Kagua bidhaa zilizoingia, zilizotoka na marekebisho yaliyorekodiwa. Taarifa hizi hazibadilishi stock." : "Review recorded stock in, stock out, and adjustments. Viewing this ledger does not change stock."}</p>
            </div>
          </div>
          <Link href="/inventory" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"><ArrowLeft className="h-4 w-4" />{sw ? "Hifadhi ya bidhaa" : "Inventory"}</Link>
        </header>

        <section className="space-y-3 border border-gray-200 bg-white p-4" aria-label={sw ? "Vichujio vya historia" : "History filters"}>
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-800"><SlidersHorizontal className="h-4 w-4 text-gray-500" />{sw ? "Tafuta na chuja" : "Search and filter"}</div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_170px_170px_170px_auto]">
            <label className="relative block">
              <span className="sr-only">{sw ? "Tafuta bidhaa, SKU au maelezo" : "Search product, SKU, or note"}</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={sw ? "Bidhaa, SKU au maelezo..." : "Product, SKU, or note..."} className="h-10 w-full rounded-lg border border-gray-300 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" />
            </label>
            <label className="grid gap-1 text-xs font-medium text-gray-600"><span>{sw ? "Aina ya mwendo" : "Movement type"}</span><select value={type} onChange={(event) => { setType(event.target.value as TypeFilter); setPage(1); }} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900"><option value="ALL">{sw ? "Aina zote" : "All types"}</option><option value="IN">{sw ? "Stock imeingia" : "Stock in"}</option><option value="OUT">{sw ? "Stock imetoka" : "Stock out"}</option><option value="ADJUSTMENT">{sw ? "Marekebisho" : "Adjustments"}</option></select></label>
            <label className="grid gap-1 text-xs font-medium text-gray-600"><span>{sw ? "Kuanzia" : "From date"}</span><input type="date" value={from} max={to || undefined} onChange={(event) => { setFrom(event.target.value); setPage(1); }} className="h-10 min-w-0 rounded-lg border border-gray-300 px-3 text-sm text-gray-900" /></label>
            <label className="grid gap-1 text-xs font-medium text-gray-600"><span>{sw ? "Hadi" : "To date"}</span><input type="date" value={to} min={from || undefined} onChange={(event) => { setTo(event.target.value); setPage(1); }} className="h-10 min-w-0 rounded-lg border border-gray-300 px-3 text-sm text-gray-900" /></label>
            <div className="flex items-end gap-2">
              <button type="button" onClick={() => void load()} disabled={loading} aria-label={sw ? "Pakia tena historia" : "Refresh history"} title={sw ? "Pakia tena" : "Refresh"} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
              {hasFilters && <button type="button" onClick={clearFilters} className="h-10 whitespace-nowrap rounded-lg px-2 text-xs font-semibold text-brand-700 hover:bg-brand-50">{sw ? "Futa vichujio" : "Clear filters"}</button>}
            </div>
          </div>
        </section>

        <section className="overflow-hidden border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">{sw ? "Matukio ya stock" : "Stock movements"}</h2>
            <p className="text-xs text-gray-500" aria-live="polite">{sw ? `Matukio ${pagination.total} · ukurasa ${pagination.totalPages ? page : 0} / ${pagination.totalPages}` : `${pagination.total} entries · page ${pagination.totalPages ? page : 0} of ${pagination.totalPages}`}</p>
          </div>
          {error ? <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4" role="alert"><p className="text-sm font-semibold text-red-900">{error}</p><button type="button" onClick={() => void load()} className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-lg border border-red-300 bg-white px-3 text-sm font-semibold text-red-800"><RefreshCw className="h-4 w-4" />{sw ? "Jaribu tena" : "Retry"}</button></div> : loading && movements.length === 0 ? <div className="flex min-h-48 items-center justify-center text-sm text-gray-500" role="status">{sw ? "Inapakia historia..." : "Loading stock history..."}</div> : movements.length === 0 ? <div className="flex min-h-56 flex-col items-center justify-center px-5 text-center"><History className="h-8 w-8 text-gray-300" /><p className="mt-3 text-sm font-semibold text-gray-800">{hasFilters ? (sw ? "Hakuna mwendo unaolingana na vichujio." : "No movements match these filters.") : (sw ? "Bado hakuna historia ya stock." : "No stock movements yet.")}</p><p className="mt-1 text-xs text-gray-500">{sw ? "Mabadiliko yatatokea baada ya kurekodi bidhaa, kupokea stock, kuuza au kufanya marekebisho." : "Entries appear after adding products, receiving stock, making sales, or recording adjustments."}</p></div> : <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-4 py-3 font-semibold">{sw ? "Tarehe" : "Date"}</th><th className="px-4 py-3 font-semibold">{sw ? "Bidhaa" : "Product"}</th><th className="px-4 py-3 font-semibold">{sw ? "Aina" : "Type"}</th><th className="px-4 py-3 text-right font-semibold">{sw ? "Kiasi" : "Quantity"}</th><th className="px-4 py-3 text-right font-semibold">{sw ? "Stock sasa" : "Stock now"}</th><th className="px-4 py-3 font-semibold">{sw ? "Chanzo / maelezo" : "Source / note"}</th></tr></thead>
                <tbody className="divide-y divide-gray-100">{movements.map((movement) => <tr key={movement.id} className="align-top hover:bg-gray-50/70"><td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600">{formatDate(movement.createdAt, lang)}</td><td className="px-4 py-3"><Link href={`/inventory?search=${encodeURIComponent(movement.product.name)}`} className="font-semibold text-brand-800 hover:underline">{movement.product.name}</Link>{movement.product.sku && <p className="mt-0.5 text-xs text-gray-500">SKU: {movement.product.sku}</p>}</td><td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${movement.type === "IN" ? "bg-emerald-50 text-emerald-800" : movement.type === "OUT" ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-800"}`}>{movement.type === "IN" ? <ArrowDownToLine className="h-3.5 w-3.5" /> : movement.type === "OUT" ? <ArrowUpFromLine className="h-3.5 w-3.5" /> : <SlidersHorizontal className="h-3.5 w-3.5" />}{labelFor(movement.type)}</span></td><td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{movement.type === "IN" ? "+" : movement.type === "OUT" ? "−" : ""}{formatQuantity(movement.quantity)} <span className="font-normal text-gray-500">{movement.product.unit}</span>{movement.type === "ADJUSTMENT" && <span className="block text-[10px] font-normal text-gray-500">{sw ? "stock mpya iliyowekwa" : "new set-to level"}</span>}</td><td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-700">{formatQuantity(movement.product.currentStock)} {movement.product.unit}</td><td className="max-w-sm px-4 py-3 text-xs leading-5 text-gray-600">{movement.stockReceipt?.supplier?.name && <p className="font-medium text-gray-800">{movement.stockReceipt.supplier.name}{movement.stockReceipt.invoiceNumber ? ` · ${sw ? "ankara" : "invoice"} ${movement.stockReceipt.invoiceNumber}` : ""}</p>}{movement.note || <span className="text-gray-400">{sw ? "Hakuna maelezo" : "No note"}</span>}</td></tr>)}</tbody>
              </table>
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3">
              <p className="text-xs text-gray-500">{sw ? `Inaonyesha ${movements.length} kati ya ${pagination.total} matukio` : `Showing ${movements.length} of ${pagination.total} entries`}</p>
              <div className="flex items-center gap-2"><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading} className="min-h-9 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">{sw ? "Nyuma" : "Previous"}</button><button type="button" onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} disabled={page >= pagination.totalPages || loading} className="min-h-9 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">{sw ? "Mbele" : "Next"}</button></div>
            </footer>
          </>}
        </section>
      </div>
    </AppShell>
  );
}

export default function StockHistoryPage() {
  return <StockHistoryContent />;
}
