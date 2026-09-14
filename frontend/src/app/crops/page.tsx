"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, CalendarDays, ClipboardList, LoaderCircle, MapPin, PackagePlus, Sprout, Tractor, WalletCards, Wheat } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { api, ApiError, formatTZS, getCurrentSession } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import { newCropOperationId, readPendingCropOperations, setActiveOfflineCropScope, type PendingCropOperation, writePendingCropOperations } from "@/lib/offlineCropStorage";
import { offlineSalesScope } from "@/lib/offlineSalesStorage";

type CycleStatus = "PLANNED" | "PLANTED" | "GROWING" | "HARVESTING" | "CLOSED" | "CANCELLED";
type Product = { id: string; name: string; unit: string; currentStock: number; buyingPrice?: number | null; sellingPrice?: number | null; };
type Plot = { id: string; name: string; location?: string | null; areaMilli: number; areaUnit: "ACRE" | "HECTARE" | "SQUARE_METRE"; isActive: boolean; };
type Cycle = { id: string; cropName: string; variety?: string | null; status: CycleStatus; plantedAt: string; expectedHarvestAt?: string | null; expectedYield?: number | null; yieldUnit?: string | null; plot: Plot; inputUsages: Array<{ id: string; title: string; category: string; quantity?: number | null; usedAt: string }>; harvestBatches: Array<{ id: string; actualYield: number; wasteQuantity: number; harvestAt: string; outputProduct: { name: string; unit: string } }>; };
type CropReport = { id: string; cropName: string; variety?: string | null; status: CycleStatus; plot: Plot; expectedYield?: number | null; yieldUnit?: string | null; harvestedQuantity: number; remainingQuantity: number; soldQuantity: number; wasteQuantity: number; inputCost?: number; costPerArea?: number | null; realizedRevenue?: number; realizedProfit?: number; potentialProfit?: number; outputs: Array<{ name: string; unit: string; harvestedQuantity: number; remainingQuantity: number; soldQuantity: number; }> };
type CropData = { plots: Plot[]; cycles: Cycle[]; report: CropReport[]; financialsVisible: boolean; summary: { activeCycles: number; plots: number; totalHarvested: number; totalRemaining: number; totalInputCost?: number | null; }; recentInputs: Array<{ id: string; title: string; category: string; quantity?: number | null; usedAt: string; cropCycle: { cropName: string; plot: { name: string } }; product?: { name: string; unit: string } | null; totalCost?: number | null; }>; recentHarvests: Array<{ id: string; actualYield: number; wasteQuantity: number; harvestAt: string; cropCycle: { cropName: string; plot: { name: string } }; outputProduct: { name: string; unit: string }; totalCost?: number | null; }>; };

const CROP_SUGGESTIONS = ["Maize", "Beans", "Rice", "Vegetables", "Cassava", "Sunflower", "Tomatoes", "Onions"];
const INPUT_CATEGORIES = ["SEED", "FERTILIZER", "PESTICIDE", "LABOUR", "TRANSPORT", "IRRIGATION", "OTHER"];
const PAYMENT_METHODS = ["CASH", "MPESA", "TIGOPESA", "AIRTEL_MONEY", "HALOPESA", "BANK"];

function today() { return new Date().toISOString().slice(0, 10); }
function formatDate(value?: string | null) { return value ? new Date(value).toLocaleDateString("en-TZ", { day: "numeric", month: "short", year: "numeric" }) : "-"; }
function formatArea(plot: Plot) { return `${(plot.areaMilli / 1000).toLocaleString("en-TZ", { maximumFractionDigits: 3 })} ${plot.areaUnit === "SQUARE_METRE" ? "m2" : plot.areaUnit.toLowerCase()}`; }
function labelStatus(status: CycleStatus, sw: boolean) { return ({ PLANNED: sw ? "Imepangwa" : "Planned", PLANTED: sw ? "Imepandwa" : "Planted", GROWING: sw ? "Inakua" : "Growing", HARVESTING: sw ? "Mavuno" : "Harvesting", CLOSED: sw ? "Imefungwa" : "Closed", CANCELLED: sw ? "Imeghairiwa" : "Cancelled" } as Record<string, string>)[status] || status; }
function labelInput(category: string, sw: boolean) { return ({ SEED: sw ? "Mbegu" : "Seed", FERTILIZER: sw ? "Mbolea" : "Fertilizer", PESTICIDE: sw ? "Dawa ya mimea" : "Pesticide", LABOUR: sw ? "Kazi" : "Labour", TRANSPORT: sw ? "Usafiri" : "Transport", IRRIGATION: sw ? "Umwagiliaji" : "Irrigation", OTHER: sw ? "Nyingine" : "Other" } as Record<string, string>)[category] || category; }
function labelPayment(method: string, sw: boolean) { return ({ CASH: sw ? "Taslimu" : "Cash", MPESA: "M-Pesa", TIGOPESA: "Tigo Pesa", AIRTEL_MONEY: "Airtel Money", HALOPESA: "HaloPesa", BANK: sw ? "Benki" : "Bank" } as Record<string, string>)[method] || method; }

