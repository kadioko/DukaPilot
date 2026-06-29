"use client";
import { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/layout/AppShell";
import { api, formatTZS } from "@/lib/api";
import { Plus, X, ShoppingCart, Check, Minus, Search, Clock, WifiOff } from "lucide-react";
import { t, useLang } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";

interface Product {
  id: string;
  name: string;
  unit: string;
  sellingPrice: number;
  buyingPrice: number;
  wholesalePrice?: number | null;
  wholesaleMinQty?: number | null;
  currentStock: number;
}

interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
}

interface SaleRecord {
  id: string;
  totalAmount: number;
  profit: number;
  paymentMethod: string;
  createdAt: string;
  items: Array<{ quantity: number; unitPrice: number; totalPrice: number; product: { name: string; unit: string } }>;
}

interface PendingSale {
  id: string;
  createdAt: string;
  total: number;
  attempts?: number;
  lastError?: string;
  payload: {
    items: Array<{ productId: string; quantity: number; unitPrice: number }>;
    saleMode: "RETAIL" | "WHOLESALE";
    paymentMethod: string;
    paymentRef?: string;
    customerName?: string;
    customerPhone?: string;
  };
}

interface SyncEvent {
  id: string;
  at: string;
  status: "synced" | "failed" | "queued";
  total: number;
  message: string;
}

const PAYMENT_METHODS = [
  { value: "CASH", labelKey: "sales.cash", color: "gray" },
  { value: "MPESA", labelKey: "sales.mpesa", color: "green" },
  { value: "TIGOPESA", labelKey: "sales.tigopesa", color: "blue" },
  { value: "AIRTEL_MONEY", labelKey: "sales.airtel", color: "red" },
  { value: "HALOPESA", labelKey: "sales.halopesa", color: "purple" },
  { value: "BANK", labelKey: "sales.bank", color: "indigo" },
  { value: "CREDIT", labelKey: "sales.credit", color: "orange" },
];

const PENDING_SALES_KEY = "dukapilot_pending_sales";
const SYNC_HISTORY_KEY = "dukapilot_sales_sync_history";

function readPendingSales(): PendingSale[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(PENDING_SALES_KEY) || "[]");
  } catch {
    return [];
  }
}

function writePendingSales(sales: PendingSale[]) {
  window.localStorage.setItem(PENDING_SALES_KEY, JSON.stringify(sales));
}

