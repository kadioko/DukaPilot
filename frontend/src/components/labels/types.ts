export type BarcodeType = "EAN13" | "UPC" | "CODE128" | "INTERNAL";
export type LabelLayout = "BARCODE_ONLY" | "NAME_PRICE" | "NAME_BARCODE" | "NAME_PRICE_BARCODE" | "CUSTOM";
export type LabelField = "name" | "price" | "barcode" | "sku" | "unit" | "stock";
export type PrinterDriver = "BROWSER" | "PDF" | "ZPL" | "TSPL" | "ESCPOS";

export interface LabelProduct {
  id: string;
  name: string;
  labelName?: string | null;
  sku?: string | null;
  barcode?: string | null;
  barcodeType?: BarcodeType | null;
  unit?: string | null;
  currentStock?: number | null;
  sellingPrice: number;
}

export interface LabelTemplate {
  id?: string;
  name: string;
  layout: LabelLayout;
  widthMm: number;
  heightMm: number;
  columns: number;
  gapMm: number;
  fields: LabelField[];
  barcodeType?: BarcodeType | null;
  isDefault?: boolean;
}

export interface PrinterProfile {
  id?: string;
  name: string;
  driver: PrinterDriver;
  widthMm: number;
  heightMm: number;
  dpi: number;
  transport: "BROWSER_DOWNLOAD" | "QZ_TRAY" | "PRINT_BRIDGE";
  templateId?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
  template?: LabelTemplate | null;
}

export const labelFields: LabelField[] = ["name", "price", "barcode", "sku", "unit", "stock"];

export const defaultLabelTemplate: LabelTemplate = {
  name: "40 x 30 mm",
  layout: "NAME_PRICE_BARCODE",
  widthMm: 40,
  heightMm: 30,
  columns: 1,
  gapMm: 2,
  fields: ["name", "price", "barcode"],
  barcodeType: null,
};

export function fieldsForLayout(layout: LabelLayout): LabelField[] {
  if (layout === "BARCODE_ONLY") return ["barcode"];
  if (layout === "NAME_PRICE") return ["name", "price"];
  if (layout === "NAME_BARCODE") return ["name", "barcode"];
  return ["name", "price", "barcode"];
}
