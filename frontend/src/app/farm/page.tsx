"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Bird, Boxes, ChevronLeft, ChevronRight, ClipboardList, Egg, LoaderCircle, Milk, PackageOpen, Plus, Search, Tractor, Trash2, Users, Wheat, type LucideIcon } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { api, formatTZS } from "@/lib/api";
import { useLang, type Lang } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";

type ProfileType = "LAYERS" | "BROILERS" | "DAIRY" | "BEEF" | "GOATS_SHEEP" | "PIGS" | "MIXED";
type ProductionType = "EGGS" | "MILK" | "HARVEST" | "OTHER";

interface Product { id: string; name: string; unit: string; currentStock: number; buyingPrice?: number | null; }
interface Group { id: string; name: string; profileType: ProfileType; currentAnimals: number; isActive: boolean; note?: string | null; }
interface Profile { id: string; type: ProfileType; isActive: boolean; }
interface Batch {
  id: string; type: ProductionType; expectedYield: number; actualYield: number; wasteQuantity: number; ingredientCost: number | null; additionalCost: number | null; totalCost: number | null; unitCost: number | null; producedAt: string;
  group: { id: string; name: string; profileType: ProfileType };
  outputProduct: { id: string; name: string; unit: string };
  items: Array<{ id: string; quantity: number; unitCost: number | null; totalCost: number | null; product: { id: string; name: string; unit: string } }>;
}
interface Conversion { id: string; inputQuantity: number; outputQuantity: number; totalCost: number | null; unitCost: number | null; convertedAt: string; inputProduct: { id: string; name: string; unit: string }; outputProduct: { id: string; name: string; unit: string }; }
interface FarmData {
  profiles: Profile[]; groups: Group[]; batches: Batch[]; conversions: Conversion[];
  pagination: { page: number; totalPages: number; total: number };
  summary: { activeGroups: number; animals: number; productionCount: number; outputQuantity: number; wasteQuantity: number; lossAnimals: number; productionCost?: number };
}

const PROFILES: Array<{ value: ProfileType; sw: string; en: string; hintSw: string; hintEn: string }> = [
  { value: "LAYERS", sw: "Kuku wa mayai", en: "Layers / eggs", hintSw: "Mayai, trays na hasara ya mayai", hintEn: "Eggs, trays, and egg loss" },
  { value: "BROILERS", sw: "Kuku wa nyama", en: "Broilers", hintSw: "Vifaranga, feed, vifo na mavuno", hintEn: "Chicks, feed, losses, and harvest" },
  { value: "DAIRY", sw: "Maziwa", en: "Dairy", hintSw: "Ng'ombe au mbuzi wa maziwa", hintEn: "Dairy cattle or goats" },
  { value: "BEEF", sw: "Ng'ombe wa nyama", en: "Beef cattle", hintSw: "Makundi ya kufuga na kuuza", hintEn: "Rearing and sale groups" },
  { value: "GOATS_SHEEP", sw: "Mbuzi na kondoo", en: "Goats and sheep", hintSw: "Zizi, feed, vifo na mauzo", hintEn: "Pens, feed, losses, and sales" },
  { value: "PIGS", sw: "Nguruwe", en: "Pigs", hintSw: "Banda, feed, vifo na mavuno", hintEn: "Pens, feed, losses, and harvest" },
  { value: "MIXED", sw: "Mifugo mchanganyiko", en: "Mixed livestock", hintSw: "Zaidi ya aina moja ya ufugaji", hintEn: "More than one farm activity" },
];

const PAYMENT_METHODS = ["CASH", "MPESA", "TIGOPESA", "AIRTEL_MONEY", "HALOPESA", "BANK"];
function today() { return new Date().toISOString().slice(0, 10); }
function profileLabel(type: ProfileType, lang: Lang) { const profile = PROFILES.find((item) => item.value === type); return profile ? profile[lang] : type; }
function paymentLabel(value: string, lang: Lang) { return ({ CASH: lang === "sw" ? "Taslimu" : "Cash", MPESA: "M-Pesa", TIGOPESA: "Tigo Pesa", AIRTEL_MONEY: "Airtel Money", HALOPESA: "HaloPesa", BANK: lang === "sw" ? "Benki" : "Bank" } as Record<string, string>)[value] || value; }

