"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Calculator, PackageCheck, Plus, ReceiptText, RefreshCw, Trash2, Truck } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import DateSelect from "@/components/ui/DateSelect";
import { api, formatTZS } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";

interface Supplier { id: string; name: string; }
interface Product { id: string; name: string; unit: string; buyingPrice: number; supplier?: { id: string } | null; }
interface ReceiveLine { productId: string; quantity: string; unitCost: string; }
interface Order { id: string; supplier: Supplier; items: Array<{ productId: string; quantity: number; unitPrice?: number | null; product: { name: string; unit: string; buyingPrice?: number } }>; }
interface StockReceipt { id: string; invoiceNumber?: string | null; totalLandedCost: number; transportCost: number; otherCost: number; receivedAt: string; supplier?: Supplier | null; items: Array<{ id: string; quantity: number; landedUnitCost: number; product: { name: string; unit: string } }> }

function today() { return new Date().toISOString().slice(0, 10); }

function ReceivingContent() {
  const lang = useLang();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const sourceOrderId = searchParams.get("order") || "";
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [receipts, setReceipts] = useState<StockReceipt[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [lines, setLines] = useState<ReceiveLine[]>([]);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [transportCost, setTransportCost] = useState("0");
  const [otherCost, setOtherCost] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [receivedAt, setReceivedAt] = useState(today());
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sourceOrder, setSourceOrder] = useState<Order | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [productsData, suppliersData, receiptsData] = await Promise.all([
        api.get<{ products: Product[] }>("/products", lang),
        api.get<{ suppliers: Supplier[] }>("/suppliers", lang),
        api.get<{ receipts: StockReceipt[] }>("/stock-receipts", lang),
      ]);
      setProducts(productsData.products);
      setSuppliers(suppliersData.suppliers);
      setReceipts(receiptsData.receipts);
    } catch (error: unknown) {
      toast(error instanceof Error ? error.message : (lang === "sw" ? "Imeshindikana kupakia kupokea stock." : "Could not load stock receiving."), "error");
    } finally {
      setLoading(false);
    }
  }, [lang, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!sourceOrderId) return;
    api.get<{ order: Order }>(`/orders/${sourceOrderId}`, lang).then(({ order }) => {
      setSourceOrder(order);
      setSupplierId(order.supplier.id);
      setLines(order.items.map((item) => ({ productId: item.productId, quantity: String(item.quantity), unitCost: String(item.unitPrice ?? item.product.buyingPrice ?? 0) })));
    }).catch((error: unknown) => toast(error instanceof Error ? error.message : (lang === "sw" ? "Agizo halijapatikana." : "Order not found."), "error"));
  }, [lang, sourceOrderId, toast]);

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const productCost = lines.reduce((sum, line) => sum + Math.max(0, Number(line.quantity) || 0) * Math.max(0, Number(line.unitCost) || 0), 0);
  const extraCost = Math.max(0, Number(transportCost) || 0) + Math.max(0, Number(otherCost) || 0);
  const totalLandedCost = productCost + extraCost;
  const availableProducts = products.filter((product) => !lines.some((line) => line.productId === product.id) && (!supplierId || !product.supplier || product.supplier.id === supplierId));

  function addProduct(productId: string) {
    const product = productMap.get(productId);
    if (!product || lines.some((line) => line.productId === productId)) return;
    setLines((current) => [...current, { productId, quantity: "1", unitCost: String(product.buyingPrice) }]);
  }

  function updateLine(productId: string, key: "quantity" | "unitCost", value: string) {
    setLines((current) => current.map((line) => line.productId === productId ? { ...line, [key]: value } : line));
  }

  async function receiveStock() {
    const transport = Number(transportCost || 0);
    const other = Number(otherCost || 0);
    if (!lines.length) { toast(lang === "sw" ? "Ongeza angalau bidhaa moja." : "Add at least one product.", "error"); return; }
    if (lines.some((line) => !Number.isInteger(Number(line.quantity)) || Number(line.quantity) <= 0 || !Number.isInteger(Number(line.unitCost)) || Number(line.unitCost) < 0)) {
      toast(lang === "sw" ? "Idadi na bei ya kununua ziwe namba kamili sahihi." : "Quantity and unit cost must be valid whole numbers.", "error"); return;
    }
    if (!Number.isInteger(transport) || transport < 0 || !Number.isInteger(other) || other < 0) { toast(lang === "sw" ? "Gharama za ziada ziwe namba kamili." : "Extra costs must be whole amounts.", "error"); return; }
    if (!receivedAt) { toast(lang === "sw" ? "Chagua tarehe ya kupokea." : "Choose a received date.", "error"); return; }
    setSaving(true);
    try {
      const result = await api.post<{ receipt: StockReceipt }>("/stock-receipts", {
        supplierId: supplierId || undefined,
        sourceOrderId: sourceOrder?.id || undefined,
        invoiceNumber: invoiceNumber.trim() || undefined,
        transportCost: transport,
        otherCost: other,
        paymentMethod,
        receivedAt,
        note: note.trim() || undefined,
        items: lines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity), unitCost: Number(line.unitCost) })),
      }, lang);
      toast(lang === "sw" ? `Stock imepokelewa. Jumla ${formatTZS(result.receipt.totalLandedCost)}.` : `Stock received. Total ${formatTZS(result.receipt.totalLandedCost)}.`, "success");
      setLines([]); setSupplierId(""); setInvoiceNumber(""); setTransportCost("0"); setOtherCost("0"); setPaymentMethod("CASH"); setReceivedAt(today()); setNote(""); setSourceOrder(null);
      await load();
    } catch (error: unknown) {
      toast(error instanceof Error ? error.message : "Could not receive stock", "error");
    } finally { setSaving(false); }
  }

  if (loading) return <AppShell><div className="flex h-64 items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-brand-600" /></div></AppShell>;

  return <AppShell><main className="mx-auto max-w-5xl space-y-5 pb-24 lg:pb-6">
    <header><h1 className="text-xl font-bold text-gray-950">{lang === "sw" ? "Pokea Stock" : "Receive Stock"}</h1><p className="mt-1 text-sm text-gray-500">{lang === "sw" ? "Rekodi bidhaa zilizofika na gharama zake halisi." : "Record delivered products and their true buying cost."}</p></header>
    {sourceOrder && <div className="flex items-center gap-3 border border-brand-200 bg-brand-50 p-3 text-sm text-brand-950"><PackageCheck className="h-5 w-5 shrink-0" /><span>{lang === "sw" ? `Unapokea agizo kutoka ${sourceOrder.supplier.name}. Hii italiweka agizo kama limepokelewa.` : `Receiving order from ${sourceOrder.supplier.name}. This will mark the order as delivered.`}</span></div>}
    <section className="border border-gray-200 bg-white p-5">
      <div className="grid gap-3 md:grid-cols-3"><label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Msambazaji (hiari)" : "Supplier (optional)"}</span><select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} disabled={Boolean(sourceOrder)} className="rounded-lg border border-gray-300 bg-white px-3 py-3"><option value="">{lang === "sw" ? "Bila msambazaji" : "No supplier"}</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Namba ya invoice (hiari)" : "Invoice number (optional)"}</span><input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-3" placeholder="INV-001" /></label><div><DateSelect value={receivedAt} onChange={setReceivedAt} label={lang === "sw" ? "Tarehe ya kupokea" : "Received date"} lang={lang} required /></div></div>
      <div className="mt-5 border-t border-gray-100 pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-gray-950">{lang === "sw" ? "Bidhaa zilizofika" : "Delivered products"}</h2><select value="" onChange={(event) => { addProduct(event.target.value); event.currentTarget.value = ""; }} className="rounded-lg border border-brand-300 bg-white px-3 py-2 text-sm font-semibold text-brand-800"><option value="">{lang === "sw" ? "+ Ongeza bidhaa" : "+ Add product"}</option>{availableProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></div>{lines.length ? <div className="mt-3 space-y-2">{lines.map((line) => { const product = productMap.get(line.productId); return <div key={line.productId} className="grid gap-2 border border-gray-100 bg-gray-50 p-3 sm:grid-cols-[1fr_120px_150px_42px] sm:items-end"><div><p className="text-sm font-semibold text-gray-950">{product?.name}</p><p className="text-xs text-gray-500">{product?.unit}</p></div><label className="grid gap-1 text-xs font-medium text-gray-600"><span>{lang === "sw" ? "Idadi" : "Quantity"}</span><input value={line.quantity} onChange={(event) => updateLine(line.productId, "quantity", event.target.value)} type="number" min="1" step="1" inputMode="numeric" className="rounded-lg border border-gray-300 bg-white px-3 py-2" /></label><label className="grid gap-1 text-xs font-medium text-gray-600"><span>{lang === "sw" ? "Bei / kipimo (TZS)" : "Unit cost (TZS)"}</span><input value={line.unitCost} onChange={(event) => updateLine(line.productId, "unitCost", event.target.value)} type="number" min="0" step="1" inputMode="numeric" className="rounded-lg border border-gray-300 bg-white px-3 py-2" /></label><button type="button" onClick={() => setLines((current) => current.filter((item) => item.productId !== line.productId))} className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600" title={lang === "sw" ? "Ondoa" : "Remove"} aria-label={lang === "sw" ? "Ondoa" : "Remove"}><Trash2 className="h-4 w-4" /></button></div>; })}</div> : <div className="mt-3 border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">{lang === "sw" ? "Chagua bidhaa zilizofika." : "Choose the products that arrived."}</div>}</div>
      <div className="mt-5 grid gap-3 border-t border-gray-100 pt-4 md:grid-cols-3"><label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Usafiri (TZS)" : "Transport (TZS)"}</span><input value={transportCost} onChange={(event) => setTransportCost(event.target.value)} type="number" min="0" step="1" inputMode="numeric" className="rounded-lg border border-gray-300 px-3 py-3" /></label><label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Gharama nyingine (TZS)" : "Other costs (TZS)"}</span><input value={otherCost} onChange={(event) => setOtherCost(event.target.value)} type="number" min="0" step="1" inputMode="numeric" className="rounded-lg border border-gray-300 px-3 py-3" /></label><label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Njia ya malipo" : "Payment method"}</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-3"><option value="CASH">{lang === "sw" ? "Taslimu" : "Cash"}</option><option value="MPESA">M-Pesa</option><option value="BANK">{lang === "sw" ? "Benki" : "Bank"}</option></select></label></div>
      <label className="mt-3 grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Maelezo (hiari)" : "Note (optional)"}</span><input value={note} onChange={(event) => setNote(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-3" /></label>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Calculator className="h-5 w-5" /></span><div><p className="text-xs text-gray-500">{lang === "sw" ? "Gharama ya bidhaa" : "Product cost"}: {formatTZS(productCost)} + {lang === "sw" ? "gharama za ziada" : "extra costs"}: {formatTZS(extraCost)}</p><p className="font-bold text-gray-950">{lang === "sw" ? "Jumla ya gharama halisi" : "Total landed cost"}: {formatTZS(totalLandedCost)}</p></div></div><button type="button" disabled={saving || !lines.length} onClick={receiveStock} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><Truck className="h-4 w-4" />{saving ? "..." : (lang === "sw" ? "Pokea stock" : "Receive stock")}</button></div>
    </section>
    <section><div className="mb-3 flex items-center gap-2"><ReceiptText className="h-4 w-4 text-brand-700" /><h2 className="font-bold text-gray-950">{lang === "sw" ? "Stock iliyopokelewa karibuni" : "Recent stock receipts"}</h2></div><div className="space-y-2">{receipts.length ? receipts.map((receipt) => <details key={receipt.id} className="border border-gray-200 bg-white p-4"><summary className="cursor-pointer list-none"><div className="flex flex-wrap items-center justify-between gap-2 pr-6"><div><p className="font-semibold text-gray-950">{receipt.supplier?.name || (lang === "sw" ? "Bila msambazaji" : "No supplier")}</p><p className="mt-0.5 text-xs text-gray-500">{new Date(receipt.receivedAt).toLocaleDateString(lang === "sw" ? "sw-TZ" : "en-TZ")}{receipt.invoiceNumber ? ` - ${receipt.invoiceNumber}` : ""}</p></div><p className="font-bold text-brand-800">{formatTZS(receipt.totalLandedCost)}</p></div></summary><div className="mt-3 border-t border-gray-100 pt-3 text-sm">{receipt.items.map((item) => <div key={item.id} className="flex justify-between gap-3 border-b border-gray-100 py-2 last:border-0"><span>{item.product.name} x {item.quantity} {item.product.unit}</span><span className="font-semibold">{formatTZS(item.landedUnitCost)} / {item.product.unit}</span></div>)}<p className="mt-3 text-xs text-gray-500">{lang === "sw" ? "Usafiri" : "Transport"}: {formatTZS(receipt.transportCost)} | {lang === "sw" ? "Nyingine" : "Other"}: {formatTZS(receipt.otherCost)}</p></div></details>) : <div className="border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">{lang === "sw" ? "Hakuna stock iliyopokelewa bado." : "No stock receipts yet."}</div>}</div></section>
  </main></AppShell>;
}

export default function ReceivingPage() {
  return <Suspense fallback={<AppShell><div className="flex h-64 items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-brand-600" /></div></AppShell>}><ReceivingContent /></Suspense>;
}
