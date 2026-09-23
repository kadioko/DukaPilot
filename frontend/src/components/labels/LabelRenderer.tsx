"use client";

import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { formatTZS } from "@/lib/api";
import type { BarcodeType, LabelProduct, LabelTemplate } from "./types";

function barcodeFormat(type?: BarcodeType | null, value?: string | null) {
  if (type === "EAN13" && /^\d{13}$/.test(value || "")) return "EAN13";
  if (type === "UPC" && /^\d{12}$/.test(value || "")) return "UPC";
  return "CODE128";
}

function labelName(product: LabelProduct) {
  return product.labelName?.trim() || product.name;
}

function visibleFields(template: LabelTemplate) {
  if (template.layout === "CUSTOM") return template.fields;
  if (template.layout === "BARCODE_ONLY") return ["barcode"];
  if (template.layout === "NAME_PRICE") return ["name", "price"];
  if (template.layout === "NAME_BARCODE") return ["name", "barcode"];
  return ["name", "price", "barcode"];
}

export function barcodeSvgMarkup(value: string, type?: BarcodeType | null, width = 260, height = 76) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, value, {
    format: barcodeFormat(type, value),
    width: 1.25,
    height: Math.max(24, height - 22),
    displayValue: true,
    fontSize: 11,
    margin: 0,
    background: "#ffffff",
    lineColor: "#111827",
  });
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("preserveAspectRatio", "none");
  return svg.outerHTML;
}

export function ProductBarcode({ value, type, className = "" }: { value: string; type?: BarcodeType | null; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, {
        format: barcodeFormat(type, value),
        width: 1.25,
        height: 46,
        displayValue: true,
        fontSize: 11,
        margin: 0,
        background: "#ffffff",
        lineColor: "#111827",
      });
      setError(false);
    } catch {
      setError(true);
    }
  }, [type, value]);

  if (error) return <p className="font-mono text-[10px] text-red-700">{value}</p>;
  return <svg ref={ref} className={`h-auto w-full ${className}`} role="img" aria-label={`Barcode ${value}`} />;
}

export function LabelPreview({ product, template, className = "" }: { product: LabelProduct; template: LabelTemplate; className?: string }) {
  const fields = visibleFields(template);
  const hasBarcode = fields.includes("barcode") && Boolean(product.barcode);
  const nameOnly = fields.length === 1 && fields[0] === "name";
  return <article
    className={`overflow-hidden border border-gray-300 bg-white text-gray-950 shadow-sm ${className}`}
    style={{ width: `${template.widthMm}mm`, height: `${template.heightMm}mm`, padding: "1.5mm" }}
    aria-label={`Preview label for ${labelName(product)}`}
  >
    <div className="flex h-full min-h-0 flex-col justify-between gap-0.5" style={{ fontSize: "2.8mm", lineHeight: 1.1 }}>
      {fields.includes("name") && <p className="truncate font-bold">{labelName(product)}</p>}
      {fields.includes("price") && <p className="font-extrabold text-brand-800">{formatTZS(product.sellingPrice)}</p>}
      {fields.includes("sku") && product.sku && <p className="truncate font-mono text-[2.2mm]">SKU {product.sku}</p>}
      {fields.includes("unit") && <p className="truncate text-[2.2mm]">{product.unit || "pcs"}</p>}
      {fields.includes("stock") && <p className="truncate text-[2.2mm]">Stock {product.currentStock ?? 0}</p>}
      {hasBarcode && <ProductBarcode value={product.barcode || ""} type={template.barcodeType || product.barcodeType} className={nameOnly ? "h-full" : "max-h-[15mm]"} />}
      {fields.includes("barcode") && !product.barcode && <p className="text-[2.2mm] text-red-700">Barcode required</p>}
    </div>
  </article>;
}

export function labelFieldsForTemplate(template: LabelTemplate) {
  return visibleFields(template);
}
