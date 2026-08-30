"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChefHat, ClipboardList, LoaderCircle, Search, Trash2, UtensilsCrossed, X } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import DateSelect from "@/components/ui/DateSelect";
import { api, formatTZS } from "@/lib/api";
import { useLang, type Lang } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";

type Product = { id: string; name: string; unit: string; currentStock: number; buyingPrice: number | null };
type IngredientLine = { productId: string; quantity: string };
type Recipe = { id: string; name: string; expectedYield: number; instructions?: string | null; outputProduct: Product; items: Array<{ productId: string; quantity: number; product: Product }> };
type Batch = { id: string; expectedYield: number; actualYield: number; wasteQuantity: number; totalCost: number | null; unitCost: number | null; additionalCost: number | null; preparedAt: string; outputProduct: Pick<Product, "id" | "name" | "unit">; items: Array<{ id: string; quantity: number; totalCost: number | null; product: Pick<Product, "id" | "name" | "unit"> }> };

const today = () => new Date().toISOString().slice(0, 10);
const paymentMethods = ["CASH", "MPESA", "TIGOPESA", "AIRTEL_MONEY", "HALOPESA", "BANK"];

export default function FoodPreparationPage() {
  const lang = useLang();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recipeId, setRecipeId] = useState("");
  const [outputProductId, setOutputProductId] = useState("");
  const [lines, setLines] = useState<IngredientLine[]>([]);
  const [expectedYield, setExpectedYield] = useState("");
  const [actualYield, setActualYield] = useState("");
  const [additionalCost, setAdditionalCost] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [additionalCostNote, setAdditionalCostNote] = useState("");
  const [preparedAt, setPreparedAt] = useState(today());
  const [note, setNote] = useState("");
  const [saveRecipe, setSaveRecipe] = useState(false);
  const [recipeName, setRecipeName] = useState("");
  const [recipeInstructions, setRecipeInstructions] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const rememberProducts = useCallback((nextProducts: Product[]) => {
    setProducts((current) => Array.from(new Map([...current, ...nextProducts].map((product) => [product.id, product])).values()));
  }, []);

  const load = useCallback(async (nextPage: number) => {
    setLoading(true);
    try {
      const [recipesData, batchesData] = await Promise.all([
        api.get<{ recipes: Recipe[] }>("/food-preparation/recipes", lang),
        api.get<{ batches: Batch[]; totalPages: number }>(`/food-preparation?page=${nextPage}&limit=10`, lang),
      ]);
      setRecipes(recipesData.recipes);
      rememberProducts(recipesData.recipes.flatMap((recipe) => [recipe.outputProduct, ...recipe.items.map((item) => item.product)]));
      setBatches(batchesData.batches);
      setTotalPages(batchesData.totalPages);
    } catch (error) {
      toast(error instanceof Error ? error.message : (lang === "sw" ? "Imeshindikana kupakia maandalizi ya chakula." : "Could not load food preparation."), "error");
    } finally { setLoading(false); }
  }, [lang, rememberProducts, toast]);

  useEffect(() => { load(page); }, [load, page]);

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const canViewCosts = lines.every((line) => typeof productMap.get(line.productId)?.buyingPrice === "number");
  const ingredientCost = lines.reduce((sum, line) => sum + (productMap.get(line.productId)?.buyingPrice || 0) * (Number(line.quantity) || 0), 0);
  const totalCost = ingredientCost + Math.max(0, Number(additionalCost) || 0);
  const yieldValue = Number(actualYield) || 0;
  const expectedValue = Number(expectedYield) || 0;
  const projectedUnitCost = yieldValue > 0 ? Math.round(totalCost / yieldValue) : 0;
  const waste = Math.max(0, expectedValue - yieldValue);

  function resetForm() {
    setRecipeId(""); setOutputProductId(""); setLines([]); setExpectedYield(""); setActualYield(""); setAdditionalCost("0"); setPaymentMethod("CASH"); setAdditionalCostNote(""); setPreparedAt(today()); setNote(""); setSaveRecipe(false); setRecipeName(""); setRecipeInstructions("");
  }

  function selectRecipe(nextRecipeId: string) {
    setRecipeId(nextRecipeId); setSaveRecipe(false);
    const recipe = recipes.find((item) => item.id === nextRecipeId);
    if (!recipe) return;
    rememberProducts([recipe.outputProduct, ...recipe.items.map((item) => item.product)]);
    setOutputProductId(recipe.outputProduct.id); setExpectedYield(String(recipe.expectedYield)); setActualYield(String(recipe.expectedYield));
    setLines(recipe.items.map((item) => ({ productId: item.productId, quantity: String(item.quantity) })));
    setRecipeName(recipe.name); setRecipeInstructions(recipe.instructions || "");
  }

  function addIngredient(productId: string) {
    if (!productId || lines.some((line) => line.productId === productId) || productId === outputProductId) return;
    setRecipeId(""); setLines((current) => [...current, { productId, quantity: "1" }]);
  }

  async function prepareFood() {
    if (!outputProductId || !lines.length || !Number.isInteger(expectedValue) || expectedValue <= 0 || !Number.isInteger(yieldValue) || yieldValue <= 0) {
      toast(lang === "sw" ? "Chagua bidhaa inayotoka, ingredients, yield inayotarajiwa na yield halisi." : "Choose the prepared item, ingredients, expected yield, and actual yield.", "error"); return;
    }
    if (lines.some((line) => !Number.isInteger(Number(line.quantity)) || Number(line.quantity) <= 0)) { toast(lang === "sw" ? "Idadi ya kila ingredient iwe namba kamili zaidi ya sifuri." : "Each ingredient quantity must be a whole number greater than zero.", "error"); return; }
    if (!Number.isInteger(Number(additionalCost)) || Number(additionalCost) < 0) { toast(lang === "sw" ? "Gharama ya maandalizi si sahihi." : "Preparation cost is invalid.", "error"); return; }
    if (saveRecipe && (!recipeName.trim() || recipeId)) { toast(lang === "sw" ? "Weka jina la recipe mpya." : "Enter a name for the new recipe.", "error"); return; }
    setSaving(true);
    try {
      let savedRecipeId = recipeId || undefined;
      if (saveRecipe) {
        const result = await api.post<{ recipe: { id: string } }>("/food-preparation/recipes", { name: recipeName.trim(), outputProductId, expectedYield: expectedValue, instructions: recipeInstructions.trim() || undefined, items: lines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity) })) }, lang);
        savedRecipeId = result.recipe.id;
      }
      const result = await api.post<{ batch: Batch }>("/food-preparation", { recipeId: savedRecipeId, outputProductId, expectedYield: expectedValue, actualYield: yieldValue, additionalCost: Number(additionalCost), paymentMethod, additionalCostNote: additionalCostNote.trim() || undefined, preparedAt, note: note.trim() || undefined, items: lines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity) })) }, lang);
      const costMessage = typeof result.batch.unitCost === "number" ? (lang === "sw" ? ` Gharama ni ${formatTZS(result.batch.unitCost)} kwa ${result.batch.outputProduct.unit}.` : ` Cost is ${formatTZS(result.batch.unitCost)} per ${result.batch.outputProduct.unit}.`) : "";
      toast(lang === "sw" ? `Maandalizi yamehifadhiwa.${costMessage}` : `Preparation saved.${costMessage}`, "success");
      resetForm();
      if (page === 1) await load(1); else setPage(1);
    } catch (error) {
      toast(error instanceof Error ? error.message : (lang === "sw" ? "Imeshindikana kuhifadhi maandalizi." : "Could not save preparation."), "error");
    } finally { setSaving(false); }
  }

  if (loading) return <AppShell><div className="flex h-64 items-center justify-center"><LoaderCircle className="h-6 w-6 animate-spin text-brand-700" /></div></AppShell>;

  return <AppShell><main className="mx-auto max-w-5xl space-y-5 pb-24 lg:pb-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-bold text-gray-950">{lang === "sw" ? "Andaa Chakula" : "Prepare Food"}</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600">{lang === "sw" ? "Toa ingredients kwenye stock, weka portions zilizopatikana, na DukaPilot ihesabu gharama halisi kwa portion. Vinywaji vya chupa vinaendelea kuuzwa kama stock ya kawaida." : "Deduct ingredient stock, record the portions produced, and calculate the true cost per portion. Bottled drinks remain normal inventory."}</p></div><a href="/help" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-brand-300 bg-white px-3 py-2 text-sm font-semibold text-brand-800"><UtensilsCrossed className="h-4 w-4" />{lang === "sw" ? "Soma mwongozo" : "Read guide"}</a></header>
    <section className="border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>{lang === "sw" ? "Jambo muhimu:" : "Important:"}</strong> {lang === "sw" ? "Nunua kuku, mafuta, mchele na viungo kupitia Pokea Bidhaa. Tumia ukurasa huu baada ya kupika, si wakati wa kununua grocery." : "Receive chicken, oil, rice, and spices through Receive Stock. Use this page after cooking, not while buying groceries."}</section>
    <section className="border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold text-gray-950">{lang === "sw" ? "Batch mpya ya chakula" : "New food batch"}</h2><p className="mt-1 text-xs text-gray-500">{lang === "sw" ? "Batch ikihifadhiwa haihaririwi; stock history inabaki sahihi." : "A saved batch is immutable so stock history remains accurate."}</p></div><button type="button" onClick={resetForm} className="text-sm font-semibold text-gray-600">{lang === "sw" ? "Anza upya" : "Start over"}</button></div>
      {recipes.length > 0 && <label className="mt-5 grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Anza na recipe iliyohifadhiwa (hiari)" : "Start from a saved recipe (optional)"}</span><select value={recipeId} onChange={(event) => selectRecipe(event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-3"><option value="">{lang === "sw" ? "Chagua recipe" : "Choose a recipe"}</option>{recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name} - {recipe.outputProduct.name}</option>)}</select></label>}
      <div className="mt-5 grid gap-3 md:grid-cols-3"><div className="md:col-span-2"><ProductSearchPicker label={lang === "sw" ? "Bidhaa inayotoka baada ya kupika" : "Prepared item to add to stock"} placeholder={lang === "sw" ? "Tafuta, mfano: Nusu ya kuku" : "Search, for example: Half chicken"} selected={outputProductId ? productMap.get(outputProductId) || null : null} excludedIds={lines.map((line) => line.productId)} lang={lang} onSelect={(product) => { rememberProducts([product]); setRecipeId(""); setOutputProductId(product.id); }} onClear={() => { setRecipeId(""); setOutputProductId(""); }} /></div><div><DateSelect value={preparedAt} onChange={setPreparedAt} label={lang === "sw" ? "Tarehe ya kupika" : "Preparation date"} lang={lang} required /></div></div>
      <div className="mt-5 border-t border-gray-100 pt-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold text-gray-950">{lang === "sw" ? "Ingredients zilizotumika" : "Ingredients used"}</h3><div className="w-full sm:max-w-sm"><ProductSearchPicker compact label={lang === "sw" ? "Ongeza ingredient" : "Add ingredient"} placeholder={lang === "sw" ? "Tafuta ingredient" : "Search ingredient"} selected={null} excludedIds={[outputProductId, ...lines.map((line) => line.productId)]} lang={lang} onSelect={(product) => { rememberProducts([product]); addIngredient(product.id); }} /></div></div>
        {lines.length ? <div className="mt-3 space-y-2">{lines.map((line) => { const product = productMap.get(line.productId); const hasCost = typeof product?.buyingPrice === "number"; const lineCost = (product?.buyingPrice || 0) * (Number(line.quantity) || 0); return <div key={line.productId} className="grid gap-2 border border-gray-100 bg-gray-50 p-3 sm:grid-cols-[1fr_120px_150px_42px] sm:items-end"><div><p className="text-sm font-semibold text-gray-950">{product?.name}</p><p className="text-xs text-gray-500">{lang === "sw" ? "Iliyopo" : "Available"}: {product?.currentStock ?? "-"} {product?.unit || ""}{hasCost ? ` - ${formatTZS(product.buyingPrice || 0)} / ${product?.unit}` : ""}</p></div><label className="grid gap-1 text-xs font-medium text-gray-600"><span>{lang === "sw" ? "Iliyotumika" : "Used"}</span><input type="number" min="1" step="1" inputMode="numeric" value={line.quantity} onChange={(event) => { setRecipeId(""); setLines((current) => current.map((item) => item.productId === line.productId ? { ...item, quantity: event.target.value } : item)); }} className="rounded-lg border border-gray-300 bg-white px-3 py-2" /></label><p className="text-sm font-semibold text-gray-800">{hasCost ? formatTZS(lineCost) : "Private"}</p><button type="button" onClick={() => { setRecipeId(""); setLines((current) => current.filter((item) => item.productId !== line.productId)); }} className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600" aria-label={lang === "sw" ? "Ondoa ingredient" : "Remove ingredient"}><Trash2 className="h-4 w-4" /></button></div>; })}</div> : <div className="mt-3 border border-dashed border-gray-300 p-5 text-center text-sm text-gray-500">{lang === "sw" ? "Ongeza ingredients zilizotumika kupika." : "Add the ingredients used to cook this batch."}</div>}
      </div>
      <div className="mt-5 grid gap-3 border-t border-gray-100 pt-4 md:grid-cols-2 lg:grid-cols-5"><NumberField label={lang === "sw" ? "Yield iliyotarajiwa" : "Expected yield"} value={expectedYield} onChange={(value) => { setRecipeId(""); setExpectedYield(value); }} placeholder="20" /><NumberField label={lang === "sw" ? "Yield halisi" : "Actual yield"} value={actualYield} onChange={setActualYield} placeholder="18" /><NumberField label={lang === "sw" ? "Gharama za kupika (TZS)" : "Preparation costs (TZS)"} value={additionalCost} onChange={setAdditionalCost} /><label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Njia ya malipo" : "Payment method"}</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-3">{paymentMethods.map((method) => <option key={method} value={method}>{paymentLabel(method, lang)}</option>)}</select></label><label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Maelezo ya gharama (hiari)" : "Cost note (optional)"}</span><input value={additionalCostNote} onChange={(event) => setAdditionalCostNote(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-3" placeholder={lang === "sw" ? "Mkaa, labour" : "Charcoal, labour"} /></label></div>
      {paymentMethod === "CASH" && Number(additionalCost) > 0 && <p className="mt-3 text-xs leading-5 text-brand-800">{lang === "sw" ? "Gharama hii ya taslimu itaonekana kwenye Daily Close ya shift iliyo wazi. Usiirekodi tena kwenye Matumizi." : "This cash cost appears in the open Daily Close shift. Do not record it again as an Expense."}</p>}
      <label className="mt-3 grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Maelezo ya batch (hiari)" : "Batch note (optional)"}</span><input value={note} onChange={(event) => setNote(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-3" /></label>
      <label className="mt-4 flex items-start gap-2 text-sm text-gray-700"><input type="checkbox" checked={saveRecipe} disabled={Boolean(recipeId)} onChange={(event) => setSaveRecipe(event.target.checked)} className="mt-1" /><span><strong>{lang === "sw" ? "Hifadhi kama recipe ya kutumia tena" : "Save as a reusable recipe"}</strong><span className="block text-xs text-gray-500">{lang === "sw" ? "Recipe haihamishi stock mpaka utengeneze batch." : "A recipe does not move stock until you prepare a batch."}</span></span></label>
      {saveRecipe && <div className="mt-3 grid gap-3 md:grid-cols-2"><label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Jina la recipe" : "Recipe name"}</span><input value={recipeName} onChange={(event) => setRecipeName(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-3" placeholder={lang === "sw" ? "Kuku wa mkaa nusu" : "Half charcoal chicken"} /></label><label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Maelekezo (hiari)" : "Instructions (optional)"}</span><input value={recipeInstructions} onChange={(event) => setRecipeInstructions(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-3" /></label></div>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-gray-100 pt-4"><div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm"><span className="text-gray-500">{lang === "sw" ? "Gharama ya ingredients" : "Ingredient cost"}</span><strong>{canViewCosts ? formatTZS(ingredientCost) : "Private"}</strong><span className="text-gray-500">{lang === "sw" ? "Jumla ya gharama" : "Total cost"}</span><strong>{canViewCosts ? formatTZS(totalCost) : "Private"}</strong><span className="text-gray-500">{lang === "sw" ? "Waste / loss" : "Waste / loss"}</span><strong className={waste ? "text-amber-800" : ""}>{waste} {productMap.get(outputProductId)?.unit || ""}</strong><span className="text-gray-500">{lang === "sw" ? "Gharama kwa portion" : "Cost per portion"}</span><strong className="text-brand-800">{canViewCosts ? formatTZS(projectedUnitCost) : (lang === "sw" ? "Hukokotolewa baada ya kuhifadhi" : "Calculated when saved")}</strong></div><button type="button" disabled={saving || !lines.length} onClick={prepareFood} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><ChefHat className="h-4 w-4" />{saving ? "..." : (lang === "sw" ? "Hifadhi batch" : "Save batch")}</button></div>
    </section>
    <section><div className="mb-3 flex items-center gap-2"><ClipboardList className="h-4 w-4 text-brand-700" /><h2 className="font-bold text-gray-950">{lang === "sw" ? "Historia ya maandalizi" : "Preparation history"}</h2></div><div className="space-y-2">{batches.length ? batches.map((batch) => <details key={batch.id} className="border border-gray-200 bg-white p-4"><summary className="cursor-pointer list-none"><div className="flex flex-wrap items-center justify-between gap-3 pr-5"><div><p className="font-semibold text-gray-950">{batch.outputProduct.name}</p><p className="mt-0.5 text-xs text-gray-500">{new Date(batch.preparedAt).toLocaleDateString(lang === "sw" ? "sw-TZ" : "en-TZ")} - {batch.actualYield} {batch.outputProduct.unit}{batch.wasteQuantity ? ` - ${lang === "sw" ? "waste" : "waste"}: ${batch.wasteQuantity}` : ""}</p></div>{typeof batch.unitCost === "number" && <p className="font-bold text-brand-800">{formatTZS(batch.unitCost)} / {batch.outputProduct.unit}</p>}</div></summary><div className="mt-3 border-t border-gray-100 pt-3 text-sm">{typeof batch.totalCost === "number" && <p className="mb-2 text-xs text-gray-500">{lang === "sw" ? "Yield iliyotarajiwa" : "Expected yield"}: {batch.expectedYield} | {lang === "sw" ? "Gharama yote" : "Total cost"}: {formatTZS(batch.totalCost)} | {lang === "sw" ? "Gharama za kupika" : "Preparation costs"}: {formatTZS(batch.additionalCost || 0)}</p>}{batch.items.map((item) => <div key={item.id} className="flex justify-between gap-3 border-b border-gray-100 py-2 last:border-0"><span>{item.product.name} x {item.quantity} {item.product.unit}</span>{typeof item.totalCost === "number" && <span className="font-semibold">{formatTZS(item.totalCost)}</span>}</div>)}</div></details>) : <div className="border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">{lang === "sw" ? "Hakuna batch bado. Rekodi ulipika nini leo." : "No batches yet. Record what you cooked today."}</div>}</div>{totalPages > 1 && <div className="mt-3 flex items-center justify-between"><button disabled={page === 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-40">{lang === "sw" ? "Iliyotangulia" : "Previous"}</button><span className="text-sm text-gray-500">{page} / {totalPages}</span><button disabled={page === totalPages} onClick={() => setPage(page + 1)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-40">{lang === "sw" ? "Inayofuata" : "Next"}</button></div>}</section>
  </main></AppShell>;
}

function NumberField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="grid gap-1 text-sm font-medium text-gray-700"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} type="number" min="0" step="1" inputMode="numeric" className="rounded-lg border border-gray-300 px-3 py-3" placeholder={placeholder} /></label>;
}

function paymentLabel(method: string, lang: string) {
  const labels: Record<string, string> = { CASH: lang === "sw" ? "Taslimu" : "Cash", MPESA: "M-Pesa", TIGOPESA: "Tigo Pesa", AIRTEL_MONEY: "Airtel Money", HALOPESA: "HaloPesa", BANK: lang === "sw" ? "Benki" : "Bank" };
  return labels[method] || method;
}

function ProductSearchPicker({ label, placeholder, selected, excludedIds, lang, onSelect, onClear, compact = false }: { label: string; placeholder: string; selected: Product | null; excludedIds: string[]; lang: Lang; onSelect: (product: Product) => void; onClear?: () => void; compact?: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const excludedKey = excludedIds.filter(Boolean).sort().join("|");

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setResults([]); return undefined; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api.get<{ products: Product[] }>(`/products?search=${encodeURIComponent(term)}&limit=20`, lang);
        if (!cancelled) setResults(data.products.filter((product) => !excludedIds.includes(product.id)));
      } catch { if (!cancelled) setResults([]); } finally { if (!cancelled) setSearching(false); }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [excludedKey, lang, query]);

  return <label className="relative grid gap-1 text-sm font-medium text-gray-700"><span>{label}</span>{selected && <div className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 text-sm text-brand-950"><span className="truncate"><strong>{selected.name}</strong><span className="ml-1 text-xs">({selected.currentStock} {selected.unit})</span></span>{onClear && <button type="button" onClick={onClear} className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-brand-200 bg-white text-brand-800" aria-label={lang === "sw" ? "Ondoa bidhaa" : "Clear product"}><X className="h-4 w-4" /></button>}</div>}<div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onBlur={() => window.setTimeout(() => setOpen(false), 150)} autoComplete="off" className={`w-full rounded-lg border border-gray-300 py-3 pl-9 pr-3 ${compact ? "text-sm" : ""}`} placeholder={placeholder} />{open && <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">{query.trim().length < 2 ? <p className="px-3 py-2 text-xs font-normal text-gray-500">{lang === "sw" ? "Andika angalau herufi 2 kutafuta bidhaa." : "Type at least 2 letters to search products."}</p> : searching ? <p className="px-3 py-2 text-xs font-normal text-gray-500">{lang === "sw" ? "Inatafuta..." : "Searching..."}</p> : results.length ? results.map((product) => <button key={product.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelect(product); setQuery(""); setOpen(false); }} className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-brand-50"><span className="min-w-0 truncate font-semibold text-gray-950">{product.name}</span><span className="shrink-0 text-xs font-normal text-gray-500">{product.currentStock} {product.unit}</span></button>) : <p className="px-3 py-2 text-xs font-normal text-gray-500">{lang === "sw" ? "Hakuna bidhaa iliyopatikana." : "No products found."}</p>}</div>}</div></label>;
}
