"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { api, formatTZS } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { activePromotionPrice } from "@/lib/productPricing";

type PriceProduct = { id: string; name: string; unit: string; sku: string | null; sellingPrice: number; wholesalePrice: number | null; wholesaleMinQty: number | null; promotionPrice: number | null; promotionStartsAt: string | null; promotionEndsAt: string | null };

export default function SalePricesPage() {
  const lang = useLang();
  const [search, setSearch] = useState("");
  const [settledSearch, setSettledSearch] = useState("");
  const [page, setPage] = useState(1);
  const [products, setProducts] = useState<PriceProduct[]>([]);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => { const timer = window.setTimeout(() => setSettledSearch(search.trim()), 300); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), search: settledSearch });
    api.get<{ products: PriceProduct[]; pagination: { totalPages: number } }>(`/products/prices?${params}`, lang)
      .then((result) => { if (active) { setProducts(result.products); setPages(result.pagination.totalPages); } })
      .catch((reason: unknown) => { if (active) { setProducts([]); setError(reason instanceof Error ? reason.message : (lang === "sw" ? "Bei hazikupakia." : "Could not load prices.")); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [settledSearch, page, retry, lang]);

  return <AppShell><div className="mx-auto max-w-4xl space-y-4 pb-24">
    <h1 className="text-xl font-bold text-gray-950">{lang === "sw" ? "Bei za kuuza" : "Sale prices"}</h1>
    <label className="relative block"><span className="sr-only">{lang === "sw" ? "Tafuta bidhaa" : "Search products"}</span><Search aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-gray-400" /><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={lang === "sw" ? "Tafuta jina, SKU au barcode" : "Search name, SKU or barcode"} className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm" /></label>
    {error && <div role="alert" className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error} <button onClick={() => setRetry((n) => n + 1)} className="font-semibold underline">{lang === "sw" ? "Jaribu tena" : "Retry"}</button></div>}
    {loading ? <p role="status" className="text-sm text-gray-600">{lang === "sw" ? "Inapakia..." : "Loading..."}</p> : !error && products.length === 0 ? <p className="text-sm text-gray-600">{lang === "sw" ? "Hakuna bidhaa zilizopatikana." : "No products found."}</p> : <div className="divide-y divide-gray-200 border-y border-gray-200 bg-white">{products.map((p) => <article key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3"><div className="min-w-0"><h2 className="break-words text-sm font-semibold text-gray-950">{p.name}</h2><p className="text-xs text-gray-500">{p.sku || p.unit}</p></div><div className="text-right text-sm"><p>{lang === "sw" ? "Rejareja" : "Retail"}: <strong>{formatTZS(activePromotionPrice(p))}</strong></p><p className="text-gray-600">{lang === "sw" ? "Jumla" : "Wholesale"}: {p.wholesalePrice == null ? "-" : formatTZS(p.wholesalePrice)}{p.wholesaleMinQty != null && p.wholesalePrice != null ? ` (${p.wholesaleMinQty}+)` : ""}</p></div></article>)}</div>}
    {pages > 1 && <div className="flex items-center justify-between text-sm"><button disabled={page <= 1} onClick={() => setPage((n) => n - 1)} className="rounded border px-3 py-2 disabled:opacity-40">{lang === "sw" ? "Iliyotangulia" : "Previous"}</button><span>{page} / {pages}</span><button disabled={page >= pages} onClick={() => setPage((n) => n + 1)} className="rounded border px-3 py-2 disabled:opacity-40">{lang === "sw" ? "Inayofuata" : "Next"}</button></div>}
  </div></AppShell>;
}
