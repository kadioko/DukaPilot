"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Barcode, ClipboardList, Printer, RefreshCw, ScanLine, Search, Tags } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { BarcodeLabel } from "@/components/barcode/BarcodeLabel";
import { api, formatTZS } from "@/lib/api";
import { useLang } from "@/lib/i18n";

type Product = { id: string; name: string; barcode?: string | null; sellingPrice: number; currentStock?: number };
type Report = { withoutBarcodes: Array<{ id: string; name: string; currentStock: number }>; mostScanned: Array<{ barcode: string; scans: number; product: Product | null }>; duplicateAttempts: number };
type Scan = { id: string; barcode: string; context: string; found: boolean; createdAt: string; product?: { id: string; name: string } | null };

const sizeClasses = { small: "w-[48mm]", standard: "w-[62mm]", large: "w-[80mm]" };

export default function BarcodesPage() {
  const lang = useLang();
  const [tab, setTab] = useState<"overview" | "labels" | "history">("overview");
  const [report, setReport] = useState<Report | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [scans, setScans] = useState<Scan[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [labelSize, setLabelSize] = useState<keyof typeof sizeClasses>("standard");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [reportData, productData, historyData] = await Promise.all([
        api.get<Report>("/barcodes/report"),
        api.get<{ products: Product[] }>("/products?limit=200"),
        api.get<{ scans: Scan[] }>("/barcodes/history?limit=50"),
      ]);
      setReport(reportData); setProducts(productData.products.filter((product) => Boolean(product.barcode))); setScans(historyData.scans);
    } finally { setLoading(false); }
  };
  useEffect(() => { load().catch(() => {}); }, []);

  const printProducts = useMemo(() => products.flatMap((product) => Array.from({ length: Math.min(selected[product.id] || 0, 100) }, () => product)), [products, selected]);
  const toggleLabel = (id: string) => setSelected((current) => ({ ...current, [id]: current[id] ? 0 : 1 }));
  const setQuantity = (id: string, value: string) => setSelected((current) => ({ ...current, [id]: Math.max(0, Math.min(100, Number(value) || 0)) }));
  const copyBarcode = async (value: string) => { try { await navigator.clipboard.writeText(value); } catch {} };

  return <AppShell><div className="mx-auto max-w-5xl pb-24 lg:pb-6">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-bold text-gray-950">{lang === "sw" ? "Usimamizi wa Barcode" : "Barcode management"}</h1><p className="mt-1 text-sm text-gray-600">{lang === "sw" ? "Scan, tengeneza, chapisha na fuatilia barcode za duka." : "Scan, generate, print, and track your shop barcodes."}</p></div><button onClick={load} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600" title="Refresh"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button></div>
    <div className="mb-5 grid grid-cols-3 rounded-lg bg-gray-100 p-1">{[["overview", ClipboardList, lang === "sw" ? "Muhtasari" : "Overview"],["labels", Tags, lang === "sw" ? "Labels" : "Labels"],["history", ScanLine, lang === "sw" ? "Historia" : "History"]].map(([value, Icon, label]) => <button key={String(value)} onClick={() => setTab(value as typeof tab)} className={`flex min-h-10 items-center justify-center gap-2 rounded-md text-sm font-semibold ${tab === value ? "bg-white text-brand-700 shadow-sm" : "text-gray-600"}`}><Icon className="h-4 w-4" />{label as string}</button>)}</div>
    {loading && !report ? <div className="py-16 text-center text-gray-500">Loading barcodes...</div> : <>
      {tab === "overview" && <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-3"><Stat label={lang === "sw" ? "Bila barcode" : "Without barcodes"} value={report?.withoutBarcodes.length || 0} tone="amber" /><Stat label={lang === "sw" ? "Majaribio duplicate" : "Duplicate attempts"} value={report?.duplicateAttempts || 0} tone="red" /><Stat label={lang === "sw" ? "Zilizoscanwa" : "Scanned products"} value={report?.mostScanned.length || 0} tone="green" /></div>
        <section className="rounded-lg border border-gray-200 bg-white"><div className="flex items-center justify-between border-b border-gray-100 px-4 py-3"><div><h2 className="font-semibold text-gray-950">{lang === "sw" ? "Bidhaa zisizo na barcode" : "Products without barcodes"}</h2><p className="text-xs text-gray-500">{lang === "sw" ? "Zipe barcode ili ziwe rahisi kuscan." : "Add a barcode so they are ready to scan."}</p></div><Barcode className="h-5 w-5 text-amber-600" /></div>{report?.withoutBarcodes.length ? <div className="divide-y divide-gray-100">{report.withoutBarcodes.map((product) => <div key={product.id} className="flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-800">{product.name}</p><p className="text-xs text-gray-500">{product.currentStock} in stock</p></div><Link href={`/inventory?search=${encodeURIComponent(product.name)}`} className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white">{lang === "sw" ? "Ongeza" : "Add barcode"}</Link></div>)}</div> : <div className="p-8 text-center text-sm text-gray-500">{lang === "sw" ? "Bidhaa zote zina barcode." : "Every active product has a barcode."}</div>}</section>
        <section className="rounded-lg border border-gray-200 bg-white"><div className="border-b border-gray-100 px-4 py-3"><h2 className="font-semibold text-gray-950">{lang === "sw" ? "Zinazotumika zaidi" : "Most scanned"}</h2></div>{report?.mostScanned.length ? <div className="divide-y divide-gray-100">{report.mostScanned.map((item) => <div key={item.barcode} className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="text-sm font-semibold text-gray-800">{item.product?.name || item.barcode}</p><button onClick={() => copyBarcode(item.barcode)} className="font-mono text-xs text-gray-500">{item.barcode}</button></div><span className="rounded-full bg-green-50 px-2 py-1 text-xs font-bold text-green-700">{item.scans} scans</span></div>)}</div> : <div className="p-8 text-center text-sm text-gray-500">{lang === "sw" ? "Hakuna scan zilizorekodiwa bado." : "No scans recorded yet."}</div>}</section>
      </div>}
      {tab === "labels" && <div className="space-y-4"><section className="rounded-lg border border-gray-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-gray-950">{lang === "sw" ? "Chapisha labels nyingi" : "Print multiple labels"}</h2><p className="text-xs text-gray-500">{lang === "sw" ? "Chagua bidhaa na idadi, kisha print." : "Choose products and quantities, then print."}</p></div><button disabled={!printProducts.length} onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"><Printer className="h-4 w-4" />{lang === "sw" ? `Print (${printProducts.length})` : `Print (${printProducts.length})`}</button></div><div className="mt-4 flex gap-2"><span className="text-sm text-gray-600">{lang === "sw" ? "Ukubwa" : "Size"}</span>{(["small", "standard", "large"] as const).map((size) => <button key={size} onClick={() => setLabelSize(size)} className={`rounded-md px-3 py-1.5 text-xs font-bold ${labelSize === size ? "bg-brand-100 text-brand-800" : "bg-gray-100 text-gray-600"}`}>{size === "small" ? "48mm" : size === "standard" ? "62mm" : "80mm"}</button>)}</div></section><section className="overflow-hidden rounded-lg border border-gray-200 bg-white"><div className="divide-y divide-gray-100">{products.map((product) => <div key={product.id} className="flex items-center gap-3 px-4 py-3"><input type="checkbox" checked={Boolean(selected[product.id])} onChange={() => toggleLabel(product.id)} className="h-5 w-5 rounded border-gray-300 text-brand-600" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-gray-800">{product.name}</p><p className="font-mono text-xs text-gray-500">{product.barcode}</p></div><input aria-label={`Label quantity for ${product.name}`} type="number" min="0" max="100" value={selected[product.id] || ""} onChange={(event) => setQuantity(product.id, event.target.value)} className="w-16 rounded-lg border border-gray-300 px-2 py-2 text-sm" placeholder="0" /></div>)}</div></section><div className="print-labels hidden print:grid print:grid-cols-2 print:gap-2">{printProducts.map((product, index) => <BarcodeLabel key={`${product.id}-${index}`} value={product.barcode || ""} name={product.name} price={formatTZS(product.sellingPrice)} className={`${sizeClasses[labelSize]} border`} />)}</div></div>}
      {tab === "history" && <section className="overflow-hidden rounded-lg border border-gray-200 bg-white"><div className="border-b border-gray-100 px-4 py-3"><h2 className="font-semibold text-gray-950">{lang === "sw" ? "Historia ya scan" : "Barcode scan history"}</h2></div>{scans.length ? <div className="divide-y divide-gray-100">{scans.map((scan) => <div key={scan.id} className="flex items-center justify-between gap-4 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-800">{scan.product?.name || scan.barcode}</p><p className="font-mono text-xs text-gray-500">{scan.barcode} · {scan.context}</p></div><div className="text-right"><p className={`text-xs font-bold ${scan.found ? "text-green-700" : "text-red-700"}`}>{scan.found ? "FOUND" : "NOT FOUND"}</p><p className="text-xs text-gray-400">{new Date(scan.createdAt).toLocaleString()}</p></div></div>)}</div> : <div className="p-10 text-center text-sm text-gray-500"><Search className="mx-auto mb-2 h-6 w-6" />{lang === "sw" ? "Hakuna scan bado." : "No barcode scans yet."}</div>}</section>}
    </>}
  </div></AppShell>;
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "amber" | "red" | "green" }) { const colors = { amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700", green: "bg-green-50 text-green-700" }; return <div className={`rounded-lg p-4 ${colors[tone]}`}><p className="text-xs font-semibold">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>; }
