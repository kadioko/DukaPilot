"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileDown, Printer, Save, Search, Settings2, Trash2, Wifi } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { LabelPreview } from "./LabelRenderer";
import { downloadLabelPdf, openLabelPrint } from "./labelPrint";
import { defaultLabelTemplate, fieldsForLayout, labelFields, type LabelField, type LabelLayout, type LabelProduct, type LabelTemplate, type PrinterConnection, type PrinterDriver, type PrinterProfile } from "./types";

type LabelData = { templates: LabelTemplate[]; profiles: PrinterProfile[]; jobs: Array<{ id: string; outputDriver: PrinterDriver; status: string; createdAt: string; template?: { name: string } | null; printerProfile?: { name: string } | null }> };
type Prepared = { job: { id: string }; output: { content: string; encoding: string; filename: string; contentType: string } | null };

const layouts: Array<{ value: LabelLayout; en: string; sw: string }> = [
  { value: "NAME_PRICE_BARCODE", en: "Name, price & barcode", sw: "Jina, bei na barcode" },
  { value: "NAME_BARCODE", en: "Name & barcode", sw: "Jina na barcode" },
  { value: "NAME_PRICE", en: "Name & price", sw: "Jina na bei" },
  { value: "BARCODE_ONLY", en: "Barcode only", sw: "Barcode pekee" },
  { value: "CUSTOM", en: "Custom fields", sw: "Chagua taarifa" },
];
const fieldLabels: Record<LabelField, [string, string]> = {
  name: ["Product name", "Jina la bidhaa"], price: ["Selling price", "Bei ya kuuza"], wholesalePrice: ["Wholesale price", "Bei ya jumla"],
  barcode: ["Preferred barcode", "Barcode kuu"], manufacturerBarcode: ["Manufacturer barcode", "Barcode ya mtengenezaji"], internalBarcode: ["DukaPilot barcode", "Barcode ya DukaPilot"],
  sku: ["SKU", "SKU"], unit: ["Unit", "Kipimo"], stock: ["Stock", "Stock"], customText: ["Custom text", "Maandishi maalum"],
};
const sizePresets = [{ name: "40 x 30 mm", widthMm: 40, heightMm: 30 }, { name: "48 x 30 mm", widthMm: 48, heightMm: 30 }, { name: "62 x 30 mm", widthMm: 62, heightMm: 30 }, { name: "80 x 40 mm", widthMm: 80, heightMm: 40 }];

function templateFrom(value: LabelTemplate): LabelTemplate {
  return { ...defaultLabelTemplate, ...value, fields: Array.isArray(value.fields) ? value.fields as LabelField[] : defaultLabelTemplate.fields };
}
function profileFrom(value: PrinterProfile): PrinterProfile {
  const legacy = value.transport === "PRINT_BRIDGE" ? "BRIDGE" : value.driver === "BROWSER" || value.driver === "PDF" ? "BROWSER" : "DOWNLOAD";
  return { ...value, driver: value.driver || "BROWSER", connection: value.connection || legacy, dpi: value.dpi || 203, config: value.config || {} };
}
function downloadRaw(content: string, encoding: string, filename: string, contentType: string) {
  const bytes = encoding === "base64" ? Uint8Array.from(window.atob(content), (character) => character.charCodeAt(0)) : undefined;
  const blob = new Blob([bytes || content], { type: contentType });
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}
function base64ToHex(value: string) {
  return Uint8Array.from(window.atob(value), (character) => character.charCodeAt(0)).reduce((hex, byte) => `${hex}${byte.toString(16).padStart(2, "0")}`, "");
}
function validBridgeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname) ? `${url.protocol}//${url.host}` : null;
  } catch { return null; }
}

