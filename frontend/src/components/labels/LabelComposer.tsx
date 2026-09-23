"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileDown, LoaderCircle, Printer, Save, Settings2, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { LabelPreview } from "./LabelRenderer";
import { downloadLabelPdf, openLabelPrint } from "./labelPrint";
import { defaultLabelTemplate, fieldsForLayout, labelFields, type LabelField, type LabelLayout, type LabelProduct, type LabelTemplate, type PrinterDriver, type PrinterProfile } from "./types";

type LabelData = { templates: LabelTemplate[]; profiles: PrinterProfile[]; jobs: Array<{ id: string; outputDriver: PrinterDriver; status: string; createdAt: string; template?: { name: string } | null; printerProfile?: { name: string } | null }> };

const layouts: Array<{ value: LabelLayout; en: string; sw: string }> = [
  { value: "NAME_PRICE_BARCODE", en: "Name, price & barcode", sw: "Jina, bei na barcode" },
  { value: "NAME_BARCODE", en: "Name & barcode", sw: "Jina na barcode" },
  { value: "NAME_PRICE", en: "Name & price", sw: "Jina na bei" },
  { value: "BARCODE_ONLY", en: "Barcode only", sw: "Barcode pekee" },
  { value: "CUSTOM", en: "Custom fields", sw: "Chagua taarifa" },
];

const fieldLabels: Record<LabelField, [string, string]> = {
  name: ["Product name", "Jina la bidhaa"], price: ["Selling price", "Bei ya kuuza"], barcode: ["Barcode", "Barcode"], sku: ["SKU", "SKU"], unit: ["Unit", "Kipimo"], stock: ["Stock", "Stock"],
};

function templateFrom(value: LabelTemplate): LabelTemplate {
  return { ...defaultLabelTemplate, ...value, fields: Array.isArray(value.fields) ? value.fields as LabelField[] : defaultLabelTemplate.fields };
}

function profileFrom(value: PrinterProfile): PrinterProfile {
  return { ...value, driver: value.driver || "BROWSER", transport: value.transport || "BROWSER_DOWNLOAD", dpi: value.dpi || 203 };
}

function outputFilename(name: string, extension: string) {
  return `${name.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "dukapilot-labels"}.${extension}`;
}

