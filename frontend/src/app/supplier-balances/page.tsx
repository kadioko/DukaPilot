"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { ApiError, api, formatTZS } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import { AlertTriangle, ChevronDown, ChevronRight, CreditCard, RefreshCw, RotateCcw, Search, Undo2 } from "lucide-react";

type SupplierBalance = { id: string; name: string; phone: string; balance: number; current: number; days31To60: number; days61To90: number; over90: number; receiptCount: number };
type ReceiptLine = { id: string; quantity: number; landedUnitCost: number; landedTotalCost: number; product: { id: string; name: string; unit: string; currentStock: number }; supplierCreditLines: Array<{ quantity: number; amount: number; supplierCredit: { kind: string; reversalOfId?: string | null } }> };
type Receipt = { id: string; invoiceNumber?: string | null; receivedAt: string; totalLandedCost: number; paidAtReceipt: number; paymentMethod: string; balance: number; supplier?: { id: string; name: string } | null; items: ReceiptLine[]; paymentCorrections: Array<{ id: string; previousCorrectionId?: string | null; previousAmount: number; correctedAmount: number; previousMethod: string; correctedMethod: string; cashOutAdjustment: number; note: string; createdAt: string }>; paymentAllocations: Array<{ amount: number; supplierPayment: { id: string; amount: number; paymentMethod: string; paymentReference?: string | null; paidAt: string; reversalOfId?: string | null; reversal?: unknown } }>; credits: Array<{ id: string; kind: string; issuedAt: string; reversalOfId?: string | null; reversal?: unknown; items: Array<{ amount: number; quantity: number }> }> };
type SupplierPageData = { suppliers: SupplierBalance[]; pagination: { page: number; totalPages: number; total: number } };
type ReceiptPageData = { receipts: Receipt[]; pagination: { page: number; totalPages: number } };

function returnableQuantity(item: ReceiptLine) {
  const alreadyReturned = item.supplierCreditLines.reduce((total, line) => total + (line.supplierCredit.kind === "RETURN" ? line.quantity : 0), 0);
  return Math.max(0, Math.min(item.product.currentStock, item.quantity - alreadyReturned));
}

function receiptPaymentState(receipt: Receipt) {
  const previousIds = new Set((receipt.paymentCorrections || []).map((item) => item.previousCorrectionId).filter(Boolean));
  const latest = receipt.paymentCorrections?.find((item) => !previousIds.has(item.id));
  return { amount: latest?.correctedAmount ?? receipt.paidAtReceipt, method: latest?.correctedMethod ?? receipt.paymentMethod };
}

function newKey() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