export default function CropsPage() {
  const lang = useLang();
  const { toast } = useToast();
  const sw = lang === "sw";
  const [data, setData] = useState<CropData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [farmSetupRequired, setFarmSetupRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [offlineScope, setOfflineScope] = useState<string | null>(null);
  const [pendingCropOperations, setPendingCropOperations] = useState<PendingCropOperation[]>([]);
  const [syncingCrops, setSyncingCrops] = useState(false);
  const [inputUsesStock, setInputUsesStock] = useState(true);
  const [plotForm, setPlotForm] = useState({ name: "", location: "", area: "", areaUnit: "ACRE", note: "" });
  const [cycleForm, setCycleForm] = useState({ plotId: "", cropName: "", variety: "", plantedAt: today(), expectedHarvestAt: "", expectedYield: "", yieldUnit: "kg", note: "" });
  const [inputForm, setInputForm] = useState({ cropCycleId: "", productId: "", category: "SEED", quantity: "", title: "", totalCost: "", paymentMethod: "CASH", usedAt: today(), note: "" });
  const [harvestForm, setHarvestForm] = useState({ cropCycleId: "", outputProductId: "", expectedYield: "", actualYield: "", wasteQuantity: "0", harvestAt: today(), note: "" });

  useEffect(() => {
    getCurrentSession<{ user: { id: string; businessShopId?: string; shop?: { id?: string; parentShopId?: string | null }; staff?: { id?: string } } }>()
      .then((session) => {
        const scope = offlineSalesScope(session.user);
        setOfflineScope(scope);
        setActiveOfflineCropScope(scope);
        setPendingCropOperations(readPendingCropOperations(scope));
      })
      .catch(() => { setOfflineScope(null); setPendingCropOperations([]); });
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [crops, inventory] = await Promise.all([
        api.get<CropData>("/crops", lang),
        api.get<{ products: Product[] }>("/crops/products?limit=100", lang),
      ]);
      setData(crops);
      setProducts(inventory.products || []);
      setCycleForm((current) => ({ ...current, plotId: current.plotId || crops.plots.find((plot) => plot.isActive)?.id || "" }));
      const search = new URLSearchParams(window.location.search);
      const requestedAction = search.get("action");
      const requestedCycleId = search.get("cycle");
      const firstActiveCycle = crops.cycles.find((cycle) => !["CLOSED", "CANCELLED"].includes(cycle.status))?.id || "";
      const requestedInputCycle = crops.cycles.some((cycle) => cycle.id === requestedCycleId && !["CLOSED", "CANCELLED"].includes(cycle.status)) ? requestedCycleId : "";
      setInputForm((current) => ({ ...current, cropCycleId: requestedAction === "input" && requestedInputCycle ? requestedInputCycle : (current.cropCycleId || firstActiveCycle) }));
      const firstHarvestableCycle = crops.cycles.find((cycle) => !["CLOSED", "CANCELLED"].includes(cycle.status))?.id || "";
      const requestedHarvestCycle = crops.cycles.some((cycle) => cycle.id === requestedCycleId && !["CLOSED", "CANCELLED"].includes(cycle.status)) ? requestedCycleId : "";
      setHarvestForm((current) => ({ ...current, cropCycleId: requestedAction === "harvest" && requestedHarvestCycle ? requestedHarvestCycle : (crops.cycles.some((cycle) => cycle.id === current.cropCycleId && !["CLOSED", "CANCELLED"].includes(cycle.status)) ? current.cropCycleId : firstHarvestableCycle) }));
      if (requestedAction === "input" || requestedAction === "harvest") {
        window.requestAnimationFrame(() => document.getElementById(`crop-${requestedAction}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : (sw ? "Imeshindikana kufungua mazao." : "Could not load crop operations.");
      if (/crops operations are not enabled/i.test(message)) setFarmSetupRequired(true);
      else toast(message, "error");
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [lang]);

  async function syncPendingCropOperations() {
    if (!offlineScope || syncingCrops || (typeof navigator !== "undefined" && !navigator.onLine)) return;
    const pending = readPendingCropOperations(offlineScope);
    if (!pending.length) return;
    setSyncingCrops(true);
    const remaining: PendingCropOperation[] = [];
    let synced = 0;
    for (const operation of pending) {
      try {
        await api.post(operation.path, operation.payload, lang);
        synced += 1;
      } catch (error) {
        remaining.push({ ...operation, attempts: operation.attempts + 1, lastError: error instanceof Error ? error.message : "Could not sync crop record" });
      }
    }
    writePendingCropOperations(offlineScope, remaining);
    setPendingCropOperations(remaining);
    setSyncingCrops(false);
    if (synced) {
      toast(sw ? "Rekodi za mazao zimesawazishwa." : "Crop records synced.", "success");
      await load();
    }
  }

  useEffect(() => {
    if (!offlineScope) return;
    syncPendingCropOperations().catch(() => {});
    const handleOnline = () => { syncPendingCropOperations().catch(() => {}); };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [offlineScope, lang]);

  function queueCropOperation(operation: PendingCropOperation, error: unknown) {
    const status = error instanceof ApiError ? error.status : undefined;
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    if (!offlineScope || (status && status >= 400 && status < 500) || (!offline && status)) return false;
    const next = [...readPendingCropOperations(offlineScope), { ...operation, lastError: error instanceof Error ? error.message : undefined }];
    writePendingCropOperations(offlineScope, next);
    setPendingCropOperations(next);
    return true;
  }

  const activeCycles = useMemo(() => data?.cycles.filter((cycle) => !["CLOSED", "CANCELLED"].includes(cycle.status)) || [], [data?.cycles]);
  const harvestableCycles = activeCycles;
  const selectedInputProduct = products.find((product) => product.id === inputForm.productId);

  async function submitPlot(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post("/crops/plots", { ...plotForm, area: Number(plotForm.area), note: plotForm.note.trim() || undefined }, lang);
      toast(sw ? "Plot imeongezwa." : "Plot added.", "success");
      setPlotForm({ name: "", location: "", area: "", areaUnit: "ACRE", note: "" });
      await load();
    } catch (error) { toast(error instanceof Error ? error.message : (sw ? "Imeshindikana kuongeza plot." : "Could not add plot."), "error"); } finally { setSaving(false); }
  }

  async function submitCycle(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post("/crops/cycles", { ...cycleForm, expectedHarvestAt: cycleForm.expectedHarvestAt || undefined, expectedYield: cycleForm.expectedYield ? Number(cycleForm.expectedYield) : undefined, variety: cycleForm.variety.trim() || undefined, note: cycleForm.note.trim() || undefined }, lang);
      toast(sw ? "Msimu wa zao umeanzishwa." : "Crop cycle started.", "success");
      setCycleForm((current) => ({ ...current, cropName: "", variety: "", expectedHarvestAt: "", expectedYield: "", note: "" }));
      await load();
    } catch (error) { toast(error instanceof Error ? error.message : (sw ? "Imeshindikana kuanzisha msimu." : "Could not start crop cycle."), "error"); } finally { setSaving(false); }
  }

  async function submitInput(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const clientRequestId = newCropOperationId();
      const payload = inputUsesStock
        ? { cropCycleId: inputForm.cropCycleId, productId: inputForm.productId, category: inputForm.category, quantity: Number(inputForm.quantity), paymentMethod: inputForm.paymentMethod, usedAt: inputForm.usedAt, note: inputForm.note.trim() || undefined, clientRequestId }
        : { cropCycleId: inputForm.cropCycleId, category: inputForm.category, title: inputForm.title.trim(), totalCost: Number(inputForm.totalCost), paymentMethod: inputForm.paymentMethod, usedAt: inputForm.usedAt, note: inputForm.note.trim() || undefined, clientRequestId };
      try { await api.post("/crops/inputs", payload, lang); }
      catch (error) {
        if (queueCropOperation({ id: clientRequestId, path: "/crops/inputs", payload, createdAt: new Date().toISOString(), attempts: 0 }, error)) {
          toast(sw ? "Pembejeo imesubiri kusawazishwa ukipata mtandao." : "Input is queued and will sync when you are back online.", "success");
          return;
        }
        throw error;
      }
      toast(inputUsesStock ? (sw ? "Pembejeo imetolewa kwenye stock." : "Input removed from stock.") : (sw ? "Gharama ya pembejeo imehifadhiwa." : "Input cost saved."), "success");
      setInputForm((current) => ({ ...current, productId: "", quantity: "", title: "", totalCost: "", note: "", usedAt: today() }));
      await load();
    } catch (error) { toast(error instanceof Error ? error.message : (sw ? "Imeshindikana kuhifadhi pembejeo." : "Could not save crop input."), "error"); } finally { setSaving(false); }
  }

  async function submitHarvest(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const clientRequestId = newCropOperationId();
      const payload = { ...harvestForm, expectedYield: harvestForm.expectedYield ? Number(harvestForm.expectedYield) : undefined, actualYield: Number(harvestForm.actualYield), wasteQuantity: Number(harvestForm.wasteQuantity || 0), note: harvestForm.note.trim() || undefined, clientRequestId };
      try { await api.post("/crops/harvests", payload, lang); }
      catch (error) {
        if (queueCropOperation({ id: clientRequestId, path: "/crops/harvests", payload, createdAt: new Date().toISOString(), attempts: 0 }, error)) {
          toast(sw ? "Mavuno yamesubiri kusawazishwa ukipata mtandao." : "Harvest is queued and will sync when you are back online.", "success");
          return;
        }
        throw error;
      }
      toast(sw ? "Mavuno yameongezwa kwenye stock." : "Harvest added to stock.", "success");
      setHarvestForm((current) => ({ ...current, outputProductId: "", expectedYield: "", actualYield: "", wasteQuantity: "0", harvestAt: today(), note: "" }));
      await load();
    } catch (error) { toast(error instanceof Error ? error.message : (sw ? "Imeshindikana kuhifadhi mavuno." : "Could not save harvest."), "error"); } finally { setSaving(false); }
  }

  async function updateCycleStatus(cycleId: string, status: CycleStatus) {
    setSaving(true);
    try {
      await api.patch(`/crops/cycles/${cycleId}`, { status }, lang);
      toast(sw ? "Hatua ya zao imehifadhiwa." : "Crop status saved.", "success");
      await load();
    } catch (error) { toast(error instanceof Error ? error.message : (sw ? "Imeshindikana kubadilisha hatua." : "Could not update crop status."), "error"); } finally { setSaving(false); }
  }

  if (loading && !data) return <AppShell><div className="flex h-64 items-center justify-center"><LoaderCircle className="h-6 w-6 animate-spin text-brand-700" /></div></AppShell>;
  if (farmSetupRequired) return <AppShell><main className="mx-auto max-w-xl pb-24 pt-4 lg:pb-8"><section className="border border-brand-200 bg-brand-50 p-5"><Sprout className="h-6 w-6 text-brand-700" /><h1 className="mt-3 text-xl font-bold text-gray-950">{sw ? "Weka aina ya shamba kwanza" : "Set up your farm type first"}</h1><p className="mt-2 text-sm leading-6 text-gray-700">{sw ? "Chagua Mazao, Ufugaji au Vyote ili DukaPilot ikuonyeshe zana sahihi kwa biashara yako." : "Choose Crops, Livestock, or Both so DukaPilot shows the right tools for your business."}</p><Link href="/farm" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white"><Tractor className="h-4 w-4" />{sw ? "Fungua usanidi wa shamba" : "Open farm setup"}</Link></section></main></AppShell>;

  return <AppShell><main className="mx-auto max-w-6xl space-y-6 pb-24 lg:pb-8">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-bold text-gray-950">{sw ? "Mazao" : "Crop operations"}</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600">{sw ? "Fuatilia plot, msimu wa zao, pembejeo, mavuno na stock ya kuuza bila kurudia gharama." : "Track plots, crop cycles, inputs, harvests, and sellable stock without recording costs twice."}</p></div><div className="flex flex-wrap gap-2"><Link href="/crops/operations" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white"><ClipboardList className="h-4 w-4" />{sw ? "Mpango wa shamba" : "Field plan"}</Link><Link href="/inventory" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-brand-300 bg-white px-3 py-2 text-sm font-semibold text-brand-800"><PackagePlus className="h-4 w-4" />{sw ? "Bidhaa" : "Inventory"}</Link><Link href="/help" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-brand-300 bg-white px-3 py-2 text-sm font-semibold text-brand-800"><Tractor className="h-4 w-4" />{sw ? "Mwongozo" : "Guide"}</Link></div></header>

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
      [sw ? "Plots hai" : "Active plots", data?.summary.plots || 0, MapPin],
      [sw ? "Misimu hai" : "Active cycles", data?.summary.activeCycles || 0, Sprout],
      [sw ? "Mavuno yote" : "Total harvested", data?.summary.totalHarvested || 0, Wheat],
      [sw ? "Stock ya mavuno" : "Harvest stock", data?.summary.totalRemaining || 0, PackagePlus],
    ].map(([label, value, Icon]) => { const MetricIcon = Icon as typeof Sprout; return <div key={String(label)} className="border border-gray-200 bg-white p-4"><MetricIcon className="h-4 w-4 text-brand-700" /><p className="mt-3 text-xs text-gray-500">{String(label)}</p><p className="mt-1 text-xl font-bold text-gray-950">{String(value)}</p></div>; })}</section>

    <section className="border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950"><ClipboardList className="mr-2 inline h-4 w-4" /><strong>{sw ? "Muunganisho wa mtandao:" : "Internet connection:"}</strong> {pendingCropOperations.length ? <><span>{sw ? `Rekodi ${pendingCropOperations.length} za mazao zinasubiri kusawazishwa.` : `${pendingCropOperations.length} crop record${pendingCropOperations.length === 1 ? " is" : "s are"} waiting to sync.`}</span><button type="button" disabled={syncingCrops} onClick={() => syncPendingCropOperations()} className="ml-3 min-h-9 border border-sky-400 bg-white px-3 text-xs font-semibold text-sky-900 disabled:opacity-60">{syncingCrops ? (sw ? "Inasawazisha..." : "Syncing...") : (sw ? "Jaribu sasa" : "Try now")}</button></> : <span>{sw ? "Pembejeo na mavuno yanaweza kusubiri kwa usalama ukiwa kwenye ukurasa huu na mtandao ukikatika. Rekodi zingine za shamba huhifadhiwa online." : "Inputs and harvests can safely wait to sync if the connection drops while this page is open. Other field records save online."}</span>}</section>

    <section className="grid gap-5 lg:grid-cols-2">
      <form onSubmit={submitPlot} className="border border-gray-200 bg-white p-5"><div className="flex items-start gap-3"><MapPin className="mt-0.5 h-5 w-5 text-brand-700" /><div><h2 className="font-bold text-gray-950">{sw ? "1. Ongeza plot/shamba" : "1. Add a plot/field"}</h2><p className="mt-1 text-sm leading-6 text-gray-600">{sw ? "Eneo moja la kufuatilia zao linaweza kuwa shamba, sehemu, au green house." : "One record can be a field, plot, section, or greenhouse."}</p></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><TextField label={sw ? "Jina la plot" : "Plot name"} value={plotForm.name} onChange={(value) => setPlotForm({ ...plotForm, name: value })} placeholder={sw ? "Mfano: Shamba A" : "Example: Field A"} required /><TextField label={sw ? "Eneo/mtaa (hiari)" : "Location (optional)"} value={plotForm.location} onChange={(value) => setPlotForm({ ...plotForm, location: value })} /><TextField label={sw ? "Ukubwa" : "Size"} value={plotForm.area} onChange={(value) => setPlotForm({ ...plotForm, area: value })} type="number" required /><SelectField label={sw ? "Kipimo" : "Unit"} value={plotForm.areaUnit} onChange={(value) => setPlotForm({ ...plotForm, areaUnit: value })}><option value="ACRE">{sw ? "Ekari" : "Acres"}</option><option value="HECTARE">{sw ? "Hekta" : "Hectares"}</option><option value="SQUARE_METRE">m2</option></SelectField></div><div className="mt-3"><TextField label={sw ? "Dokezo (hiari)" : "Note (optional)"} value={plotForm.note} onChange={(value) => setPlotForm({ ...plotForm, note: value })} /></div><button disabled={saving} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><MapPin className="h-4 w-4" />{sw ? "Ongeza plot" : "Add plot"}</button></form>
      <form onSubmit={submitCycle} className="border border-gray-200 bg-white p-5"><div className="flex items-start gap-3"><Sprout className="mt-0.5 h-5 w-5 text-brand-700" /><div><h2 className="font-bold text-gray-950">{sw ? "2. Anzisha msimu wa zao" : "2. Start a crop cycle"}</h2><p className="mt-1 text-sm leading-6 text-gray-600">{sw ? "Unganisha zao na plot yake ili gharama na mavuno vikae pamoja." : "Connect a crop to its plot so costs and harvests stay together."}</p></div></div>{!data?.plots.length ? <p className="mt-4 border border-dashed border-gray-300 p-4 text-sm text-gray-600">{sw ? "Ongeza plot kwanza." : "Add a plot first."}</p> : <fieldset disabled={saving} className="mt-4 grid gap-3 sm:grid-cols-2"><SelectField label={sw ? "Plot" : "Plot"} value={cycleForm.plotId} onChange={(value) => setCycleForm({ ...cycleForm, plotId: value })}>{data.plots.filter((plot) => plot.isActive).map((plot) => <option key={plot.id} value={plot.id}>{plot.name} - {formatArea(plot)}</option>)}</SelectField><TextField label={sw ? "Zao" : "Crop"} value={cycleForm.cropName} onChange={(value) => setCycleForm({ ...cycleForm, cropName: value })} list="crop-suggestions" placeholder={sw ? "Mahindi" : "Maize"} required /><TextField label={sw ? "Aina/variety (hiari)" : "Variety (optional)"} value={cycleForm.variety} onChange={(value) => setCycleForm({ ...cycleForm, variety: value })} /><TextField label={sw ? "Tarehe ya kupanda" : "Planting date"} value={cycleForm.plantedAt} onChange={(value) => setCycleForm({ ...cycleForm, plantedAt: value })} type="date" required /><TextField label={sw ? "Tarehe ya mavuno (hiari)" : "Expected harvest (optional)"} value={cycleForm.expectedHarvestAt} onChange={(value) => setCycleForm({ ...cycleForm, expectedHarvestAt: value })} type="date" /><TextField label={sw ? "Mavuno yanayotarajiwa (hiari)" : "Expected yield (optional)"} value={cycleForm.expectedYield} onChange={(value) => setCycleForm({ ...cycleForm, expectedYield: value })} type="number" /><TextField label={sw ? "Kipimo cha mavuno" : "Yield unit"} value={cycleForm.yieldUnit} onChange={(value) => setCycleForm({ ...cycleForm, yieldUnit: value })} placeholder="kg" /><div className="sm:col-span-2"><TextField label={sw ? "Dokezo (hiari)" : "Note (optional)"} value={cycleForm.note} onChange={(value) => setCycleForm({ ...cycleForm, note: value })} /></div><button className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white"><Sprout className="h-4 w-4" />{sw ? "Anzisha msimu" : "Start cycle"}</button></fieldset>}<datalist id="crop-suggestions">{CROP_SUGGESTIONS.map((crop) => <option key={crop} value={crop} />)}</datalist></form>
    </section>

    <section className="grid gap-5 lg:grid-cols-2">
      <form id="crop-input" onSubmit={submitInput} className="border border-gray-200 bg-white p-5"><div className="flex items-start gap-3"><WalletCards className="mt-0.5 h-5 w-5 text-brand-700" /><div><h2 className="font-bold text-gray-950">{sw ? "3. Rekodi pembejeo na gharama" : "3. Record inputs and costs"}</h2><p className="mt-1 text-sm leading-6 text-gray-600">{sw ? "Mbegu, mbolea, dawa, kazi au maji huenda moja kwa moja kwenye msimu wa zao." : "Seeds, fertilizer, pesticide, labour, or water are assigned to one crop cycle."}</p></div></div>{!activeCycles.length ? <p className="mt-4 border border-dashed border-gray-300 p-4 text-sm text-gray-600">{sw ? "Anzisha msimu wa zao kwanza." : "Start a crop cycle first."}</p> : <fieldset disabled={saving} className="mt-4"><div className="grid gap-3 sm:grid-cols-2"><SelectField label={sw ? "Msimu wa zao" : "Crop cycle"} value={inputForm.cropCycleId} onChange={(value) => setInputForm({ ...inputForm, cropCycleId: value })}>{activeCycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.cropName} - {cycle.plot.name}</option>)}</SelectField><SelectField label={sw ? "Aina ya pembejeo" : "Input type"} value={inputForm.category} onChange={(value) => setInputForm({ ...inputForm, category: value })}>{INPUT_CATEGORIES.map((category) => <option key={category} value={category}>{labelInput(category, sw)}</option>)}</SelectField></div><div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1"><button type="button" onClick={() => setInputUsesStock(true)} className={`min-h-10 rounded-md px-3 text-sm font-semibold ${inputUsesStock ? "bg-white text-brand-800 shadow-sm" : "text-gray-600"}`}>{sw ? "Tumia stock" : "Use stock"}</button><button type="button" onClick={() => setInputUsesStock(false)} className={`min-h-10 rounded-md px-3 text-sm font-semibold ${!inputUsesStock ? "bg-white text-brand-800 shadow-sm" : "text-gray-600"}`}>{sw ? "Gharama ya moja kwa moja" : "Direct cost"}</button></div>{inputUsesStock ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><ProductSelect label={sw ? "Bidhaa kwenye stock" : "Stock product"} products={products} value={inputForm.productId} onChange={(value) => setInputForm({ ...inputForm, productId: value })} emptyLabel={sw ? "Hakuna bidhaa. Ongeza kwenye Bidhaa." : "No products. Add one in Inventory."} /><TextField label={sw ? `Kiasi${selectedInputProduct ? ` (${selectedInputProduct.unit})` : ""}` : `Quantity${selectedInputProduct ? ` (${selectedInputProduct.unit})` : ""}`} value={inputForm.quantity} onChange={(value) => setInputForm({ ...inputForm, quantity: value })} type="number" required /></div> : <div className="mt-4 grid gap-3 sm:grid-cols-2"><TextField label={sw ? "Jina la gharama" : "Input description"} value={inputForm.title} onChange={(value) => setInputForm({ ...inputForm, title: value })} placeholder={sw ? "Mfano: Kazi ya kupalilia" : "Example: Weeding labour"} required /><TextField label={sw ? "Gharama (TZS)" : "Cost (TZS)"} value={inputForm.totalCost} onChange={(value) => setInputForm({ ...inputForm, totalCost: value })} type="number" required /></div>}<div className="mt-3 grid gap-3 sm:grid-cols-2"><SelectField label={sw ? "Njia ya malipo" : "Payment method"} value={inputForm.paymentMethod} onChange={(value) => setInputForm({ ...inputForm, paymentMethod: value })}>{PAYMENT_METHODS.map((method) => <option key={method} value={method}>{labelPayment(method, sw)}</option>)}</SelectField><TextField label={sw ? "Tarehe" : "Date"} value={inputForm.usedAt} onChange={(value) => setInputForm({ ...inputForm, usedAt: value })} type="date" required /></div><div className="mt-3"><TextField label={sw ? "Dokezo (hiari)" : "Note (optional)"} value={inputForm.note} onChange={(value) => setInputForm({ ...inputForm, note: value })} /></div>{!inputUsesStock && inputForm.paymentMethod === "CASH" && <p className="mt-3 text-xs leading-5 text-brand-800">{sw ? "Hii itaonekana kwenye Daily Close. Usiirekodi tena kwenye Matumizi." : "This appears in Daily Close. Do not add it again as an Expense."}</p>}<button className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white"><WalletCards className="h-4 w-4" />{sw ? "Hifadhi pembejeo" : "Save input"}</button></fieldset>}</form>
      <form id="crop-harvest" onSubmit={submitHarvest} className="border border-gray-200 bg-white p-5"><div className="flex items-start gap-3"><Wheat className="mt-0.5 h-5 w-5 text-brand-700" /><div><h2 className="font-bold text-gray-950">{sw ? "4. Rekodi mavuno kwenye stock" : "4. Harvest into stock"}</h2><p className="mt-1 text-sm leading-6 text-gray-600">{sw ? "Mavuno huongezwa kwenye Bidhaa, tayari kuuzwa kwa POS au catalog." : "Harvest is added to Inventory, ready for POS or catalog sales."}</p></div></div>{!harvestableCycles.length ? <p className="mt-4 border border-dashed border-gray-300 p-4 text-sm text-gray-600">{sw ? "Anzisha msimu wa zao kwanza." : "Start a crop cycle first."}</p> : <fieldset disabled={saving} className="mt-4 grid gap-3 sm:grid-cols-2"><SelectField label={sw ? "Msimu wa zao" : "Crop cycle"} value={harvestForm.cropCycleId} onChange={(value) => setHarvestForm({ ...harvestForm, cropCycleId: value })}>{harvestableCycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.cropName} - {cycle.plot.name}</option>)}</SelectField><ProductSelect label={sw ? "Bidhaa ya mavuno" : "Harvest product"} products={products} value={harvestForm.outputProductId} onChange={(value) => setHarvestForm({ ...harvestForm, outputProductId: value })} emptyLabel={sw ? "Ongeza bidhaa ya mavuno kwenye Bidhaa kwanza." : "Add a harvest product in Inventory first."} /><p className="sm:col-span-2 text-xs leading-5 text-gray-600">{sw ? "Tumia bidhaa maalumu ya mavuno haya (mfano Mahindi ya Shamba A). Kwa nyanya au mavuno ya mara nyingi, weka makadirio ya jumla kabla ya mavuno ya kwanza; haya hubaki msingi wa kugawa gharama bila kubadilisha mauzo yaliyopita." : "Use a product dedicated to this harvest (for example, Field A maize). For tomatoes or repeated picks, set the expected total before the first harvest; it becomes the fixed cost-allocation basis without rewriting prior sales."}</p><TextField label={sw ? "Makadirio ya jumla ya msimu (hiari)" : "Expected total cycle yield (optional)"} value={harvestForm.expectedYield} onChange={(value) => setHarvestForm({ ...harvestForm, expectedYield: value })} type="number" /><TextField label={sw ? "Mavuno ya leo" : "This harvest"} value={harvestForm.actualYield} onChange={(value) => setHarvestForm({ ...harvestForm, actualYield: value })} type="number" required /><TextField label={sw ? "Yaliyoharibika" : "Wastage"} value={harvestForm.wasteQuantity} onChange={(value) => setHarvestForm({ ...harvestForm, wasteQuantity: value })} type="number" /><TextField label={sw ? "Tarehe ya mavuno" : "Harvest date"} value={harvestForm.harvestAt} onChange={(value) => setHarvestForm({ ...harvestForm, harvestAt: value })} type="date" required /><div className="sm:col-span-2"><TextField label={sw ? "Dokezo (hiari)" : "Note (optional)"} value={harvestForm.note} onChange={(value) => setHarvestForm({ ...harvestForm, note: value })} /></div><button className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white"><Wheat className="h-4 w-4" />{sw ? "Hifadhi mavuno" : "Save harvest"}</button></fieldset>}</form>
    </section>

    <section className="border border-gray-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold text-gray-950">{sw ? "Ripoti ya mazao" : "Crop report"}</h2><p className="mt-1 text-sm leading-6 text-gray-600">{sw ? "Linganisha matarajio, mavuno, stock iliyobaki na mauzo kwa kila msimu wa zao." : "Compare expected yield, harvest, remaining stock, and sales for every crop cycle."}</p></div>{data?.financialsVisible && <div className="text-right"><p className="text-xs text-gray-500">{sw ? "Gharama za pembejeo" : "Input costs"}</p><p className="font-bold text-gray-950">{formatTZS(data.summary.totalInputCost || 0)}</p></div>}</div>{!data?.report.length ? <p className="mt-4 border border-dashed border-gray-300 p-5 text-sm text-gray-600">{sw ? "Bado hakuna msimu wa zao. Anzisha msimu ili kuona ripoti." : "No crop cycles yet. Start one to see its report."}</p> : <div className="mt-4 grid gap-3">{data.report.map((row) => <article key={row.id} className="border border-gray-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-gray-950">{row.cropName}{row.variety ? ` - ${row.variety}` : ""}</h3><p className="mt-1 text-xs text-gray-500">{row.plot.name} - {formatArea(row.plot)} - {labelStatus(row.status, sw)}</p></div><select aria-label={`${row.cropName} status`} value={row.status} disabled={saving || ["CLOSED", "CANCELLED"].includes(row.status)} onChange={(event) => updateCycleStatus(row.id, event.target.value as CycleStatus)} className="min-h-10 border border-gray-300 bg-white px-3 text-sm"><option value="PLANNED">{labelStatus("PLANNED", sw)}</option><option value="PLANTED">{labelStatus("PLANTED", sw)}</option><option value="GROWING">{labelStatus("GROWING", sw)}</option><option value="HARVESTING">{labelStatus("HARVESTING", sw)}</option><option value="CLOSED">{labelStatus("CLOSED", sw)}</option><option value="CANCELLED">{labelStatus("CANCELLED", sw)}</option></select></div><div className="mt-4 grid gap-3 text-sm sm:grid-cols-5"><Metric label={sw ? "Tarajio" : "Expected"} value={row.expectedYield ? `${row.expectedYield} ${row.yieldUnit || ""}` : "-"} /><Metric label={sw ? "Mavuno" : "Harvested"} value={String(row.harvestedQuantity)} /><Metric label={sw ? "Stock iliyobaki" : "Remaining stock"} value={String(row.remainingQuantity)} /><Metric label={sw ? "Iliyuzwa" : "Sold"} value={String(row.soldQuantity)} /><Metric label={sw ? "Hasara" : "Wastage"} value={String(row.wasteQuantity)} /></div>{data.financialsVisible && <div className="mt-4 grid gap-3 border-t border-gray-100 pt-4 text-sm sm:grid-cols-4"><Metric label={sw ? "Gharama za pembejeo" : "Input costs"} value={formatTZS(row.inputCost || 0)} /><Metric label={sw ? `Gharama kwa ${row.plot.areaUnit === "HECTARE" ? "hecta" : row.plot.areaUnit === "SQUARE_METRE" ? "m2" : "ekari"}` : `Cost per ${row.plot.areaUnit === "HECTARE" ? "hectare" : row.plot.areaUnit === "SQUARE_METRE" ? "m2" : "acre"}`} value={row.costPerArea === null || row.costPerArea === undefined ? "-" : formatTZS(row.costPerArea)} /><Metric label={sw ? "Mapato yaliyopatikana" : "Realized revenue"} value={formatTZS(row.realizedRevenue || 0)} /><Metric label={sw ? "Faida iliyopatikana" : "Realized profit"} value={formatTZS(row.realizedProfit || 0)} /></div>}<div className="mt-4 flex flex-wrap gap-2">{row.outputs.map((output) => <span key={output.name} className="border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-900">{output.name}: {output.remainingQuantity}/{output.harvestedQuantity} {output.unit}</span>)}</div></article>)}</div>}</section>

    <section className="grid gap-5 lg:grid-cols-2"><RecentCard title={sw ? "Pembejeo za hivi karibuni" : "Recent inputs"} Icon={WalletCards}>{data?.recentInputs.length ? data.recentInputs.map((input) => <div key={input.id} className="flex items-start justify-between gap-3 border-b border-gray-100 py-3 last:border-0"><div><p className="font-semibold text-gray-950">{input.title}</p><p className="mt-1 text-xs text-gray-500">{labelInput(input.category, sw)} - {input.cropCycle.cropName}, {input.cropCycle.plot.name} - {formatDate(input.usedAt)}</p></div><div className="text-right text-sm font-semibold text-gray-950">{input.quantity ? `${input.quantity} ${input.product?.unit || ""}` : data?.financialsVisible ? formatTZS(input.totalCost || 0) : ""}</div></div>) : <Empty text={sw ? "Bado hakuna pembejeo." : "No inputs yet."} />}</RecentCard><RecentCard title={sw ? "Mavuno ya hivi karibuni" : "Recent harvests"} Icon={Wheat}>{data?.recentHarvests.length ? data.recentHarvests.map((harvest) => <div key={harvest.id} className="flex items-start justify-between gap-3 border-b border-gray-100 py-3 last:border-0"><div><p className="font-semibold text-gray-950">{harvest.cropCycle.cropName} - {harvest.outputProduct.name}</p><p className="mt-1 text-xs text-gray-500">{harvest.cropCycle.plot.name} - {formatDate(harvest.harvestAt)}{harvest.wasteQuantity ? ` - ${sw ? "hasara" : "waste"}: ${harvest.wasteQuantity}` : ""}</p></div><p className="text-sm font-bold text-gray-950">{harvest.actualYield} {harvest.outputProduct.unit}</p></div>) : <Empty text={sw ? "Bado hakuna mavuno." : "No harvests yet."} />}</RecentCard></section>

    <section className="border border-brand-200 bg-brand-50 p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-bold text-gray-950">{sw ? "Hatua inayofuata" : "What happens next"}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600">{sw ? "Mavuno yaliyoingizwa kwenye stock yanauzwa kawaida kupitia Mauzo. Mmiliki huona gharama na faida; wafanyakazi wenye ruhusa ya shamba wanaweza kurekodi shughuli bila kuona fedha." : "Harvest stock is sold normally in Sales. Owners see costs and profit; staff with farm access can record field work without seeing finances."}</p></div><Link href="/sales" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white">{sw ? "Fungua Mauzo" : "Open Sales"}<ArrowRight className="h-4 w-4" /></Link></div></section>
  </main></AppShell>;
}

function TextField({ label, value, onChange, type = "text", placeholder, required, list }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; required?: boolean; list?: string; }) { return <label className="grid gap-1 text-sm font-medium text-gray-700"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} type={type} placeholder={placeholder} required={required} list={list} className="min-h-11 border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" /></label>; }
function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode; }) { return <label className="grid gap-1 text-sm font-medium text-gray-700"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">{children}</select></label>; }
function ProductSelect({ label, products, value, onChange, emptyLabel }: { label: string; products: Product[]; value: string; onChange: (value: string) => void; emptyLabel: string; }) { return <SelectField label={label} value={value} onChange={onChange}><option value="">{emptyLabel}</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.currentStock} {product.unit})</option>)}</SelectField>; }
function Metric({ label, value }: { label: string; value: string; }) { return <div><p className="text-xs text-gray-500">{label}</p><p className="mt-1 font-bold text-gray-950">{value}</p></div>; }
function Empty({ text }: { text: string; }) { return <p className="py-3 text-sm text-gray-500">{text}</p>; }
function RecentCard({ title, Icon, children }: { title: string; Icon: typeof Wheat; children: React.ReactNode; }) { return <section className="border border-gray-200 bg-white p-5"><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-brand-700" /><h2 className="font-bold text-gray-950">{title}</h2></div><div className="mt-3">{children}</div></section>; }
