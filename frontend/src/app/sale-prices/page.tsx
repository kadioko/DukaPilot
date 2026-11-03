"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, PackageSearch, Search, X } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { api, formatTZS } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { activePromotionPrice } from "@/lib/productPricing";

type PriceProduct = { id: string; name: string; unit: string; sku: string | null; sellingPrice: number; wholesalePrice: number | null; wholesaleMinQty: number | null; promotionPrice: number | null; promotionStartsAt: string | null; promotionEndsAt: string | null };

export default function SalePricesPage() {
  const lang = useLang();
  const sw = lang === "sw";
  const [search, setSearch] = useState("");
  const [settledSearch, setSettledSearch] = useState("");
  const [page, setPage] = useState(1);
  const [products, setProducts] = useState<PriceProduct[]>([]);
  const [pages, setPages] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettledSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), search: settledSearch });
    api.get<{ products: PriceProduct[]; pagination: { totalPages: number; total?: number } }>(`/products/prices?${params}`, lang)
      .then((result) => {
        if (active) {
          setProducts(result.products);
          setPages(result.pagination.totalPages);
          setTotal(result.pagination.total ?? null);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setProducts([]);
          setTotal(null);
          setError(reason instanceof Error ? reason.message : (sw ? "Bei hazikupakia." : "Could not load prices."));
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [settledSearch, page, retry, lang, sw]);

  return <AppShell>
    <div className="mx-auto max-w-5xl space-y-5 pb-24">
      <header className="border-b border-gray-200 pb-4">
        <h1 className="text-xl font-bold text-gray-950 sm:text-2xl">{sw ? "Bei za kuuza" : "Sale prices"}</h1>
        <p className="mt-1 text-sm text-gray-500">{sw ? "Rejareja na jumla" : "Retail and wholesale"}</p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative block w-full sm:max-w-md">
          <span className="sr-only">{sw ? "Tafuta bidhaa" : "Search products"}</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={sw ? "Tafuta jina, SKU au barcode" : "Search name, SKU or barcode"} className="h-11 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-11 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100" />
          {search && <button type="button" onClick={() => { setSearch(""); setPage(1); }} aria-label={sw ? "Futa utafutaji" : "Clear search"} title={sw ? "Futa utafutaji" : "Clear search"} className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button>}
        </label>
        {!loading && !error && total !== null && <p className="text-sm text-gray-500" aria-live="polite">{total.toLocaleString()} {sw ? "bidhaa" : total === 1 ? "product" : "products"}</p>}
      </div>

      {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error} <button onClick={() => setRetry((n) => n + 1)} className="ml-1 font-semibold underline">{sw ? "Jaribu tena" : "Retry"}</button></div>}
      {loading ? <div role="status" className="py-10 text-center text-sm text-gray-500">{sw ? "Inapakia bei..." : "Loading prices..."}</div> : !error && products.length === 0 ? <div className="border-y border-gray-200 py-12 text-center">
        <PackageSearch aria-hidden="true" className="mx-auto h-8 w-8 text-gray-400" />
        <p className="mt-3 text-sm font-semibold text-gray-800">{sw ? "Hakuna bidhaa zilizopatikana" : "No products found"}</p>
        {settledSearch && <p className="mt-1 text-sm text-gray-500">{sw ? "Jaribu jina au namba nyingine." : "Try another name or code."}</p>}
      </div> : !error && <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
        <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_minmax(130px,180px)_minmax(130px,180px)] gap-5 border-b border-gray-200 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase text-gray-500 sm:grid">
          <span>{sw ? "Bidhaa" : "Product"}</span><span>{sw ? "Rejareja" : "Retail"}</span><span>{sw ? "Jumla" : "Wholesale"}</span>
        </div>
        <div className="divide-y divide-gray-100">
          {products.map((product) => {
            const retailPrice = activePromotionPrice(product);
            const onOffer = retailPrice !== product.sellingPrice;
            return <article key={product.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(130px,180px)_minmax(130px,180px)] sm:items-center sm:gap-5 sm:px-5">
              <div className="min-w-0">
                <h2 className="break-words text-sm font-semibold leading-5 text-gray-950">{product.name}</h2>
                <p className="mt-1 break-words text-xs text-gray-500">{product.unit}{product.sku ? ` · SKU: ${product.sku}` : ""}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:contents">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 sm:sr-only">{sw ? "Rejareja" : "Retail"}:</p>
                  <p className="break-words text-sm font-semibold text-gray-950"><span className="sr-only">{sw ? "Rejareja: " : "Retail: "}</span>{formatTZS(retailPrice)}</p>
                  {onOffer && <p className="mt-1 text-xs text-emerald-700"><span className="font-semibold">{sw ? "OFA" : "OFFER"}</span> <span className="text-gray-500 line-through">{formatTZS(product.sellingPrice)}</span></p>}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 sm:sr-only">{sw ? "Jumla" : "Wholesale"}:</p>
                  <p className="break-words text-sm font-semibold text-gray-800"><span className="sr-only">{sw ? "Jumla: " : "Wholesale: "}</span>{product.wholesalePrice == null ? (sw ? "Haijawekwa" : "Not set") : formatTZS(product.wholesalePrice)}</p>
                  {product.wholesaleMinQty != null && product.wholesalePrice != null && <p className="mt-1 text-xs text-gray-500">{sw ? "Kuanzia" : "From"} {product.wholesaleMinQty.toLocaleString()} {product.unit}</p>}
                </div>
              </div>
            </article>;
          })}
        </div>
      </div>}
      {!loading && !error && pages > 1 && <nav aria-label={sw ? "Kurasa za bei" : "Price pages"} className="flex items-center justify-between gap-2 text-sm">
        <button disabled={page <= 1} onClick={() => setPage((n) => n - 1)} className="inline-flex min-h-10 items-center gap-1 rounded-md border border-gray-300 bg-white px-3 font-medium text-gray-700 disabled:opacity-40"><ChevronLeft aria-hidden="true" className="h-4 w-4" />{sw ? "Iliyotangulia" : "Previous"}</button>
        <span className="text-gray-600">{sw ? "Ukurasa" : "Page"} {page} / {pages}</span>
        <button disabled={page >= pages} onClick={() => setPage((n) => n + 1)} className="inline-flex min-h-10 items-center gap-1 rounded-md border border-gray-300 bg-white px-3 font-medium text-gray-700 disabled:opacity-40">{sw ? "Inayofuata" : "Next"}<ChevronRight aria-hidden="true" className="h-4 w-4" /></button>
      </nav>}
    </div>
  </AppShell>;
}
