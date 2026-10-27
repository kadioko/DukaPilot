"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { api, formatTZS } from "@/lib/api";

interface Item { id: string; quantity: number; product: { name: string; unit: string }; }
export interface CorrectableReceipt {
  id: string;
  invoiceNumber?: string | null;
  note?: string | null;
  totalLandedCost: number;
  transportCost: number;
  otherCost: number;
  estimatedAllocation?: boolean;
  voidedAt?: string | null;
  hasReturnHistory?: boolean;
  items: Item[];
  stockCorrections?: Array<{ id: string; reason: string; createdAt: string; before: { items: Array<{ id: string; quantity: number }>; totalLandedCost: number }; after: { items: Array<{ id: string; quantity: number }>; totalLandedCost: number } }>;
}

export default function ReceiptCorrection({ receipt, sw, onSaved }: { receipt: CorrectableReceipt; sw: boolean; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries(receipt.items.map((item) => [item.id, String(item.quantity)])));
  const [invoiceNumber, setInvoiceNumber] = useState(receipt.invoiceNumber || "");
  const [note, setNote] = useState(receipt.note || "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);

  async function submit() {
    const items = receipt.items.map((item) => ({ id: item.id, quantity: Number(quantities[item.id]) }));
    if (!reason.trim() || items.some((item) => !Number.isSafeInteger(item.quantity) || item.quantity < 0)) {
      setError(sw ? "Weka sababu na idadi kamili kwa kila bidhaa." : "Enter a reason and a valid whole quantity for each product.");
      return;
    }
    if (items.every((item) => item.quantity === 0) && !window.confirm(sw
      ? "Geuza risiti hii yote? Hili litaondoa stock iliyopokelewa na kubakiza historia ya marekebisho."
      : "Reverse this entire receipt? Received stock will be removed and the correction history will remain.")) return;
    const body = { items, invoiceNumber, note, reason: reason.trim() };
    const fingerprint = JSON.stringify(body);
    if (!attempt.current || attempt.current.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() };
    setSaving(true);
    setError("");
    try {
      await api.post(`/stock-receipts/${receipt.id}/corrections`, { ...body, requestKey: attempt.current.key }, sw ? "sw" : "en");
      attempt.current = null;
      setOpen(false);
      await onSaved();
    } catch (value) {
      setError(value instanceof Error ? value.message : (sw ? "Imeshindikana kusahihisha risiti." : "Could not correct the receipt."));
    } finally { setSaving(false); }
  }

  return <div className="mt-3 border-t border-gray-100 pt-3">
    {receipt.stockCorrections?.length ? <div className="space-y-2 text-xs text-gray-600">
      <strong className="text-gray-800">{sw ? "Historia ya marekebisho" : "Correction history"}</strong>
      {receipt.stockCorrections.map((correction) => <p key={correction.id} className="border-l-2 border-amber-300 pl-2">
        {new Date(correction.createdAt).toLocaleString(sw ? "sw-TZ" : "en-TZ")} · {correction.reason} · {formatTZS(correction.before.totalLandedCost)} → {formatTZS(correction.after.totalLandedCost)}
      </p>)}
    </div> : null}
    {!receipt.voidedAt && <button type="button" onClick={() => setOpen((value) => !value)} className="mt-2 inline-flex min-h-10 items-center gap-2 border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-900"><RotateCcw className="h-4 w-4" />{sw ? "Sahihisha risiti" : "Correct receipt"}</button>}
    {open && <div className="mt-3 space-y-3 border border-amber-200 bg-amber-50 p-3">
      <p className="text-xs leading-5 text-amber-950">{receipt.hasReturnHistory ? (sw ? "Risiti hii ina historia ya rejesho kwa supplier. Unaweza kusahihisha invoice na maelezo tu; idadi inahitaji ukaguzi wa rejesho na gharama." : "This receipt has supplier-return history. You can correct its invoice and note only; quantity changes need a review of the return and costs.") : receipt.estimatedAllocation || receipt.transportCost || receipt.otherCost ? (sw ? "Unaweza kusahihisha invoice na maelezo tu. Idadi kwenye risiti yenye gharama zilizogawiwa inahitaji ukaguzi wa gharama." : "You can correct the invoice and note only. Quantities on receipts with allocated costs need a reviewed correction.") : (sw ? "Badili idadi iliyopokelewa; weka 0 kwa bidhaa iliyoingizwa kimakosa. Bei za kununua na malipo hazibadilishwi hapa." : "Correct received quantities; use 0 for an item entered by mistake. Buying costs and payments cannot be edited here.")}</p>
      {receipt.items.map((item) => <label key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{item.product.name} ({item.product.unit})</span><input type="number" min="0" step="1" disabled={Boolean(receipt.hasReturnHistory || receipt.estimatedAllocation || receipt.transportCost || receipt.otherCost)} value={quantities[item.id]} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))} className="h-10 w-24 border border-gray-300 bg-white px-2 text-right disabled:bg-gray-100" aria-label={`${item.product.name} ${sw ? "idadi sahihi" : "correct quantity"}`} /></label>)}
      <div className="grid gap-2 sm:grid-cols-2"><label className="grid gap-1 text-xs font-medium"><span>{sw ? "Namba ya invoice" : "Invoice number"}</span><input value={invoiceNumber} maxLength={120} onChange={(event) => setInvoiceNumber(event.target.value)} className="h-10 border border-gray-300 bg-white px-2 text-sm" /></label><label className="grid gap-1 text-xs font-medium"><span>{sw ? "Maelezo" : "Note"}</span><input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} className="h-10 border border-gray-300 bg-white px-2 text-sm" /></label></div>
      <label className="grid gap-1 text-xs font-medium"><span>{sw ? "Sababu ya marekebisho" : "Correction reason"}</span><input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} className="h-10 border border-gray-300 bg-white px-2 text-sm" required /></label>
      <p className="text-xs text-amber-950">{sw ? "Ikiwa malipo yaliyorekodiwa yanazidi jumla mpya, sahihisha malipo kwanza kwenye Uchambuzi wa Manunuzi." : "If recorded payments exceed the new total, correct the payment first in Purchase Analytics."} <Link href="/analytics/purchases" className="font-semibold underline">{sw ? "Fungua manunuzi" : "Open purchases"}</Link></p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => void submit()} className="min-h-10 bg-brand-700 px-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "..." : sw ? "Hifadhi marekebisho" : "Save correction"}</button><button type="button" onClick={() => setOpen(false)} className="min-h-10 border border-gray-300 bg-white px-3 text-sm">{sw ? "Ghairi" : "Cancel"}</button></div>
    </div>}
  </div>;
}
