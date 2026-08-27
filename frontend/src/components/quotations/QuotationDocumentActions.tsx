"use client";

import { useState } from "react";
import { Copy, Download, LoaderCircle, MessageCircle, Printer } from "lucide-react";
import { formatTZS } from "@/lib/api";

export type CustomerDocument = {
  quotationNumber: string;
  revisionNumber: number;
  issueDate: string;
  expiryDate?: string | null;
  projectTitle: string;
  projectType?: string | null;
  scopeOfWork?: string | null;
  currency: string;
  business?: { name: string; location?: string | null; district?: string | null; phone?: string | null };
  customer: { name: string; phone?: string | null; email?: string | null; address?: string | null };
  customerNote?: string | null;
  paymentTerms?: string | null;
  termsAndConditions?: string | null;
  subtotalAmount: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  depositRequiredAmount?: number;
  outstandingAmount?: number;
  signatureName?: string | null;
  sections?: Array<{ id: string; name: string; position: number }>;
  items: Array<{ sectionId?: string | null; name: string; description?: string | null; quantity?: string; unit?: string; unitPrice?: number; discountAmount?: number; taxAmount?: number; lineTotal: number; position?: number }>;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);
}

function dateLabel(value: string | null | undefined, lang: "sw" | "en") {
  if (!value) return "-";
  return new Date(value).toLocaleDateString(lang === "sw" ? "sw-TZ" : "en-TZ", { day: "2-digit", month: "short", year: "numeric" });
}