export default function FarmPage() {
  const lang = useLang();
  const { toast } = useToast();
  const [data, setData] = useState<FarmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedProfiles, setSelectedProfiles] = useState<ProfileType[]>([]);
  const [groupForm, setGroupForm] = useState({ name: "", profileType: "LAYERS" as ProfileType, currentAnimals: "", note: "" });
  const [eventForm, setEventForm] = useState({ groupId: "", type: "MORTALITY", quantity: "", occurredAt: today(), note: "" });
  const [productionForm, setProductionForm] = useState({ groupId: "", type: "EGGS" as ProductionType, outputProduct: null as Product | null, expectedYield: "", actualYield: "", additionalCost: "0", paymentMethod: "CASH", producedAt: today(), note: "", additionalCostNote: "" });
  const [supplyLines, setSupplyLines] = useState<Array<{ product: Product; quantity: string }>>([]);
  const [packForm, setPackForm] = useState({ inputProduct: null as Product | null, outputProduct: null as Product | null, inputQuantity: "30", outputQuantity: "1", convertedAt: today(), note: "" });

  async function load(nextPage = page) {
    setLoading(true);
    try {
      const result = await api.get<FarmData>(`/farm?page=${nextPage}&limit=12`, lang);
      setData(result);
      setSelectedProfiles(result.profiles.filter((profile) => profile.isActive).map((profile) => profile.type));
      setProductionForm((current) => ({ ...current, groupId: current.groupId || result.groups.find((group) => group.isActive)?.id || "" }));
      setEventForm((current) => ({ ...current, groupId: current.groupId || result.groups.find((group) => group.isActive)?.id || "" }));
    } catch (error) {
      toast(error instanceof Error ? error.message : (lang === "sw" ? "Imeshindikana kufungua ufugaji." : "Could not load farm operations."), "error");
    } finally { setLoading(false); }
  }

  useEffect(() => { load(1); }, []);

  const activeGroups = data?.groups.filter((group) => group.isActive) || [];
  const activeProfileSet = useMemo(() => new Set(selectedProfiles), [selectedProfiles]);

  async function saveProfiles() {
    if (!selectedProfiles.length) { toast(lang === "sw" ? "Chagua angalau aina moja ya ufugaji." : "Choose at least one farm profile.", "error"); return; }
    setSaving(true);
    try {
      await api.post("/farm/profiles", { types: selectedProfiles }, lang);
      toast(lang === "sw" ? "Aina za ufugaji zimehifadhiwa." : "Farm profiles saved.", "success");
      await load(1);
    } catch (error) { toast(error instanceof Error ? error.message : "Could not save profiles", "error"); } finally { setSaving(false); }
  }

  async function addGroup(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post("/farm/groups", { ...groupForm, currentAnimals: Number(groupForm.currentAnimals || 0), note: groupForm.note.trim() || undefined }, lang);
      setGroupForm({ name: "", profileType: selectedProfiles[0] || "LAYERS", currentAnimals: "", note: "" });
      toast(lang === "sw" ? "Kundi la ufugaji limeongezwa." : "Farm group added.", "success");
      await load(1);
    } catch (error) { toast(error instanceof Error ? error.message : "Could not add farm group", "error"); } finally { setSaving(false); }
  }

  async function addEvent(event: FormEvent) {
    event.preventDefault();
    if (!eventForm.groupId) return;
    setSaving(true);
    try {
      await api.post(`/farm/groups/${eventForm.groupId}/events`, { ...eventForm, quantity: Number(eventForm.quantity), note: eventForm.note.trim() || undefined }, lang);
      setEventForm((current) => ({ ...current, quantity: "", note: "", occurredAt: today() }));
      toast(lang === "sw" ? "Tukio la mifugo limehifadhiwa." : "Animal event saved.", "success");
      await load(1);
    } catch (error) { toast(error instanceof Error ? error.message : "Could not save animal event", "error"); } finally { setSaving(false); }
  }

  async function saveProduction(event: FormEvent) {
    event.preventDefault();
    if (!productionForm.outputProduct || !productionForm.groupId) { toast(lang === "sw" ? "Chagua kundi na bidhaa inayotoka." : "Choose a group and output product.", "error"); return; }
    setSaving(true);
    try {
      const result = await api.post<{ batch: Batch }>("/farm/production", {
        groupId: productionForm.groupId, type: productionForm.type, outputProductId: productionForm.outputProduct.id,
        expectedYield: Number(productionForm.expectedYield), actualYield: Number(productionForm.actualYield), additionalCost: Number(productionForm.additionalCost || 0),
        paymentMethod: productionForm.paymentMethod, producedAt: productionForm.producedAt, note: productionForm.note.trim() || undefined, additionalCostNote: productionForm.additionalCostNote.trim() || undefined,
        items: supplyLines.map((line) => ({ productId: line.product.id, quantity: Number(line.quantity) })),
      }, lang);
      const cost = typeof result.batch.unitCost === "number" ? ` ${lang === "sw" ? `Gharama ni ${formatTZS(result.batch.unitCost)} kwa ${result.batch.outputProduct.unit}.` : `Cost is ${formatTZS(result.batch.unitCost)} per ${result.batch.outputProduct.unit}.`}` : "";
      toast((lang === "sw" ? "Uzalishaji umehifadhiwa." : "Production saved.") + cost, "success");
      setProductionForm((current) => ({ ...current, outputProduct: null, expectedYield: "", actualYield: "", additionalCost: "0", producedAt: today(), note: "", additionalCostNote: "" }));
      setSupplyLines([]);
      await load(1);
    } catch (error) { toast(error instanceof Error ? error.message : "Could not save production", "error"); } finally { setSaving(false); }
  }

  async function packOutput(event: FormEvent) {
    event.preventDefault();
    if (!packForm.inputProduct || !packForm.outputProduct) { toast(lang === "sw" ? "Chagua stock ya kuingiza na bidhaa ya kifurushi." : "Choose the base stock and packed product.", "error"); return; }
    setSaving(true);
    try {
      await api.post("/farm/pack", { inputProductId: packForm.inputProduct.id, outputProductId: packForm.outputProduct.id, inputQuantity: Number(packForm.inputQuantity), outputQuantity: Number(packForm.outputQuantity), convertedAt: packForm.convertedAt, note: packForm.note.trim() || undefined }, lang);
      toast(lang === "sw" ? "Kifurushi kimeongezwa kwenye stock." : "Packed stock added.", "success");
      setPackForm({ inputProduct: null, outputProduct: null, inputQuantity: "30", outputQuantity: "1", convertedAt: today(), note: "" });
      await load(1);
    } catch (error) { toast(error instanceof Error ? error.message : "Could not pack output", "error"); } finally { setSaving(false); }
  }

  function addSupply(product: Product) {
    setSupplyLines((current) => current.some((line) => line.product.id === product.id) ? current : [...current, { product, quantity: "1" }]);
  }

  if (loading && !data) return <AppShell><div className="flex h-64 items-center justify-center"><LoaderCircle className="h-6 w-6 animate-spin text-brand-700" /></div></AppShell>;

  return <AppShell><main className="mx-auto max-w-6xl space-y-6 pb-24 lg:pb-8">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-bold text-gray-950">{lang === "sw" ? "Ufugaji" : "Farm Operations"}</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600">{lang === "sw" ? "Rekodi makundi ya mifugo, supplies zilizotumika, uzalishaji, hasara na stock ya kuuza." : "Record animal groups, supplies used, production, loss, and sellable stock."}</p></div><a href="/help" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-brand-300 bg-white px-3 py-2 text-sm font-semibold text-brand-800"><Tractor className="h-4 w-4" />{lang === "sw" ? "Soma mwongozo" : "Read guide"}</a></header>

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{([
      { label: lang === "sw" ? "Makundi hai" : "Active groups", value: data?.summary.activeGroups || 0, Icon: Users },
      { label: lang === "sw" ? "Wanyama waliopo" : "Animals now", value: data?.summary.animals || 0, Icon: Bird },
      { label: lang === "sw" ? "Output siku 30" : "30-day output", value: data?.summary.outputQuantity || 0, Icon: Egg },
      { label: lang === "sw" ? "Hasara ya output" : "Output loss", value: data?.summary.wasteQuantity || 0, Icon: PackageOpen },
      { label: lang === "sw" ? "Vifo/cull siku 30" : "30-day deaths/culls", value: data?.summary.lossAnimals || 0, Icon: ClipboardList },
    ] satisfies Array<{ label: string; value: number; Icon: LucideIcon }>).map(({ label, value, Icon }) => <div key={label} className="border border-gray-200 bg-white p-4"><Icon className="h-4 w-4 text-brand-700" /><p className="mt-3 text-xs text-gray-500">{label}</p><p className="mt-1 text-lg font-bold text-gray-950">{value}</p></div>)}</section>

    <section className="border border-brand-200 bg-brand-50 p-5"><div className="flex items-start gap-3"><Tractor className="mt-0.5 h-5 w-5 text-brand-800" /><div><h2 className="font-bold text-gray-950">{lang === "sw" ? "Aina za ufugaji" : "Farm profiles"}</h2><p className="mt-1 text-sm leading-6 text-gray-600">{lang === "sw" ? "Chagua shughuli ambazo shamba lako linafanya. Unaweza kuchagua zaidi ya moja." : "Choose the activities your farm runs. You can choose more than one."}</p></div></div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{PROFILES.map((profile) => <label key={profile.value} className={`flex cursor-pointer items-start gap-3 border p-3 text-sm ${activeProfileSet.has(profile.value) ? "border-brand-400 bg-white" : "border-brand-100 bg-brand-50"}`}><input type="checkbox" checked={activeProfileSet.has(profile.value)} onChange={(event) => setSelectedProfiles((current) => event.target.checked ? [...current, profile.value] : current.filter((type) => type !== profile.value))} className="mt-0.5" /><span><strong className="block text-gray-950">{profile[lang]}</strong><span className="mt-1 block text-xs leading-5 text-gray-600">{lang === "sw" ? profile.hintSw : profile.hintEn}</span></span></label>)}</div><button type="button" disabled={saving} onClick={saveProfiles} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><Tractor className="h-4 w-4" />{lang === "sw" ? "Hifadhi aina" : "Save profiles"}</button></section>

    {selectedProfiles.includes("DAIRY") && <section className="border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950"><Milk className="mr-2 inline h-4 w-4" /><strong>{lang === "sw" ? "Maziwa:" : "Dairy:"}</strong> {lang === "sw" ? "Kwa sasa tumia millilitre (ml) kama stock ya msingi; 1,000 ml ni litre 1. Unaweza kupakia ml kuwa chupa ya litre 1 kwa sehemu ya Kifurushi." : "Use millilitres (ml) as the base stock for now; 1,000 ml equals one litre. You can pack ml into a one-litre bottle below."}</section>}

    <section className="grid gap-5 lg:grid-cols-2"><form onSubmit={addGroup} className="border border-gray-200 bg-white p-5"><h2 className="font-bold text-gray-950">{lang === "sw" ? "Ongeza kundi la ufugaji" : "Add a farm group"}</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label={lang === "sw" ? "Jina la kundi" : "Group name"} value={groupForm.name} onChange={(value) => setGroupForm({ ...groupForm, name: value })} placeholder={lang === "sw" ? "Mfano: Banda A - Layers" : "For example: Layer house A"} required /><SelectField label={lang === "sw" ? "Aina" : "Profile"} value={groupForm.profileType} onChange={(value) => setGroupForm({ ...groupForm, profileType: value as ProfileType })}>{selectedProfiles.map((type) => <option key={type} value={type}>{profileLabel(type, lang)}</option>)}</SelectField><Field label={lang === "sw" ? "Idadi ya kuanzia" : "Opening animals"} value={groupForm.currentAnimals} onChange={(value) => setGroupForm({ ...groupForm, currentAnimals: value })} type="number" placeholder="100" /><Field label={lang === "sw" ? "Dokezo (hiari)" : "Note (optional)"} value={groupForm.note} onChange={(value) => setGroupForm({ ...groupForm, note: value })} /></div><button disabled={saving || !selectedProfiles.length} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><Plus className="h-4 w-4" />{lang === "sw" ? "Ongeza kundi" : "Add group"}</button></form>
      <form onSubmit={addEvent} className="border border-gray-200 bg-white p-5"><h2 className="font-bold text-gray-950">{lang === "sw" ? "Rekodi mabadiliko ya mifugo" : "Record animal change"}</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><SelectField label={lang === "sw" ? "Kundi" : "Group"} value={eventForm.groupId} onChange={(value) => setEventForm({ ...eventForm, groupId: value })}><option value="">{lang === "sw" ? "Chagua kundi" : "Choose group"}</option>{activeGroups.map((group) => <option key={group.id} value={group.id}>{group.name} ({group.currentAnimals})</option>)}</SelectField><SelectField label={lang === "sw" ? "Tukio" : "Event"} value={eventForm.type} onChange={(value) => setEventForm({ ...eventForm, type: value })}><option value="ADDITION">{lang === "sw" ? "Ongezeko" : "Addition"}</option><option value="MORTALITY">{lang === "sw" ? "Vifo" : "Mortality"}</option><option value="CULL">{lang === "sw" ? "Kuondoa/kuchuja" : "Cull / remove"}</option></SelectField><Field label={lang === "sw" ? "Idadi" : "Quantity"} value={eventForm.quantity} onChange={(value) => setEventForm({ ...eventForm, quantity: value })} type="number" required /><Field label={lang === "sw" ? "Tarehe" : "Date"} value={eventForm.occurredAt} onChange={(value) => setEventForm({ ...eventForm, occurredAt: value })} type="date" required /><div className="sm:col-span-2"><Field label={lang === "sw" ? "Maelezo (hiari)" : "Note (optional)"} value={eventForm.note} onChange={(value) => setEventForm({ ...eventForm, note: value })} /></div></div><button disabled={saving || !activeGroups.length} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-brand-300 bg-white px-4 py-2 text-sm font-semibold text-brand-800 disabled:opacity-60"><ClipboardList className="h-4 w-4" />{lang === "sw" ? "Hifadhi tukio" : "Save event"}</button></form>
    </section>

    <section className="border border-gray-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold text-gray-950">{lang === "sw" ? "Rekodi uzalishaji" : "Record production"}</h2><p className="mt-1 text-sm leading-6 text-gray-600">{lang === "sw" ? "Supplies hupunguzwa baada ya kuhifadhi; output inaongezwa kwenye stock ya kuuza." : "Supplies reduce only when saved; output is added to sellable stock."}</p></div><Wheat className="h-5 w-5 text-brand-700" /></div><form onSubmit={saveProduction}><div className="mt-4 grid gap-3 md:grid-cols-3"><SelectField label={lang === "sw" ? "Kundi" : "Group"} value={productionForm.groupId} onChange={(value) => setProductionForm({ ...productionForm, groupId: value })}><option value="">{lang === "sw" ? "Chagua kundi" : "Choose group"}</option>{activeGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</SelectField><SelectField label={lang === "sw" ? "Aina ya output" : "Output type"} value={productionForm.type} onChange={(value) => setProductionForm({ ...productionForm, type: value as ProductionType })}><option value="EGGS">{lang === "sw" ? "Mayai" : "Eggs"}</option><option value="MILK">{lang === "sw" ? "Maziwa" : "Milk"}</option><option value="HARVEST">{lang === "sw" ? "Mavuno" : "Harvest"}</option><option value="OTHER">{lang === "sw" ? "Nyingine" : "Other"}</option></SelectField><ProductPicker label={lang === "sw" ? "Bidhaa inayoongezeka kwenye stock" : "Output product added to stock"} selected={productionForm.outputProduct} onSelect={(product) => setProductionForm({ ...productionForm, outputProduct: product })} onClear={() => setProductionForm({ ...productionForm, outputProduct: null })} lang={lang} excludeIds={supplyLines.map((line) => line.product.id)} /><Field label={lang === "sw" ? "Output iliyotarajiwa" : "Expected output"} value={productionForm.expectedYield} onChange={(value) => setProductionForm({ ...productionForm, expectedYield: value })} type="number" required /><Field label={lang === "sw" ? "Output halisi" : "Actual output"} value={productionForm.actualYield} onChange={(value) => setProductionForm({ ...productionForm, actualYield: value })} type="number" required /><Field label={lang === "sw" ? "Tarehe" : "Date"} value={productionForm.producedAt} onChange={(value) => setProductionForm({ ...productionForm, producedAt: value })} type="date" required /></div><div className="mt-5 border-t border-gray-100 pt-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-gray-950">{lang === "sw" ? "Feed na supplies zilizotumika" : "Feed and supplies used"}</h3><p className="mt-1 text-xs text-gray-500">{lang === "sw" ? "Pokea feed/medicine kwanza kupitia Pokea Bidhaa; hapa unaandika kilichotumika." : "Receive feed or medicine first through Receive Stock; record only what was used here."}</p></div><div className="w-full sm:max-w-sm"><ProductPicker compact label={lang === "sw" ? "Ongeza supply" : "Add supply"} selected={null} onSelect={addSupply} lang={lang} excludeIds={[productionForm.outputProduct?.id || "", ...supplyLines.map((line) => line.product.id)]} /></div></div>{supplyLines.length ? <div className="mt-3 space-y-2">{supplyLines.map((line) => <div key={line.product.id} className="grid gap-2 border border-gray-100 bg-gray-50 p-3 sm:grid-cols-[1fr_130px_42px] sm:items-end"><div><p className="font-semibold text-gray-950">{line.product.name}</p><p className="text-xs text-gray-500">{lang === "sw" ? "Iliyopo" : "Available"}: {line.product.currentStock} {line.product.unit}</p></div><Field label={lang === "sw" ? "Iliyotumika" : "Used"} value={line.quantity} onChange={(value) => setSupplyLines((current) => current.map((item) => item.product.id === line.product.id ? { ...item, quantity: value } : item))} type="number" /><button type="button" onClick={() => setSupplyLines((current) => current.filter((item) => item.product.id !== line.product.id))} className="flex h-10 w-10 items-center justify-center border border-red-200 bg-white text-red-600" aria-label={lang === "sw" ? "Ondoa supply" : "Remove supply"}><Trash2 className="h-4 w-4" /></button></div>)}</div> : <p className="mt-3 border border-dashed border-gray-300 p-4 text-sm text-gray-500">{lang === "sw" ? "Ongeza feed, dawa, packaging au supply nyingine iliyotumika." : "Add feed, medicine, packaging, or another supply used."}</p>}</div><div className="mt-5 grid gap-3 border-t border-gray-100 pt-4 md:grid-cols-3"><Field label={lang === "sw" ? "Gharama ya moja kwa moja (TZS)" : "Direct cost (TZS)"} value={productionForm.additionalCost} onChange={(value) => setProductionForm({ ...productionForm, additionalCost: value })} type="number" /><SelectField label={lang === "sw" ? "Njia ya malipo" : "Payment method"} value={productionForm.paymentMethod} onChange={(value) => setProductionForm({ ...productionForm, paymentMethod: value })}>{PAYMENT_METHODS.map((method) => <option key={method} value={method}>{paymentLabel(method, lang)}</option>)}</SelectField><Field label={lang === "sw" ? "Maelezo ya gharama (hiari)" : "Cost note (optional)"} value={productionForm.additionalCostNote} onChange={(value) => setProductionForm({ ...productionForm, additionalCostNote: value })} placeholder={lang === "sw" ? "Labour, maji..." : "Labour, water..."} /></div>{productionForm.paymentMethod === "CASH" && Number(productionForm.additionalCost) > 0 && <p className="mt-3 text-xs leading-5 text-brand-800">{lang === "sw" ? "Gharama hii itaonekana mara moja kwenye Daily Close. Usiirekodi tena kwenye Matumizi." : "This cash cost appears once in Daily Close. Do not record it again as an Expense."}</p>}<div className="mt-4"><Field label={lang === "sw" ? "Dokezo la batch (hiari)" : "Batch note (optional)"} value={productionForm.note} onChange={(value) => setProductionForm({ ...productionForm, note: value })} /></div><button disabled={saving || !activeGroups.length} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><Wheat className="h-4 w-4" />{lang === "sw" ? "Hifadhi uzalishaji" : "Save production"}</button></form></section>

    <section className="border border-gray-200 bg-white p-5"><div><h2 className="font-bold text-gray-950">{lang === "sw" ? "Tengeneza kifurushi" : "Pack farm output"}</h2><p className="mt-1 text-sm leading-6 text-gray-600">{lang === "sw" ? "Mfano: toa mayai 30 moja moja, ongeza tray 1. Gharama inahamia kwenye tray bila kununua stock tena." : "Example: take out 30 individual eggs and add one tray. Cost moves to the tray without buying stock again."}</p></div><form onSubmit={packOutput} className="mt-4 grid gap-3 md:grid-cols-3"><ProductPicker label={lang === "sw" ? "Stock ya msingi" : "Base stock"} selected={packForm.inputProduct} onSelect={(product) => setPackForm({ ...packForm, inputProduct: product })} onClear={() => setPackForm({ ...packForm, inputProduct: null })} lang={lang} excludeIds={packForm.outputProduct ? [packForm.outputProduct.id] : []} /><ProductPicker label={lang === "sw" ? "Bidhaa ya kifurushi" : "Packed product"} selected={packForm.outputProduct} onSelect={(product) => setPackForm({ ...packForm, outputProduct: product })} onClear={() => setPackForm({ ...packForm, outputProduct: null })} lang={lang} excludeIds={packForm.inputProduct ? [packForm.inputProduct.id] : []} /><Field label={lang === "sw" ? "Tarehe" : "Date"} value={packForm.convertedAt} onChange={(value) => setPackForm({ ...packForm, convertedAt: value })} type="date" required /><Field label={lang === "sw" ? "Idadi ya msingi" : "Base quantity"} value={packForm.inputQuantity} onChange={(value) => setPackForm({ ...packForm, inputQuantity: value })} type="number" required /><Field label={lang === "sw" ? "Idadi ya vifurushi" : "Packed quantity"} value={packForm.outputQuantity} onChange={(value) => setPackForm({ ...packForm, outputQuantity: value })} type="number" required /><Field label={lang === "sw" ? "Dokezo (hiari)" : "Note (optional)"} value={packForm.note} onChange={(value) => setPackForm({ ...packForm, note: value })} /><div className="md:col-span-3"><button disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-brand-300 bg-white px-4 py-2 text-sm font-semibold text-brand-800 disabled:opacity-60"><Boxes className="h-4 w-4" />{lang === "sw" ? "Hifadhi kifurushi" : "Save pack"}</button></div></form></section>

    <section><div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="font-bold text-gray-950">{lang === "sw" ? "Historia ya uzalishaji" : "Production history"}</h2><p className="mt-1 text-xs text-gray-500">{data?.pagination.total || 0} {lang === "sw" ? "batch" : "batches"}</p></div></div><div className="space-y-2">{data?.batches.length ? data.batches.map((batch) => <details key={batch.id} className="border border-gray-200 bg-white p-4"><summary className="cursor-pointer list-none"><div className="flex flex-wrap items-center justify-between gap-3 pr-5"><div><p className="font-semibold text-gray-950">{batch.outputProduct.name}</p><p className="mt-1 text-xs text-gray-500">{batch.group.name} · {new Date(batch.producedAt).toLocaleDateString(lang === "sw" ? "sw-TZ" : "en-TZ")} · {batch.actualYield} {batch.outputProduct.unit}{batch.wasteQuantity ? ` · ${lang === "sw" ? "hasara" : "loss"}: ${batch.wasteQuantity}` : ""}</p></div>{typeof batch.unitCost === "number" && <p className="font-bold text-brand-800">{formatTZS(batch.unitCost)} / {batch.outputProduct.unit}</p>}</div></summary><div className="mt-3 border-t border-gray-100 pt-3 text-sm">{typeof batch.totalCost === "number" && <p className="mb-2 text-xs text-gray-500">{lang === "sw" ? "Gharama yote" : "Total cost"}: {formatTZS(batch.totalCost)}</p>}{batch.items.map((item) => <div key={item.id} className="flex justify-between gap-3 border-b border-gray-100 py-2 last:border-0"><span>{item.product.name} × {item.quantity} {item.product.unit}</span>{typeof item.totalCost === "number" && <strong>{formatTZS(item.totalCost)}</strong>}</div>)}</div></details>) : <div className="border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">{lang === "sw" ? "Hakuna uzalishaji bado." : "No production batches yet."}</div>}</div>{data && data.pagination.totalPages > 1 && <div className="mt-4 flex items-center justify-between"><p className="text-sm text-gray-500">{data.pagination.page} / {data.pagination.totalPages}</p><div className="flex gap-2"><button type="button" disabled={loading || data.pagination.page <= 1} onClick={() => { const next = page - 1; setPage(next); load(next); }} className="flex h-9 w-9 items-center justify-center border border-gray-300 text-gray-700 disabled:opacity-40" aria-label="Previous"><ChevronLeft className="h-4 w-4" /></button><button type="button" disabled={loading || data.pagination.page >= data.pagination.totalPages} onClick={() => { const next = page + 1; setPage(next); load(next); }} className="flex h-9 w-9 items-center justify-center border border-gray-300 text-gray-700 disabled:opacity-40" aria-label="Next"><ChevronRight className="h-4 w-4" /></button></div></div>}</section>
    {data?.conversions.length ? (
      <section>
        <h2 className="mb-3 font-bold text-gray-950">{lang === "sw" ? "Vifurushi vya karibuni" : "Recent packing"}</h2>
        <div className="space-y-2">
          {data.conversions.map((conversion) => (
            <div key={conversion.id} className="flex flex-wrap items-center justify-between gap-3 border border-gray-200 bg-white p-4">
              <div>
                <p className="font-semibold text-gray-950">{conversion.inputProduct.name} {conversion.inputQuantity} {conversion.inputProduct.unit} → {conversion.outputProduct.name} {conversion.outputQuantity} {conversion.outputProduct.unit}</p>
                <p className="mt-1 text-xs text-gray-500">{new Date(conversion.convertedAt).toLocaleDateString(lang === "sw" ? "sw-TZ" : "en-TZ")}</p>
              </div>
              {typeof conversion.unitCost === "number" && <p className="font-bold text-brand-800">{formatTZS(conversion.unitCost)} / {conversion.outputProduct.unit}</p>}
            </div>
          ))}
        </div>
      </section>
    ) : null}
  </main></AppShell>;
}

