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
  items: Array<{ quantity: number; unitPrice: number; totalPrice: number; name?: string | null; unit?: string | null; product?: { name: string; unit: string } | null }>;
}

interface ReceiptActionsProps {
  sale: ReceiptSale;
  shopName?: string;
  lang: "sw" | "en";
  change?: number | null;
  compact?: boolean;
}

interface ReceiptData {
  shopName: string;
  receiptId: string;
  issuedAt: string;
  total: string;
  payment: string;
  change?: string;
  labels: { title: string; issued: string; total: string; payment: string; change: string; thanks: string };
  items: Array<{ name: string; quantity: number; unitPrice: string; totalPrice: string }>;
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

function receiptDate(value: string, lang: "sw" | "en") {
  const date = new Date(value);
  const locale = lang === "sw" ? "sw-TZ" : "en-TZ";
  const day = date.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
  const time = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day}, ${time}`;
}

function receiptData(sale: ReceiptSale, shopName: string, lang: "sw" | "en", change?: number | null): ReceiptData {
  const isSwahili = lang === "sw";
  return {
    shopName,
    receiptId: receiptNumber(sale),
    issuedAt: receiptDate(sale.createdAt, lang),
    total: formatTZS(sale.totalAmount),
    payment: paymentLabel(sale.paymentMethod, lang),
    change: change && change > 0 ? formatTZS(change) : undefined,
    labels: {
      title: isSwahili ? "RISITI YA MAUZO" : "SALES RECEIPT",
      issued: isSwahili ? "Imetolewa" : "Issued",
      total: isSwahili ? "Jumla" : "Total",
      payment: isSwahili ? "Malipo" : "Payment",
      change: isSwahili ? "Chenji" : "Change",
      thanks: isSwahili ? "Asante kwa kununua. Karibu tena!" : "Thank you for your purchase. Please come again!",
    },
    items: sale.items.map((item) => ({ name: item.product?.name || item.name || "Custom service", quantity: item.quantity, unitPrice: formatTZS(item.unitPrice), totalPrice: formatTZS(item.totalPrice) })),
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);
}

const receiptStyles = `
  * { box-sizing: border-box; }
  .receipt { width: 100%; color: #111827; font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.35; }
  .receipt-header { text-align: center; }
  .receipt-brand { margin: 0 0 5px; color: #15803d; font-size: 11px; font-weight: 800; letter-spacing: 1.3px; text-transform: uppercase; }
  .receipt-shop { margin: 0; color: #111827; font-size: 22px; font-weight: 800; line-height: 1.18; }
  .receipt-title { margin: 8px 0 2px; color: #374151; font-size: 10px; font-weight: 800; letter-spacing: 1px; }
  .receipt-meta { margin: 2px 0 0; color: #4b5563; font-size: 12px; }
  .receipt-rule { border: 0; border-top: 1px dashed #9ca3af; margin: 16px 0; }
  .receipt-items { display: grid; gap: 13px; }
  .receipt-item-name { margin: 0 0 4px; color: #111827; font-size: 15px; font-weight: 700; line-height: 1.35; }
  .receipt-item-row, .receipt-summary-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .receipt-item-detail, .receipt-summary-label { color: #4b5563; font-size: 12px; }
  .receipt-item-total { color: #111827; font-size: 13px; font-weight: 700; text-align: right; white-space: nowrap; }
  .receipt-summary { display: grid; gap: 8px; }
  .receipt-total { align-items: center; border-top: 2px solid #15803d; margin-top: 3px; padding-top: 11px; }
  .receipt-total .receipt-summary-label, .receipt-total .receipt-summary-value { color: #111827; font-size: 18px; font-weight: 800; }
  .receipt-summary-value { color: #111827; font-size: 13px; font-weight: 700; text-align: right; }
  .receipt-footer { margin: 16px 0 0; color: #4b5563; font-size: 12px; text-align: center; }
`;

function receiptBodyMarkup(data: ReceiptData) {
  const change = data.change ? `<div class="receipt-summary-row"><span class="receipt-summary-label">${escapeHtml(data.labels.change)}</span><strong class="receipt-summary-value">${escapeHtml(data.change)}</strong></div>` : "";
  return `<style>${receiptStyles}</style><section class="receipt"><header class="receipt-header"><p class="receipt-brand">DukaPilot</p><h1 class="receipt-shop">${escapeHtml(data.shopName)}</h1><p class="receipt-title">${escapeHtml(data.labels.title)}</p><p class="receipt-meta">${escapeHtml(data.receiptId)} | ${escapeHtml(data.labels.issued)} ${escapeHtml(data.issuedAt)}</p></header><hr class="receipt-rule"><div class="receipt-items">${data.items.map((item) => `<article><p class="receipt-item-name">${escapeHtml(item.name)}</p><div class="receipt-item-row"><span class="receipt-item-detail">${item.quantity} x ${escapeHtml(item.unitPrice)}</span><strong class="receipt-item-total">${escapeHtml(item.totalPrice)}</strong></div></article>`).join("")}</div><hr class="receipt-rule"><div class="receipt-summary"><div class="receipt-summary-row receipt-total"><span class="receipt-summary-label">${escapeHtml(data.labels.total)}</span><strong class="receipt-summary-value">${escapeHtml(data.total)}</strong></div><div class="receipt-summary-row"><span class="receipt-summary-label">${escapeHtml(data.labels.payment)}</span><strong class="receipt-summary-value">${escapeHtml(data.payment)}</strong></div>${change}</div><p class="receipt-footer">${escapeHtml(data.labels.thanks)}</p></section>`;
}

function printableMarkup(data: ReceiptData) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(data.receiptId)}</title><style>@page{size:80mm auto;margin:4mm}body{width:72mm;margin:0;font-family:Arial,Helvetica,sans-serif;background:#fff}</style></head><body>${receiptBodyMarkup(data)}</body></html>`;
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

async function createPng(data: ReceiptData) {
  const element = document.createElement("div");
  element.style.cssText = "position:fixed;left:-10000px;top:0;width:400px;padding:28px;background:#fff;";
  element.innerHTML = receiptBodyMarkup(data);
  document.body.appendChild(element);
  try {
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(element, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create receipt image")), "image/png"));
  } finally {
    element.remove();
  }
}

function pdfHeight(data: ReceiptData, pdf: { splitTextToSize: (text: string, width: number) => string[] }) {
  const shopLines = pdf.splitTextToSize(data.shopName, 66).length;
  const itemLines = data.items.reduce((total, item) => total + pdf.splitTextToSize(item.name, 66).length, 0);
  return Math.max(115, Math.ceil(53 + shopLines * 5 + itemLines * 5 + data.items.length * 9 + (data.change ? 7 : 0)));
}

async function createPdf(data: ReceiptData) {
  const { jsPDF } = await import("jspdf");
  const draft = new jsPDF({ unit: "mm", format: [80, 150] });
  const pdf = new jsPDF({ unit: "mm", format: [80, pdfHeight(data, draft)] });
  const center = 40;
  const left = 6;
  const right = 74;
  let y = 8;
  const divider = () => { pdf.setDrawColor(156, 163, 175); pdf.setLineDashPattern([1.2, 1.2], 0); pdf.line(left, y, right, y); pdf.setLineDashPattern([], 0); y += 6; };
  const centered = (text: string, size: number, style: "normal" | "bold", color: [number, number, number], gap: number) => {
    pdf.setFont("helvetica", style); pdf.setFontSize(size); pdf.setTextColor(...color);
    const wrapped = pdf.splitTextToSize(text, 66);
    pdf.text(wrapped, center, y, { align: "center" });
    y += wrapped.length * (size * 0.42) + gap;
  };

  centered("DUKAPILOT", 7.5, "bold", [21, 128, 61], 2.5);
  centered(data.shopName, 13, "bold", [17, 24, 39], 3);
  centered(data.labels.title, 7.5, "bold", [75, 85, 99], 2);
  centered(`${data.receiptId} | ${data.labels.issued} ${data.issuedAt}`, 7.5, "normal", [75, 85, 99], 5);
  divider();

  data.items.forEach((item) => {
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(9.5); pdf.setTextColor(17, 24, 39);
    const name = pdf.splitTextToSize(item.name, 68);
    pdf.text(name, left, y);
    y += name.length * 4.1 + 1.5;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.8); pdf.setTextColor(75, 85, 99);
    pdf.text(`${item.quantity} x ${item.unitPrice}`, left, y);
    pdf.setFont("helvetica", "bold"); pdf.setTextColor(17, 24, 39);
    pdf.text(item.totalPrice, right, y, { align: "right" });
    y += 5.5;
  });
  divider();

  pdf.setDrawColor(21, 128, 61); pdf.setLineWidth(0.6); pdf.line(left, y, right, y); pdf.setLineWidth(0.2); y += 6;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(11); pdf.setTextColor(17, 24, 39);
  pdf.text(data.labels.total, left, y); pdf.text(data.total, right, y, { align: "right" }); y += 6;
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(75, 85, 99);
  pdf.text(data.labels.payment, left, y); pdf.setFont("helvetica", "bold"); pdf.setTextColor(17, 24, 39); pdf.text(data.payment, right, y, { align: "right" }); y += 5;
  if (data.change) { pdf.setFont("helvetica", "normal"); pdf.setTextColor(75, 85, 99); pdf.text(data.labels.change, left, y); pdf.setFont("helvetica", "bold"); pdf.setTextColor(17, 24, 39); pdf.text(data.change, right, y, { align: "right" }); y += 5; }
  centered(data.labels.thanks, 7.5, "normal", [75, 85, 99], 0);
  return pdf.output("blob");
}

export default function ReceiptActions({ sale, shopName = "DukaPilot", lang, change, compact = false }: ReceiptActionsProps) {
  const [busy, setBusy] = useState<"png" | "pdf" | null>(null);
  const data = receiptData(sale, shopName, lang, change);
  const prefix = `risiti-${data.receiptId.toLowerCase()}`;

  async function sharePng() {
    setBusy("png");
    try { await shareOrDownload(await createPng(data), `${prefix}.png`, shopName); } finally { setBusy(null); }
  }

  async function sharePdf() {
    setBusy("pdf");
    try { await shareOrDownload(await createPdf(data), `${prefix}.pdf`, shopName); } finally { setBusy(null); }
  }

  function printReceipt() {
    const popup = window.open("", "_blank", "popup,width=420,height=640");
    if (!popup) return;
    popup.opener = null;
    popup.document.open();
    popup.document.write(printableMarkup(data));
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