function downloadRaw(content: string, encoding: string, filename: string, contentType: string) {
  let blob: Blob;
  if (encoding === "base64") {
    const binary = window.atob(content);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const payload = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    blob = new Blob([payload], { type: contentType });
  } else blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
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
  const [profileDraft, setProfileDraft] = useState<PrinterProfile>({ name: "", driver: "BROWSER", widthMm: 40, heightMm: 30, dpi: 203, transport: "BROWSER_DOWNLOAD" });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedProducts = useMemo(() => products.flatMap((product) => Array.from({ length: Math.min(100, Math.max(0, selected[product.id] || 0)) }, () => product)), [products, selected]);
  const needsBarcode = template.layout !== "NAME_PRICE" && (template.layout !== "CUSTOM" || template.fields.includes("barcode"));
  const missingBarcode = needsBarcode && selectedProducts.some((product) => !product.barcode);
  const activeProfile = profiles.find((profile) => profile.id === selectedProfileId) || null;

  const copy = (en: string, sw: string) => lang === "sw" ? sw : en;
  const load = async () => {
    try {
      const data = await api.get<LabelData>("/labels", lang);
      const nextTemplates = data.templates.map(templateFrom);
      const nextProfiles = data.profiles.map(profileFrom);
      setTemplates(nextTemplates); setProfiles(nextProfiles); setJobs(data.jobs || []);
      const defaultTemplate = nextTemplates.find((item) => item.isDefault) || nextTemplates[0];
      if (defaultTemplate && !selectedTemplateId) { setSelectedTemplateId(defaultTemplate.id || ""); setTemplate(defaultTemplate); }
      const defaultProfile = nextProfiles.find((item) => item.isDefault) || nextProfiles[0];
      if (defaultProfile && !selectedProfileId) { setSelectedProfileId(defaultProfile.id || ""); setProfileDraft(defaultProfile); }
    } catch {
      // Labels stay useful as a browser-only tool even before saved profiles exist.
    }
  };
  useEffect(() => { load(); }, []); // Initial configuration only.

  function setLayout(layout: LabelLayout) {
    setTemplate((current) => ({ ...current, layout, fields: layout === "CUSTOM" ? current.fields : fieldsForLayout(layout) }));
  }

  function toggleField(field: LabelField) {
    setTemplate((current) => ({ ...current, fields: current.fields.includes(field) ? current.fields.filter((item) => item !== field) : [...current.fields, field] }));
  }

  function setQuantity(id: string, raw: string) {
    setSelected((current) => ({ ...current, [id]: Math.max(0, Math.min(100, Number.parseInt(raw, 10) || 0)) }));
  }

  async function saveTemplate() {
    if (!template.name.trim()) { toast(copy("Give the template a name.", "Weka jina la template."), "error"); return; }
    setSaving(true);
    try {
      const data = selectedTemplateId
        ? await api.patch<{ template: LabelTemplate }>(`/labels/templates/${selectedTemplateId}`, template, lang)
        : await api.post<{ template: LabelTemplate }>("/labels/templates", { ...template, isDefault: templates.length === 0 }, lang);
      const saved = templateFrom(data.template);
      setTemplate(saved); setSelectedTemplateId(saved.id || "");
      toast(copy("Label template saved.", "Template ya label imehifadhiwa."), "success");
      await load();
    } catch (error) { toast(error instanceof Error ? error.message : copy("Could not save template.", "Imeshindikana kuhifadhi template."), "error"); }
    finally { setSaving(false); }
  }

  async function deleteTemplate() {
    if (!selectedTemplateId || !window.confirm(copy("Delete this label template?", "Futa template hii ya label?"))) return;
    try {
      await api.delete(`/labels/templates/${selectedTemplateId}`, lang);
      setSelectedTemplateId(""); setTemplate(defaultLabelTemplate); await load();
      toast(copy("Label template deleted.", "Template ya label imefutwa."), "success");
    } catch (error) { toast(error instanceof Error ? error.message : copy("Could not delete template.", "Imeshindikana kufuta template."), "error"); }
  }

  async function saveProfile() {
    if (!profileDraft.name.trim()) { toast(copy("Give the printer profile a name.", "Weka jina la profile ya printer."), "error"); return; }
    setSaving(true);
    try {
      const body = { ...profileDraft, widthMm: template.widthMm, heightMm: template.heightMm, templateId: selectedTemplateId || null };
      const data = selectedProfileId
        ? await api.patch<{ profile: PrinterProfile }>(`/labels/printer-profiles/${selectedProfileId}`, body, lang)
        : await api.post<{ profile: PrinterProfile }>("/labels/printer-profiles", { ...body, isDefault: profiles.length === 0 }, lang);
      const saved = profileFrom(data.profile);
      setProfileDraft(saved); setSelectedProfileId(saved.id || ""); await load();
      toast(copy("Printer profile saved.", "Profile ya printer imehifadhiwa."), "success");
    } catch (error) { toast(error instanceof Error ? error.message : copy("Could not save printer profile.", "Imeshindikana kuhifadhi profile ya printer."), "error"); }
    finally { setSaving(false); }
  }

  async function deleteProfile() {
    if (!selectedProfileId || !window.confirm(copy("Delete this printer profile?", "Futa profile hii ya printer?"))) return;
    try {
      await api.delete(`/labels/printer-profiles/${selectedProfileId}`, lang);
      setSelectedProfileId(""); setProfileDraft({ name: "", driver: "BROWSER", widthMm: template.widthMm, heightMm: template.heightMm, dpi: 203, transport: "BROWSER_DOWNLOAD" });
      await load();
      toast(copy("Printer profile deleted.", "Profile ya printer imefutwa."), "success");
    } catch (error) { toast(error instanceof Error ? error.message : copy("Could not delete printer profile.", "Imeshindikana kufuta profile ya printer."), "error"); }
  }

  async function prepare(driver: PrinterDriver) {
    if (!selectedProducts.length) { toast(copy("Choose at least one product.", "Chagua angalau bidhaa moja."), "error"); return null; }
    if (missingBarcode) { toast(copy("Add a barcode to every selected product for this label format.", "Weka barcode kwa kila bidhaa iliyochaguliwa kwa format hii."), "error"); return null; }
    setLoading(true);
    try {
      const data = await api.post<{ job: { id: string }; output: { content: string; encoding: string; filename: string; contentType: string } | null }>("/labels/print-jobs", {
        items: Object.entries(selected).map(([productId, copies]) => ({ productId, copies })),
        template,
        printerProfileId: activeProfile?.driver === driver ? activeProfile.id : undefined,
        outputDriver: driver,
      }, lang);
      await load();
      return data;
    } catch (error) {
      toast(error instanceof Error ? error.message : copy("Could not prepare labels.", "Imeshindikana kuandaa labels."), "error");
      return null;
    } finally { setLoading(false); }
  }

  async function browserPrint() {
    // Reserve the window during the trusted user gesture. Opening it after the
    // audit request returns causes mobile browsers to block the print popup.
    const popup = window.open("", "_blank");
    if (!popup) { toast(copy("Allow pop-ups to print labels.", "Ruhusu pop-up ili kuchapisha label."), "error"); return; }
    const prepared = await prepare("BROWSER");
    if (!prepared) { popup.close(); return; }
    try { openLabelPrint(selectedProducts, template, popup); await api.post(`/labels/print-jobs/${prepared.job.id}/complete`, {}, lang); }
    catch (error) { popup.close(); await api.post(`/labels/print-jobs/${prepared.job.id}/complete`, { status: "FAILED", error: error instanceof Error ? error.message : "Browser print failed" }, lang).catch(() => {}); toast(error instanceof Error ? error.message : copy("Could not open print dialog.", "Imeshindikana kufungua print."), "error"); }
  }

  async function pdfDownload() {
    const prepared = await prepare("PDF");
    if (!prepared) return;
    try { await downloadLabelPdf(selectedProducts, template); await api.post(`/labels/print-jobs/${prepared.job.id}/complete`, {}, lang); }
    catch (error) { await api.post(`/labels/print-jobs/${prepared.job.id}/complete`, { status: "FAILED", error: error instanceof Error ? error.message : "PDF failed" }, lang).catch(() => {}); toast(error instanceof Error ? error.message : copy("Could not create PDF.", "Imeshindikana kutengeneza PDF."), "error"); }
  }

  async function rawDownload() {
    const driver = activeProfile?.driver;
    if (!driver || !["ZPL", "TSPL", "ESCPOS"].includes(driver)) return;
    const prepared = await prepare(driver);
    if (!prepared?.output) return;
    downloadRaw(prepared.output.content, prepared.output.encoding, prepared.output.filename, prepared.output.contentType);
    await api.post(`/labels/print-jobs/${prepared.job.id}/complete`, {}, lang).catch(() => {});
    toast(copy("Printer command downloaded for your local print bridge.", "Amri ya printer imepakuliwa kwa print bridge ya kifaa chako."), "success");
  }

  return <section className="space-y-4" aria-label={copy("Product label printing", "Uchapishaji wa label za bidhaa")}>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]"><div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-gray-950">{copy("Print product labels", "Chapisha label za bidhaa")}</h2><p className="mt-1 text-xs text-gray-500">{copy("Default size is 40 x 30 mm. Choose exactly what appears on each label.", "Ukubwa wa kawaida ni 40 x 30 mm. Chagua taarifa zitakazoonekana kwenye kila label.")}</p></div><span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-800">{selectedProducts.length} {copy("labels", "label")}</span></div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs font-semibold text-gray-700"><span>{copy("Saved template", "Template iliyohifadhiwa")}</span><select value={selectedTemplateId} onChange={(event) => { const next = templates.find((item) => item.id === event.target.value); setSelectedTemplateId(event.target.value); if (next) setTemplate(templateFrom(next)); }} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"><option value="">{copy("Quick label (not saved)", "Label ya haraka (haijahifadhiwa)")}</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="grid gap-1 text-xs font-semibold text-gray-700"><span>{copy("Template name", "Jina la template")}</span><input value={template.name} onChange={(event) => setTemplate((current) => ({ ...current, name: event.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" maxLength={80} /></label></div>
      <div className="grid gap-2 sm:grid-cols-2">{layouts.map((item) => <button key={item.value} onClick={() => setLayout(item.value)} className={`rounded-lg border px-3 py-2 text-left text-xs font-bold ${template.layout === item.value ? "border-brand-600 bg-brand-50 text-brand-800" : "border-gray-200 bg-white text-gray-700"}`}>{copy(item.en, item.sw)}</button>)}</div>
      {template.layout === "CUSTOM" && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{labelFields.map((field) => <label key={field} className="flex min-h-10 items-center gap-2 rounded-lg border border-gray-200 px-2 text-xs font-semibold text-gray-700"><input type="checkbox" checked={template.fields.includes(field)} onChange={() => toggleField(field)} className="h-4 w-4" />{copy(...fieldLabels[field])}</label>)}</div>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Numeric label={copy("Width mm", "Upana mm")} value={template.widthMm} onChange={(widthMm) => setTemplate((current) => ({ ...current, widthMm }))} min={20} max={120} /><Numeric label={copy("Height mm", "Urefu mm")} value={template.heightMm} onChange={(heightMm) => setTemplate((current) => ({ ...current, heightMm }))} min={20} max={100} /><Numeric label={copy("Columns", "Safu") } value={template.columns} onChange={(columns) => setTemplate((current) => ({ ...current, columns: Math.round(columns) }))} min={1} max={6} /><Numeric label={copy("Gap mm", "Nafasi mm")} value={template.gapMm} onChange={(gapMm) => setTemplate((current) => ({ ...current, gapMm }))} min={0} max={10} /></div>
      <div className="flex flex-wrap gap-2"><button onClick={saveTemplate} disabled={saving} className="action-primary"><Save className="h-4 w-4" />{copy("Save template", "Hifadhi template")}</button>{selectedTemplateId && <button onClick={deleteTemplate} className="action danger"><Trash2 className="h-4 w-4" />{copy("Delete", "Futa")}</button>}<button onClick={browserPrint} disabled={loading || !selectedProducts.length || missingBarcode} className="action-primary"><Printer className="h-4 w-4" />{loading ? copy("Preparing...", "Inaandaa...") : copy("Print", "Chapisha")}</button><button onClick={pdfDownload} disabled={loading || !selectedProducts.length || missingBarcode} className="action"><FileDown className="h-4 w-4" />PDF</button></div>
    </div>
      <div className="flex items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4"><div className="max-w-full overflow-auto"><LabelPreview product={selectedProducts[0] || products[0] || { id: "preview", name: "DukaPilot", sellingPrice: 0 }} template={template} /></div></div>
    </div>

    {!compact && <section className="overflow-hidden rounded-lg border border-gray-200 bg-white"><div className="border-b border-gray-100 px-4 py-3"><h3 className="text-sm font-semibold text-gray-950">{copy("Products and copies", "Bidhaa na nakala")}</h3></div><div className="divide-y divide-gray-100">{products.map((product) => <div key={product.id} className="flex items-center gap-3 px-4 py-3"><input aria-label={`${copy("Select", "Chagua")} ${product.name}`} type="checkbox" checked={Boolean(selected[product.id])} onChange={() => setSelected((current) => ({ ...current, [product.id]: current[product.id] ? 0 : 1 }))} className="h-5 w-5 rounded border-gray-300 text-brand-600" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-gray-800">{product.labelName || product.name}</p><p className="font-mono text-xs text-gray-500">{product.barcode || copy("No barcode", "Hakuna barcode")}</p></div><input aria-label={`${copy("Copies for", "Nakala za")} ${product.name}`} type="number" min="0" max="100" value={selected[product.id] || ""} onChange={(event) => setQuantity(product.id, event.target.value)} className="w-16 rounded-lg border border-gray-300 px-2 py-2 text-sm" placeholder="0" /></div>)}</div></section>}

    <details className="rounded-lg border border-gray-200 bg-white"><summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-900"><Settings2 className="h-4 w-4" />{copy("Printer profiles and direct output", "Profile za printer na output ya moja kwa moja")}</summary><div className="space-y-3 border-t border-gray-100 p-4"><p className="text-xs leading-5 text-gray-600">{copy("Browser and PDF work everywhere. ZPL, TSPL, and ESC/POS files are generated for a compatible local print bridge; DukaPilot never sends raw printer commands through Railway.", "Browser na PDF hufanya kazi kila mahali. Faili za ZPL, TSPL na ESC/POS zinatengenezwa kwa print bridge ya kifaa chako; DukaPilot haitumi amri za printer kupitia Railway.")}</p><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs font-semibold text-gray-700"><span>{copy("Saved profile", "Profile iliyohifadhiwa")}</span><select value={selectedProfileId} onChange={(event) => { const next = profiles.find((item) => item.id === event.target.value); setSelectedProfileId(event.target.value); if (next) setProfileDraft(profileFrom(next)); }} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"><option value="">{copy("New profile", "Profile mpya")}</option>{profiles.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.driver})</option>)}</select></label><label className="grid gap-1 text-xs font-semibold text-gray-700"><span>{copy("Profile name", "Jina la profile")}</span><input value={profileDraft.name} onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" maxLength={80} /></label><label className="grid gap-1 text-xs font-semibold text-gray-700"><span>{copy("Output", "Output")}</span><select value={profileDraft.driver} onChange={(event) => setProfileDraft((current) => ({ ...current, driver: event.target.value as PrinterDriver }))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"><option value="BROWSER">Browser print</option><option value="PDF">PDF</option><option value="ZPL">ZPL (Zebra-compatible)</option><option value="TSPL">TSPL (TSC/Xprinter-compatible)</option><option value="ESCPOS">ESC/POS</option></select></label><label className="grid gap-1 text-xs font-semibold text-gray-700"><span>{copy("Local transport", "Njia ya kifaa")}</span><select value={profileDraft.transport} onChange={(event) => setProfileDraft((current) => ({ ...current, transport: event.target.value as PrinterProfile["transport"] }))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"><option value="BROWSER_DOWNLOAD">Download / browser</option><option value="QZ_TRAY">QZ Tray desktop</option><option value="PRINT_BRIDGE">DukaPilot print bridge</option></select></label><label className="grid gap-1 text-xs font-semibold text-gray-700"><span>DPI</span><select value={profileDraft.dpi} onChange={(event) => setProfileDraft((current) => ({ ...current, dpi: Number(event.target.value) }))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"><option value="203">203 DPI</option><option value="300">300 DPI</option></select></label></div><div className="flex flex-wrap gap-2"><button onClick={saveProfile} disabled={saving} className="action-primary"><Save className="h-4 w-4" />{copy("Save profile", "Hifadhi profile")}</button>{selectedProfileId && <button onClick={deleteProfile} className="action danger"><Trash2 className="h-4 w-4" />{copy("Delete", "Futa")}</button>}{activeProfile && ["ZPL", "TSPL", "ESCPOS"].includes(activeProfile.driver) && <button onClick={rawDownload} disabled={loading || !selectedProducts.length || missingBarcode} className="action"><Download className="h-4 w-4" />{copy("Download printer command", "Pakua amri ya printer")}</button>}</div></div></details>

    {jobs.length > 0 && <section className="rounded-lg border border-gray-200 bg-white"><div className="border-b border-gray-100 px-4 py-3"><h3 className="text-sm font-semibold text-gray-950">{copy("Recent label jobs", "Kazi za label za karibuni")}</h3></div><div className="divide-y divide-gray-100">{jobs.slice(0, 5).map((job) => <div key={job.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs"><span className="truncate font-semibold text-gray-700">{job.template?.name || copy("Quick label", "Label ya haraka")}</span><span className="text-gray-500">{job.outputDriver} · {job.status}</span></div>)}</div></section>}
  </section>;
}

function Numeric({ label, value, onChange, min, max }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number }) {
  return <label className="grid gap-1 text-xs font-semibold text-gray-700"><span>{label}</span><input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Math.max(min, Math.min(max, Number(event.target.value) || min)))} className="rounded-lg border border-gray-300 px-2 py-2 text-sm" /></label>;
}
