"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, ArrowLeft, Store, Package } from "lucide-react";
import { api, formatTZS } from "@/lib/api";
import { t, useLang, setLanguage as setAppLanguage } from "@/lib/i18n";
import LogoMark from "@/components/brand/LogoMark";

interface Shop {
  id: string;
  name: string;
  location: string;
  district?: string | null;
  category: string;
  productCount: number;
}

interface CatalogProduct {
  id: string;
  name: string;
  unit: string;
  sellingPrice: number;
  wholesalePrice?: number | null;
  wholesaleMinQty?: number | null;
  currentStock: number;
  shop: { id: string; name: string; location: string; category: string };
}

export default function CatalogPage() {
  const lang = useLang();
  const [shops, setShops] = useState<Shop[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [shopId, setShopId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ shops: Shop[] }>("/public/shops").then((d) => setShops(d.shops)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (shopId) params.set("shopId", shopId);
    if (search) params.set("search", search);
    const q = params.toString();
    api
      .get<{ products: CatalogProduct[] }>(`/public/products${q ? `?${q}` : ""}`)
      .then((d) => setProducts(d.products))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [shopId, search]);

  const grouped = useMemo(() => {
    const map: Record<string, { shop: CatalogProduct["shop"]; items: CatalogProduct[] }> = {};
    for (const p of products) {
      if (!map[p.shop.id]) map[p.shop.id] = { shop: p.shop, items: [] };
      map[p.shop.id].items.push(p);
    }
    return Object.values(map);
  }, [products]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/"
            aria-label={t("catalog.backToLogin", lang)}
            className="text-gray-500 hover:text-gray-800 min-h-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <LogoMark className="h-8 w-8 rounded-lg flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-bold text-sm text-gray-900 truncate">{t("catalog.title", lang)}</p>
              <p className="text-xs text-gray-500 truncate">{t("catalog.subtitle", lang)}</p>
            </div>
          </div>
          <div className="hidden sm:flex gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setAppLanguage("sw")}
              className={`px-2 py-1 rounded-md text-xs font-semibold min-h-0 ${lang === "sw" ? "bg-white text-brand-700 shadow-sm" : "text-gray-500"}`}
            >
              {t("app.swahili", lang)}
            </button>
            <button
              onClick={() => setAppLanguage("en")}
              className={`px-2 py-1 rounded-md text-xs font-semibold min-h-0 ${lang === "en" ? "bg-white text-brand-700 shadow-sm" : "text-gray-500"}`}
            >
              {t("app.english", lang)}
            </button>
          </div>
          <Link
            href="/"
            className="text-xs sm:text-sm font-semibold text-brand-700 hover:underline whitespace-nowrap"
          >
            {t("catalog.loginCta", lang)}
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 pb-12">
        <div className="flex flex-col sm:flex-row gap-2 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t("catalog.search", lang)}
              placeholder={t("catalog.search", lang)}
              className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <select
            value={shopId}
            onChange={(e) => setShopId(e.target.value)}
            aria-label={t("catalog.filterShop", lang)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-0 sm:min-w-[220px]"
          >
            <option value="">{t("catalog.allShops", lang)}</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.productCount})
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">{t("common.loading", lang)}</div>
        ) : products.length === 0 ? (
          <div className="text-center py-16">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">{t("catalog.noProducts", lang)}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(({ shop, items }) => (
              <section key={shop.id}>
                <div className="flex items-center gap-2 mb-3">
                  <Store className="w-4 h-4 text-brand-600" />
                  <h2 className="font-semibold text-gray-900 text-sm">{shop.name}</h2>
                  <span className="text-xs text-gray-400">• {shop.location}</span>
                  <Link href={`/catalog/${shop.id}`} className="ml-auto text-xs font-semibold text-brand-700 hover:underline whitespace-nowrap">
                    {t("catalog.viewShop", lang)}
                  </Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map((p) => (
                    <article
                      key={p.id}
                      className="bg-white border border-gray-200 rounded-xl p-4 hover:border-brand-300 transition-colors"
                    >
                      <p className="font-medium text-gray-900 text-sm leading-tight">{p.name}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {p.currentStock} {p.unit} {t("catalog.inStock", lang)}
                      </p>
                      <div className="mt-3 space-y-0.5">
                        <p className="text-sm">
                          <span className="text-gray-500">{t("catalog.retail", lang)}: </span>
                          <span className="font-bold text-brand-700">{formatTZS(p.sellingPrice)}</span>
                          <span className="text-gray-400"> / {p.unit}</span>
                        </p>
                        {p.wholesalePrice != null && (
                          <p className="text-xs text-gray-600">
                            {t("catalog.wholesale", lang)}:{" "}
                            <span className="font-semibold text-gray-800">{formatTZS(p.wholesalePrice)}</span>
                            {p.wholesaleMinQty != null && (
                              <span className="text-gray-400">
                                {" "}
                                ({t("catalog.from", lang)} {p.wholesaleMinQty}+)
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
