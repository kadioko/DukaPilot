"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Calculator, PackageCheck, Plus, ReceiptText, RefreshCw, Search, Trash2, Truck } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import DateSelect from "@/components/ui/DateSelect";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { api, formatTZS, getCurrentSession } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import ReceiptCorrection, { type CorrectableReceipt } from "./ReceiptCorrection";

interface Supplier { id: string; name: string; }
interface Product { id: string; name: string; unit: string; buyingPrice: number; sku?: string | null; supplier?: { id: string } | null; }
interface ReceiveLine { productId: string; quantity: string; unitCost: string; }
interface Order { id: string; status: string; invoiceNumber?: string | null; supplier: Supplier; items: Array<{ productId: string; quantity: number; receivedQuantity: number; unitPrice?: number | null; product: { name: string; unit: string; buyingPrice?: number } }>; }
interface StockReceipt extends CorrectableReceipt { paidAtReceipt: number; paymentMethod: string; receivedAt: string; supplier?: Supplier | null; items: Array<{ id: string; quantity: number; landedUnitCost: number; product: { name: string; unit: string } }> }

function today() { return new Date().toISOString().slice(0, 10); }
function newReceiptRequestKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function ReceivingContent() {
  const lang = useLang();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const sourceOrderId = searchParams.get("order") || "";
  const selectedReceiptId = searchParams.get("receipt") || "";
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [productSearchResults, setProductSearchResults] = useState<Product[]>([]);
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [productSearchError, setProductSearchError] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [receipts, setReceipts] = useState<StockReceipt[]>([]);
  const [canCorrect, setCanCorrect] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [lines, setLines] = useState<ReceiveLine[]>([]);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [transportCost, setTransportCost] = useState("0");
  const [otherCost, setOtherCost] = useState("0");
  const [estimatedTotalMode, setEstimatedTotalMode] = useState(false);
  const [totalGroceryBill, setTotalGroceryBill] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paidNow, setPaidNow] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [receivedAt, setReceivedAt] = useState(today());
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sourceOrder, setSourceOrder] = useState<Order | null>(null);
  const [invoiceMatchOrders, setInvoiceMatchOrders] = useState<Order[]>([]);
  const [invoiceMatchLoading, setInvoiceMatchLoading] = useState(false);
  const [invoiceMatchError, setInvoiceMatchError] = useState("");
  const receiveAttempt = useRef<{ fingerprint: string; requestKey: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [productsData, suppliersData, receiptsData] = await Promise.all([
        api.get<{ products: Product[] }>("/products?limit=200", lang),
        api.get<{ suppliers: Supplier[] }>("/suppliers", lang),
        api.get<{ receipts: StockReceipt[] }>("/stock-receipts", lang),
      ]);
      setProducts(productsData.products);
      setSuppliers(suppliersData.suppliers);
      if (selectedReceiptId && !receiptsData.receipts.some((receipt) => receipt.id === selectedReceiptId)) {
        const selected = await api.get<{ receipt: StockReceipt }>(`/stock-receipts/${encodeURIComponent(selectedReceiptId)}`, lang);
        setReceipts([selected.receipt, ...receiptsData.receipts]);
      } else setReceipts(receiptsData.receipts);
    } catch (error: unknown) {
      toast(error instanceof Error ? error.message : (lang === "sw" ? "Imeshindikana kupakia kupokea stock." : "Could not load stock receiving."), "error");
    } finally {
      setLoading(false);
    }
  }, [lang, selectedReceiptId, toast]);

  useEffect(() => {
    if (selectedReceiptId && receipts.some((receipt) => receipt.id === selectedReceiptId)) {
      document.getElementById(`receipt-${selectedReceiptId}`)?.scrollIntoView({ block: "center" });
    }
  }, [receipts, selectedReceiptId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    getCurrentSession<{ user: { staff?: { permissions?: { canCorrectStock?: boolean } } } }>()
      .then(({ user }) => setCanCorrect(!user.staff || Boolean(user.staff.permissions?.canCorrectStock)))
      .catch(() => setCanCorrect(false));
  }, []);
  useEffect(() => {
    const term = productSearch.trim();
    if (term.length < 2) {
      setProductSearchResults([]);
      setProductSearchError("");
      setProductSearchLoading(false);
      return;
    }
    let cancelled = false;
    setProductSearchLoading(true);
    setProductSearchError("");
    setProductSearchResults([]);
    const timer = window.setTimeout(async () => {
      try {
        const query = new URLSearchParams({ page: "1", limit: "200", search: term });
        const result = await api.getRecoverable<{ products: Product[] }>(`/products?${query.toString()}`, lang);
        if (!cancelled) setProductSearchResults(result.products);
      } catch (error: unknown) {
        if (!cancelled) {
          setProductSearchResults([]);
          setProductSearchError(error instanceof Error ? error.message : (lang === "sw" ? "Imeshindikana kutafuta bidhaa." : "Could not search products."));
        }
      } finally {
        if (!cancelled) setProductSearchLoading(false);
      }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [lang, productSearch]);
  useEffect(() => {
    if (!sourceOrderId) return;
    api.get<{ order: Order }>(`/orders/${sourceOrderId}`, lang).then(({ order }) => {
      setSourceOrder(order);
      setSupplierId(order.supplier.id);
      setInvoiceNumber(order.invoiceNumber || "");
      setProducts((current) => {
        const known = new Set(current.map((product) => product.id));
        return [...current, ...order.items.filter((item) => !known.has(item.productId)).map((item) => ({ id: item.productId, name: item.product.name, unit: item.product.unit, buyingPrice: item.unitPrice ?? item.product.buyingPrice ?? 0 }))];
      });
      setLines(order.items.filter((item) => item.quantity > item.receivedQuantity).map((item) => ({ productId: item.productId, quantity: String(item.quantity - item.receivedQuantity), unitCost: String(item.unitPrice ?? item.product.buyingPrice ?? 0) })));
    }).catch((error: unknown) => toast(error instanceof Error ? error.message : (lang === "sw" ? "Agizo halijapatikana." : "Order not found."), "error"));
  }, [lang, sourceOrderId, toast]);

  const applyMatchedOrder = useCallback((order: Order) => {
    const outstanding = order.items.filter((item) => item.quantity > item.receivedQuantity);
    setSourceOrder(order);
    setSupplierId(order.supplier.id);
    setInvoiceNumber(order.invoiceNumber || "");
    setProducts((current) => {
      const known = new Set(current.map((product) => product.id));
      return [...current, ...outstanding.filter((item) => !known.has(item.productId)).map((item) => ({ id: item.productId, name: item.product.name, unit: item.product.unit, buyingPrice: item.unitPrice ?? item.product.buyingPrice ?? 0 }))];
    });
    setLines(outstanding.map((item) => ({
      productId: item.productId,
      quantity: String(item.quantity - item.receivedQuantity),
      unitCost: String(item.unitPrice ?? item.product.buyingPrice ?? 0),
    })));
    setInvoiceMatchOrders([]);
    if (!outstanding.length) setInvoiceMatchError(lang === "sw" ? "Order hii haina bidhaa zilizobaki kupokea." : "This order has no quantities left to receive.");
  }, [lang]);

  useEffect(() => {
    if (sourceOrderId) return;
    const invoice = invoiceNumber.trim();
    if (!supplierId || invoice.length < 2) {
      setInvoiceMatchOrders([]);
      setInvoiceMatchLoading(false);
      setInvoiceMatchError("");
      return;
    }
    let cancelled = false;
    setInvoiceMatchLoading(true);
    setInvoiceMatchError("");
    const timer = window.setTimeout(async () => {
      try {
        const query = new URLSearchParams({ supplierId, invoiceNumber: invoice });
        const result = await api.get<{ orders: Order[] }>(`/orders/match?${query.toString()}`, lang);
        if (cancelled) return;
        setInvoiceMatchOrders(result.orders);
        if (result.orders.length === 1) applyMatchedOrder(result.orders[0]);
      } catch (error: unknown) {
        if (!cancelled) setInvoiceMatchError(error instanceof Error ? error.message : (lang === "sw" ? "Imeshindikana kutafuta order." : "Could not match an order."));
      } finally {
        if (!cancelled) setInvoiceMatchLoading(false);
      }
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [applyMatchedOrder, invoiceNumber, lang, sourceOrderId, supplierId]);

  function clearMatchedOrder() {
    if (sourceOrderId) return;
    setSourceOrder(null);
    setLines([]);
    setInvoiceMatchOrders([]);
    setSupplierId("");
  }

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const directProductCost = lines.reduce((sum, line) => sum + Math.max(0, Number(line.quantity) || 0) * Math.max(0, Number(line.unitCost) || 0), 0);
  const productCost = estimatedTotalMode ? Math.max(0, Number(totalGroceryBill) || 0) : directProductCost;
  const extraCost = Math.max(0, Number(transportCost) || 0) + Math.max(0, Number(otherCost) || 0);
  const totalLandedCost = productCost + extraCost;
  const paidAmount = paidNow === "" ? totalLandedCost : Math.max(0, Number(paidNow) || 0);
  const remainingOrderProductIds = sourceOrder
    ? new Set(sourceOrder.items.filter((item) => item.quantity > item.receivedQuantity).map((item) => item.productId))
    : null;
  const remainingOrderQuantities = sourceOrder
    ? new Map(sourceOrder.items.map((item) => [item.productId, item.quantity - item.receivedQuantity]))
    : null;
  const availableProducts = productSearchResults.filter((product) =>
    (!remainingOrderProductIds || remainingOrderProductIds.has(product.id))
    && !lines.some((line) => line.productId === product.id)
    && (!supplierId || !product.supplier || product.supplier.id === supplierId));

  function changeSupplier(value: string) {
    if (!sourceOrderId) {
      setSourceOrder(null);
      setLines([]);
      setInvoiceMatchOrders([]);
    }
    setSupplierId(value);
  }

  function changeInvoiceNumber(value: string) {
    if (!sourceOrderId && sourceOrder) {
      setSourceOrder(null);
      setLines([]);
    }
    setInvoiceNumber(value);
  }

  function addProduct(product: Product) {
    if (lines.some((line) => line.productId === product.id)) return;
    setProducts((current) => current.some((item) => item.id === product.id) ? current : [...current, product]);
    setLines((current) => [...current, { productId: product.id, quantity: "1", unitCost: String(product.buyingPrice) }]);
    setProductSearch("");
    setProductSearchResults([]);
  }

  function updateLine(productId: string, key: "quantity" | "unitCost", value: string) {
    setLines((current) => current.map((line) => line.productId === productId ? { ...line, [key]: value } : line));
  }

  async function receiveStock() {
    const transport = Number(transportCost || 0);
    const other = Number(otherCost || 0);
    if (invoiceMatchOrders.length > 1) {
      toast(lang === "sw" ? "Chagua order sahihi inayolingana na invoice kabla ya kupokea." : "Choose the matching order before receiving these goods.", "error");
      return;
    }
    if (!lines.length) { toast(lang === "sw" ? "Ongeza angalau bidhaa moja." : "Add at least one product.", "error"); return; }
    if (lines.some((line) => !Number.isInteger(Number(line.quantity)) || Number(line.quantity) <= 0 || (!estimatedTotalMode && (!Number.isInteger(Number(line.unitCost)) || Number(line.unitCost) < 0)))) {
      toast(lang === "sw" ? "Idadi na bei ya kununua ziwe namba kamili sahihi." : "Quantity and unit cost must be valid whole numbers.", "error"); return;
    }
    if (sourceOrder && lines.some((line) => {
      const remaining = remainingOrderQuantities?.get(line.productId);
      return remaining === undefined || Number(line.quantity) > remaining;
    })) {
      toast(lang === "sw" ? "Kiasi cha kupokea hakiwezi kuzidi kiasi kilichobaki kwenye order." : "A received quantity cannot exceed the order's remaining quantity.", "error");
      return;
    }
    if (estimatedTotalMode && (!Number.isInteger(Number(totalGroceryBill)) || Number(totalGroceryBill) <= 0)) {
      toast(lang === "sw" ? "Weka jumla ya bill ya grocery kwa TZS." : "Enter the total grocery bill in TZS.", "error"); return;
    }
    if (!Number.isInteger(transport) || transport < 0 || !Number.isInteger(other) || other < 0) { toast(lang === "sw" ? "Gharama za ziada ziwe namba kamili." : "Extra costs must be whole amounts.", "error"); return; }
    if (!receivedAt) { toast(lang === "sw" ? "Chagua tarehe ya kupokea." : "Choose a received date.", "error"); return; }
    const request = {
      supplierId: supplierId || undefined,
      sourceOrderId: sourceOrder?.id || undefined,
      invoiceNumber: invoiceNumber.trim() || undefined,
      transportCost: transport,
      otherCost: other,
      paymentMethod,
      paidAtReceipt: paidNow === "" ? totalLandedCost : Number(paidNow),
      paymentReference: paymentReference.trim() || undefined,
      receivedAt,
      note: note.trim() || undefined,
      allocationMode: estimatedTotalMode ? "TOTAL_ESTIMATE" : "DIRECT",
      totalGroceryBill: estimatedTotalMode ? Number(totalGroceryBill) : undefined,
      items: lines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity), unitCost: estimatedTotalMode ? undefined : Number(line.unitCost) })),
    };
    const fingerprint = JSON.stringify(request);
    if (!receiveAttempt.current || receiveAttempt.current.fingerprint !== fingerprint) {
      receiveAttempt.current = { fingerprint, requestKey: newReceiptRequestKey() };
    }
    setSaving(true);
    try {
      const result = await api.post<{ receipt: StockReceipt }>("/stock-receipts", {
        ...request,
        requestKey: receiveAttempt.current.requestKey,
      }, lang);
      receiveAttempt.current = null;
      toast(lang === "sw" ? `Stock imepokelewa. Jumla ${formatTZS(result.receipt.totalLandedCost)}.` : `Stock received. Total ${formatTZS(result.receipt.totalLandedCost)}.`, "success");
      setLines([]); setSupplierId(""); setInvoiceNumber(""); setInvoiceMatchOrders([]); setInvoiceMatchError(""); setTransportCost("0"); setOtherCost("0"); setEstimatedTotalMode(false); setTotalGroceryBill(""); setPaymentMethod("CASH"); setPaidNow(""); setPaymentReference(""); setReceivedAt(today()); setNote(""); setSourceOrder(null);
      await load();
    } catch (error: unknown) {
      toast(error instanceof Error ? error.message : "Could not receive stock", "error");
    } finally { setSaving(false); }
  }

  if (loading) return <AppShell><div className="flex h-64 items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-brand-600" /></div></AppShell>;

  return <AppShell><main className="mx-auto max-w-5xl space-y-5 pb-24 lg:pb-6">
    <header><h1 className="text-xl font-bold text-gray-950">{lang === "sw" ? "Pokea Stock" : "Receive Stock"}</h1><p className="mt-1 text-sm text-gray-500">{lang === "sw" ? "Rekodi bidhaa zilizofika na gharama zake halisi." : "Record delivered products and their true buying cost."}</p></header>
    {sourceOrder && <div className="flex flex-wrap items-center justify-between gap-3 border border-brand-200 bg-brand-50 p-3 text-sm text-brand-950"><div className="flex items-center gap-3"><PackageCheck className="h-5 w-5 shrink-0" /><span>{lang === "sw" ? `Order #${sourceOrder.id.slice(-8).toUpperCase()} imeunganishwa. Stock itaongezwa kwa kiasi kilichofika tu; kilichobaki kitaendelea kuonekana kwenye order.` : `Matched order #${sourceOrder.id.slice(-8).toUpperCase()}. Only delivered quantities increase stock; the remaining quantity stays on the order.`}</span></div>{!sourceOrderId && <button type="button" onClick={clearMatchedOrder} className="min-h-0 font-semibold underline">{lang === "sw" ? "Ondoa muunganisho" : "Unlink order"}</button>}</div>}
    <section className="border border-gray-200 bg-white p-5">
      <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        <label className="flex cursor-pointer items-start gap-2"><input type="checkbox" checked={estimatedTotalMode} disabled={Boolean(sourceOrder)} onChange={(event) => setEstimatedTotalMode(event.target.checked)} className="mt-1" /><span><strong>{lang === "sw" ? "Najua jumla ya bill ya grocery tu" : "I only know the total grocery bill"}</strong><span className="mt-1 block text-xs leading-5">{lang === "sw" ? "Mfumo utagawa gharama kwa makadirio kwa kutumia bei za mwisho za kununua. Risiti itaandikwa wazi kama makadirio; tumia bei za kila bidhaa ukizipata ili gharama iwe sahihi zaidi." : "DukaPilot will estimate each item cost using its last buying price. The receipt is clearly marked as estimated; use direct item costs when available for the most accurate result."}</span></span></label>
        {estimatedTotalMode && <label className="mt-3 grid max-w-xs gap-1 text-sm font-medium"><span>{lang === "sw" ? "Jumla ya bill ya grocery (TZS)" : "Total grocery bill (TZS)"}</span><CurrencyInput value={totalGroceryBill} onChange={setTotalGroceryBill} className="rounded-lg border border-amber-300 bg-white px-3 py-2" placeholder="180,000" /></label>}
      </div>
      <div className="grid gap-3 md:grid-cols-3"><label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Msambazaji (hiari)" : "Supplier (optional)"}</span><select value={supplierId} onChange={(event) => changeSupplier(event.target.value)} disabled={Boolean(sourceOrder)} className="rounded-lg border border-gray-300 bg-white px-3 py-3"><option value="">{lang === "sw" ? "Bila msambazaji" : "No supplier"}</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Namba ya invoice (hiari)" : "Invoice number (optional)"}</span><input value={invoiceNumber} onChange={(event) => changeInvoiceNumber(event.target.value)} readOnly={Boolean(sourceOrderId)} className="rounded-lg border border-gray-300 px-3 py-3 read-only:bg-gray-50" placeholder="INV-001" /></label><div><DateSelect value={receivedAt} onChange={setReceivedAt} label={lang === "sw" ? "Tarehe ya kupokea" : "Received date"} lang={lang} required /></div></div>
      {invoiceMatchLoading && <p className="mt-3 text-sm text-gray-500">{lang === "sw" ? "Inatafuta order inayolingana..." : "Searching for a matching order..."}</p>}
      {invoiceMatchError && <p role="alert" className="mt-3 text-sm text-red-700">{invoiceMatchError}</p>}
      {invoiceMatchOrders.length > 1 && <div className="mt-3 border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-semibold text-amber-900">{lang === "sw" ? "Orders kadhaa zina invoice hii. Chagua order sahihi:" : "Several orders match this invoice. Choose the correct order:"}</p><div className="mt-2 flex flex-wrap gap-2">{invoiceMatchOrders.map((order) => <button key={order.id} type="button" onClick={() => applyMatchedOrder(order)} className="min-h-10 rounded-lg border border-amber-300 bg-white px-3 py-2 text-left text-sm">#{order.id.slice(-8).toUpperCase()} · {order.items.filter((item) => item.quantity > item.receivedQuantity).length} {lang === "sw" ? "bidhaa" : "products"}</button>)}</div></div>}
       <div className="mt-5 border-t border-gray-100 pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-gray-950">{lang === "sw" ? "Bidhaa zilizofika" : "Delivered products"}</h2></div><label className="relative mt-3 block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><span className="sr-only">{lang === "sw" ? "Tafuta bidhaa za kuongeza" : "Search products to add"}</span><input type="search" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder={lang === "sw" ? "Tafuta bidhaa kwa jina au SKU..." : "Search products by name or SKU..."} className="min-h-11 w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" /></label>{productSearch.trim().length < 2 ? <p className="mt-2 text-xs text-gray-500">{lang === "sw" ? "Andika angalau herufi 2 ili kutafuta kwenye bidhaa zako." : "Type at least 2 characters to search your product catalog."}</p> : productSearchLoading ? <p className="mt-2 text-sm text-gray-500">{lang === "sw" ? "Inatafuta bidhaa..." : "Searching products..."}</p> : productSearchError ? <p role="alert" className="mt-2 text-sm text-red-700">{productSearchError}</p> : availableProducts.length ? <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white">{availableProducts.map((product) => <button key={product.id} type="button" onClick={() => addProduct(product)} className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 text-left last:border-b-0 hover:bg-brand-50 focus:bg-brand-50 focus:outline-none"><span className="min-w-0"><span className="block truncate text-sm font-semibold text-gray-950">{product.name}</span>{product.sku && <span className="block truncate font-mono text-xs text-gray-500">SKU: {product.sku}</span>}</span><span className="shrink-0 text-xs font-medium text-brand-800">{lang === "sw" ? "Ongeza" : "Add"}</span></button>)}</div> : <p className="mt-2 text-sm text-gray-500">{sourceOrder ? (lang === "sw" ? "Risiti ya order inaweza kuwa na bidhaa zilizo kwenye order tu. Bidhaa nyingine pokea kwenye risiti tofauti." : "An order receipt can include only items on that order. Receive extra items on a separate receipt.") : (lang === "sw" ? "Hakuna bidhaa inayolingana ambayo haijaongezwa." : "No matching products left to add.")}</p>}{lines.length ? <div className="mt-3 space-y-2">{lines.map((line) => { const product = productMap.get(line.productId); const maxReceive = remainingOrderQuantities?.get(line.productId); return <div key={line.productId} className={`grid gap-2 border border-gray-100 bg-gray-50 p-3 ${estimatedTotalMode ? "sm:grid-cols-[1fr_120px_42px]" : "sm:grid-cols-[1fr_120px_150px_42px]"} sm:items-end`}><div><p className="text-sm font-semibold text-gray-950">{product?.name}</p><p className="text-xs text-gray-500">{product?.unit}{estimatedTotalMode ? (lang === "sw" ? " - gharama itakadiriwa" : " - cost will be estimated") : ""}{maxReceive !== undefined && <span> · {lang === "sw" ? `imebaki ${maxReceive}` : `${maxReceive} remaining`}</span>}</p></div><label className="grid gap-1 text-xs font-medium text-gray-600"><span>{lang === "sw" ? "Idadi" : "Quantity"}</span><input value={line.quantity} onChange={(event) => updateLine(line.productId, "quantity", event.target.value)} type="number" min="1" max={maxReceive} step="1" inputMode="numeric" className="rounded-lg border border-gray-300 bg-white px-3 py-2" /></label>{!estimatedTotalMode && <label className="grid gap-1 text-xs font-medium text-gray-600"><span>{lang === "sw" ? "Bei / kipimo (TZS)" : "Unit cost (TZS)"}</span><CurrencyInput value={line.unitCost} onChange={(value) => updateLine(line.productId, "unitCost", value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2" /></label>}<button type="button" onClick={() => setLines((current) => current.filter((item) => item.productId !== line.productId))} className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600" title={lang === "sw" ? "Ondoa" : "Remove"} aria-label={lang === "sw" ? "Ondoa" : "Remove"}><Trash2 className="h-4 w-4" /></button></div>; })}</div> : <div className="mt-3 border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">{lang === "sw" ? "Chagua bidhaa zilizofika." : "Choose the products that arrived."}</div>}</div>
      <div className="mt-5 grid gap-3 border-t border-gray-100 pt-4 md:grid-cols-3"><label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Usafiri (TZS)" : "Transport (TZS)"}</span><CurrencyInput value={transportCost} onChange={setTransportCost} className="rounded-lg border border-gray-300 px-3 py-3" /></label><label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Gharama nyingine (TZS)" : "Other costs (TZS)"}</span><CurrencyInput value={otherCost} onChange={setOtherCost} className="rounded-lg border border-gray-300 px-3 py-3" /></label><label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Kiasi kilicholipwa sasa (TZS)" : "Amount paid now (TZS)"}</span><CurrencyInput value={paidNow === "" ? String(totalLandedCost) : paidNow} onChange={setPaidNow} className="rounded-lg border border-gray-300 px-3 py-3" /></label><label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Njia ya malipo" : "Payment method"}</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-3"><option value="CASH">{lang === "sw" ? "Taslimu" : "Cash"}</option><option value="MPESA">M-Pesa</option><option value="TIGOPESA">Tigo Pesa</option><option value="AIRTEL_MONEY">Airtel Money</option><option value="HALOPESA">HaloPesa</option><option value="BANK">{lang === "sw" ? "Benki" : "Bank"}</option></select></label><label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Namba ya kumbukumbu (hiari)" : "Payment reference (optional)"}</span><input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-3" maxLength={120} /></label></div>
      <p className="mt-3 text-xs leading-5 text-brand-800">{paymentMethod === "CASH" && paidAmount > 0 ? (lang === "sw" ? "Taslimu iliyolipwa sasa pekee itaonekana kwenye Daily Close. Salio la supplier si Matumizi; usiandike stakabadhi tena." : "Only cash paid now is counted in Daily Close. The remaining supplier balance is not an Expense; do not enter this receipt again.") : (lang === "sw" ? "Stakabadhi huongeza stock na deni la supplier tu. Salio lililobaki litalipwa kupitia Wasambazaji > Salio." : "The receipt adds inventory and supplier payable only. Record later settlements under Suppliers > Balances.")}</p>
      <label className="mt-3 grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Maelezo (hiari)" : "Note (optional)"}</span><input value={note} onChange={(event) => setNote(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-3" /></label>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Calculator className="h-5 w-5" /></span><div><p className="text-xs text-gray-500">{lang === "sw" ? "Gharama ya bidhaa" : "Product cost"}: {formatTZS(productCost)} + {lang === "sw" ? "gharama za ziada" : "extra costs"}: {formatTZS(extraCost)}</p><p className="font-bold text-gray-950">{lang === "sw" ? "Jumla" : "Receipt total"}: {formatTZS(totalLandedCost)} · {lang === "sw" ? "imelipwa" : "paid"}: {formatTZS(paidAmount)} · {lang === "sw" ? "salio" : "due"}: {formatTZS(Math.max(0, totalLandedCost - paidAmount))}</p></div></div><button type="button" disabled={saving || !lines.length || !Number.isSafeInteger(Number(paidNow === "" ? totalLandedCost : paidNow)) || Number(paidNow === "" ? totalLandedCost : paidNow) < 0 || Number(paidNow === "" ? totalLandedCost : paidNow) > totalLandedCost} onClick={receiveStock} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><Truck className="h-4 w-4" />{saving ? "..." : (lang === "sw" ? "Pokea stock" : "Receive stock")}</button></div>
    </section>
    <section><div className="mb-3 flex items-center gap-2"><ReceiptText className="h-4 w-4 text-brand-700" /><h2 className="font-bold text-gray-950">{lang === "sw" ? "Stock iliyopokelewa karibuni" : "Recent stock receipts"}</h2></div><div className="space-y-2">{receipts.length ? receipts.map((receipt) => <details id={`receipt-${receipt.id}`} key={receipt.id} open={receipt.id === selectedReceiptId ? true : undefined} className="border border-gray-200 bg-white p-4"><summary className="cursor-pointer list-none"><div className="flex flex-wrap items-center justify-between gap-2 pr-6"><div><p className="font-semibold text-gray-950">{receipt.supplier?.name || (lang === "sw" ? "Bila msambazaji" : "No supplier")}{receipt.voidedAt && <span className="ml-2 text-xs font-semibold text-red-700">{lang === "sw" ? "IMEGEUZWA" : "REVERSED"}</span>}</p><p className="mt-0.5 text-xs text-gray-500">{new Date(receipt.receivedAt).toLocaleDateString(lang === "sw" ? "sw-TZ" : "en-TZ")}{receipt.invoiceNumber ? ` - ${receipt.invoiceNumber}` : ""}{receipt.estimatedAllocation ? ` - ${lang === "sw" ? "makadirio ya gharama" : "estimated costs"}` : ""}</p></div><p className="font-bold text-brand-800">{formatTZS(receipt.totalLandedCost)}</p></div></summary><div className="mt-3 border-t border-gray-100 pt-3 text-sm">{receipt.items.map((item) => <div key={item.id} className="flex justify-between gap-3 border-b border-gray-100 py-2 last:border-0"><span>{item.product.name} x {item.quantity} {item.product.unit}</span><span className="font-semibold">{formatTZS(item.landedUnitCost)} / {item.product.unit}</span></div>)}<p className="mt-3 text-xs text-gray-500">{lang === "sw" ? "Usafiri" : "Transport"}: {formatTZS(receipt.transportCost)} | {lang === "sw" ? "Nyingine" : "Other"}: {formatTZS(receipt.otherCost)}</p>{canCorrect && <ReceiptCorrection key={`${receipt.id}:${receipt.stockCorrections?.length || 0}`} receipt={receipt} sw={lang === "sw"} onSaved={load} />}</div></details>) : <div className="border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">{lang === "sw" ? "Hakuna stock iliyopokelewa bado." : "No stock receipts yet."}</div>}</div></section>
  </main></AppShell>;
}

export default function ReceivingPage() {
  return <Suspense fallback={<AppShell><div className="flex h-64 items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-brand-600" /></div></AppShell>}><ReceivingContent /></Suspense>;
}
