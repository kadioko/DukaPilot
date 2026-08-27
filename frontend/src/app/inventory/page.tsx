"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import AppShell from "@/components/layout/AppShell";
import { ApiError, api, formatTZS, getCurrentSession, type ApiErrorDetail } from "@/lib/api";
import { t, useLang } from "@/lib/i18n";
import {
  Plus,
  Search,
  AlertTriangle,
  Edit2,
  Package,
  X,
  ArrowUp,
  ArrowDown,
  CalendarClock,
  Trash2,
  ScanLine,
  Printer,
  MoreVertical,
  Download,
  FileUp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { BarcodeScanner } from "@/components/barcode/BarcodeScanner";
import { BarcodeLabel } from "@/components/barcode/BarcodeLabel";

interface Product {
  id: string;
  name: string;
  sku?: string;
  unit: string;
  buyingPrice: number;
  sellingPrice: number;
  wholesalePrice?: number | null;
  wholesaleMinQty?: number | null;
  currentStock: number;
  minimumStock: number;
  isActive: boolean;
  expiryDate?: string | null;
  doesNotExpire: boolean;
  supplier?: { id: string; name: string; phone: string };
  barcode?: string | null;
  barcodeType?: string | null;
  barcodeGenerated?: boolean;
}

interface Supplier {
  id: string;
  name: string;
  phone: string;
}

interface ProductPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const PRODUCTS_PER_PAGE = 50;

function expiryStatus(p: Product, lang: string): { label: string; color: string } | null {
  if (p.doesNotExpire) return { label: lang === "en" ? "Does not expire" : "Haiishi muda", color: "bg-gray-100 text-gray-500" };
  if (!p.expiryDate) return null;
  const now = new Date();
  const exp = new Date(p.expiryDate);
  const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { label: lang === "en" ? "Expired" : "Imekwisha muda", color: "bg-red-100 text-red-700" };
  if (daysLeft <= 30) return {
    label: lang === "en" ? `Expires in ${daysLeft} days` : `Inaisha siku ${daysLeft}`,
    color: "bg-orange-100 text-orange-700",
  };
  return { label: exp.toLocaleDateString(lang === "sw" ? "sw-TZ" : "en-US", { day: "2-digit", month: "short", year: "numeric" }), color: "bg-green-100 text-green-700" };
}

export default function InventoryPage() {
  const lang = useLang();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("search") || "";
  });
  const [assistantAction] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("action") || "";
  });
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState<ProductPagination>({
    page: 1,
    limit: PRODUCTS_PER_PAGE,
    total: 0,
    totalPages: 0,
  });
  const [stockSummary, setStockSummary] = useState({ lowStock: 0, outOfStock: 0 });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
  const [actionMenuProductId, setActionMenuProductId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", sku: "", unit: "pcs", buyingPrice: "", sellingPrice: "",
    wholesalePrice: "", wholesaleMinQty: "",
    currentStock: "0", minimumStock: "5", supplierId: "",
    expiryDate: "", doesNotExpire: false, barcode: "", barcodeType: "", generateBarcode: false,
  });
  const [adjustForm, setAdjustForm] = useState({ type: "IN", quantity: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const latestLoad = useRef(0);
  const mutationInFlight = useRef(false);
  const [canViewFinancials, setCanViewFinancials] = useState(true);
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvErrors, setCsvErrors] = useState<ApiErrorDetail[]>([]);
  const [labelProduct, setLabelProduct] = useState<Product | null>(null);
  const [stockCount, setStockCount] = useState<{ id: string; items: Array<{ id: string; expected: number; counted: number; product: { id: string; name: string; barcode?: string | null; unit: string } }> } | null>(null);
  const [stockCountScannerOpen, setStockCountScannerOpen] = useState(false);
  const [stockCountCode, setStockCountCode] = useState("");

  const fetchProducts = useCallback(async () => {
    const requestId = ++latestLoad.current;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      params.set("page", String(currentPage));
      params.set("limit", String(PRODUCTS_PER_PAGE));
      if (lowStockOnly) params.set("lowStock", "true");
      const [data, lowStockData] = await Promise.all([
        api.get<{ products: Product[]; pagination?: ProductPagination }>(`/products?${params}`),
        api.get<{ products: Product[] }>("/products/low-stock").catch(() => null),
      ]);
      if (requestId !== latestLoad.current) return;
      const nextPagination = data.pagination || {
        page: currentPage,
        limit: PRODUCTS_PER_PAGE,
        total: data.products.length,
        totalPages: data.products.length ? 1 : 0,
      };
      if (nextPagination.totalPages > 0 && currentPage > nextPagination.totalPages) {
        setCurrentPage(nextPagination.totalPages);
        return;
      }
      setProducts(data.products);
      setPagination(nextPagination);
      if (lowStockData) {
        setStockSummary({
          lowStock: lowStockData.products.filter((product) => product.currentStock > 0).length,
          outOfStock: lowStockData.products.filter((product) => product.currentStock === 0).length,
        });
      }
    } catch (value: unknown) {
      if (requestId === latestLoad.current) {
        toast(value instanceof Error ? value.message : (lang === "sw" ? "Imeshindikana kupakia bidhaa." : "Could not load products."), "error");
      }
    } finally {
      if (requestId === latestLoad.current) setLoading(false);
    }
  }, [search, lowStockOnly, currentPage, toast, lang]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("action") === "add") {
      openAdd();
      setForm((current) => ({ ...current, barcode: params.get("barcode") || "" }));
    }
  // Intentional one-time handoff from the POS unknown-barcode prompt.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    getCurrentSession<{ user: { role: string; staff?: { permissions?: { canViewReports?: boolean } } } }>()
      .then((data) => setCanViewFinancials(data.user.role !== "MERCHANT" || !data.user.staff || Boolean(data.user.staff.permissions?.canViewReports)))
      .catch(() => setCanViewFinancials(false));
    api.get<{ suppliers: Supplier[] }>("/suppliers").then((d) => setSuppliers(d.suppliers));
  }, []);

  function openAdd() {
    setEditProduct(null);
    setForm({ name: "", sku: "", unit: "pcs", buyingPrice: "", sellingPrice: "", wholesalePrice: "", wholesaleMinQty: "", currentStock: "0", minimumStock: "5", supplierId: "", expiryDate: "", doesNotExpire: false, barcode: "", barcodeType: "", generateBarcode: false });
    setError("");
    setShowForm(true);
  }

  function openEdit(p: Product) {
    setEditProduct(p);
    setForm({
      name: p.name, sku: p.sku || "", unit: p.unit,
      buyingPrice: p.buyingPrice == null ? "" : String(p.buyingPrice), sellingPrice: String(p.sellingPrice),
      wholesalePrice: p.wholesalePrice != null ? String(p.wholesalePrice) : "",
      wholesaleMinQty: p.wholesaleMinQty != null ? String(p.wholesaleMinQty) : "",
      currentStock: String(p.currentStock), minimumStock: String(p.minimumStock),
      supplierId: p.supplier?.id || "",
      expiryDate: p.expiryDate ? p.expiryDate.slice(0, 10) : "",
      doesNotExpire: p.doesNotExpire,
      barcode: p.barcode || "", barcodeType: p.barcodeType || "", generateBarcode: false,
    });
    setError("");
    setShowForm(true);
  }

  async function handleSave() {
    if (mutationInFlight.current) return;
    setError("");
    if (!form.name.trim() || (canViewFinancials && form.buyingPrice === "") || form.sellingPrice === "") {
      setError(t("inventory.fieldRequired", lang));
      return;
    }
    const numericFields = [form.sellingPrice, form.minimumStock, ...(editProduct ? [] : [form.currentStock]), ...(canViewFinancials ? [form.buyingPrice] : [])];
    if (numericFields.some((value) => !Number.isInteger(Number(value)) || Number(value) < 0)) {
      setError(lang === "sw" ? "Bei na idadi ziwe namba kamili zisizo hasi." : "Prices and quantities must be whole, non-negative numbers.");
      return;
    }
    if (form.wholesalePrice !== "" && (!Number.isInteger(Number(form.wholesalePrice)) || Number(form.wholesalePrice) < 0)) {
      setError(lang === "sw" ? "Bei ya jumla iwe namba kamili isiyo hasi." : "Wholesale price must be a whole, non-negative number.");
      return;
    }
    mutationInFlight.current = true;
    setSaving(true);
    try {
      const sharedBody = {
        name: form.name, sku: form.sku || undefined, unit: form.unit,
        ...(canViewFinancials ? { buyingPrice: Number(form.buyingPrice) } : {}), sellingPrice: Number(form.sellingPrice),
        wholesalePrice: form.wholesalePrice === "" ? null : Number(form.wholesalePrice),
        wholesaleMinQty: form.wholesaleMinQty === "" ? null : Number(form.wholesaleMinQty),
        minimumStock: Number(form.minimumStock),
        supplierId: form.supplierId || undefined,
        doesNotExpire: form.doesNotExpire,
        expiryDate: form.doesNotExpire ? null : (form.expiryDate || null),
        barcode: form.barcode || null,
        barcodeType: form.barcodeType || undefined,
        generateBarcode: form.generateBarcode,
      };
      const body = editProduct ? sharedBody : { ...sharedBody, currentStock: Number(form.currentStock) };
      const response = editProduct
        ? await api.patch<{ product: Product }>(`/products/${editProduct.id}`, body)
        : await api.post<{ product: Product }>("/products", body);
      if (editProduct) {
        setProducts((current) => current.map((product) => product.id === editProduct.id ? response.product : product));
      } else {
        setProducts((current) => [response.product, ...current]);
      }
      setShowForm(false);
      toast(editProduct ? (lang === "sw" ? "Bidhaa imebadilishwa." : "Product updated.") : (lang === "sw" ? "Bidhaa imeongezwa." : "Product added."), "success");
      await fetchProducts();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("common.error", lang));
    } finally {
      setSaving(false);
      mutationInFlight.current = false;
    }
  }

  async function handleAdjust() {
    if (mutationInFlight.current) return;
    if (!adjustProduct || adjustForm.quantity === "") return;
    if (!Number.isInteger(Number(adjustForm.quantity)) || Number(adjustForm.quantity) < 0 || (adjustForm.type !== "ADJUSTMENT" && Number(adjustForm.quantity) === 0)) {
      toast(lang === "sw" ? "Weka idadi sahihi ya namba kamili." : "Enter a valid whole quantity.", "error");
      return;
    }
    mutationInFlight.current = true;
    setSaving(true);
    try {
      const response = await api.post<{ product: Product }>("/stock/adjust", {
        productId: adjustProduct.id,
        type: adjustForm.type,
        quantity: Number(adjustForm.quantity),
        note: adjustForm.note || undefined,
      });
      setProducts((current) => current.map((product) => product.id === response.product.id ? response.product : product));
      setAdjustProduct(null);
      toast(lang === "sw" ? "Stock imebadilishwa." : "Stock updated.", "success");
      await fetchProducts();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : t("common.error", lang), "error");
    } finally {
      setSaving(false);
      mutationInFlight.current = false;
    }
  }

  async function handleDeleteProduct() {
    if (!deleteProduct) return;
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setSaving(true);
    try {
      await api.delete(`/products/${deleteProduct.id}`, lang);
      setProducts((prev) => prev.filter((p) => p.id !== deleteProduct.id));
      setDeleteProduct(null);
      toast(t("inventory.deleted", lang), "success");
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : t("common.error", lang), "error");
    } finally {
      setSaving(false);
      mutationInFlight.current = false;
    }
  }

  function downloadCsvTemplate() {
    const csv = [
      "name,sku,unit,buyingPrice,sellingPrice,currentStock,minimumStock,barcode,expiryDate,doesNotExpire,wholesaleEnabled,wholesalePrice,wholesaleMinQty",
      "Sukari 1kg,SKR001,pcs,2500,3000,10,5,,,true,false,,",
      "Mchele 1kg,MCH001,kg,2200,2800,20,5,,,true,true,2500,5",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "dukapilot-products-template.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function importCsv() {
    if (!csvFile || csvImporting) return;
    setCsvErrors([]);
    setCsvImporting(true);
    try {
      const csv = await csvFile.text();
      const result = await api.post<{ count: number }>("/products/import-csv", { csv }, lang);
      setShowCsvImport(false);
      setCsvFile(null);
      toast(lang === "sw" ? `Bidhaa ${result.count} zimeongezwa.` : `${result.count} products imported.`, "success");
      await fetchProducts();
    } catch (error: unknown) {
      if (error instanceof ApiError && error.code === "PRODUCT_CSV_INVALID" && error.details?.length) {
        setCsvErrors(error.details);
        toast(lang === "sw" ? "Kuna makosa kwenye CSV. Angalia row na column hapa chini." : "This CSV has errors. See the row and column below.", "error");
        return;
      }
      toast(error instanceof Error ? error.message : (lang === "sw" ? "Imeshindikana kuingiza CSV." : "Could not import CSV."), "error");
    } finally {
      setCsvImporting(false);
    }
  }

  async function startStockCount() {
    try {
      const data = await api.post<{ count: NonNullable<typeof stockCount> }>("/stock-counts", {});
      setStockCount(data.count);
      toast(lang === "sw" ? "Uhesabuji umeanza. Scan bidhaa." : "Stock count started. Scan items.", "success");
    } catch (error: unknown) { toast(error instanceof Error ? error.message : "Could not start stock count", "error"); }
  }

  async function scanStockCount(barcode: string) {
    if (!stockCount) return;
    try {
      const data = await api.post<{ item: { productId: string; counted: number } }>(`/stock-counts/${stockCount.id}/scan`, { barcode });
      setStockCount((current) => current ? { ...current, items: current.items.map((item) => item.product.id === data.item.productId ? { ...item, counted: data.item.counted } : item) } : current);
      setStockCountCode(""); setStockCountScannerOpen(false);
      if (navigator.vibrate) navigator.vibrate(50);
    } catch (error: unknown) { toast(error instanceof Error ? error.message : "Barcode not found", "error"); }
  }

  async function finishStockCount(applyAdjustments: boolean) {
    if (!stockCount) return;
    try {
      await api.post(`/stock-counts/${stockCount.id}/finish`, { applyAdjustments });
      setStockCount(null); await fetchProducts();
      toast(applyAdjustments ? (lang === "sw" ? "Tofauti za stock zimetumika." : "Stock differences applied.") : (lang === "sw" ? "Uhesabuji umekamilika." : "Stock count completed."), "success");
    } catch (error: unknown) { toast(error instanceof Error ? error.message : "Could not finish stock count", "error"); }
  }

  const margin = (p: Product) =>
    p.sellingPrice > 0 ? (((p.sellingPrice - p.buyingPrice) / p.sellingPrice) * 100).toFixed(0) : "0";

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto pb-24 lg:pb-6">
        {/* Header */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-900">{t("inventory.title", lang)}</h1>
          <div className="flex flex-wrap gap-2">{canViewFinancials && <button onClick={startStockCount} aria-label="Start stock count" className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 text-gray-600" title="Stock count"><ScanLine className="h-4 w-4" /></button>}{canViewFinancials && <button onClick={downloadCsvTemplate} aria-label={lang === "sw" ? "Pakua CSV template" : "Download CSV template"} title={lang === "sw" ? "Pakua CSV template" : "Download CSV template"} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:text-brand-700"><Download className="h-4 w-4" /></button>}{canViewFinancials && <button onClick={() => { setCsvFile(null); setCsvErrors([]); setShowCsvImport(true); }} className="flex items-center gap-2 rounded-lg border border-brand-300 bg-white px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"><FileUp className="h-4 w-4" /><span className="hidden sm:inline">{lang === "sw" ? "Ingiza CSV" : "Import CSV"}</span></button>}{canViewFinancials && <button onClick={openAdd} aria-label={t("inventory.addProduct", lang)} className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"><Plus className="w-4 h-4" /><span className="hidden sm:inline">{t("inventory.addProduct", lang)}</span></button>}</div>
        </div>

        {stockCount && <div className="mb-4 rounded-lg border border-brand-200 bg-brand-50 p-3"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-brand-950">{lang === "sw" ? "Uhesabuji wa stock unaendelea" : "Stock count in progress"}</p><p className="text-xs text-brand-700">{stockCount.items.reduce((sum, item) => sum + item.counted, 0)} {lang === "sw" ? "zimescanwa" : "scanned"}</p></div><button onClick={() => setStockCountScannerOpen(true)} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white">Scan</button></div><div className="mt-3 flex gap-2"><input value={stockCountCode} onChange={(event) => setStockCountCode(event.target.value)} onKeyDown={(event) => event.key === "Enter" && scanStockCount(stockCountCode)} placeholder="Barcode" className="min-w-0 flex-1 rounded-lg border border-brand-200 px-3 py-2 text-sm" /><button onClick={() => scanStockCount(stockCountCode)} className="rounded-lg border border-brand-300 px-3 text-sm font-semibold text-brand-800">Add</button></div><div className="mt-3 max-h-32 overflow-y-auto text-xs">{stockCount.items.filter((item) => item.counted > 0).map((item) => <div key={item.id} className="flex justify-between border-t border-brand-100 py-1"><span>{item.product.name}</span><span>{item.expected} / {item.counted} ({item.counted - item.expected >= 0 ? "+" : ""}{item.counted - item.expected})</span></div>)}</div><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => finishStockCount(false)} className="rounded-lg border border-brand-300 py-2 text-sm font-semibold text-brand-800">{lang === "sw" ? "Maliza bila kubadili" : "Finish only"}</button><button onClick={() => finishStockCount(true)} className="rounded-lg bg-brand-700 py-2 text-sm font-semibold text-white">{lang === "sw" ? "Tumia tofauti" : "Apply differences"}</button></div></div>}

        {assistantAction && (
          <div className="mb-4 rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm text-brand-900">
            <p className="font-semibold">
              {assistantAction === "restock"
                ? (lang === "sw" ? "DukaPilot imekufungua kwenye bidhaa ya kuagiza tena." : "DukaPilot opened the product that needs restocking.")
                : (lang === "sw" ? "DukaPilot imekufungua kwenye bidhaa ya kupromote." : "DukaPilot opened the product to promote.")}
            </p>
            <p className="mt-1 text-xs text-brand-700">
              {assistantAction === "restock"
                ? (lang === "sw" ? "Tumia kuongeza stock, kuunganisha supplier, au kurekebisha minimum stock." : "Use adjust stock, link a supplier, or update minimum stock.")
                : (lang === "sw" ? "Hakiki bei, margin, na stock kabla ya kuiweka mbele kwa wateja." : "Check price, margin, and stock before featuring it for customers.")}
            </p>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              aria-label={t("inventory.search", lang)}
              placeholder={t("inventory.search", lang)}
              className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <button
            onClick={() => { setLowStockOnly((current) => !current); setCurrentPage(1); }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
              lowStockOnly
                ? "bg-amber-50 border-amber-300 text-amber-700"
                : "bg-white border-gray-300 text-gray-600"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t("inventory.lowStockOnly", lang)}</span>
          </button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: t("inventory.allProducts", lang), value: pagination.total },
            { label: t("inventory.lowStockCount", lang), value: stockSummary.lowStock, color: "text-amber-600" },
            { label: t("inventory.outOfStockCount", lang), value: stockSummary.outOfStock, color: "text-red-600" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
              <p className={`text-lg font-bold ${stat.color || "text-gray-900"}`}>{stat.value}</p>
              <p className="text-xs text-gray-500">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Product list */}
        {loading ? (
          <div className="text-center py-16 text-gray-400">{t("common.loading", lang)}</div>
        ) : products.length === 0 ? (
          <div className="text-center py-16">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">{t("inventory.noProducts", lang)}</p>
            <p className="text-gray-400 text-sm mt-1">{t("inventory.noProductsHint", lang)}</p>
          </div>
        ) : (
          <>
          <div className="space-y-2">
            {products.map((p) => {
              const isLow = p.currentStock <= p.minimumStock && p.currentStock > 0;
              const isOut = p.currentStock === 0;
              const expiry = expiryStatus(p, lang);
              const isExpired = expiry?.color === "bg-red-100 text-red-700";
              return (
                <div
                  key={p.id}
                  className={`bg-white rounded-xl border p-4 ${
                    isExpired ? "border-red-300" :
                    isOut ? "border-red-200" :
                    isLow ? "border-amber-200" :
                    "border-gray-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900 text-sm">{p.name}</p>
                        {isOut && (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                            {t("inventory.outOfStockBadge", lang)}
                          </span>
                        )}
                        {isLow && !isOut && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                            {t("inventory.lowStockBadge", lang)}
                          </span>
                        )}
                        {expiry && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${expiry.color}`}>
                            <CalendarClock className="w-3 h-3" />
                            {expiry.label}
                          </span>
                        )}
                      </div>
                      {p.supplier && (
                        <p className="text-xs text-gray-400 mt-0.5">{p.supplier.name}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 flex-wrap">
                        <div>
                          <p className="text-xs text-gray-400">{t("inventory.stock", lang)}</p>
                          <p className={`text-sm font-bold ${isOut ? "text-red-600" : isLow ? "text-amber-600" : "text-gray-800"}`}>
                            {p.currentStock} {p.unit}
                          </p>
                        </div>
                        {canViewFinancials && <div>
                          <p className="text-xs text-gray-400">{t("inventory.buyingPrice", lang)}</p>
                          <p className="text-sm font-medium text-gray-700">{p.buyingPrice == null ? "-" : formatTZS(p.buyingPrice)}</p>
                        </div>}
                        <div>
                          <p className="text-xs text-gray-400">{t("inventory.sellingPrice", lang)}</p>
                          <p className="text-sm font-medium text-brand-700">{formatTZS(p.sellingPrice)}</p>
                        </div>
                        {canViewFinancials && <div>
                          <p className="text-xs text-gray-400">{t("inventory.marginLabel", lang)}</p>
                          <p className={`text-sm font-medium ${p.sellingPrice - p.buyingPrice < 0 ? "text-red-600" : "text-green-600"}`}>{formatTZS(p.sellingPrice - p.buyingPrice)} <span className="text-xs">({margin(p)}%)</span></p>
                        </div>}
                      </div>
                    </div>
                    <div className="relative flex flex-shrink-0 items-start gap-2">
                      <button
                        onClick={() => {
                          setAdjustProduct(p);
                          setAdjustForm({ type: "IN", quantity: "", note: "" });
                        }}
                        aria-label={`${t("inventory.adjustStock", lang)} ${p.name}`}
                        className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-brand-50 px-3 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100"
                        title={t("inventory.adjustStock", lang)}
                      >
                        <ArrowUp className="w-4 h-4" />
                        {lang === "sw" ? "Ongeza stock" : "Restock"}
                      </button>
                      <button
                        onClick={() => setActionMenuProductId((current) => current === p.id ? null : p.id)}
                        aria-label={`${lang === "sw" ? "Vitendo vya" : "Actions for"} ${p.name}`}
                        aria-expanded={actionMenuProductId === p.id}
                        className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                      {actionMenuProductId === p.id && <div className="absolute right-0 top-12 z-20 w-44 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
                        {p.barcode && <button onClick={() => { setLabelProduct(p); setActionMenuProductId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"><Printer className="h-4 w-4" />{lang === "sw" ? "Chapisha lebo" : "Print label"}</button>}
                        <button onClick={() => { openEdit(p); setActionMenuProductId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"><Edit2 className="h-4 w-4" />{t("common.edit", lang)}</button>
                        <button onClick={() => { setDeleteProduct(p); setActionMenuProductId(null); }} disabled={saving} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"><Trash2 className="h-4 w-4" />{t("inventory.deleteProduct", lang)}</button>
                      </div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-200 pt-3">
              <p className="text-xs text-gray-500" aria-live="polite">
                {lang === "sw"
                  ? `Bidhaa ${((pagination.page - 1) * pagination.limit) + 1}-${Math.min(pagination.page * pagination.limit, pagination.total)} kati ya ${pagination.total}`
                  : `${((pagination.page - 1) * pagination.limit) + 1}-${Math.min(pagination.page * pagination.limit, pagination.total)} of ${pagination.total} products`}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={pagination.page <= 1}
                  aria-label={lang === "sw" ? "Ukurasa uliopita" : "Previous page"}
                  title={lang === "sw" ? "Ukurasa uliopita" : "Previous page"}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(pagination.totalPages, page + 1))}
                  disabled={pagination.page >= pagination.totalPages}
                  aria-label={lang === "sw" ? "Ukurasa unaofuata" : "Next page"}
                  title={lang === "sw" ? "Ukurasa unaofuata" : "Next page"}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
          </>
        )}
      </div>

      {/* Add/Edit Product Modal */}
      {showForm && (
        <Modal title={editProduct ? t("inventory.editTitle", lang) : t("inventory.addTitle", lang)} onClose={() => setShowForm(false)}>
          <div className="space-y-3">
            {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg p-2">{error}</p>}
            <Field label={t("inventory.nameLabel", lang)}>
              <input aria-label={t("inventory.nameLabel", lang)} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={INPUT} placeholder={t("inventory.namePlaceholder", lang)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("inventory.skuLabel", lang)}>
                <input aria-label={t("inventory.skuLabel", lang)} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  className={INPUT} placeholder="UNG001" />
              </Field>
              <Field label={t("inventory.unitLabel", lang)}>
                <select aria-label={t("inventory.unitLabel", lang)} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className={INPUT}>
                  {["pcs", "kg", "litre", "box", "crate", "bag", "pkt", "bar"].map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="space-y-2 rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Barcode</p><button onClick={() => setBarcodeScannerOpen(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700"><ScanLine className="h-4 w-4" />Scan</button></div>
              <input aria-label="Barcode" value={form.barcode} disabled={form.generateBarcode} onChange={(e) => setForm({ ...form, barcode: e.target.value.toUpperCase() })} placeholder="EAN, UPC, or DP00000001" className={INPUT} />
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.generateBarcode} onChange={(e) => setForm({ ...form, generateBarcode: e.target.checked, barcode: e.target.checked ? "" : form.barcode })} />Generate DukaPilot barcode</label>
              {form.barcode && <BarcodeLabel value={form.barcode} name={form.name || "Product"} price={form.sellingPrice ? formatTZS(Number(form.sellingPrice)) : undefined} className="max-w-[240px] border" />}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {canViewFinancials && <Field label={t("inventory.buyingPriceLabel", lang)}>
                <input aria-label={t("inventory.buyingPriceLabel", lang)} type="number" min="0" step="1" value={form.buyingPrice} onChange={(e) => setForm({ ...form, buyingPrice: e.target.value })}
                  className={INPUT} placeholder="2800" />
              </Field>}
              <Field label={t("inventory.sellingPriceLabel", lang)}>
                <input aria-label={t("inventory.sellingPriceLabel", lang)} type="number" min="0" step="1" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
                  className={INPUT} placeholder="3200" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {editProduct ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-600">{t("inventory.currentStockLabel", lang)}</p>
                  <p className="mt-1 text-sm font-bold text-gray-950">{editProduct.currentStock} {editProduct.unit}</p>
                  <button type="button" onClick={() => { setShowForm(false); setAdjustProduct(editProduct); }} className="mt-2 text-xs font-semibold text-brand-700 hover:text-brand-900">{t("inventory.adjustStock", lang)}</button>
                </div>
              ) : <Field label={t("inventory.currentStockLabel", lang)}>
                <input aria-label={t("inventory.currentStockLabel", lang)} type="number" min="0" step="1" value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: e.target.value })}
                  className={INPUT} placeholder="0" />
              </Field>}
              <Field label={t("inventory.minimumStockLabel", lang)}>
                <input aria-label={t("inventory.minimumStockLabel", lang)} type="number" min="0" step="1" value={form.minimumStock} onChange={(e) => setForm({ ...form, minimumStock: e.target.value })}
                  className={INPUT} placeholder="5" />
              </Field>
            </div>
            {/* Wholesale section */}
            <div className="border border-gray-200 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{t("inventory.wholesaleSection", lang)}</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("inventory.wholesalePriceLabel", lang)}>
                  <input aria-label={t("inventory.wholesalePriceLabel", lang)} type="number" min="0" step="1" value={form.wholesalePrice}
                    onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value })}
                    className={INPUT} placeholder="2900" />
                </Field>
                <Field label={t("inventory.wholesaleMinQtyLabel", lang)}>
                  <input aria-label={t("inventory.wholesaleMinQtyLabel", lang)} type="number" min="1" step="1" value={form.wholesaleMinQty}
                    onChange={(e) => setForm({ ...form, wholesaleMinQty: e.target.value })}
                    className={INPUT} placeholder="5" />
                </Field>
              </div>
            </div>

            <Field label={t("inventory.supplierLabel", lang)}>
              <select aria-label={t("inventory.supplierLabel", lang)} value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} className={INPUT}>
                <option value="">{t("inventory.selectSupplier", lang)}</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>

            {/* Expiry section */}
            <div className="border border-gray-200 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5" /> {t("inventory.expirySection", lang)}
              </p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  aria-label={t("inventory.doesNotExpire", lang)}
                  checked={form.doesNotExpire}
                  onChange={(e) => setForm({ ...form, doesNotExpire: e.target.checked, expiryDate: "" })}
                  className="w-4 h-4 rounded border-gray-300 text-brand-600"
                />
                <span className="text-sm text-gray-700">{t("inventory.doesNotExpire", lang)}</span>
              </label>
              {!form.doesNotExpire && (
                <Field label={t("inventory.expiryDateLabel", lang)}>
                  <input
                    type="date"
                    aria-label={t("inventory.expiryDateLabel", lang)}
                    value={form.expiryDate}
                    onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                    className={INPUT}
                  />
                </Field>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-lg text-sm font-medium">
                {t("common.cancel", lang)}
              </button>
              <button aria-label={t("common.save", lang)} onClick={handleSave} disabled={saving} className="flex-1 bg-brand-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-60">
                {saving ? t("inventory.saving", lang) : t("common.save", lang)}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Product Confirmation */}
      {deleteProduct && (
        <Modal title={t("inventory.deleteProduct", lang)} onClose={() => setDeleteProduct(null)}>
          <div className="space-y-4">
            <div className="rounded-xl border border-red-100 bg-red-50 p-4">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white text-red-600">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-red-950">
                    {lang === "sw" ? `Futa/fiche ${deleteProduct.name}?` : `Delete/hide ${deleteProduct.name}?`}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-red-800">
                    {lang === "sw"
                      ? "Haitaonekana tena kwenye inventory au mauzo mapya. Historia ya mauzo ya zamani itabaki salama."
                      : "It will no longer appear in inventory or new sales. Existing sales history will stay safe."}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteProduct(null)}
                className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-600"
              >
                {t("common.cancel", lang)}
              </button>
              <button
                onClick={handleDeleteProduct}
                disabled={saving}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? t("inventory.saving", lang) : t("inventory.deleteProduct", lang)}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Adjust Stock Modal */}
      {adjustProduct && (
        <Modal title={`${t("inventory.adjustStock", lang)}: ${adjustProduct.name}`} onClose={() => setAdjustProduct(null)}>
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              {t("inventory.currentStockOf", lang)} <strong>{adjustProduct.currentStock} {adjustProduct.unit}</strong>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { v: "IN", labelKey: "inventory.adjustIn", icon: <ArrowUp className="w-4 h-4" />, color: "green" },
                { v: "OUT", labelKey: "inventory.adjustOut", icon: <ArrowDown className="w-4 h-4" />, color: "red" },
                { v: "ADJUSTMENT", labelKey: "inventory.adjustSet", icon: <Edit2 className="w-4 h-4" />, color: "blue" },
              ].map(({ v, labelKey, icon, color }) => (
                <button
                  key={v}
                  onClick={() => setAdjustForm({ ...adjustForm, type: v })}
                  aria-label={t(labelKey, lang)}
                  className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-colors min-h-0 ${
                    adjustForm.type === v
                      ? `bg-${color}-50 border-${color}-300 text-${color}-700`
                      : "border-gray-200 text-gray-500"
                  }`}
                >
                  {icon}{t(labelKey, lang)}
                </button>
              ))}
            </div>
            {adjustForm.type === "IN" && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-900">
                {lang === "sw" ? "Hii ndiyo njia ya kupokea bidhaa mpya. Usirekodi ununuzi huu tena kwenye Matumizi; bei ya kununua itatumika kwenye faida bidhaa inapouzwa." : "Use this to receive new stock. Do not record the purchase again in Expenses; the buying price is used when the product sells."}
              </div>
            )}
            <Field label={adjustForm.type === "ADJUSTMENT" ? t("inventory.adjustNewQty", lang) : t("inventory.adjustQty", lang)}>
              <input aria-label={adjustForm.type === "ADJUSTMENT" ? t("inventory.adjustNewQty", lang) : t("inventory.adjustQty", lang)} type="number" min="0" step="1" value={adjustForm.quantity}
                onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })}
                className={INPUT} placeholder="0" />
            </Field>
            <Field label={t("inventory.adjustNote", lang)}>
              <input aria-label={t("inventory.adjustNote", lang)} value={adjustForm.note}
                onChange={(e) => setAdjustForm({ ...adjustForm, note: e.target.value })}
                className={INPUT} placeholder={t("inventory.adjustNotePlaceholder", lang)} />
            </Field>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setAdjustProduct(null)} className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-lg text-sm font-medium">
                {t("common.cancel", lang)}
              </button>
              <button aria-label={t("common.save", lang)} onClick={handleAdjust} disabled={saving || adjustForm.quantity === ""}
                className="flex-1 bg-brand-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-60">
                {saving ? "..." : t("common.save", lang)}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {barcodeScannerOpen && <BarcodeScanner onClose={() => setBarcodeScannerOpen(false)} onDetected={(barcode) => { setForm({ ...form, barcode: barcode.toUpperCase(), generateBarcode: false }); setBarcodeScannerOpen(false); }} />}
      {showCsvImport && <Modal title={lang === "sw" ? "Ingiza bidhaa kwa CSV" : "Import products from CSV"} onClose={() => setShowCsvImport(false)}><div className="space-y-4"><ol className="space-y-2 text-sm leading-6 text-gray-700"><li>{lang === "sw" ? "1. Pakua template, kisha ifungue kwa Excel au Google Sheets." : "1. Download the template and open it in Excel or Google Sheets."}</li><li>{lang === "sw" ? "2. Jaza bidhaa zako. Jina, bei ya kununua na bei ya kuuza zinahitajika." : "2. Fill in products. Name, buying price, and selling price are required."}</li><li>{lang === "sw" ? "3. Bei ya jumla huwa imezimwa. Weka wholesaleEnabled kuwa true kwa bidhaa inayouzwa jumla, kisha jaza wholesalePrice." : "3. Wholesale is off by default. Set wholesaleEnabled to true only for a wholesale product, then add wholesalePrice."}</li><li>{lang === "sw" ? "4. Hifadhi kama CSV, kisha chagua file hapa chini." : "4. Save as CSV, then choose the file below."}</li></ol><button type="button" onClick={downloadCsvTemplate} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:text-brand-900"><Download className="h-4 w-4" />{lang === "sw" ? "Pakua CSV template" : "Download CSV template"}</button><label className="grid gap-2 rounded-lg border border-dashed border-gray-300 p-4 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Chagua CSV file" : "Choose CSV file"}</span><input type="file" accept=".csv,text/csv" onChange={(event) => { setCsvFile(event.target.files?.[0] || null); setCsvErrors([]); }} className="block w-full text-sm" />{csvFile && <span className="text-xs font-normal text-gray-500">{csvFile.name}</span>}</label><p className="text-xs leading-5 text-gray-500">{lang === "sw" ? "SKU, stock ya kuanzia, minimum stock, barcode na expiry date ni hiari. wholesaleMinQty pia ni hiari; ukiweka jumla bila idadi, mfumo utatumia 5. Stock ya kuanzia ni 0 na minimum stock ni 5 ukiiacha wazi. Bei za TZS zinaweza kuandikwa 12500, 12,500, 12 500, au TZS 12,500." : "SKU, opening stock, minimum stock, barcode, and expiry date are optional. wholesaleMinQty is also optional; enabled wholesale products default to 5 units. Blank opening stock is 0 and minimum stock is 5. TZS prices can be written as 12500, 12,500, 12 500, or TZS 12,500."}</p>{csvErrors.length > 0 && <section aria-live="polite" className="max-h-48 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-3"><p className="text-sm font-bold text-red-900">{lang === "sw" ? "Rekebisha makosa haya, kisha chagua file tena:" : "Fix these errors, then choose the file again:"}</p><ul className="mt-2 space-y-1.5 text-xs leading-5 text-red-800">{csvErrors.map((item, index) => <li key={`${item.row}-${item.field}-${index}`}><strong>{lang === "sw" ? "Mstari" : "Row"} {item.row || 1}{item.field ? ` - ${item.field}` : ""}:</strong> {item.message}</li>)}</ul></section>}<div className="flex gap-2"><button type="button" onClick={() => setShowCsvImport(false)} className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-semibold text-gray-700">{t("common.cancel", lang)}</button><button type="button" onClick={importCsv} disabled={!csvFile || csvImporting} className="flex-1 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{csvImporting ? (lang === "sw" ? "Inaingiza..." : "Importing...") : (lang === "sw" ? "Ingiza bidhaa" : "Import products")}</button></div></div></Modal>}
      {stockCountScannerOpen && <BarcodeScanner onClose={() => setStockCountScannerOpen(false)} onDetected={scanStockCount} />}
      {labelProduct?.barcode && <Modal title="Barcode label" onClose={() => setLabelProduct(null)}><div className="space-y-4"><BarcodeLabel value={labelProduct.barcode} name={labelProduct.name} price={formatTZS(labelProduct.sellingPrice)} className="border" /><button onClick={() => window.print()} className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white">Print label</button></div></Modal>}
    </AppShell>
  );
}

const INPUT = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 min-h-0"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