function readSyncHistory(): SyncEvent[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(SYNC_HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeSyncHistory(events: SyncEvent[]) {
  window.localStorage.setItem(SYNC_HISTORY_KEY, JSON.stringify(events.slice(0, 10)));
}

function newLocalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function SalesPage() {
  const lang = useLang();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saleMode, setSaleMode] = useState<"RETAIL" | "WHOLESALE">("RETAIL");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentRef, setPaymentRef] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [search, setSearch] = useState("");
  const [completing, setCompleting] = useState(false);
  const [recentSales, setRecentSales] = useState<SaleRecord[]>([]);
  const [view, setView] = useState<"pos" | "history">("pos");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);
  const [syncHistory, setSyncHistory] = useState<SyncEvent[]>([]);

  useEffect(() => {
    api.get<{ products: Product[] }>("/products")
      .then((d) => setProducts(d.products.filter((p) => p.currentStock > 0)));
  }, []);

  const syncPendingSales = useCallback(async () => {
    const pending = readPendingSales();
    if (pending.length === 0) {
      setPendingSales([]);
      return;
    }

    const remaining: PendingSale[] = [];
    const events: SyncEvent[] = [];
    for (const sale of pending) {
      try {
        await api.post("/sales", sale.payload, lang);
        events.push({
          id: newLocalId(),
          at: new Date().toISOString(),
          status: "synced",
          total: sale.total,
          message: lang === "sw" ? "Sale synced successfully" : "Sale synced successfully",
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t("common.error", lang);
        const nextSale = { ...sale, attempts: (sale.attempts || 0) + 1, lastError: message };
        remaining.push(nextSale);
        events.push({
          id: newLocalId(),
          at: new Date().toISOString(),
          status: "failed",
          total: sale.total,
          message: message.includes("Insufficient stock")
            ? (lang === "sw" ? "Stock imebadilika kabla ya sync. Kagua cart na inventory." : "Stock changed before sync. Review cart and inventory.")
            : message,
        });
      }
    }
    writePendingSales(remaining);
    if (events.length > 0) {
      const nextHistory = [...events, ...readSyncHistory()];
      writeSyncHistory(nextHistory);
      setSyncHistory(nextHistory.slice(0, 10));
    }
    setPendingSales(remaining);
    if (remaining.length < pending.length) {
      toast(lang === "sw" ? "Mauzo ya offline yamesawazishwa." : "Offline sales synced.", "success");
      api.get<{ products: Product[] }>("/products")
        .then((d) => setProducts(d.products.filter((p) => p.currentStock > 0)))
        .catch(() => {});
    }
  }, [lang, toast]);

  useEffect(() => {
    setPendingSales(readPendingSales());
    setSyncHistory(readSyncHistory());
    syncPendingSales().catch(() => {});
    window.addEventListener("online", syncPendingSales);
    return () => window.removeEventListener("online", syncPendingSales);
  }, [syncPendingSales]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    const data = await api.get<{ sales: SaleRecord[] }>("/sales?limit=30");
    setRecentSales(data.sales);
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    if (view === "history") fetchHistory();
  }, [view, fetchHistory]);

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  function defaultPriceFor(product: Product): number {
    if (saleMode === "WHOLESALE" && product.wholesalePrice != null) {
      return product.wholesalePrice;
    }
    return product.sellingPrice;
  }

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id
            ? { ...i, quantity: Math.min(i.quantity + 1, product.currentStock) }
            : i
        );
      }
      return [...prev, { product, quantity: 1, unitPrice: defaultPriceFor(product) }];
    });
  }

  function updateQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) =>
          i.product.id === productId
            ? { ...i, quantity: Math.max(0, Math.min(i.quantity + delta, i.product.currentStock)) }
            : i
        )
        .filter((i) => i.quantity > 0)
    );
  }

  function updatePrice(productId: string, price: number) {
    setCart((prev) =>
      prev.map((i) => i.product.id === productId ? { ...i, unitPrice: price } : i)
    );
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  }

  const total = cart.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const profit = cart.reduce((sum, i) => sum + i.quantity * (i.unitPrice - i.product.buyingPrice), 0);

  async function completeSale() {
    if (cart.length === 0) return;
    if (paymentMethod === "CREDIT" && !customerPhone.trim()) {
      toast(lang === "sw" ? "Weka namba ya simu ya mteja kwa mauzo ya deni." : "Enter the customer phone for credit sales.", "error");
      return;
    }
    setCompleting(true);
    const payload = {
      items: cart.map((i) => ({
        productId: i.product.id,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
      saleMode,
      paymentMethod,
      paymentRef: paymentRef || undefined,
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
    };
    try {
      await api.post("/sales", payload, lang);
      toast(t("sales.completed", lang), "success");
      setCart([]);
      setPaymentRef("");
      setCustomerName("");
      setCustomerPhone("");
      // Refresh products stock
      api.get<{ products: Product[] }>("/products")
        .then((d) => setProducts(d.products.filter((p) => p.currentStock > 0)));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t("common.error", lang);
      const canQueue = typeof navigator !== "undefined" && (!navigator.onLine || message.includes("Unable to reach"));
      if (canQueue) {
        const queued = [
          ...readPendingSales(),
          { id: newLocalId(), createdAt: new Date().toISOString(), total, attempts: 0, payload },
        ];
        const queuedEvent = {
          id: newLocalId(),
          at: new Date().toISOString(),
          status: "queued" as const,
          total,
          message: lang === "sw" ? "Sale saved locally until internet returns." : "Sale saved locally until internet returns.",
        };
        const nextHistory = [queuedEvent, ...readSyncHistory()];
        writePendingSales(queued);
        writeSyncHistory(nextHistory);
        setPendingSales(queued);
        setSyncHistory(nextHistory.slice(0, 10));
        setCart([]);
        setPaymentRef("");
        setCustomerName("");
        setCustomerPhone("");
        toast(lang === "sw" ? "Mtandao haupo. Mauzo yamehifadhiwa kusubiri sync." : "Offline. Sale saved and will sync later.", "success");
      } else {
        toast(message, "error");
      }
    } finally {
      setCompleting(false);
    }
  }

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto pb-24 lg:pb-6">
        {/* Success toast */}

        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-bold text-gray-900">{t("nav.sales", lang)}</h1>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {[{ v: "pos", label: t("sales.pos", lang) }, { v: "history", label: t("sales.history", lang) }].map(({ v, label }) => (
              <button key={v} onClick={() => setView(v as "pos" | "history")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors min-h-0 ${view === v ? "bg-white text-brand-700 shadow-sm" : "text-gray-500"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {view === "pos" && (
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 uppercase tracking-wide">{t("sales.priceMode", lang)}</span>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {(["RETAIL", "WHOLESALE"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setSaleMode(m);
                    setCart((prev) => prev.map((i) => ({
                      ...i,
                      unitPrice: m === "WHOLESALE" && i.product.wholesalePrice != null
                        ? i.product.wholesalePrice
                        : i.product.sellingPrice,
                    })));
                  }}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors min-h-0 ${saleMode === m ? "bg-white text-brand-700 shadow-sm" : "text-gray-500"}`}
                >
                  {t(m === "RETAIL" ? "sales.retail" : "sales.wholesale", lang)}
                </button>
              ))}
            </div>
            </div>
            {pendingSales.length > 0 && (
              <button
                onClick={() => syncPendingSales()}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"
              >
                <WifiOff className="h-4 w-4" />
                {lang === "sw" ? `${pendingSales.length} yanangoja sync` : `${pendingSales.length} pending sync`}
              </button>
            )}
          </div>
        )}

        {view === "pos" && (pendingSales.length > 0 || syncHistory.length > 0) && (
          <section className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-amber-950">{lang === "sw" ? "Offline sales sync" : "Offline sales sync"}</p>
                <p className="text-xs text-amber-800">
                  {pendingSales.length > 0
                    ? (lang === "sw" ? `${pendingSales.length} sale zinasubiri. Kila sale itajaribu tena internet ikirudi.` : `${pendingSales.length} sale(s) waiting. Each sale retries when internet returns.`)
                    : (lang === "sw" ? "Hakuna sale inayosubiri sync." : "No sales are waiting to sync.")}
                </p>
              </div>
              {pendingSales.some((sale) => sale.lastError) && (
                <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                  {lang === "sw" ? "Kagua hitilafu" : "Review errors"}
                </span>
              )}
            </div>
            {syncHistory.length > 0 && (
              <div className="mt-3 grid gap-2">
                {syncHistory.slice(0, 3).map((event) => (
                  <div key={event.id} className="flex items-start justify-between gap-3 rounded-lg bg-white/70 px-3 py-2 text-xs">
                    <div>
                      <p className={`font-semibold ${event.status === "failed" ? "text-red-700" : event.status === "synced" ? "text-green-700" : "text-amber-800"}`}>
                        {event.status.toUpperCase()} - {formatTZS(event.total)}
                      </p>
                      <p className="mt-0.5 text-gray-600">{event.message}</p>
                    </div>
                    <p className="whitespace-nowrap text-gray-400">{new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {view === "pos" ? (
          <div className="lg:grid lg:grid-cols-2 lg:gap-6">
            {/* Product picker */}
            <div>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("inventory.search", lang)}
                  className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-[50vh] lg:max-h-[60vh] overflow-y-auto">
                {filtered.map((p) => {
                  const inCart = cart.find((i) => i.product.id === p.id);
                  return (
                    <button key={p.id} onClick={() => addToCart(p)}
                      className={`text-left p-3 rounded-xl border transition-all ${inCart ? "border-brand-400 bg-brand-50" : "border-gray-200 bg-white hover:border-brand-300"}`}>
                      <p className="text-sm font-medium text-gray-800 leading-tight">{p.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{p.currentStock} {p.unit} {t("dashboard.remaining", lang)}</p>
                      <p className="text-sm font-bold text-brand-700 mt-1">{formatTZS(defaultPriceFor(p))}</p>
                      {saleMode === "WHOLESALE" && p.wholesalePrice == null && (
                        <p className="text-[10px] text-amber-600 mt-0.5">{t("sales.noWholesalePrice", lang)}</p>
                      )}
                      {p.wholesalePrice != null && p.wholesaleMinQty != null && (
                        <p className="text-[10px] text-gray-400 mt-0.5">{t("sales.wholesaleMinHint", lang).replace("{n}", String(p.wholesaleMinQty))}</p>
                      )}
                      {inCart && (
                        <span className="text-xs bg-brand-600 text-white px-1.5 py-0.5 rounded-full">
                          x{inCart.quantity}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Cart */}
            <div className="mt-4 lg:mt-0">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <ShoppingCart className="w-4 h-4 text-gray-500" />
                  <h2 className="font-semibold text-gray-800 text-sm">{t("sales.cart", lang)} ({cart.length})</h2>
                </div>

                {cart.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{t("sales.chooseProduct", lang)}</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3 mb-4 max-h-48 overflow-y-auto">
                      {cart.map((item) => (
                        <div key={item.product.id} className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-800 truncate">{item.product.name}</p>
                            <input
                              type="number"
                              value={item.unitPrice}
                              onChange={(e) => updatePrice(item.product.id, Number(e.target.value))}
                              className="text-xs text-brand-600 font-bold w-24 border-b border-dashed border-gray-300 focus:outline-none bg-transparent"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => updateQty(item.product.id, -1)} className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center min-h-0">
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                            <button onClick={() => updateQty(item.product.id, 1)} className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center min-h-0">
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <span className="text-xs font-bold text-gray-800 w-16 text-right">
                            {formatTZS(item.quantity * item.unitPrice)}
                          </span>
                          <button onClick={() => removeFromCart(item.product.id)} className="text-gray-300 hover:text-red-400 min-h-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-gray-100 pt-3 mb-4 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{t("sales.total", lang)}</span>
                        <span className="font-bold text-gray-900">{formatTZS(total)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{t("sales.profit", lang)}</span>
                        <span className="font-bold text-green-600">{formatTZS(profit)}</span>
                      </div>
                    </div>

                    <div className="mb-3">
                      <p className="text-xs font-medium text-gray-600 mb-2">{t("sales.payment", lang)}</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {PAYMENT_METHODS.map((m) => (
                          <button key={m.value} onClick={() => setPaymentMethod(m.value)}
                            className={`py-1.5 rounded-lg text-xs font-medium border transition-colors min-h-0 ${paymentMethod === m.value ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 border-gray-200"}`}>
                            {t(m.labelKey, lang)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {paymentMethod !== "CASH" && paymentMethod !== "CREDIT" && (
                      <input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)}
                        placeholder={t("sales.paymentReference", lang)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    )}

                    {paymentMethod === "CREDIT" && (
                      <div className="mb-3 grid gap-2 sm:grid-cols-2">
                        <input
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder={lang === "sw" ? "Jina la mteja (hiari)" : "Customer name (optional)"}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                        <input
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          placeholder={lang === "sw" ? "Simu ya mteja *" : "Customer phone *"}
                          type="tel"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                    )}

                    <button onClick={completeSale} disabled={completing || cart.length === 0}
                      className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors">
                      <Check className="w-4 h-4" />
                      {completing ? t("sales.saving", lang) : `${t("sales.complete", lang)} • ${formatTZS(total)}`}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div>
            {historyLoading ? (
              <div className="text-center py-16 text-gray-400">{t("common.loading", lang)}</div>
            ) : recentSales.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>{t("sales.noSales", lang)}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentSales.map((sale) => (
                  <div key={sale.id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-gray-900">{formatTZS(sale.totalAmount)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(sale.createdAt).toLocaleString(lang === "sw" ? "sw-TZ" : "en-US", {
                            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {t(PAYMENT_METHODS.find((m) => m.value === sale.paymentMethod)?.labelKey || "sales.cash", lang)}
                        </span>
                        <p className="text-sm font-bold text-green-600 mt-1">+{formatTZS(sale.profit)}</p>
                      </div>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {sale.items.map((item, i) => (
                        <p key={i} className="text-xs text-gray-500 py-0.5">
                          {item.product.name} × {item.quantity} @ {formatTZS(item.unitPrice)}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
