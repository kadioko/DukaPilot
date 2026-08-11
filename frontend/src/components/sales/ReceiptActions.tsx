"use client";

import { useState } from "react";
import { Download, ImageDown, LoaderCircle, Printer } from "lucide-react";
import { formatTZS } from "@/lib/api";

export interface ReceiptSale {
  id: string;
  totalAmount: number;
  paymentMethod: string;
  createdAt: string;
  receiptNumber?: number | null;
  items: Array<{ quantity: number; unitPrice: number; totalPrice: number; product: { name: string; unit: string } }>;
}

interface ReceiptActionsProps {
  sale: ReceiptSale;
  shopName?: string;
  lang: "sw" | "en";
  change?: number | null;
  compact?: boolean;
}

function receiptNumber(sale: ReceiptSale) {
  return sale.receiptNumber ? `DP-${String(sale.receiptNumber).padStart(6, "0")}` : sale.id.slice(-8).toUpperCase();
}

function paymentLabel(value: string, lang: "sw" | "en") {
  const labels: Record<string, [string, string]> = {
    CASH: ["Taslimu", "Cash"], MPESA: ["M-Pesa", "M-Pesa"], TIGOPESA: ["Tigo Pesa", "Tigo Pesa"], AIRTEL_MONEY: ["Airtel Money", "Airtel Money"], HALOPESA: ["HaloPesa", "HaloPesa"], BANK: ["Benki", "Bank"], CREDIT: ["Deni", "Credit"],
  };
  return (labels[value] || labels.CASH)[lang === "sw" ? 0 : 1];
}

function textLines(sale: ReceiptSale, shopName: string, lang: "sw" | "en", change?: number | null) {
  return [
    shopName,
    `${lang === "sw" ? "Risiti" : "Receipt"}: ${receiptNumber(sale)}`,
    new Date(sale.createdAt).toLocaleString(lang === "sw" ? "sw-TZ" : "en-TZ"),
    "",
    ...sale.items.flatMap((item) => [`${item.product.name} x${item.quantity}`, `${formatTZS(item.unitPrice)} x ${item.quantity} = ${formatTZS(item.totalPrice)}`]),
    "",
    `${lang === "sw" ? "Jumla" : "Total"}: ${formatTZS(sale.totalAmount)}`,
    `${lang === "sw" ? "Malipo" : "Payment"}: ${paymentLabel(sale.paymentMethod, lang)}`,
    ...(change && change > 0 ? [`${lang === "sw" ? "Chenji" : "Change"}: ${formatTZS(change)}`] : []),
    lang === "sw" ? "Asante kwa kununua." : "Thank you for your purchase.",
  ];
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);
}

function printableMarkup(lines: string[]) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title><style>@page{size:80mm auto;margin:3mm}body{font-family:Arial,sans-serif;width:74mm;margin:0;font-size:11px;color:#111}.line{white-space:pre-wrap;margin:0 0 5px}.line:first-child{font-weight:700;font-size:14px;text-align:center}.line:nth-child(2),.line:nth-child(3){text-align:center}hr{border:0;border-top:1px dashed #666;margin:8px 0}</style></head><body>${lines.map((line, index) => line === "" ? "<hr>" : `<p class="line" data-index="${index}">${escapeHtml(line)}</p>`).join("")}</body></html>`;
}

