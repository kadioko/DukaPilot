"use client";

import { ProductBarcode } from "@/components/labels/LabelRenderer";
import type { BarcodeType } from "@/components/labels/types";

// Compatibility view for feature areas that need a barcode outside the full
// label composer. JsBarcode renders EAN, UPC, and Code 128 correctly.
export function BarcodeLabel({ value, name, price, barcodeType, className = "" }: { value: string; name?: string; price?: string; barcodeType?: BarcodeType | null; className?: string }) {
  return <div className={`bg-white p-2 text-center ${className}`}><p className="truncate text-xs font-semibold text-gray-900">{name || "DukaPilot"}</p><ProductBarcode value={value} type={barcodeType} className="mt-1" />{price && <p className="text-xs font-bold text-gray-800">{price}</p>}</div>;
}