export default function SupplierBalancesPage() {
  const lang = useLang();
  const { toast } = useToast();
  const sw = lang === "sw";
  const [rows, setRows] = useState<SupplierBalance[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [receiptPage, setReceiptPage] = useState(1);
  const [receiptTotalPages, setReceiptTotalPages] = useState(1);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [mode, setMode] = useState<"payment" | "return" | "credit" | "correction" | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [lineId, setLineId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [correctionMethod, setCorrectionMethod] = useState("CASH");
  const [saving, setSaving] = useState(false);
  const requestAttempt = useRef<{ fingerprint: string; key: string } | null>(null);

  const refresh = useCallback(async (nextPage: number, query: string) => {
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams({ page: String(nextPage), limit: "25" });
      if (query.trim()) params.set("search", query.trim());
      const data = await api.get<SupplierPageData>(`/supplier-payables?${params}`);
      setRows(data.suppliers || []);
      setPage(data.pagination.page);
      setTotalPages(data.pagination.totalPages || 1);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return;
      setLoadError(error instanceof Error ? error.message : (sw ? "Imeshindikana kupakia salio." : "Could not load supplier balances."));
    } finally { setLoading(false); }
  }, [sw]);

  useEffect(() => { refresh(1, ""); }, [refresh]);

  async function toggleSupplier(supplierId: string) {
    if (expanded === supplierId) { setExpanded(null); setReceipts([]); return; }
    setExpanded(supplierId);
    setReceiptLoading(true);
    try {
      const data = await api.get<ReceiptPageData>(`/supplier-payables/${supplierId}/receipts?page=1&limit=20`);
      setReceipts(data.receipts || []);
      setReceiptPage(data.pagination.page);
      setReceiptTotalPages(data.pagination.totalPages || 1);
    } catch (error) { toast(error instanceof Error ? error.message : (sw ? "Imeshindikana kupakia risiti." : "Could not load receipts."), "error"); }
    finally { setReceiptLoading(false); }
  }

  async function loadReceiptPage(supplierId: string, nextPage: number) {
    setReceiptLoading(true);
    try {
      const data = await api.get<ReceiptPageData>(`/supplier-payables/${supplierId}/receipts?page=${nextPage}&limit=20`);
      setReceipts(data.receipts || []);
      setReceiptPage(data.pagination.page);
      setReceiptTotalPages(data.pagination.totalPages || 1);
    } catch (error) { toast(error instanceof Error ? error.message : (sw ? "Imeshindikana kupakia risiti." : "Could not load receipts."), "error"); }
    finally { setReceiptLoading(false); }
  }

  function openForm(receipt: Receipt, action: "payment" | "return" | "credit") {
    setSelectedReceipt(receipt);
    setMode(action);
    setAmount(""); setReference(""); setNote(""); setQuantity("1");
    setLineId(receipt.items[0]?.id || "");
    requestAttempt.current = null;
  }

  function openCorrection(receipt: Receipt) {
    const state = receiptPaymentState(receipt);
    setSelectedReceipt(receipt);
    setMode("correction");
    setAmount(String(state.amount));
    setCorrectionMethod(state.amount === 0 ? "CASH" : state.method);
    setNote("");
    requestAttempt.current = null;
  }

  async function submit() {
    if (!selectedReceipt || !mode) return;
    const amountValue = Number(amount);
    const quantityValue = Number(quantity);
    if (mode === "payment" && (!Number.isSafeInteger(amountValue) || amountValue <= 0 || amountValue > selectedReceipt.balance)) {
      toast(sw ? "Weka kiasi halali kisichozidi salio la risiti." : "Enter a valid amount no greater than this receipt balance.", "error"); return;
    }
    if (mode === "correction" && (!Number.isSafeInteger(amountValue) || amountValue < 0 || !note.trim())) {
      toast(sw ? "Weka kiasi sahihi na sababu ya marekebisho." : "Enter a valid corrected amount and a reason.", "error"); return;
    }
    if ((mode === "return" || mode === "credit") && (!lineId || (mode === "return" && (!Number.isSafeInteger(quantityValue) || quantityValue <= 0)) || (mode === "credit" && (!Number.isSafeInteger(amountValue) || amountValue <= 0)))) {
      toast(sw ? "Kamilisha taarifa za marejesho." : "Complete the return or credit details.", "error"); return;
    }
    const body = mode === "payment"
      ? { allocations: [{ stockReceiptId: selectedReceipt.id, amount: amountValue }], amount: amountValue, paymentMethod: method, paymentReference: reference.trim() || undefined, note: note.trim() || undefined }
      : mode === "correction"
        ? { correctedAmount: amountValue, paymentMethod: correctionMethod, note: note.trim() }
        : { stockReceiptId: selectedReceipt.id, kind: mode === "return" ? "RETURN" : "CREDIT_NOTE", note: note.trim() || undefined, items: [{ stockReceiptItemId: lineId, quantity: mode === "return" ? quantityValue : 0, amount: mode === "credit" ? amountValue : undefined }] };
    const fingerprint = JSON.stringify(body);
    if (!requestAttempt.current || requestAttempt.current.fingerprint !== fingerprint) requestAttempt.current = { fingerprint, key: newKey() };
    setSaving(true);
    try {
      if (mode === "payment") await api.post("/supplier-payables/payments", { ...body, requestKey: requestAttempt.current.key });
      else if (mode === "correction") await api.post(`/supplier-payables/receipts/${selectedReceipt.id}/payment-corrections`, { ...body, requestKey: requestAttempt.current.key });
      else await api.post("/supplier-payables/credits", { ...body, requestKey: requestAttempt.current.key });
      requestAttempt.current = null;
      setMode(null); setSelectedReceipt(null);
      toast(sw ? "Imerekodiwa na salio limesasishwa." : "Saved and supplier balance updated.", "success");
      await refresh(page, search);
      setExpanded(null); setReceipts([]);
    } catch (error) { toast(error instanceof Error ? error.message : (sw ? "Imeshindikana kuhifadhi." : "Could not save."), "error"); }
    finally { setSaving(false); }
  }

  async function reverse(kind: "payment" | "credit", id: string) {
    const okay = window.confirm(sw ? "Uunde rekodi ya kurekebisha? Historia ya awali itahifadhiwa." : "Create a linked reversal? The original history will remain unchanged.");
    if (!okay) return;
    try {
      await api.post(`/supplier-payables/${kind === "payment" ? "payments" : "credits"}/${id}/reverse`, { requestKey: newKey() });
      toast(sw ? "Marekebisho yamehifadhiwa." : "Reversal recorded.", "success");
      await refresh(page, search);
      setExpanded(null); setReceipts([]);
    } catch (error) { toast(error instanceof Error ? error.message : (sw ? "Imeshindikana kurekebisha." : "Could not reverse record."), "error"); }
  }

  const selectedLine = selectedReceipt?.items.find((item) => item.id === lineId);
  const selectedLineReturnable = selectedLine ? returnableQuantity(selectedLine) : 0;

  return <AppShell><main className="mx-auto max-w-5xl space-y-5 pb-24 lg:pb-6">
    <header><h1 className="text-xl font-bold text-gray-950">{sw ? "Salio la Wasambazaji" : "Supplier balances"}</h1><p className="mt-1 text-sm text-gray-600">{sw ? "Madeni, malipo na mikopo huhesabiwa kutoka kwenye risiti na miamala iliyohifadhiwa." : "Payables are calculated from receipts, allocated payments, and linked supplier credits."}</p></header>
    <div className="flex flex-col gap-2 sm:flex-row"><label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" /><span className="sr-only">{sw ? "Tafuta supplier" : "Search suppliers"}</span><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") refresh(1, search); }} placeholder={sw ? "Tafuta jina au simu..." : "Search supplier name or phone..."} className="min-h-11 w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm" /></label><button type="button" onClick={() => refresh(1, search)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700"><RefreshCw className="h-4 w-4" />{sw ? "Tafuta" : "Search"}</button></div>
    {loadError ? <div role="alert" className="border border-red-200 bg-red-50 p-5 text-sm text-red-800"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{loadError}</div><button type="button" onClick={() => refresh(page, search)} className="mt-3 font-semibold underline">{sw ? "Jaribu tena" : "Retry"}</button></div> : loading ? <div className="flex h-32 items-center justify-center"><RefreshCw className="h-5 w-5 animate-spin text-brand-700" /></div> : rows.length === 0 ? <div className="border border-dashed border-gray-300 p-8 text-center text-sm text-gray-600">{sw ? "Hakuna risiti zenye supplier kwenye kipindi hiki." : "No supplier receipts found."}</div> : <div className="divide-y divide-gray-200 border-y border-gray-200 bg-white">{rows.map((supplier) => <section key={supplier.id}>
      <button type="button" onClick={() => toggleSupplier(supplier.id)} className="grid w-full grid-cols-[1fr_auto] gap-3 px-3 py-4 text-left hover:bg-gray-50 sm:px-5"><span className="min-w-0"><span className="block truncate font-semibold text-gray-950">{supplier.name}</span><span className="mt-0.5 block text-xs text-gray-500">{supplier.phone} · {supplier.receiptCount} {sw ? "risiti" : "receipts"}</span><span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-600"><span>{sw ? "0–30 siku" : "0–30 days"}: {formatTZS(supplier.current)}</span><span>31–60: {formatTZS(supplier.days31To60)}</span><span>61–90: {formatTZS(supplier.days61To90)}</span><span>&gt;90: {formatTZS(supplier.over90)}</span></span></span><span className="flex items-center gap-2 self-center text-right"><span><span className={`block font-bold ${supplier.balance < 0 ? "text-blue-700" : "text-brand-800"}`}>{formatTZS(Math.abs(supplier.balance))}</span><span className="text-[11px] text-gray-500">{supplier.balance < 0 ? (sw ? "mkopo wetu" : "supplier credit") : (sw ? "salio" : "outstanding")}</span></span>{expanded === supplier.id ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}</span></button>
      {expanded === supplier.id && <div className="space-y-3 border-t border-gray-100 bg-gray-50 p-3 sm:p-4">{receiptLoading ? <p className="py-4 text-center text-sm text-gray-500">{sw ? "Inapakia risiti..." : "Loading receipts..."}</p> : receipts.map((receipt) => { const receiptPayment = receiptPaymentState(receipt); return <article key={receipt.id} className="border border-gray-200 bg-white p-3 sm:p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold text-gray-900">{receipt.invoiceNumber || `#${receipt.id.slice(-7).toUpperCase()}`}</h2><p className="text-xs text-gray-500">{new Date(receipt.receivedAt).toLocaleDateString(sw ? "sw-TZ" : "en-TZ")} · {sw ? "Jumla" : "Receipt"}: {formatTZS(receipt.totalLandedCost)} · {sw ? "imelipwa wakati wa kupokea" : "paid at receipt"}: {formatTZS(receiptPayment.amount)} ({receiptPayment.method})</p></div><div className="text-right"><p className={`font-bold ${receipt.balance < 0 ? "text-blue-700" : "text-brand-800"}`}>{formatTZS(Math.abs(receipt.balance))}</p><p className="text-xs text-gray-500">{receipt.balance < 0 ? (sw ? "mkopo" : "credit") : (sw ? "bado kulipwa" : "remaining")}</p></div></div>
        <div className="mt-3 divide-y divide-gray-100 border-y border-gray-100">{receipt.items.map((item) => { const returned = item.supplierCreditLines.reduce((total, line) => total + (line.supplierCredit.kind === "RETURN" ? line.quantity : 0), 0); return <div key={item.id} className="flex justify-between gap-3 py-2 text-sm"><span className="min-w-0"><span className="block truncate text-gray-800">{item.product.name}</span><span className="text-xs text-gray-500">{item.quantity} {item.product.unit} · {sw ? "imerudishwa" : "returned"} {returned} · {sw ? "inayoweza kurudishwa" : "returnable"} {returnableQuantity(item)}</span></span><span className="shrink-0 text-gray-700">{formatTZS(item.landedUnitCost)} / {item.product.unit}</span></div>; })}</div>
        <div className="mt-3 space-y-2 text-xs">{receipt.paymentCorrections.map((correction) => <div key={correction.id} className="border-l-2 border-amber-400 pl-2 text-gray-700"><span className="font-medium">{sw ? "Marekebisho ya malipo" : "Receipt payment correction"}</span> · {new Date(correction.createdAt).toLocaleDateString(sw ? "sw-TZ" : "en-TZ")} · {correction.previousMethod} {formatTZS(correction.previousAmount)} → {correction.correctedMethod} {formatTZS(correction.correctedAmount)} · {correction.note}</div>)}{receipt.paymentAllocations.map((allocation, index) => <div key={`${allocation.supplierPayment.id}-${index}`} className="flex flex-wrap items-center justify-between gap-2"><span>{new Date(allocation.supplierPayment.paidAt).toLocaleDateString(sw ? "sw-TZ" : "en-TZ")} · {allocation.supplierPayment.paymentMethod} {allocation.supplierPayment.paymentReference ? `· ${allocation.supplierPayment.paymentReference}` : ""} · {formatTZS(allocation.amount)}{allocation.supplierPayment.reversalOfId ? (sw ? " (marekebisho)" : " (reversal)") : ""}</span>{!allocation.supplierPayment.reversalOfId && !allocation.supplierPayment.reversal && <button type="button" onClick={() => reverse("payment", allocation.supplierPayment.id)} className="inline-flex items-center gap-1 font-semibold text-red-700"><Undo2 className="h-3.5 w-3.5" />{sw ? "Rekebisha" : "Reverse"}</button>}</div>)}{receipt.credits.map((credit) => <div key={credit.id} className="flex flex-wrap items-center justify-between gap-2"><span>{new Date(credit.issuedAt).toLocaleDateString(sw ? "sw-TZ" : "en-TZ")} · {credit.kind === "RETURN" ? (sw ? "Marejesho" : "Return") : (sw ? "Credit note" : "Credit note")} · {formatTZS(credit.items.reduce((total, item) => total + item.amount, 0))}{credit.reversalOfId ? (sw ? " (marekebisho)" : " (reversal)") : ""}</span>{!credit.reversalOfId && !credit.reversal && <button type="button" onClick={() => reverse("credit", credit.id)} className="inline-flex items-center gap-1 font-semibold text-red-700"><Undo2 className="h-3.5 w-3.5" />{sw ? "Rekebisha" : "Reverse"}</button>}</div>)}</div>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => openCorrection(receipt)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">{sw ? "Sahihisha malipo ya kupokea" : "Correct receipt payment"}</button>{receipt.balance > 0 && <><button type="button" onClick={() => openForm(receipt, "payment")} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-2 text-xs font-semibold text-white"><CreditCard className="h-4 w-4" />{sw ? "Rekodi malipo" : "Record payment"}</button><button type="button" onClick={() => openForm(receipt, "credit")} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700">{sw ? "Credit note" : "Credit note"}</button></>}{receipt.items.some((item) => returnableQuantity(item) > 0) && <button type="button" onClick={() => openForm(receipt, "return")} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-900"><RotateCcw className="h-4 w-4" />{sw ? "Rekodi marejesho" : "Record return"}</button>}</div>
      </article>; })}{receipts.length === 0 && !receiptLoading && <p className="text-sm text-gray-500">{sw ? "Hakuna risiti." : "No receipts."}</p>}{receiptTotalPages > 1 && <nav className="flex items-center justify-between text-xs text-gray-600"><span>{sw ? `Ukurasa ${receiptPage} / ${receiptTotalPages}` : `Page ${receiptPage} of ${receiptTotalPages}`}</span><div className="flex gap-2"><button type="button" disabled={receiptPage <= 1 || receiptLoading} onClick={() => loadReceiptPage(supplier.id, receiptPage - 1)} className="min-h-9 rounded-md border border-gray-300 bg-white px-3 disabled:opacity-50">{sw ? "Nyuma" : "Previous"}</button><button type="button" disabled={receiptPage >= receiptTotalPages || receiptLoading} onClick={() => loadReceiptPage(supplier.id, receiptPage + 1)} className="min-h-9 rounded-md border border-gray-300 bg-white px-3 disabled:opacity-50">{sw ? "Mbele" : "Next"}</button></div></nav>}</div>}
    </section>)}</div>}
    {!loading && totalPages > 1 && <nav className="flex items-center justify-between border-t border-gray-200 pt-3 text-sm"><span className="text-gray-500">{sw ? `Ukurasa ${page} / ${totalPages}` : `Page ${page} of ${totalPages}`}</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => refresh(page - 1, search)} className="min-h-10 rounded-lg border border-gray-300 bg-white px-3 disabled:opacity-50">{sw ? "Nyuma" : "Previous"}</button><button type="button" disabled={page >= totalPages} onClick={() => refresh(page + 1, search)} className="min-h-10 rounded-lg border border-gray-300 bg-white px-3 disabled:opacity-50">{sw ? "Mbele" : "Next"}</button></div></nav>}
    {mode === "correction" && selectedReceipt && <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-3 sm:items-center"><section role="dialog" aria-modal="true" aria-labelledby="receipt-correction-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-gray-200 bg-white p-4 shadow-xl sm:p-5"><div className="mb-4 flex items-center justify-between"><h2 id="receipt-correction-title" className="text-lg font-bold text-gray-950">{sw ? "Sahihisha malipo ya kupokea" : "Correct receipt payment"}</h2><button type="button" onClick={() => setMode(null)} aria-label={sw ? "Funga" : "Close"} className="min-h-10 min-w-10 rounded-lg border border-gray-300 text-gray-600">×</button></div><p className="mb-4 text-sm text-gray-600">{selectedReceipt.invoiceNumber || `#${selectedReceipt.id.slice(-7).toUpperCase()}`} · {sw ? "Salio la sasa" : "Current balance"}: {formatTZS(selectedReceipt.balance)}</p><label className="mb-3 grid gap-1 text-sm font-medium"><span>{sw ? "Kiasi sahihi kilicholipwa wakati wa kupokea (TZS)" : "Correct amount paid at receipt (TZS)"}</span><CurrencyInput value={amount} onChange={setAmount} className="min-h-11 rounded-lg border border-gray-300 px-3 py-2" /></label><label className="mb-3 grid gap-1 text-sm font-medium"><span>{sw ? "Njia sahihi ya malipo" : "Correct payment method"}</span><select value={correctionMethod} onChange={(event) => setCorrectionMethod(event.target.value)} className="min-h-11 rounded-lg border border-gray-300 bg-white px-3"><option value="CASH">{sw ? "Taslimu" : "Cash"}</option><option value="MPESA">M-Pesa</option><option value="TIGOPESA">Tigo Pesa</option><option value="AIRTEL_MONEY">Airtel Money</option><option value="HALOPESA">HaloPesa</option><option value="BANK">{sw ? "Benki" : "Bank"}</option></select></label><label className="mb-4 grid gap-1 text-sm font-medium"><span>{sw ? "Sababu ya marekebisho (inahitajika)" : "Reason for correction (required)"}</span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={3} className="rounded-lg border border-gray-300 px-3 py-2" /></label><p className="mb-4 text-xs leading-5 text-gray-600">{sw ? "Risiti ya awali haitabadilishwa. Tofauti ya taslimu itaonekana kama marekebisho tofauti kwenye shift yako wazi ya Daily Close." : "The original receipt will remain unchanged. Any cash difference will appear as a separate adjustment in your open Daily Close shift."}</p><button type="button" disabled={saving} onClick={submit} className="min-h-11 w-full rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? (sw ? "Inahifadhi..." : "Saving...") : (sw ? "Hifadhi marekebisho" : "Save correction")}</button></section></div>}
    {mode && mode !== "correction" && selectedReceipt && <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-3 sm:items-center"><section role="dialog" aria-modal="true" aria-labelledby="supplier-transaction-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-gray-200 bg-white p-4 shadow-xl sm:p-5"><div className="mb-4 flex items-center justify-between"><h2 id="supplier-transaction-title" className="text-lg font-bold text-gray-950">{mode === "payment" ? (sw ? "Malipo kwa supplier" : "Supplier payment") : mode === "return" ? (sw ? "Rudisha bidhaa" : "Return stock") : (sw ? "Rekodi credit note" : "Record credit note")}</h2><button type="button" onClick={() => setMode(null)} aria-label={sw ? "Funga" : "Close"} className="min-h-10 min-w-10 rounded-lg border border-gray-300 text-gray-600">×</button></div><p className="mb-4 text-sm text-gray-600">{selectedReceipt.invoiceNumber || `#${selectedReceipt.id.slice(-7).toUpperCase()}`} · {sw ? "Salio" : "Balance"}: {formatTZS(selectedReceipt.balance)}</p>
      {mode === "payment" ? <><label className="mb-3 grid gap-1 text-sm font-medium"><span>{sw ? "Kiasi (TZS)" : "Amount (TZS)"}</span><CurrencyInput value={amount} onChange={setAmount} className="min-h-11 rounded-lg border border-gray-300 px-3 py-2" /></label><label className="mb-3 grid gap-1 text-sm font-medium"><span>{sw ? "Njia ya malipo" : "Payment method"}</span><select value={method} onChange={(event) => setMethod(event.target.value)} className="min-h-11 rounded-lg border border-gray-300 bg-white px-3"><option value="CASH">{sw ? "Taslimu" : "Cash"}</option><option value="MPESA">M-Pesa</option><option value="TIGOPESA">Tigo Pesa</option><option value="AIRTEL_MONEY">Airtel Money</option><option value="HALOPESA">HaloPesa</option><option value="BANK">{sw ? "Benki" : "Bank"}</option></select></label><label className="mb-3 grid gap-1 text-sm font-medium"><span>{sw ? "Reference (hiari)" : "Reference (optional)"}</span><input value={reference} onChange={(event) => setReference(event.target.value)} className="min-h-11 rounded-lg border border-gray-300 px-3" /></label></> : <><label className="mb-3 grid gap-1 text-sm font-medium"><span>{sw ? "Bidhaa ya risiti ya awali" : "Original receipt item"}</span><select value={lineId} onChange={(event) => setLineId(event.target.value)} className="min-h-11 rounded-lg border border-gray-300 bg-white px-3">{selectedReceipt.items.map((item) => <option key={item.id} value={item.id}>{item.product.name} · {sw ? "stock" : "stock"} {item.product.currentStock}</option>)}</select></label>{mode === "return" ? <><label className="mb-3 grid gap-1 text-sm font-medium"><span>{sw ? `Idadi ya kurudisha (zinazobaki ${selectedLineReturnable})` : `Quantity to return (eligible ${selectedLineReturnable})`}</span><input type="number" min="1" max={selectedLineReturnable || 1} step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="min-h-11 rounded-lg border border-gray-300 px-3" /></label><p className="mb-3 text-xs text-gray-600">{sw ? "Mkopo hutumia gharama halisi ya risiti; mgao wa TZS husawazishwa ili marejesho kamili yalingane na gharama ya awali. Stock itapungua kwa kiasi kilichorudishwa." : "Credit uses the original receipt cost, with TZS rounding balanced across partial returns so a full return matches the receipt exactly. Returned stock is removed from inventory."}</p></> : <label className="mb-3 grid gap-1 text-sm font-medium"><span>{sw ? "Kiasi cha credit note (TZS)" : "Credit note amount (TZS)"}</span><CurrencyInput value={amount} onChange={setAmount} className="min-h-11 rounded-lg border border-gray-300 px-3 py-2" /></label>}</>}
      <label className="mb-4 grid gap-1 text-sm font-medium"><span>{sw ? "Maelezo (hiari)" : "Note (optional)"}</span><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} className="min-h-11 rounded-lg border border-gray-300 px-3" /></label><p className="mb-4 text-xs leading-5 text-gray-500">{sw ? "Rekodi hii itaongezwa kwenye historia; haitafuta risiti au malipo ya awali." : "This creates an auditable history entry; it does not erase the original receipt or payment."}</p><button type="button" disabled={saving} onClick={submit} className="min-h-11 w-full rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? (sw ? "Inahifadhi..." : "Saving...") : (sw ? "Hifadhi rekodi" : "Save record")}</button></section></div>}
  </main></AppShell>;
}