function Field({ label, value, onChange, type = "text", placeholder, required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; required?: boolean }) {
  return <label className="grid gap-1 text-sm font-medium text-gray-700"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "1" : undefined} inputMode={type === "number" ? "numeric" : undefined} placeholder={placeholder} required={required} className="min-h-11 border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" /></label>;
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <label className="grid gap-1 text-sm font-medium text-gray-700"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">{children}</select></label>;
}

function ProductPicker({ label, selected, onSelect, onClear, lang, excludeIds, compact = false }: { label: string; selected: Product | null; onSelect: (product: Product) => void; onClear?: () => void; lang: Lang; excludeIds: string[]; compact?: boolean }) {
  const [query, setQuery] = useState(""); const [results, setResults] = useState<Product[]>([]); const [searching, setSearching] = useState(false); const [open, setOpen] = useState(false);
  const excludedKey = excludeIds.filter(Boolean).sort().join("|");
  useEffect(() => { const term = query.trim(); if (term.length < 2) { setResults([]); return undefined; } let cancelled = false; const timer = window.setTimeout(async () => { setSearching(true); try { const data = await api.get<{ products: Product[] }>(`/products?search=${encodeURIComponent(term)}&limit=20`, lang); if (!cancelled) setResults(data.products.filter((product) => !excludeIds.includes(product.id))); } catch { if (!cancelled) setResults([]); } finally { if (!cancelled) setSearching(false); } }, 250); return () => { cancelled = true; window.clearTimeout(timer); }; }, [excludedKey, lang, query]);
  return <label className="relative grid gap-1 text-sm font-medium text-gray-700"><span>{label}</span>{selected ? <div className="flex min-h-11 items-center justify-between gap-2 border border-brand-200 bg-brand-50 px-3 text-sm"><span className="truncate"><strong>{selected.name}</strong> <span className="text-xs">({selected.currentStock} {selected.unit})</span></span>{onClear && <button type="button" onClick={onClear} className="h-7 w-7 border border-brand-200 bg-white text-brand-800" aria-label={lang === "sw" ? "Ondoa bidhaa" : "Clear product"}>×</button>}</div> : <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onBlur={() => window.setTimeout(() => setOpen(false), 150)} autoComplete="off" placeholder={lang === "sw" ? "Tafuta bidhaa" : "Search products"} className={`min-h-11 w-full border border-gray-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${compact ? "" : ""}`} />{open && <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto border border-gray-200 bg-white p-1 shadow-lg">{query.trim().length < 2 ? <p className="px-3 py-2 text-xs font-normal text-gray-500">{lang === "sw" ? "Andika angalau herufi 2." : "Type at least 2 letters."}</p> : searching ? <p className="px-3 py-2 text-xs font-normal text-gray-500">{lang === "sw" ? "Inatafuta..." : "Searching..."}</p> : results.length ? results.map((product) => <button key={product.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelect(product); setQuery(""); setOpen(false); }} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-brand-50"><span className="truncate font-semibold text-gray-950">{product.name}</span><span className="shrink-0 text-xs font-normal text-gray-500">{product.currentStock} {product.unit}</span></button>) : <p className="px-3 py-2 text-xs font-normal text-gray-500">{lang === "sw" ? "Hakuna bidhaa." : "No products found."}</p>}</div>}</div>}</label>;
}