async function shareOrDownload(blob: Blob, filename: string, title: string) {
  const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
    await nav.share({ title, files: [file] });
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function createPng(lines: string[]) {
  const element = document.createElement("div");
  element.style.cssText = "position:fixed;left:-10000px;top:0;width:360px;padding:24px;background:#fff;color:#111;font-family:Arial,sans-serif;font-size:15px;line-height:1.45;";
  element.innerHTML = printableMarkup(lines).replace("<!doctype html><html><head><meta charset=\"utf-8\"><title>Receipt</title><style>@page{size:80mm auto;margin:3mm}body{font-family:Arial,sans-serif;width:74mm;margin:0;font-size:11px;color:#111}.line{white-space:pre-wrap;margin:0 0 5px}.line:first-child{font-weight:700;font-size:14px;text-align:center}.line:nth-child(2),.line:nth-child(3){text-align:center}hr{border:0;border-top:1px dashed #666;margin:8px 0}</style></head><body>", "").replace("</body></html>", "");
  document.body.appendChild(element);
  try {
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(element, { backgroundColor: "#ffffff", scale: 2 });
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create receipt image")), "image/png"));
  } finally {
    element.remove();
  }
}

async function createPdf(lines: string[]) {
  const { jsPDF } = await import("jspdf");
  const height = Math.max(100, 24 + lines.reduce((total, line) => total + (line ? 6 : 3), 0));
  const pdf = new jsPDF({ unit: "mm", format: [80, height] });
  let y = 8;
  lines.forEach((line, index) => {
    if (!line) { y += 3; return; }
    pdf.setFontSize(index === 0 ? 12 : 9);
    pdf.setFont("helvetica", index === 0 ? "bold" : "normal");
    const wrapped = pdf.splitTextToSize(line, 68);
    pdf.text(wrapped, 6, y, { align: index < 3 ? "center" : "left", maxWidth: 68 });
    y += wrapped.length * 4.5 + 1;
  });
  return pdf.output("blob");
}

export default function ReceiptActions({ sale, shopName = "DukaPilot", lang, change, compact = false }: ReceiptActionsProps) {
  const [busy, setBusy] = useState<"png" | "pdf" | null>(null);
  const lines = textLines(sale, shopName, lang, change);
  const prefix = `risiti-${receiptNumber(sale).toLowerCase()}`;

  async function sharePng() {
    setBusy("png");
    try { await shareOrDownload(await createPng(lines), `${prefix}.png`, shopName); } finally { setBusy(null); }
  }

  async function sharePdf() {
    setBusy("pdf");
    try { await shareOrDownload(await createPdf(lines), `${prefix}.pdf`, shopName); } finally { setBusy(null); }
  }

  function printReceipt() {
    const popup = window.open("", "_blank", "noopener,noreferrer,width=420,height=640");
    if (!popup) return;
    popup.document.open();
    popup.document.write(printableMarkup(lines));
    popup.document.close();
    window.setTimeout(() => { popup.focus(); popup.print(); }, 250);
  }

  const actions = [
    { key: "png", label: lang === "sw" ? "Picha" : "Image", title: lang === "sw" ? "Tuma au pakua risiti kama picha" : "Share or download receipt image", icon: busy === "png" ? LoaderCircle : ImageDown, onClick: sharePng, busy: busy === "png" },
    { key: "pdf", label: "PDF", title: lang === "sw" ? "Tuma au pakua risiti kama PDF" : "Share or download receipt PDF", icon: busy === "pdf" ? LoaderCircle : Download, onClick: sharePdf, busy: busy === "pdf" },
    { key: "print", label: lang === "sw" ? "Chapisha" : "Print", title: lang === "sw" ? "Chapisha; chagua printer ya Bluetooth kwenye print dialog" : "Print; choose the paired Bluetooth printer in the print dialog", icon: Printer, onClick: printReceipt, busy: false },
  ];
  return <div className={`flex flex-wrap gap-2 ${compact ? "" : "mt-2"}`}>{actions.map((action) => { const Icon = action.icon; return <button key={action.key} type="button" disabled={Boolean(action.busy)} onClick={() => { Promise.resolve(action.onClick()).catch(() => {}); }} title={action.title} aria-label={action.title} className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 hover:border-brand-300 hover:bg-brand-50 disabled:opacity-60 ${compact ? "h-9 w-9" : "min-h-11 px-3 py-2 text-sm font-semibold"}`}><Icon className={`h-4 w-4 ${action.busy ? "animate-spin" : ""}`} />{!compact && <span>{action.label}</span>}</button>; })}</div>;
}