export function LabelComposer({ products, initialProductIds = [], compact = false }: { products: LabelProduct[]; initialProductIds?: string[]; compact?: boolean }) {
  const lang = useLang();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Record<string, number>>(() => Object.fromEntries(initialProductIds.map((id) => [id, 1])));
  const [template, setTemplate] = useState<LabelTemplate>(defaultLabelTemplate);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [profiles, setProfiles] = useState<PrinterProfile[]>([]);
  const [jobs, setJobs] = useState<LabelData["jobs"]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [profileDraft, setProfileDraft] = useState<PrinterProfile>({ name: "", driver: "BROWSER", widthMm: 40, heightMm: 30, dpi: 203, connection: "BROWSER", config: {} });
  const [productSearch, setProductSearch] = useState("");
  const [bridgeToken, setBridgeToken] = useState("");
  const [bridgeStatus, setBridgeStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const selectedProducts = useMemo(() => products.flatMap((product) => Array.from({ length: Math.min(100, Math.max(0, selected[product.id] || 0)) }, () => product)), [products, selected]);
  const visibleProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    return term ? products.filter((product) => [product.name, product.labelName, product.sku, product.barcode, product.manufacturerBarcode, product.internalBarcode].some((value) => value?.toLowerCase().includes(term))) : products;
  }, [products, productSearch]);
  const barcodeFields = template.fields.filter((field) => ["barcode", "manufacturerBarcode", "internalBarcode"].includes(field));
  const missingBarcode = barcodeFields.some((field) => selectedProducts.some((product) => field === "manufacturerBarcode" ? !product.manufacturerBarcode : field === "internalBarcode" ? !product.internalBarcode : !(product.internalBarcode || product.barcode || product.manufacturerBarcode)));
  const activeProfile = profiles.find((profile) => profile.id === selectedProfileId) || null;
  const rawDriver = activeProfile && ["ZPL", "TSPL", "EPL", "ESCPOS"].includes(activeProfile.driver) ? activeProfile.driver : null;
  const directBridge = Boolean(rawDriver && activeProfile && ["BRIDGE", "NETWORK"].includes(activeProfile.connection));
  const copy = (en: string, sw: string) => lang === "sw" ? sw : en;

  const load = async () => {
    try {
      const data = await api.get<LabelData>("/labels", lang);
      const nextTemplates = data.templates.map(templateFrom); const nextProfiles = data.profiles.map(profileFrom);
      setTemplates(nextTemplates); setProfiles(nextProfiles); setJobs(data.jobs || []);
      const defaultTemplate = nextTemplates.find((item) => item.isDefault) || nextTemplates[0];
      if (defaultTemplate && !selectedTemplateId) { setSelectedTemplateId(defaultTemplate.id || ""); setTemplate(defaultTemplate); }
      const defaultProfile = nextProfiles.find((item) => item.isDefault) || nextProfiles[0];
      if (defaultProfile && !selectedProfileId) { setSelectedProfileId(defaultProfile.id || ""); setProfileDraft(defaultProfile); }
    } catch {}
  };
  useEffect(() => { void load(); }, []);
  const setLayout = (layout: LabelLayout) => setTemplate((current) => ({ ...current, layout, fields: layout === "CUSTOM" ? current.fields : fieldsForLayout(layout) }));
  const toggleField = (field: LabelField) => setTemplate((current) => ({ ...current, fields: current.fields.includes(field) ? current.fields.filter((item) => item !== field) : [...current.fields, field] }));
  const setQuantity = (id: string, raw: string) => setSelected((current) => ({ ...current, [id]: Math.max(0, Math.min(100, Number.parseInt(raw, 10) || 0)) }));

  async function saveTemplate() {
    if (!template.name.trim()) { toast(copy("Give the template a name.", "Weka jina la template."), "error"); return; }
    setSaving(true);
    try {
      const data = selectedTemplateId ? await api.patch<{ template: LabelTemplate }>(`/labels/templates/${selectedTemplateId}`, template, lang) : await api.post<{ template: LabelTemplate }>("/labels/templates", { ...template, isDefault: templates.length === 0 }, lang);
      const saved = templateFrom(data.template); setTemplate(saved); setSelectedTemplateId(saved.id || ""); toast(copy("Label template saved.", "Template ya label imehifadhiwa."), "success"); await load();
    } catch (error) { toast(error instanceof Error ? error.message : copy("Could not save template.", "Imeshindikana kuhifadhi template."), "error"); } finally { setSaving(false); }
  }
  async function deleteTemplate() {
    if (!selectedTemplateId || !window.confirm(copy("Delete this label template?", "Futa template hii ya label?"))) return;
    try { await api.delete(`/labels/templates/${selectedTemplateId}`, lang); setSelectedTemplateId(""); setTemplate(defaultLabelTemplate); await load(); toast(copy("Label template deleted.", "Template ya label imefutwa."), "success"); }
    catch (error) { toast(error instanceof Error ? error.message : copy("Could not delete template.", "Imeshindikana kufuta template."), "error"); }
  }
  async function saveProfile() {
    if (!profileDraft.name.trim()) { toast(copy("Give the printer profile a name.", "Weka jina la profile ya printer."), "error"); return; }
    setSaving(true);
    try {
      const body = { ...profileDraft, widthMm: template.widthMm, heightMm: template.heightMm, templateId: selectedTemplateId || null };
      const data = selectedProfileId ? await api.patch<{ profile: PrinterProfile }>(`/labels/printer-profiles/${selectedProfileId}`, body, lang) : await api.post<{ profile: PrinterProfile }>("/labels/printer-profiles", { ...body, isDefault: profiles.length === 0 }, lang);
      const saved = profileFrom(data.profile); setProfileDraft(saved); setSelectedProfileId(saved.id || ""); await load(); toast(copy("Printer profile saved.", "Profile ya printer imehifadhiwa."), "success");
    } catch (error) { toast(error instanceof Error ? error.message : copy("Could not save printer profile.", "Imeshindikana kuhifadhi profile ya printer."), "error"); } finally { setSaving(false); }
  }
  async function deleteProfile() {
    if (!selectedProfileId || !window.confirm(copy("Delete this printer profile?", "Futa profile hii ya printer?"))) return;
    try { await api.delete(`/labels/printer-profiles/${selectedProfileId}`, lang); setSelectedProfileId(""); setProfileDraft({ name: "", driver: "BROWSER", widthMm: template.widthMm, heightMm: template.heightMm, dpi: 203, connection: "BROWSER", config: {} }); await load(); toast(copy("Printer profile deleted.", "Profile ya printer imefutwa."), "success"); }
    catch (error) { toast(error instanceof Error ? error.message : copy("Could not delete printer profile.", "Imeshindikana kufuta profile ya printer."), "error"); }
  }
  async function prepare(driver: PrinterDriver): Promise<Prepared | null> {
    if (!selectedProducts.length) { toast(copy("Choose at least one product.", "Chagua angalau bidhaa moja."), "error"); return null; }
    if (missingBarcode) { toast(copy("Add the selected barcode type to every product.", "Weka aina ya barcode iliyochaguliwa kwa kila bidhaa."), "error"); return null; }
    setLoading(true);
    try {
      const data = await api.post<Prepared>("/labels/print-jobs", { items: Object.entries(selected).map(([productId, copies]) => ({ productId, copies })), template, printerProfileId: activeProfile?.driver === driver ? activeProfile.id : undefined, outputDriver: driver }, lang);
      await load(); return data;
    } catch (error) { toast(error instanceof Error ? error.message : copy("Could not prepare labels.", "Imeshindikana kuandaa labels."), "error"); return null; } finally { setLoading(false); }
  }
  async function complete(job: Prepared["job"], failure?: unknown) {
    await api.post(`/labels/print-jobs/${job.id}/complete`, failure ? { status: "FAILED", error: failure instanceof Error ? failure.message : "Print failed" } : {}, lang).catch(() => {});
  }
  async function browserPrint() {
    const popup = window.open("", "_blank");
    if (!popup) { toast(copy("Allow pop-ups to print labels.", "Ruhusu pop-up ili kuchapisha label."), "error"); return; }
    const prepared = await prepare("BROWSER"); if (!prepared) { popup.close(); return; }
    try { openLabelPrint(selectedProducts, template, popup); await complete(prepared.job); } catch (error) { popup.close(); await complete(prepared.job, error); toast(error instanceof Error ? error.message : copy("Could not open print dialog.", "Imeshindikana kufungua print."), "error"); }
  }
  async function pdfDownload() {
    const prepared = await prepare("PDF"); if (!prepared) return;
    try { await downloadLabelPdf(selectedProducts, template); await complete(prepared.job); } catch (error) { await complete(prepared.job, error); toast(error instanceof Error ? error.message : copy("Could not create PDF.", "Imeshindikana kutengeneza PDF."), "error"); }
  }
  async function rawDownload() {
    if (!rawDriver) return;
    const prepared = await prepare(rawDriver); if (!prepared?.output) return;
    downloadRaw(prepared.output.content, prepared.output.encoding, prepared.output.filename, prepared.output.contentType); await complete(prepared.job); toast(copy("Printer command downloaded.", "Amri ya printer imepakuliwa."), "success");
  }
  function bridgeEndpoint(path: string) {
    const base = validBridgeUrl(activeProfile?.config?.bridgeUrl || "http://127.0.0.1:9123");
    if (!base) throw new Error(copy("Use a loopback bridge URL, such as http://127.0.0.1:9123.", "Tumia bridge URL ya kifaa hiki, kama http://127.0.0.1:9123."));
    return `${base}${path}`;
  }
  async function bridgeRequest(path: string, body?: Record<string, string>) {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body) headers["Content-Type"] = "application/json";
    if (bridgeToken) headers.Authorization = `Bearer ${bridgeToken}`;
    const response = await fetch(bridgeEndpoint(path), { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : `Bridge request failed (${response.status})`);
    return data;
  }
  async function testBridge() {
    try { const status = await bridgeRequest("/health"); setBridgeStatus(`${copy("Bridge ready", "Bridge iko tayari")}: ${status.version || "local"}`); toast(copy("DukaPilot print bridge is ready.", "DukaPilot print bridge iko tayari."), "success"); }
    catch (error) { setBridgeStatus(error instanceof Error ? error.message : copy("Bridge unavailable.", "Bridge haipatikani.")); toast(error instanceof Error ? error.message : copy("Bridge unavailable.", "Bridge haipatikani."), "error"); }
  }
  async function testPrint() {
    if (!rawDriver) return;
    try { await bridgeRequest("/test", { printerId: "default", protocol: rawDriver }); toast(copy("Test command sent to the local bridge.", "Amri ya majaribio imetumwa kwa bridge ya kifaa."), "success"); }
    catch (error) { toast(error instanceof Error ? error.message : copy("Test print failed.", "Majaribio ya print yameshindwa."), "error"); }
  }
  async function directPrint() {
    if (!rawDriver) return;
    const prepared = await prepare(rawDriver); if (!prepared?.output) return;
    try {
      const data = rawDriver === "ESCPOS" && prepared.output.encoding === "base64" ? base64ToHex(prepared.output.content) : prepared.output.content;
      await bridgeRequest("/print", { printerId: "default", protocol: rawDriver, data }); await complete(prepared.job); toast(copy("Labels sent to the local print bridge.", "Label zimetumwa kwa print bridge ya kifaa."), "success");
    } catch (error) { await complete(prepared.job, error); toast(error instanceof Error ? error.message : copy("Direct print failed.", "Print ya moja kwa moja imeshindwa."), "error"); }
  }

  return <section className="space-y-4" aria-label={copy("Product label printing", "Uchapishaji wa label za bidhaa")}>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]"><div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-gray-950">{copy("Print product labels", "Chapisha label za bidhaa")}</h2><p className="mt-1 text-xs text-gray-500">{copy("Default size is 40 x 30 mm. Choose exactly what appears on each label.", "Ukubwa wa kawaida ni 40 x 30 mm. Chagua taarifa zitakazoonekana kwenye kila label.")}</p></div><span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-800">{selectedProducts.length} {copy("labels", "label")}</span></div>
      <div className="grid gap-3 sm:grid-cols-2"><Select label={copy("Saved template", "Template iliyohifadhiwa")} value={selectedTemplateId} onChange={(value) => { const next = templates.find((item) => item.id === value); setSelectedTemplateId(value); if (next) setTemplate(templateFrom(next)); }}><option value="">{copy("Quick label (not saved)", "Label ya haraka (haijahifadhiwa)")}</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><Input label={copy("Template name", "Jina la template")} value={template.name} onChange={(value) => setTemplate((current) => ({ ...current, name: value }))} /></div>
      <div className="grid gap-2 sm:grid-cols-2">{layouts.map((item) => <button key={item.value} onClick={() => setLayout(item.value)} className={`rounded-lg border px-3 py-2 text-left text-xs font-bold ${template.layout === item.value ? "border-brand-600 bg-brand-50 text-brand-800" : "border-gray-200 bg-white text-gray-700"}`}>{copy(item.en, item.sw)}</button>)}</div>
      {template.layout === "CUSTOM" && <><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{labelFields.map((field) => <label key={field} className="flex min-h-10 items-center gap-2 rounded-lg border border-gray-200 px-2 text-xs font-semibold text-gray-700"><input type="checkbox" checked={template.fields.includes(field)} onChange={() => toggleField(field)} className="h-4 w-4" />{copy(...fieldLabels[field])}</label>)}</div>{template.fields.includes("customText") && <Input label={copy("Custom text", "Maandishi maalum")} value={template.customText || ""} onChange={(value) => setTemplate((current) => ({ ...current, customText: value.slice(0, 100) }))} />}</>}
      <div className="flex flex-wrap gap-2">{sizePresets.map((preset) => <button key={preset.name} onClick={() => setTemplate((current) => ({ ...current, name: current.name === defaultLabelTemplate.name ? preset.name : current.name, widthMm: preset.widthMm, heightMm: preset.heightMm }))} className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold ${template.widthMm === preset.widthMm && template.heightMm === preset.heightMm ? "border-brand-500 bg-brand-50 text-brand-800" : "border-gray-200 text-gray-600"}`}>{preset.name}</button>)}</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Numeric label={copy("Width mm", "Upana mm")} value={template.widthMm} onChange={(widthMm) => setTemplate((current) => ({ ...current, widthMm }))} min={20} max={120} /><Numeric label={copy("Height mm", "Urefu mm")} value={template.heightMm} onChange={(heightMm) => setTemplate((current) => ({ ...current, heightMm }))} min={20} max={100} /><Numeric label={copy("Columns", "Safu")} value={template.columns} onChange={(columns) => setTemplate((current) => ({ ...current, columns: Math.round(columns) }))} min={1} max={6} /><Numeric label={copy("Gap mm", "Nafasi mm")} value={template.gapMm} onChange={(gapMm) => setTemplate((current) => ({ ...current, gapMm }))} min={0} max={10} /></div>
      <div className="flex flex-wrap gap-2"><button onClick={saveTemplate} disabled={saving} className="action-primary"><Save className="h-4 w-4" />{copy("Save template", "Hifadhi template")}</button>{selectedTemplateId && <button onClick={deleteTemplate} className="action danger"><Trash2 className="h-4 w-4" />{copy("Delete", "Futa")}</button>}<button onClick={browserPrint} disabled={loading || !selectedProducts.length || missingBarcode} className="action-primary"><Printer className="h-4 w-4" />{loading ? copy("Preparing...", "Inaandaa...") : copy("Print", "Chapisha")}</button><button onClick={pdfDownload} disabled={loading || !selectedProducts.length || missingBarcode} className="action"><FileDown className="h-4 w-4" />PDF</button></div>
    </div><div className="flex items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4"><div className="max-w-full overflow-auto"><LabelPreview product={selectedProducts[0] || products[0] || { id: "preview", name: "DukaPilot", sellingPrice: 0 }} template={template} /></div></div></div>
    {!compact && <section className="overflow-hidden rounded-lg border border-gray-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3"><h3 className="text-sm font-semibold text-gray-950">{copy("Products and copies", "Bidhaa na nakala")}</h3><label className="relative block"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" /><input aria-label={copy("Search products", "Tafuta bidhaa")} value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder={copy("Search products", "Tafuta bidhaa")} className="w-52 rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm" /></label></div><div className="divide-y divide-gray-100">{visibleProducts.map((product) => <div key={product.id} className="flex items-center gap-3 px-4 py-3"><input aria-label={`${copy("Select", "Chagua")} ${product.name}`} type="checkbox" checked={Boolean(selected[product.id])} onChange={() => setSelected((current) => ({ ...current, [product.id]: current[product.id] ? 0 : 1 }))} className="h-5 w-5 rounded border-gray-300 text-brand-600" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-gray-800">{product.labelName || product.name}</p><p className="font-mono text-xs text-gray-500">{product.internalBarcode || product.manufacturerBarcode || product.barcode || copy("No barcode", "Hakuna barcode")}</p></div><input aria-label={`${copy("Copies for", "Nakala za")} ${product.name}`} type="number" min="0" max="100" value={selected[product.id] || ""} onChange={(event) => setQuantity(product.id, event.target.value)} className="w-16 rounded-lg border border-gray-300 px-2 py-2 text-sm" placeholder="0" /></div>)}{visibleProducts.length === 0 && <p className="p-6 text-center text-sm text-gray-500">{copy("No matching products.", "Hakuna bidhaa inayolingana.")}</p>}</div></section>}
    <details className="rounded-lg border border-gray-200 bg-white"><summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-900"><Settings2 className="h-4 w-4" />{copy("Printer profiles and direct output", "Profile za printer na output ya moja kwa moja")}</summary><div className="space-y-3 border-t border-gray-100 p-4"><p className="text-xs leading-5 text-gray-600">{copy("Browser/PDF work on any device. Raw protocols are downloaded or sent only to the local DukaPilot Print Bridge. The bridge token is kept in this browser tab and never saved to DukaPilot.", "Browser/PDF hufanya kazi kwenye kifaa chochote. Protocol za printer zinapakuliwa au kutumwa tu kwenye DukaPilot Print Bridge ya kifaa. Token ya bridge inabaki kwenye tab hii na haihifadhiwi na DukaPilot.")}</p>
      <div className="grid gap-3 sm:grid-cols-2"><Select label={copy("Saved profile", "Profile iliyohifadhiwa")} value={selectedProfileId} onChange={(value) => { const next = profiles.find((item) => item.id === value); setSelectedProfileId(value); if (next) setProfileDraft(profileFrom(next)); }}><option value="">{copy("New profile", "Profile mpya")}</option>{profiles.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.driver})</option>)}</Select><Input label={copy("Profile name", "Jina la profile")} value={profileDraft.name} onChange={(value) => setProfileDraft((current) => ({ ...current, name: value }))} /><Select label={copy("Output", "Output")} value={profileDraft.driver} onChange={(value) => setProfileDraft((current) => ({ ...current, driver: value as PrinterDriver }))}><option value="BROWSER">Browser print</option><option value="PDF">PDF</option><option value="ZPL">ZPL (Zebra-compatible)</option><option value="TSPL">TSPL (TSC/Xprinter-compatible)</option><option value="EPL">EPL (legacy-compatible)</option><option value="ESCPOS">ESC/POS</option></Select><Select label={copy("Connection", "Muunganisho")} value={profileDraft.connection} onChange={(value) => setProfileDraft((current) => ({ ...current, connection: value as PrinterConnection }))}><option value="BROWSER">Browser</option><option value="DOWNLOAD">Download file</option><option value="BRIDGE">Local bridge</option><option value="NETWORK">LAN via local bridge</option><option value="USB">USB (future adapter)</option><option value="BLUETOOTH">Bluetooth (future adapter)</option></Select><Input label={copy("Printer model", "Aina ya printer")} value={profileDraft.model || ""} placeholder="XP-D281B / XP-D281E" onChange={(value) => setProfileDraft((current) => ({ ...current, model: value }))} /><Select label="DPI" value={String(profileDraft.dpi)} onChange={(value) => setProfileDraft((current) => ({ ...current, dpi: Number(value) }))}><option value="203">203 DPI</option><option value="300">300 DPI</option></Select></div>
      {["BRIDGE", "NETWORK"].includes(profileDraft.connection) && <div className="grid gap-3 rounded-lg border border-brand-100 bg-brand-50 p-3 sm:grid-cols-2"><Input label={copy("Bridge URL", "Bridge URL")} value={profileDraft.config?.bridgeUrl || "http://127.0.0.1:9123"} onChange={(value) => setProfileDraft((current) => ({ ...current, config: { ...current.config, bridgeUrl: value } }))} /><label className="grid gap-1 text-xs font-semibold text-brand-950"><span>{copy("Bridge token (not saved)", "Bridge token (haihifadhiwi)")}</span><input value={bridgeToken} onChange={(event) => setBridgeToken(event.target.value)} type="password" autoComplete="off" className="rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm" /></label><p className="sm:col-span-2 text-xs leading-5 text-brand-900">{bridgeStatus || copy("The bridge must run on this computer. Its LAN printer address stays in the bridge environment, not in DukaPilot.", "Bridge lazima iwashwe kwenye kompyuta hii. Anwani ya LAN ya printer inabaki kwenye mazingira ya bridge, siyo DukaPilot.")}</p></div>}
      <div className="flex flex-wrap gap-2"><button onClick={saveProfile} disabled={saving} className="action-primary"><Save className="h-4 w-4" />{copy("Save profile", "Hifadhi profile")}</button>{selectedProfileId && <button onClick={deleteProfile} className="action danger"><Trash2 className="h-4 w-4" />{copy("Delete", "Futa")}</button>}{rawDriver && <button onClick={rawDownload} disabled={loading || !selectedProducts.length || missingBarcode} className="action"><Download className="h-4 w-4" />{copy("Download file", "Pakua faili")}</button>}{directBridge && <><button onClick={testBridge} className="action"><Wifi className="h-4 w-4" />{copy("Test bridge", "Jaribu bridge")}</button><button onClick={testPrint} className="action">{copy("Test print", "Jaribu print")}</button><button onClick={directPrint} disabled={loading || !selectedProducts.length || missingBarcode} className="action-primary"><Printer className="h-4 w-4" />{copy("Print directly", "Chapisha moja kwa moja")}</button></>}{activeProfile && ["USB", "BLUETOOTH"].includes(activeProfile.connection) && <p className="self-center text-xs text-amber-700">{copy("Direct USB/Bluetooth printing needs a future native adapter. Download remains available.", "Print ya moja kwa moja kwa USB/Bluetooth inahitaji native adapter ya baadaye. Download bado ipo.")}</p>}</div>
    </div></details>
    {jobs.length > 0 && <section className="rounded-lg border border-gray-200 bg-white"><div className="border-b border-gray-100 px-4 py-3"><h3 className="text-sm font-semibold text-gray-950">{copy("Recent label jobs", "Kazi za label za karibuni")}</h3></div><div className="divide-y divide-gray-100">{jobs.slice(0, 5).map((job) => <div key={job.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs"><span className="truncate font-semibold text-gray-700">{job.template?.name || copy("Quick label", "Label ya haraka")}</span><span className="text-gray-500">{job.outputDriver} · {job.status}</span></div>)}</div></section>}
  </section>;
}
function Input({ label, value, onChange, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="grid gap-1 text-xs font-semibold text-gray-700"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" /></label>;
}
function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <label className="grid gap-1 text-xs font-semibold text-gray-700"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">{children}</select></label>;
}
function Numeric({ label, value, onChange, min, max }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number }) {
  return <label className="grid gap-1 text-xs font-semibold text-gray-700"><span>{label}</span><input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Math.max(min, Math.min(max, Number(event.target.value) || min)))} className="rounded-lg border border-gray-300 px-2 py-2 text-sm" /></label>;
}
