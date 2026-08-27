"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { api, formatTZS, getCurrentSession } from "@/lib/api";
import { Plus, X, ShoppingCart, Check, Minus, Search, Clock, WifiOff, RefreshCw, Trash2, ScanLine, MessageCircle, RotateCcw, ReceiptText, AlertTriangle, PackagePlus } from "lucide-react";
import { t, useLang } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import { BarcodeScanner } from "@/components/barcode/BarcodeScanner";
import DateSelect from "@/components/ui/DateSelect";
import { normalizeWhatsAppNumber } from "@/lib/phone";
import ReceiptActions from "@/components/sales/ReceiptActions";

interface Product {
  id: string;
  name: string;
  unit: string;
  sellingPrice: number;
  buyingPrice: number | null;
  wholesalePrice?: number | null;
  wholesaleMinQty?: number | null;
  currentStock: number;
  barcode?: string | null;
  expiryDate?: string | null;
  doesNotExpire?: boolean;
}

interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
}

interface SaleRecord {
  id: string;
  totalAmount: number;
  profit: number | null;
  paymentMethod: string;
  createdAt: string;
  receiptNumber?: number | null;
  status?: "COMPLETED" | "VOIDED";
  voidReason?: string | null;
  customerPhone?: string | null;
  shop?: { name: string };
  items: Array<{ quantity: number; unitPrice: number; totalPrice: number; name?: string | null; unit?: string | null; product?: { id: string; name: string; unit: string } | null }>;
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

interface CustomerRecord {
  name: string;
  phone: string;
  openBalance: number;
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
const SYNC_DEVICE_KEY = "dukapilot_sync_device_id";
const SYNC_DEVICE_LABEL_KEY = "dukapilot_sync_device_label";

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

function getSyncDeviceId() {
  if (typeof window === "undefined") return "server";
  const existing = window.localStorage.getItem(SYNC_DEVICE_KEY);
  if (existing) return existing;
  const next = newLocalId();
  window.localStorage.setItem(SYNC_DEVICE_KEY, next);
  return next;
}

function getSyncDeviceLabel() {
  if (typeof window === "undefined") return "Server device";
  const existing = window.localStorage.getItem(SYNC_DEVICE_LABEL_KEY);
  if (existing) return existing;
  const deviceId = getSyncDeviceId();
  const next = `Shop phone ${deviceId.slice(0, 4)}`;
  window.localStorage.setItem(SYNC_DEVICE_LABEL_KEY, next);
  return next;
}

function reportSyncEvent(event: { status: "QUEUED" | "SYNCED" | "FAILED" | "REMOVED"; total?: number; message?: string; attempts?: number; localId?: string }) {
  api.post("/sync/events", { ...event, deviceId: getSyncDeviceId(), deviceLabel: getSyncDeviceLabel() }).catch(() => {});
}

function formatSyncTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function isExpired(product: Product) {
  if (product.doesNotExpire || !product.expiryDate) return false;
  const expiry = new Date(product.expiryDate);
  const today = new Date();
  expiry.setHours(23, 59, 59, 999);
  return expiry < today;
}

function receiptLabel(sale: SaleRecord) {
  return sale.receiptNumber ? `DP-${String(sale.receiptNumber).padStart(6, "0")}` : sale.id.slice(-8).toUpperCase();
}

export default function SalesPage() {
  const lang = useLang();
  const { toast } = useToast();
  const syncingRef = useRef(false);
  const cartPanelRef = useRef<HTMLDivElement>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productPage, setProductPage] = useState(1);
  const [productTotal, setProductTotal] = useState(0);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productRevision, setProductRevision] = useState(0);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saleMode, setSaleMode] = useState<"RETAIL" | "WHOLESALE">("RETAIL");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentRef, setPaymentRef] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [creditDueDate, setCreditDueDate] = useState("");
  const [amountTendered, setAmountTendered] = useState("");
  const [search, setSearch] = useState("");
  const [completing, setCompleting] = useState(false);
  const [recentSales, setRecentSales] = useState<SaleRecord[]>([]);
  const [view, setView] = useState<"pos" | "history">("pos");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);
  const [syncHistory, setSyncHistory] = useState<SyncEvent[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [assistantIntent, setAssistantIntent] = useState("");
  const [canViewFinancials, setCanViewFinancials] = useState(true);
  const [canManageStock, setCanManageStock] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [completedSale, setCompletedSale] = useState<SaleRecord | null>(null);
  const [completedChange, setCompletedChange] = useState<number | null>(null);
  const [restockProduct, setRestockProduct] = useState<Product | null>(null);
  const [restockQuantity, setRestockQuantity] = useState("");
  const [restocking, setRestocking] = useState(false);
  const [voidingSaleId, setVoidingSaleId] = useState<string | null>(null);
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);
  const [shopName, setShopName] = useState("DukaPilot");
  const scannerBuffer = useRef("");
  const scannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getCurrentSession<{ user: { role: string; staff?: { permissions?: { canViewReports?: boolean; canManageStock?: boolean } } } }>()
      .then((data) => {
        setCanViewFinancials(data.user.role !== "MERCHANT" || !data.user.staff || Boolean(data.user.staff.permissions?.canViewReports));
        setCanManageStock(data.user.role === "ADMIN" || !data.user.staff || Boolean(data.user.staff.permissions?.canManageStock));
      })
      .catch(() => setCanViewFinancials(false));
    api.get<{ customers: CustomerRecord[] }>("/debts/customers")
      .then((d) => setCustomers(d.customers))
      .catch(() => setCustomers([]));
    api.get<{ settings: { shop?: { name?: string } } }>("/settings")
      .then((data) => setShopName(data.settings.shop?.name || "DukaPilot"))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoadingProducts(true);
      try {
        const query = new URLSearchParams({ page: String(productPage), limit: "100" });
        if (search.trim()) query.set("search", search.trim());
        const data = await api.get<{ products: Product[]; pagination: { total: number } }>(`/products?${query.toString()}`);
        if (cancelled) return;
        setProducts((current) => {
          if (productPage === 1) return data.products;
          const known = new Set(current.map((product) => product.id));
          return [...current, ...data.products.filter((product) => !known.has(product.id))];
        });
        setProductTotal(data.pagination.total);
      } catch {
        if (!cancelled) {
          setProducts([]);
          setProductTotal(0);
        }
      } finally {
        if (!cancelled) setLoadingProducts(false);
      }
    }, search.trim() ? 250 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [productPage, productRevision, search]);

  const refreshProducts = useCallback(() => {
    setProductPage(1);
    setProductRevision((current) => current + 1);
  }, []);

  const syncPendingSales = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    const pending = readPendingSales();
    if (pending.length === 0) {
      setPendingSales([]);
      setLastSyncAt(new Date().toISOString());
      syncingRef.current = false;
      setSyncing(false);
      return;
    }

    try {
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
            message: lang === "sw" ? "Mauzo yamesawazishwa." : "Sale synced successfully",
          });
          reportSyncEvent({ status: "SYNCED", total: sale.total, message: "Sale synced successfully", attempts: sale.attempts || 0, localId: sale.id });
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
              ? (lang === "sw" ? "Kiasi cha bidhaa kilibadilika kabla ya kusawazisha. Kagua kikapu na bidhaa dukani." : "Stock changed before sync. Review cart and inventory.")
              : message,
          });
          reportSyncEvent({ status: "FAILED", total: sale.total, message, attempts: nextSale.attempts, localId: sale.id });
        }
      }
      writePendingSales(remaining);
      if (events.length > 0) {
        const nextHistory = [...events, ...readSyncHistory()];
        writeSyncHistory(nextHistory);
        setSyncHistory(nextHistory.slice(0, 10));
      }
      setPendingSales(remaining);
      setLastSyncAt(new Date().toISOString());
      if (remaining.length < pending.length) {
        toast(lang === "sw" ? "Mauzo ya bila intaneti yamesawazishwa." : "Offline sales synced.", "success");
        refreshProducts();
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [lang, refreshProducts, toast]);

  useEffect(() => {
    setPendingSales(readPendingSales());
    setSyncHistory(readSyncHistory());
    setIsOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    syncPendingSales().catch(() => {});
    const handleOnline = () => {
      setIsOnline(true);
      syncPendingSales().catch(() => {});
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncPendingSales]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const intent = params.get("intent") || "";
    const method = params.get("method");
    const phone = params.get("customerPhone") || params.get("phone");
    const name = params.get("customer") || params.get("customerName");
    const productSearch = params.get("search");
    if (intent) {
      setAssistantIntent(intent);
      setView("pos");
    }
    if (productSearch) setSearch(productSearch);
    if (method && PAYMENT_METHODS.some((item) => item.value === method)) setPaymentMethod(method);
    if (phone) {
      setCustomerPhone(phone);
      setPaymentMethod("CREDIT");
    }
    if (name) setCustomerName(name);
  }, []);

  function clearSyncHistory() {
    writeSyncHistory([]);
    setSyncHistory([]);
  }

  function removePendingSale(id: string) {
    const sale = pendingSales.find((item) => item.id === id);
    if (!sale?.lastError) return;
    const confirmed = window.confirm(lang === "sw"
      ? "Ondoa sale hii ya offline? Fanya hivi tu kama umeirekodi kwa mkono."
      : "Remove this offline sale? Only do this if you recorded it manually.");
    if (!confirmed) return;
    const nextPending = pendingSales.filter((item) => item.id !== id);
    writePendingSales(nextPending);
    setPendingSales(nextPending);
    reportSyncEvent({ status: "REMOVED", total: sale.total, message: sale.lastError, attempts: sale.attempts || 0, localId: sale.id });
    toast(lang === "sw" ? "Mauzo ya bila intaneti yameondolewa." : "Offline sale removed.", "success");
  }

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    const data = await api.get<{ sales: SaleRecord[] }>("/sales?limit=30");
    setRecentSales(data.sales);
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    if (view === "history") fetchHistory();
  }, [view, fetchHistory]);

  const hiddenOutOfStock = products.filter((p) => p.currentStock <= 0).length;
  const hiddenExpired = products.filter((p) => p.currentStock > 0 && isExpired(p)).length;
  const filtered = products;

  function defaultPriceFor(product: Product): number {
    if (saleMode === "WHOLESALE" && product.wholesalePrice != null) {
      return product.wholesalePrice;
    }
    return product.sellingPrice;
  }

  function addToCart(product: Product) {
    if (product.currentStock <= 0) {
      toast(lang === "sw" ? `Stock ya ${product.name} imeisha.` : `${product.name} is out of stock.`, "error");
      return;
    }
    if (isExpired(product)) {
      toast(lang === "sw" ? `${product.name} imeisha muda na haiwezi kuuzwa.` : `${product.name} is expired and cannot be sold.`, "error");
      return;
    }
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

  function signalScanSuccess() {
    if (navigator.vibrate) navigator.vibrate(60);
    try { const ctx = new AudioContext(); const tone = ctx.createOscillator(); const gain = ctx.createGain(); tone.frequency.value = 880; gain.gain.value = 0.05; tone.connect(gain); gain.connect(ctx.destination); tone.start(); tone.stop(ctx.currentTime + 0.08); } catch { /* Audio is optional. */ }
  }

  const handleBarcode = useCallback(async (value: string) => {
    const normalized = value.trim().toUpperCase();
    try {
      const data = await api.get<{ product: Product }>(`/barcodes/lookup/${encodeURIComponent(normalized)}?context=POS`, lang);
      addToCart(data.product);
      signalScanSuccess();
      toast(lang === "sw" ? `${data.product.name} imeongezwa.` : `${data.product.name} added.`, "success");
      setScannerOpen(false);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "This barcode was not found.") {
        setScannerOpen(false);
        setUnknownBarcode(normalized);
      }
      else toast(error instanceof Error ? error.message : "Unable to scan barcode", "error");
    }
  }, [lang, toast]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || scannerOpen) return;
      if (event.key === "Enter" && scannerBuffer.current.length >= 4) { const value = scannerBuffer.current; scannerBuffer.current = ""; if (scannerTimer.current) clearTimeout(scannerTimer.current); handleBarcode(value); return; }
      if (event.key.length !== 1) return;
      scannerBuffer.current += event.key;
      if (scannerTimer.current) clearTimeout(scannerTimer.current);
      scannerTimer.current = setTimeout(() => { scannerBuffer.current = ""; }, 180);
    };
    window.addEventListener("keydown", keydown);
    return () => { window.removeEventListener("keydown", keydown); if (scannerTimer.current) clearTimeout(scannerTimer.current); };
  }, [handleBarcode, scannerOpen]);

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
  const changeDue = Number(amountTendered || 0) - total;
  const cashShort = paymentMethod === "CASH" && Boolean(amountTendered) && changeDue < 0;
  const profit = canViewFinancials ? cart.reduce((sum, i) => sum + i.quantity * (i.unitPrice - (i.product.buyingPrice || 0)), 0) : 0;

  function updateCustomerFromPhone(phone: string) {
    setCustomerPhone(phone);
    const normalized = phone.replace(/\D/g, "").replace(/^0/, "255");
    const match = customers.find((customer) => customer.phone.replace(/\D/g, "") === normalized);
    if (match?.name) setCustomerName(match.name);
  }

  function shareReceipt(sale: SaleRecord, change: number | null = null) {
    const lines = [
      sale.shop?.name || "DukaPilot",
      `${lang === "sw" ? "Risiti" : "Receipt"}: ${receiptLabel(sale)}`,
      new Date(sale.createdAt).toLocaleString(lang === "sw" ? "sw-TZ" : "en-TZ"),
      "",
      ...sale.items.map((item) => `${item.product?.name || item.name || "Custom service"} x${item.quantity} - ${formatTZS(item.totalPrice)}`),
      "",
      `${lang === "sw" ? "Jumla" : "Total"}: ${formatTZS(sale.totalAmount)}`,
      `${lang === "sw" ? "Malipo" : "Payment"}: ${t(PAYMENT_METHODS.find((method) => method.value === sale.paymentMethod)?.labelKey || "sales.cash", lang)}`,
      ...(change != null && change > 0 ? [`${lang === "sw" ? "Chenji" : "Change"}: ${formatTZS(change)}`] : []),
      lang === "sw" ? "Asante kwa kununua." : "Thank you for your purchase.",
    ];
    let phone = normalizeWhatsAppNumber(sale.customerPhone);
    if (!phone) {
      const entered = window.prompt(lang === "sw" ? "Weka namba ya WhatsApp ya kupokea risiti (mfano 0712345678):" : "Enter the WhatsApp number that should receive this receipt (for example 0712345678):");
      if (!entered) {
        toast(lang === "sw" ? "Risiti haijatumwa. Weka namba ya mteja ili kuendelea." : "Receipt not shared. Enter a customer number to continue.", "info");
        return;
      }
      phone = normalizeWhatsAppNumber(entered);
      if (!phone) {
        toast(lang === "sw" ? "Namba ya WhatsApp si sahihi. Tumia 07XXXXXXXX au +2557XXXXXXXX." : "Invalid WhatsApp number. Use 07XXXXXXXX or +2557XXXXXXXX.", "error");
        return;
      }
    }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank", "noopener,noreferrer");
  }

  async function voidSale(sale: SaleRecord) {
    const reason = window.prompt(lang === "sw" ? "Sababu ya kufuta mauzo haya (itahifadhiwa kwenye rekodi ya ukaguzi):" : "Reason for voiding this sale (saved in the audit trail):");
    if (!reason?.trim()) return;
    if (!window.confirm(lang === "sw" ? "Thibitisha: stock itarudishwa na mauzo yataondolewa kwenye ripoti." : "Confirm: stock will be restored and the sale removed from reports.")) return;
    setVoidingSaleId(sale.id);
    try {
      await api.patch(`/sales/${sale.id}/void`, { reason: reason.trim() }, lang);
      toast(lang === "sw" ? `Mauzo ${receiptLabel(sale)} yamefutwa na stock imerudishwa.` : `Sale ${receiptLabel(sale)} was voided and stock restored.`, "success");
      await fetchHistory();
      refreshProducts();
    } catch (error: unknown) {
      toast(error instanceof Error ? error.message : t("common.error", lang), "error");
    } finally {
      setVoidingSaleId(null);
    }
  }

  async function completeSale() {
    if (cart.length === 0) return;
    if (paymentMethod === "CREDIT" && !customerPhone.trim()) {
      toast(lang === "sw" ? "Weka namba ya simu ya mteja kwa mauzo ya deni." : "Enter the customer phone for credit sales.", "error");
      return;
    }
    if (cashShort) {
      toast(lang === "sw" ? `Pesa iliyotolewa imepungua kwa ${formatTZS(Math.abs(changeDue))}.` : `The amount tendered is short by ${formatTZS(Math.abs(changeDue))}.`, "error");
      return;
    }
    setCompleting(true);
    const clientReference = newLocalId();
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
      dueDate: paymentMethod === "CREDIT" && creditDueDate ? creditDueDate : undefined,
      clientReference,
    };
    try {
      const result = await api.post<{ sale: SaleRecord }>("/sales", payload, lang);
      setCompletedSale(result.sale);
      setCompletedChange(paymentMethod === "CASH" && amountTendered ? Math.max(0, changeDue) : null);
      toast(lang === "sw" ? `Mauzo yamekamilika. Risiti ${receiptLabel(result.sale)}.` : `Sale complete. Receipt ${receiptLabel(result.sale)}.`, "success");
      setCart([]);
      setPaymentRef("");
      setCustomerName("");
      setCustomerPhone("");
      setCreditDueDate("");
      setAmountTendered("");
      // Refresh the currently browsed inventory page after stock changes.
      refreshProducts();
      if (paymentMethod === "CREDIT") {
        api.get<{ customers: CustomerRecord[] }>("/debts/customers").then((d) => setCustomers(d.customers)).catch(() => {});
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t("common.error", lang);
      const canQueue = typeof navigator !== "undefined" && (!navigator.onLine || message.includes("Unable to reach"));
      if (canQueue) {
        const queued = [
          ...readPendingSales(),
          { id: clientReference, createdAt: new Date().toISOString(), total, attempts: 0, payload },
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
        reportSyncEvent({ status: "QUEUED", total, message: queuedEvent.message, attempts: 0, localId: queued[queued.length - 1].id });
        setPendingSales(queued);
        setSyncHistory(nextHistory.slice(0, 10));
        setCart([]);
        setPaymentRef("");
        setCustomerName("");
        setCustomerPhone("");
        setCreditDueDate("");
        setAmountTendered("");
        toast(lang === "sw" ? "Mtandao haupo. Mauzo yamehifadhiwa na yatasawazishwa baadaye." : "Offline. Sale saved and will sync later.", "success");
      } else {
        toast(message, "error");
      }
    } finally {
      setCompleting(false);
    }
  }

  async function restockFromPos() {
    if (!restockProduct) return;
    const quantity = Number(restockQuantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      toast(lang === "sw" ? "Weka idadi kamili iliyo zaidi ya sifuri." : "Enter a whole quantity greater than zero.", "error");
      return;
    }
    setRestocking(true);
    try {
      const result = await api.post<{ product: Product }>("/stock/adjust", { productId: restockProduct.id, type: "IN", quantity, note: "Restocked from POS" }, lang);
      setProducts((current) => current.map((product) => product.id === result.product.id ? result.product : product));
      toast(lang === "sw" ? `Stock ya ${restockProduct.name} imeongezwa.` : `${restockProduct.name} restocked.`, "success");
      setRestockProduct(null);
      setRestockQuantity("");
    } catch (error: unknown) {
      toast(error instanceof Error ? error.message : t("common.error", lang), "error");
    } finally {
      setRestocking(false);
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
                disabled={syncing}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                {syncing
                  ? (lang === "sw" ? "Inasawazisha" : "Syncing")
                  : (lang === "sw" ? `${pendingSales.length} yanasubiri kusawazishwa` : `${pendingSales.length} pending sync`)}
              </button>
            )}
          </div>
        )}

        {view === "pos" && (hiddenOutOfStock > 0 || hiddenExpired > 0) && (
          <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
              <p>
                {lang === "sw" ? "Bidhaa zinazoonyeshwa sasa zisizoweza kuuzwa:" : "Unavailable among the products shown:"}{" "}
                {hiddenOutOfStock > 0 && `${hiddenOutOfStock} ${lang === "sw" ? "bidhaa ambazo stock imeisha" : "out of stock"}`}
                {hiddenOutOfStock > 0 && hiddenExpired > 0 ? ", " : ""}
                {hiddenExpired > 0 && `${hiddenExpired} ${lang === "sw" ? "zimeisha muda" : "expired"}`}.
              </p>
            </div>
            <Link href="/inventory" className="flex-shrink-0 font-semibold text-amber-800 underline underline-offset-2">
              {lang === "sw" ? "Kagua stock" : "Review stock"}
            </Link>
          </div>
        )}

        {view === "pos" && (pendingSales.length > 0 || syncHistory.length > 0) && (
          <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <WifiOff className="h-4 w-4 text-amber-700" />
                  <p className="text-sm font-semibold text-amber-950">{lang === "sw" ? "Usawazishaji wa mauzo bila intaneti" : "Offline sales sync"}</p>
                </div>
                <p className="text-xs text-amber-800">
                  {pendingSales.length > 0
                    ? (lang === "sw" ? `Mauzo ${pendingSales.length} yanasubiri. Kila moja litajaribu tena intaneti ikirudi.` : `${pendingSales.length} sale(s) waiting. Each sale retries when internet returns.`)
                    : (lang === "sw" ? "Hakuna mauzo yanayosubiri kusawazishwa." : "No sales are waiting to sync.")}
                </p>
                <p className="mt-1 text-[11px] text-amber-700">
                  {isOnline
                    ? (lang === "sw" ? "Mtandao upo" : "Online")
                    : (lang === "sw" ? "Mtandao haupo" : "Offline")}
                  {" - "}
                  {lang === "sw" ? "Jaribio la mwisho" : "Last check"} {formatSyncTime(lastSyncAt)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {pendingSales.some((sale) => sale.lastError) && (
                  <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                    {lang === "sw" ? "Kagua hitilafu" : "Review errors"}
                  </span>
                )}
                {pendingSales.length > 0 && (
                  <button
                    onClick={() => syncPendingSales()}
                    disabled={syncing}
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-950 disabled:opacity-60"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                    {lang === "sw" ? "Jaribu kusawazisha" : "Retry sync"}
                  </button>
                )}
                {syncHistory.length > 0 && (
                  <button onClick={clearSyncHistory} className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100">
                    {lang === "sw" ? "Futa historia" : "Clear history"}
                  </button>
                )}
              </div>
            </div>
            {pendingSales.length > 0 && (
              <div className="mt-3 grid gap-2">
                {pendingSales.map((sale) => (
                  <div key={sale.id} className="rounded-lg bg-white/80 px-3 py-2 text-xs">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold text-amber-950">
                          {formatTZS(sale.total)} - {sale.payload.items.length} {lang === "sw" ? "bidhaa" : "item(s)"}
                        </p>
                        <p className="mt-0.5 text-gray-500">
                          {new Date(sale.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          {" - "}
                          {lang === "sw" ? "Majaribio" : "Attempts"} {sale.attempts || 0}
                        </p>
                        {sale.lastError && <p className="mt-1 font-medium text-red-700">{sale.lastError}</p>}
                      </div>
                      {sale.lastError && (
                        <button
                          onClick={() => removePendingSale(sale.id)}
                          className="inline-flex items-center gap-1 self-start rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {lang === "sw" ? "Ondoa" : "Remove"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {syncHistory.length > 0 && (
              <div className="mt-3 grid gap-2">
                {syncHistory.slice(0, 5).map((event) => (
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
              {assistantIntent && (
                <div className="mb-3 rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm text-brand-900">
                  <p className="font-semibold">
                    {assistantIntent === "first-sale"
                      ? (lang === "sw" ? "DukaPilot imekufungulia mauzo ya kwanza ya leo." : "DukaPilot opened your first sale flow for today.")
                      : (lang === "sw" ? "DukaPilot imekufungua kwenye POS." : "DukaPilot opened the POS for this action.")}
                  </p>
                  <p className="mt-1 text-xs text-brand-700">
                    {lang === "sw" ? "Chagua bidhaa, hakiki malipo, kisha bonyeza kamilisha." : "Pick products, confirm payment, then complete the sale."}
                  </p>
                </div>
              )}
              <div className="mb-3 flex gap-2">
                <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={search} onChange={(e) => { setSearch(e.target.value); setProductPage(1); }}
                  placeholder={t("inventory.search", lang)}
                  className="w-full border border-gray-300 rounded-xl pl-9 pr-3 py-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <button onClick={() => setScannerOpen(true)} aria-label="Scan barcode" className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white" title="Scan barcode"><ScanLine className="h-5 w-5" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto pb-2 sm:grid-cols-3 lg:max-h-[60vh] lg:grid-cols-2">
                {filtered.map((p) => {
                  const inCart = cart.find((i) => i.product.id === p.id);
                  const expired = isExpired(p);
                  const outOfStock = p.currentStock <= 0;
                  const unavailable = expired || outOfStock;
                  return (
                    <div key={p.id} className={`flex min-h-32 flex-col rounded-xl border p-3 transition-all ${unavailable ? "border-gray-200 bg-gray-100" : inCart ? "border-brand-400 bg-brand-50" : "border-gray-200 bg-white hover:border-brand-300"}`}>
                      <button disabled={unavailable} onClick={() => addToCart(p)} className="min-h-0 flex-1 text-left disabled:cursor-not-allowed">
                        <p className={`break-words text-sm font-medium leading-tight ${unavailable ? "text-gray-500" : "text-gray-800"}`}>{p.name}</p>
                        <p className={`mt-1 text-xs font-semibold ${outOfStock || expired ? "text-red-600" : "text-gray-500"}`}>
                          {expired ? (lang === "sw" ? "Muda umeisha" : "Expired") : outOfStock ? (lang === "sw" ? "Stock imeisha" : "Out of stock") : `${p.currentStock} ${p.unit} ${t("dashboard.remaining", lang)}`}
                        </p>
                        <p className={`mt-1 text-sm font-bold ${unavailable ? "text-gray-500" : "text-brand-700"}`}>{formatTZS(defaultPriceFor(p))}</p>
                        {!unavailable && saleMode === "WHOLESALE" && p.wholesalePrice == null && <p className="mt-0.5 text-[10px] text-amber-600">{t("sales.noWholesalePrice", lang)}</p>}
                        {!unavailable && p.wholesalePrice != null && p.wholesaleMinQty != null && <p className="mt-0.5 text-[10px] text-gray-400">{t("sales.wholesaleMinHint", lang).replace("{n}", String(p.wholesaleMinQty))}</p>}
                        {inCart && <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-xs text-white">x{inCart.quantity}</span>}
                      </button>
                      {outOfStock && canManageStock && (
                        <button onClick={() => { setRestockProduct(p); setRestockQuantity(""); }} className="mt-2 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-brand-200 bg-white px-2 py-2 text-xs font-bold text-brand-800 hover:bg-brand-50">
                          <PackagePlus className="h-4 w-4" />{lang === "sw" ? "Ongeza stock" : "Restock"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-500">
                <span>{lang === "sw" ? `Inaonyesha ${products.length} kati ya bidhaa ${productTotal}` : `Showing ${products.length} of ${productTotal} products`}</span>
                {products.length < productTotal && (
                  <button disabled={loadingProducts} onClick={() => setProductPage((current) => current + 1)} className="font-semibold text-brand-700 disabled:opacity-50">
                    {loadingProducts ? "..." : (lang === "sw" ? "Onyesha zaidi" : "Load more")}
                  </button>
                )}
              </div>
            </div>

            {/* Cart */}
            <div ref={cartPanelRef} className="mt-4 scroll-mt-20 lg:mt-0">
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
                    <div className="space-y-3 mb-4 max-h-56 overflow-y-auto">
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
                            <button aria-label={`${t("common.remove", lang)} ${item.product.name}`} onClick={() => updateQty(item.product.id, -1)} className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center min-h-0 sm:h-9 sm:w-9">
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                            <button aria-label={`${t("common.add", lang)} ${item.product.name}`} onClick={() => updateQty(item.product.id, 1)} className="w-11 h-11 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center min-h-0 sm:h-9 sm:w-9">
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <span className="text-xs font-bold text-gray-800 w-16 text-right">
                            {formatTZS(item.quantity * item.unitPrice)}
                          </span>
                          <button aria-label={`${t("common.remove", lang)} ${item.product.name}`} onClick={() => removeFromCart(item.product.id)} className="flex h-11 w-11 items-center justify-center text-gray-400 hover:text-red-500 min-h-0 sm:h-9 sm:w-9">
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
                      {canViewFinancials && <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{t("sales.profit", lang)}</span>
                        <span className="font-bold text-green-600">{formatTZS(profit)}</span>
                      </div>}
                    </div>

                    <div className="mb-3">
                      <p className="text-xs font-medium text-gray-600 mb-2">{t("sales.payment", lang)}</p>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                        {PAYMENT_METHODS.map((m) => (
                          <button key={m.value} onClick={() => setPaymentMethod(m.value)}
                            className={`py-2.5 rounded-lg text-xs font-medium border transition-colors min-h-0 ${paymentMethod === m.value ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 border-gray-200"}`}>
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

                    {paymentMethod === "CASH" && (
                      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                        <label className="grid gap-1 text-sm font-medium text-gray-700">
                          <span>{lang === "sw" ? "Mteja ametoa (TZS)" : "Customer gave (TZS)"}</span>
                          <input value={amountTendered} onChange={(e) => setAmountTendered(e.target.value)} type="number" min="0" inputMode="numeric" placeholder={lang === "sw" ? "Hiari" : "Optional"} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                        </label>
                        {amountTendered && <p className={`rounded-lg px-3 py-2 text-sm font-bold ${cashShort ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{cashShort ? (lang === "sw" ? "Bado" : "Still needed") : (lang === "sw" ? "Chenji" : "Change")}: {formatTZS(Math.abs(changeDue))}</p>}
                      </div>
                    )}

                    {paymentMethod === "CREDIT" && (
                      <div className="mb-3 grid gap-2 sm:grid-cols-2">
                        <label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Jina la mteja" : "Customer name"}</span><input list="known-customer-names" value={customerName} onChange={(e) => { setCustomerName(e.target.value); const match = customers.find((customer) => customer.name.toLowerCase() === e.target.value.toLowerCase()); if (match) setCustomerPhone(match.phone); }} autoComplete="name" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" /><datalist id="known-customer-names">{customers.filter((customer) => customer.name).map((customer) => <option key={customer.phone} value={customer.name}>{customer.phone}</option>)}</datalist></label>
                        <label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Simu ya mteja" : "Customer phone"}</span><input list="known-customer-phones" value={customerPhone} onChange={(e) => updateCustomerFromPhone(e.target.value)} type="tel" autoComplete="tel" placeholder="07XXXXXXXX au +255..." className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" /><datalist id="known-customer-phones">{customers.map((customer) => <option key={customer.phone} value={customer.phone}>{customer.name || customer.phone}</option>)}</datalist></label>
                        <DateSelect className="sm:col-span-2" lang={lang} label={lang === "sw" ? "Tarehe ya mwisho ya kulipa" : "Payment due date"} value={creditDueDate} onChange={setCreditDueDate} />
                      </div>
                    )}

                    <button onClick={completeSale} disabled={completing || cart.length === 0 || cashShort}
                      className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors">
                      <Check className="w-4 h-4" />
                      {completing ? t("sales.saving", lang) : `${t("sales.complete", lang)} - ${formatTZS(total)}`}
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
                  <div key={sale.id} className={`rounded-xl border p-4 ${sale.status === "VOIDED" ? "border-red-200 bg-red-50/60" : "border-gray-200 bg-white"}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className={`font-semibold ${sale.status === "VOIDED" ? "text-gray-500 line-through" : "text-gray-900"}`}>{formatTZS(sale.totalAmount)}</p>
                          <span className="text-xs font-semibold text-gray-500">{receiptLabel(sale)}</span>
                          {sale.status === "VOIDED" && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">{lang === "sw" ? "IMEFUTWA" : "VOIDED"}</span>}
                        </div>
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
                        {canViewFinancials && sale.profit != null && sale.status !== "VOIDED" && <p className={`mt-1 text-sm font-bold ${sale.profit < 0 ? "text-red-600" : "text-green-600"}`}>{sale.profit >= 0 ? "+" : ""}{formatTZS(sale.profit)}</p>}
                      </div>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {sale.items.map((item, i) => (
                        <p key={i} className="text-xs text-gray-500 py-0.5">
                          {item.product?.name || item.name || "Custom service"} x {item.quantity} @ {formatTZS(item.unitPrice)}
                        </p>
                      ))}
                    </div>
                    {sale.voidReason && <p className="mt-2 text-xs font-medium text-red-700">{lang === "sw" ? "Sababu" : "Reason"}: {sale.voidReason}</p>}
                    {sale.status !== "VOIDED" && (
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                        <button onClick={() => shareReceipt(sale)} className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-semibold text-green-800"><MessageCircle className="h-4 w-4" />{lang === "sw" ? "Tuma risiti" : "Share receipt"}</button>
                        <ReceiptActions sale={sale} shopName={shopName} lang={lang} compact />
                        {canViewFinancials && <button onClick={() => voidSale(sale)} disabled={voidingSaleId === sale.id} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"><RotateCcw className="h-4 w-4" />{voidingSaleId === sale.id ? (lang === "sw" ? "Inafuta..." : "Voiding...") : (lang === "sw" ? "Futa mauzo" : "Void sale")}</button>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {view === "pos" && cart.length > 0 && (
          <button
            onClick={() => cartPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="fixed bottom-3 left-4 right-4 z-20 flex min-h-14 items-center justify-between rounded-xl bg-gray-950 px-4 text-white shadow-xl lg:hidden"
          >
            <span className="flex items-center gap-2 text-sm font-semibold"><ShoppingCart className="h-4 w-4" />{cart.reduce((sum, item) => sum + item.quantity, 0)} {lang === "sw" ? "bidhaa" : "items"}</span>
            <span className="text-sm font-bold">{formatTZS(total)} · {lang === "sw" ? "Fungua cart" : "View cart"}</span>
          </button>
        )}
      </div>
      {scannerOpen && <BarcodeScanner onDetected={handleBarcode} onClose={() => setScannerOpen(false)} />}
      {completedSale && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-green-100 text-green-700"><Check className="h-6 w-6" /></span><div><h2 className="font-bold text-gray-950">{lang === "sw" ? "Mauzo yamekamilika" : "Sale completed"}</h2><p className="text-sm font-semibold text-brand-700">{receiptLabel(completedSale)}</p></div></div>
              <button onClick={() => { setCompletedSale(null); setCompletedChange(null); }} aria-label={lang === "sw" ? "Funga" : "Close"} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="my-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">{lang === "sw" ? "Jumla" : "Total"}</span><strong>{formatTZS(completedSale.totalAmount)}</strong></div>
              <div className="mt-2 flex justify-between"><span className="text-gray-500">{lang === "sw" ? "Malipo" : "Payment"}</span><span>{t(PAYMENT_METHODS.find((method) => method.value === completedSale.paymentMethod)?.labelKey || "sales.cash", lang)}</span></div>
              {completedChange != null && completedChange > 0 && <div className="mt-2 flex justify-between text-green-800"><span>{lang === "sw" ? "Chenji" : "Change"}</span><strong>{formatTZS(completedChange)}</strong></div>}
            </div>
            <button onClick={() => shareReceipt(completedSale, completedChange)} className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 font-semibold text-white hover:bg-green-700"><MessageCircle className="h-5 w-5" />{lang === "sw" ? "Tuma risiti kwa WhatsApp" : "Share receipt on WhatsApp"}</button>
            <ReceiptActions sale={completedSale} shopName={shopName} lang={lang} change={completedChange} />
            <p className="mt-2 text-center text-xs text-gray-500">{lang === "sw" ? "Kwa printer ya Bluetooth, chagua printer yako kwenye print dialog." : "For a Bluetooth printer, choose your paired printer in the print dialog."}</p>
            <button onClick={() => { setCompletedSale(null); setCompletedChange(null); setView("history"); }} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700"><ReceiptText className="h-4 w-4" />{lang === "sw" ? "Fungua historia" : "View sale history"}</button>
          </div>
        </div>
      )}
      {restockProduct && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 p-3 sm:items-center sm:justify-center">
          <div role="dialog" aria-modal="true" aria-labelledby="pos-restock-title" className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div><h2 id="pos-restock-title" className="font-bold text-gray-950">{lang === "sw" ? "Ongeza stock" : "Restock"}: {restockProduct.name}</h2><p className="mt-1 text-sm text-gray-500">{lang === "sw" ? "Idadi hii itaingia kwenye historia ya stock." : "This quantity will be recorded in stock history."}</p></div>
              <button aria-label={lang === "sw" ? "Funga" : "Close"} onClick={() => setRestockProduct(null)} className="rounded-lg p-2 text-gray-500"><X className="h-5 w-5" /></button>
            </div>
            <label className="mt-4 grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Idadi inayoingia" : "Quantity received"}</span><input autoFocus type="number" min="1" step="1" inputMode="numeric" value={restockQuantity} onChange={(event) => setRestockQuantity(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500" /></label>
            <button disabled={restocking || !restockQuantity} onClick={restockFromPos} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-3 font-semibold text-white disabled:opacity-50"><PackagePlus className="h-5 w-5" />{restocking ? (lang === "sw" ? "Inahifadhi..." : "Saving...") : (lang === "sw" ? "Hifadhi stock" : "Save stock")}</button>
          </div>
        </div>
      )}
      {unknownBarcode && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl"><h2 className="font-bold text-gray-900">{lang === "sw" ? "Barcode haijapatikana" : "This barcode was not found."}</h2><p className="mt-2 text-sm text-gray-600">{unknownBarcode}</p><div className="mt-4 flex gap-2"><button onClick={() => { setSearch(unknownBarcode); setProductPage(1); setUnknownBarcode(null); }} className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-semibold">{lang === "sw" ? "Tafuta" : "Search manually"}</button><button onClick={() => { window.location.href = `/inventory?barcode=${encodeURIComponent(unknownBarcode)}&action=add`; }} className="flex-1 rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white">{lang === "sw" ? "Ongeza bidhaa" : "Add new product"}</button></div><button onClick={() => setUnknownBarcode(null)} className="mt-3 w-full text-sm text-gray-500">{t("common.cancel", lang)}</button></div></div>}
    </AppShell>
  );
}