function documentMarkup(quotation: CustomerDocument, lang: "sw" | "en") {
  const labels = lang === "sw"
    ? { title: "NUKUU YA BEI", customer: "Mteja", issued: "Tarehe", expiry: "Inaisha", scope: "Maelezo ya kazi", subtotal: "Jumla ndogo", discount: "Punguzo", tax: "Kodi", total: "JUMLA", deposit: "Amana inayohitajika", terms: "Masharti", payment: "Masharti ya malipo", note: "Maelezo", signature: "Sahihi iliyoidhinishwa" }
    : { title: "QUOTATION", customer: "Customer", issued: "Issue date", expiry: "Valid until", scope: "Scope of work", subtotal: "Subtotal", discount: "Discount", tax: "Tax", total: "TOTAL", deposit: "Deposit required", terms: "Terms and conditions", payment: "Payment terms", note: "Notes", signature: "Authorized signature" };
  const money = (amount: number) => `${quotation.currency || "TZS"} ${Number(amount || 0).toLocaleString("en-TZ")}`;
  const grouped = new Map<string, CustomerDocument["items"]>();
  quotation.items.slice().sort((a, b) => (a.position || 0) - (b.position || 0)).forEach((item) => {
    const key = item.sectionId || "other";
    grouped.set(key, [...(grouped.get(key) || []), item]);
  });
  const showQuantities = quotation.items.some((item) => item.quantity !== undefined);
  const showUnitPrices = quotation.items.some((item) => item.unitPrice !== undefined);
  const showDiscounts = quotation.items.some((item) => item.discountAmount !== undefined);
  const columns = ["<th>Item</th>", showQuantities ? "<th>Qty</th>" : "", showUnitPrices ? "<th>Unit price</th>" : "", showDiscounts ? "<th>Discount</th>" : "", "<th class=\"right\">Total</th>"].join("");
  const itemTable = (items: CustomerDocument["items"]) => items.map((item) => `<tr><td><strong>${escapeHtml(item.name)}</strong>${item.description ? `<small>${escapeHtml(item.description)}</small>` : ""}</td>${showQuantities ? `<td>${item.quantity ? `${escapeHtml(item.quantity)} ${escapeHtml(item.unit || "")}` : ""}</td>` : ""}${showUnitPrices ? `<td>${item.unitPrice === undefined ? "" : money(item.unitPrice)}</td>` : ""}${showDiscounts ? `<td>${item.discountAmount ? `-${money(item.discountAmount)}` : ""}</td>` : ""}<td class="right">${money(item.lineTotal)}</td></tr>`).join("");
  const sections = (quotation.sections || []).sort((a, b) => a.position - b.position).map((section) => grouped.has(section.id) ? `<tr class="section"><td colspan="${2 + Number(showQuantities) + Number(showUnitPrices) + Number(showDiscounts)}">${escapeHtml(section.name)}</td></tr>${itemTable(grouped.get(section.id) || [])}` : "").join("") + (grouped.has("other") ? itemTable(grouped.get("other") || []) : "");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(quotation.quotationNumber)}</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f3f4f6;color:#172033;font:14px Arial,Helvetica,sans-serif}.page{width:210mm;min-height:297mm;margin:0 auto;padding:18mm;background:#fff}.brand{color:#15803d;font-size:12px;font-weight:800;letter-spacing:1.3px}.top{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #15803d;padding-bottom:16px}.business{color:#4b5563;line-height:1.55}.title{text-align:right}.title h1{margin:0;font-size:30px;letter-spacing:0}.title p{margin:5px 0;color:#4b5563}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:22px 0}.label{font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:700;letter-spacing:.7px}.value{margin-top:4px;line-height:1.5}.scope{margin:20px 0;padding:14px;border-left:4px solid #86efac;background:#f0fdf4;white-space:pre-wrap;line-height:1.55}table{width:100%;border-collapse:collapse;margin-top:16px}th{padding:9px;text-align:left;background:#f3f4f6;color:#4b5563;font-size:11px;text-transform:uppercase}td{padding:10px 9px;border-bottom:1px solid #e5e7eb;vertical-align:top}td small{display:block;margin-top:3px;color:#6b7280;line-height:1.4}.right{text-align:right;font-weight:700;white-space:nowrap}.section td{padding-top:16px;background:#fff;border-bottom:2px solid #bbf7d0;color:#166534;font-weight:800}.summary{margin-left:auto;margin-top:20px;width:280px}.summary div{display:flex;justify-content:space-between;gap:18px;padding:7px 0;color:#4b5563}.summary .total{border-top:2px solid #15803d;margin-top:4px;padding-top:11px;color:#111827;font-size:17px;font-weight:800}.notes{margin-top:30px;line-height:1.6;white-space:pre-wrap}.signature{margin-top:42px;border-top:1px solid #9ca3af;padding-top:7px;width:220px;font-size:12px;color:#4b5563}@page{size:A4;margin:0}@media print{body{background:#fff}.page{margin:0;box-shadow:none}}
  </style></head><body><main class="page"><div class="top"><div><div class="brand">DUKAPILOT</div><h2 style="margin:7px 0 3px">${escapeHtml(quotation.business?.name || "Business")}</h2><div class="business">${escapeHtml([quotation.business?.location, quotation.business?.district, quotation.business?.phone].filter(Boolean).join(" | "))}</div></div><div class="title"><h1>${labels.title}</h1><p><strong>${escapeHtml(quotation.quotationNumber)}</strong> · v${quotation.revisionNumber}</p><p>${labels.issued}: ${escapeHtml(dateLabel(quotation.issueDate, lang))}</p><p>${labels.expiry}: ${escapeHtml(dateLabel(quotation.expiryDate, lang))}</p></div></div><div class="grid"><div><div class="label">${labels.customer}</div><div class="value"><strong>${escapeHtml(quotation.customer.name)}</strong><br>${escapeHtml([quotation.customer.phone, quotation.customer.email, quotation.customer.address].filter(Boolean).join(" · "))}</div></div><div><div class="label">${escapeHtml(quotation.projectType || labels.title)}</div><div class="value"><strong>${escapeHtml(quotation.projectTitle)}</strong></div></div></div>${quotation.scopeOfWork ? `<div><div class="label">${labels.scope}</div><div class="scope">${escapeHtml(quotation.scopeOfWork)}</div></div>` : ""}<table><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Discount</th><th class="right">Total</th></tr></thead><tbody>${sections}</tbody></table><section class="summary"><div><span>${labels.subtotal}</span><strong>${money(quotation.subtotalAmount)}</strong></div>${quotation.discountAmount ? `<div><span>${labels.discount}</span><strong>-${money(quotation.discountAmount)}</strong></div>` : ""}${quotation.taxAmount ? `<div><span>${labels.tax}</span><strong>${money(quotation.taxAmount)}</strong></div>` : ""}<div class="total"><span>${labels.total}</span><span>${money(quotation.totalAmount)}</span></div>${quotation.depositRequiredAmount ? `<div><span>${labels.deposit}</span><strong>${money(quotation.depositRequiredAmount)}</strong></div>` : ""}</section>${quotation.paymentTerms ? `<section class="notes"><div class="label">${labels.payment}</div>${escapeHtml(quotation.paymentTerms)}</section>` : ""}${quotation.customerNote ? `<section class="notes"><div class="label">${labels.note}</div>${escapeHtml(quotation.customerNote)}</section>` : ""}${quotation.termsAndConditions ? `<section class="notes"><div class="label">${labels.terms}</div>${escapeHtml(quotation.termsAndConditions)}</section>` : ""}<div class="signature">${escapeHtml(quotation.signatureName || labels.signature)}</div></main></body></html>`;
}

async function shareOrDownload(blob: Blob, filename: string, title: string) {
  const file = new File([blob], filename, { type: "application/pdf" });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) { await nav.share({ title, files: [file] }); return; }
  const href = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = href; link.download = filename; link.click(); URL.revokeObjectURL(href);
}

export default function QuotationDocumentActions({ quotation, documentLang, uiLang = documentLang, publicUrl }: { quotation: CustomerDocument; documentLang: "sw" | "en"; uiLang?: "sw" | "en"; publicUrl?: string }) {
  const [busy, setBusy] = useState(false);
  const title = `${documentLang === "sw" ? "Nukuu ya Bei" : "Quotation"} ${quotation.quotationNumber}`;
  const markup = documentMarkup(quotation, documentLang);
  const filename = `quotation-${quotation.quotationNumber.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
  async function pdf() { setBusy(true); try { const { jsPDF } = await import("jspdf"); const pdf = new jsPDF({ unit: "pt", format: "a4" }); const { default: html2canvas } = await import("html2canvas"); const host = document.createElement("iframe"); host.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0"; document.body.appendChild(host); host.contentDocument?.open(); host.contentDocument?.write(markup); host.contentDocument?.close(); await new Promise((resolve) => setTimeout(resolve, 180)); const page = host.contentDocument?.querySelector(".page") as HTMLElement; if (!page) throw new Error("Could not prepare quotation PDF"); const canvas = await html2canvas(page, { backgroundColor: "#ffffff", scale: 2, useCORS: true }); const image = canvas.toDataURL("image/png"); pdf.addImage(image, "PNG", 0, 0, 595.28, 841.89); host.remove(); await shareOrDownload(pdf.output("blob"), filename, title); } finally { setBusy(false); } }
  function print() { const popup = window.open("", "_blank", "popup,width=900,height=900"); if (!popup) return; popup.opener = null; popup.document.open(); popup.document.write(markup); popup.document.close(); window.setTimeout(() => { popup.focus(); popup.print(); }, 250); }
  async function copy() { if (publicUrl) await navigator.clipboard.writeText(publicUrl); }
  function whatsapp() { const url = publicUrl || window.location.href; const text = documentLang === "sw" ? `Habari, tafadhali angalia nukuu ya bei ${quotation.quotationNumber}: ${url}` : `Hello, please view quotation ${quotation.quotationNumber}: ${url}`; window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer"); }
  const button = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 hover:border-brand-300 hover:bg-brand-50";
  return <div className="flex flex-wrap gap-2"><button type="button" onClick={() => { void pdf().catch(() => {}); }} disabled={busy} className={button} title="PDF"><>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}</>PDF</button><button type="button" onClick={print} className={button} title={uiLang === "sw" ? "Chapisha" : "Print"}><Printer className="h-4 w-4" />{uiLang === "sw" ? "Chapisha" : "Print"}</button>{publicUrl && <><button type="button" onClick={() => { void copy().catch(() => {}); }} className={button} title={uiLang === "sw" ? "Nakili link" : "Copy link"}><Copy className="h-4 w-4" />{uiLang === "sw" ? "Nakili link" : "Copy link"}</button><button type="button" onClick={whatsapp} className={button} title="WhatsApp"><MessageCircle className="h-4 w-4 text-green-600" />WhatsApp</button></>}</div>;
}
