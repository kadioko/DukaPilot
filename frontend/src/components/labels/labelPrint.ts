"use client";

import { barcodeSvgMarkup, labelFieldsForTemplate } from "./LabelRenderer";
import type { LabelProduct, LabelTemplate } from "./types";

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character));
}

function price(value: number) {
  return `TZS ${Number(value || 0).toLocaleString("en-US")}`;
}

function labelName(product: LabelProduct) {
  return product.labelName?.trim() || product.name;
}

export function labelMarkup(product: LabelProduct, template: LabelTemplate) {
  const fields = labelFieldsForTemplate(template);
  const rows = [
    fields.includes("name") ? `<p class="name">${escapeHtml(labelName(product))}</p>` : "",
    fields.includes("price") ? `<p class="price">${escapeHtml(price(product.sellingPrice))}</p>` : "",
    fields.includes("sku") && product.sku ? `<p class="meta">SKU ${escapeHtml(product.sku)}</p>` : "",
    fields.includes("unit") ? `<p class="meta">${escapeHtml(product.unit || "pcs")}</p>` : "",
    fields.includes("stock") ? `<p class="meta">Stock ${escapeHtml(product.currentStock ?? 0)}</p>` : "",
    fields.includes("barcode") && product.barcode ? `<div class="barcode">${barcodeSvgMarkup(product.barcode, template.barcodeType || product.barcodeType, 300, 90)}</div>` : "",
    fields.includes("barcode") && !product.barcode ? `<p class="missing">Barcode required</p>` : "",
  ].filter(Boolean).join("");
  return `<article class="label">${rows}</article>`;
}

function printDocument(items: LabelProduct[], template: LabelTemplate) {
  const labels = items.map((product) => labelMarkup(product, template)).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>DukaPilot labels</title><style>
    @page { size: ${template.widthMm}mm ${template.heightMm}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111827; font-family: Arial, Helvetica, sans-serif; }
    .label { width: ${template.widthMm}mm; height: ${template.heightMm}mm; padding: 1.5mm; overflow: hidden; page-break-after: always; break-after: page; display: flex; flex-direction: column; gap: .6mm; }
    .label:last-child { page-break-after: auto; break-after: auto; }
    p { margin: 0; } .name { font-size: 2.8mm; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .price { font-size: 2.9mm; color: #166534; font-weight: 800; } .meta { font-size: 2.1mm; } .missing { font-size: 2.2mm; color: #b91c1c; }
    .barcode { margin-top: auto; width: 100%; min-height: 12mm; } .barcode svg { width: 100%; height: auto; display: block; }
  </style></head><body>${labels}</body></html>`;
}

export function openLabelPrint(items: LabelProduct[], template: LabelTemplate, target?: Window | null) {
  const popup = target || window.open("", "_blank");
  if (!popup) throw new Error("Allow pop-ups to print labels.");
  popup.document.open();
  popup.document.write(printDocument(items, template));
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 180);
}

export async function downloadLabelPdf(items: LabelProduct[], template: LabelTemplate) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${template.widthMm}mm;background:#fff;z-index:-1;`;
  host.innerHTML = `<style>
    .label { width:${template.widthMm}mm;height:${template.heightMm}mm;padding:1.5mm;overflow:hidden;background:#fff;color:#111827;font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;gap:.6mm; }
    p { margin:0; }.name { font-size:2.8mm;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }.price { font-size:2.9mm;color:#166534;font-weight:800; }.meta { font-size:2.1mm; }.missing { font-size:2.2mm;color:#b91c1c; }.barcode { margin-top:auto;width:100%;min-height:12mm; }.barcode svg { width:100%;height:auto;display:block; }
  </style>${items.map((product) => labelMarkup(product, template)).join("")}`;
  document.body.appendChild(host);
  try {
    const orientation = template.widthMm > template.heightMm ? "landscape" : "portrait";
    const pdf = new jsPDF({ orientation, unit: "mm", format: [template.widthMm, template.heightMm] });
    const labels = Array.from(host.querySelectorAll<HTMLElement>(".label"));
    for (const [index, label] of labels.entries()) {
      const canvas = await html2canvas(label, { backgroundColor: "#ffffff", scale: 3, useCORS: true });
      if (index > 0) pdf.addPage([template.widthMm, template.heightMm], orientation);
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, template.widthMm, template.heightMm, undefined, "FAST");
    }
    pdf.save("dukapilot-product-labels.pdf");
  } finally {
    host.remove();
  }
}
