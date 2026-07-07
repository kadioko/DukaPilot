"use client";
import { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/layout/AppShell";
import { api, formatTZS } from "@/lib/api";
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
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";

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
}

interface Supplier {
  id: string;
  name: string;
  phone: string;
}

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
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
  const [form, setForm] = useState({
    name: "", sku: "", unit: "pcs", buyingPrice: "", sellingPrice: "",
    wholesalePrice: "", wholesaleMinQty: "",
    currentStock: "0", minimumStock: "5", supplierId: "",
    expiryDate: "", doesNotExpire: false,
  });
  const [adjustForm, setAdjustForm] = useState({ type: "IN", quantity: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    const data = await api.get<{ products: Product[] }>(`/products?${params}`);
    let list = data.products;
    if (lowStockOnly) list = list.filter((p) => p.currentStock <= p.minimumStock);
    setProducts(list);
    setLoading(false);
  }, [search, lowStockOnly]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => {
    api.get<{ suppliers: Supplier[] }>("/suppliers").then((d) => setSuppliers(d.suppliers));
  }, []);

  function openAdd() {
    setEditProduct(null);
    setForm({ name: "", sku: "", unit: "pcs", buyingPrice: "", sellingPrice: "", wholesalePrice: "", wholesaleMinQty: "", currentStock: "0", minimumStock: "5", supplierId: "", expiryDate: "", doesNotExpire: false });
    setError("");
    setShowForm(true);
  }

  function openEdit(p: Product) {
    setEditProduct(p);
    setForm({
      name: p.name, sku: p.sku || "", unit: p.unit,
      buyingPrice: String(p.buyingPrice), sellingPrice: String(p.sellingPrice),
      wholesalePrice: p.wholesalePrice != null ? String(p.wholesalePrice) : "",
      wholesaleMinQty: p.wholesaleMinQty != null ? String(p.wholesaleMinQty) : "",
      currentStock: String(p.currentStock), minimumStock: String(p.minimumStock),
      supplierId: p.supplier?.id || "",
      expiryDate: p.expiryDate ? p.expiryDate.slice(0, 10) : "",
      doesNotExpire: p.doesNotExpire,
    });
    setError("");
    setShowForm(true);
  }

  async function handleSave() {
    setError("");
    if (!form.name || !form.buyingPrice || !form.sellingPrice) {
      setError(t("inventory.fieldRequired", lang));
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name, sku: form.sku || undefined, unit: form.unit,
        buyingPrice: Number(form.buyingPrice), sellingPrice: Number(form.sellingPrice),
        wholesalePrice: form.wholesalePrice === "" ? null : Number(form.wholesalePrice),
        wholesaleMinQty: form.wholesaleMinQty === "" ? null : Number(form.wholesaleMinQty),
        currentStock: Number(form.currentStock), minimumStock: Number(form.minimumStock),
        supplierId: form.supplierId || undefined,
        doesNotExpire: form.doesNotExpire,
        expiryDate: form.doesNotExpire ? null : (form.expiryDate || null),
      };
      if (editProduct) {
        await api.patch(`/products/${editProduct.id}`, body);
      } else {
        await api.post("/products", body);
      }
      setShowForm(false);
      fetchProducts();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("common.error", lang));
    } finally {
      setSaving(false);
    }
  }

  async function handleAdjust() {
    if (!adjustProduct || !adjustForm.quantity) return;
    setSaving(true);
    try {
      await api.post("/stock/adjust", {
        productId: adjustProduct.id,
        type: adjustForm.type,
        quantity: Number(adjustForm.quantity),
        note: adjustForm.note || undefined,
      });
      setAdjustProduct(null);
      fetchProducts();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : t("common.error", lang), "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProduct() {
    if (!deleteProduct) return;
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
    }
  }

  const margin = (p: Product) =>
    p.sellingPrice > 0 ? (((p.sellingPrice - p.buyingPrice) / p.sellingPrice) * 100).toFixed(0) : "0";

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto pb-24 lg:pb-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-bold text-gray-900">{t("inventory.title", lang)}</h1>
          <button
            onClick={openAdd}
            aria-label={t("inventory.addProduct", lang)}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t("inventory.addProduct", lang)}</span>
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t("inventory.search", lang)}
              placeholder={t("inventory.search", lang)}
              className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <button
            onClick={() => setLowStockOnly(!lowStockOnly)}
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
            { label: t("inventory.allProducts", lang), value: products.length },
            { label: t("inventory.lowStockCount", lang), value: products.filter((p) => p.currentStock <= p.minimumStock && p.currentStock > 0).length, color: "text-amber-600" },
            { label: t("inventory.outOfStockCount", lang), value: products.filter((p) => p.currentStock === 0).length, color: "text-red-600" },
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
                        <div>
                          <p className="text-xs text-gray-400">{t("inventory.buyingPrice", lang)}</p>
                          <p className="text-sm font-medium text-gray-700">{formatTZS(p.buyingPrice)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">{t("inventory.sellingPrice", lang)}</p>
                          <p className="text-sm font-medium text-brand-700">{formatTZS(p.sellingPrice)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">{t("inventory.marginLabel", lang)}</p>
                          <p className="text-sm font-medium text-green-600">{margin(p)}%</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => {
                          setAdjustProduct(p);
                          setAdjustForm({ type: "IN", quantity: "", note: "" });
                        }}
                        aria-label={`${t("inventory.adjustStock", lang)} ${p.name}`}
                        className="p-2 text-gray-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors min-h-0"
                        title={t("inventory.adjustStock", lang)}
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEdit(p)}
                        aria-label={`${t("inventory.editTitle", lang)} ${p.name}`}
                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors min-h-0"
                        title={t("common.edit", lang)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteProduct(p)}
                        disabled={saving}
                        aria-label={`${t("inventory.deleteProduct", lang)} ${p.name}`}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 min-h-0"
                        title={t("inventory.deleteProduct", lang)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("inventory.buyingPriceLabel", lang)}>
                <input aria-label={t("inventory.buyingPriceLabel", lang)} type="number" value={form.buyingPrice} onChange={(e) => setForm({ ...form, buyingPrice: e.target.value })}
                  className={INPUT} placeholder="2800" />
              </Field>
              <Field label={t("inventory.sellingPriceLabel", lang)}>
                <input aria-label={t("inventory.sellingPriceLabel", lang)} type="number" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
                  className={INPUT} placeholder="3200" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("inventory.currentStockLabel", lang)}>
                <input aria-label={t("inventory.currentStockLabel", lang)} type="number" value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: e.target.value })}
                  className={INPUT} placeholder="0" />
              </Field>
              <Field label={t("inventory.minimumStockLabel", lang)}>
                <input aria-label={t("inventory.minimumStockLabel", lang)} type="number" value={form.minimumStock} onChange={(e) => setForm({ ...form, minimumStock: e.target.value })}
                  className={INPUT} placeholder="5" />
              </Field>
            </div>
            {/* Wholesale section */}
            <div className="border border-gray-200 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{t("inventory.wholesaleSection", lang)}</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("inventory.wholesalePriceLabel", lang)}>
                  <input aria-label={t("inventory.wholesalePriceLabel", lang)} type="number" value={form.wholesalePrice}
                    onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value })}
                    className={INPUT} placeholder="2900" />
                </Field>
                <Field label={t("inventory.wholesaleMinQtyLabel", lang)}>
                  <input aria-label={t("inventory.wholesaleMinQtyLabel", lang)} type="number" value={form.wholesaleMinQty}
                    onChange={(e) => setForm({ ...form, wholesaleMinQty: e.target.value })}
                    className={INPUT} placeholder="5" min="1" />
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
            <Field label={adjustForm.type === "ADJUSTMENT" ? t("inventory.adjustNewQty", lang) : t("inventory.adjustQty", lang)}>
              <input aria-label={adjustForm.type === "ADJUSTMENT" ? t("inventory.adjustNewQty", lang) : t("inventory.adjustQty", lang)} type="number" value={adjustForm.quantity}
                onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })}
                className={INPUT} placeholder="0" min="0" />
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
              <button aria-label={t("common.save", lang)} onClick={handleAdjust} disabled={saving || !adjustForm.quantity}
                className="flex-1 bg-brand-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-60">
                {saving ? "..." : t("common.save", lang)}
              </button>
            </div>
          </div>
        </Modal>
      )}
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
