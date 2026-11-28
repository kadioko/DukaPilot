"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Edit2, Plus, RefreshCw } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { api, formatTZS, getCurrentSession } from "@/lib/api";
import { useLang } from "@/lib/i18n";

type Service = { id: string; name: string; defaultSellingPrice: number | null; defaultEstimatedUnitCost?: number };

export default function ServicesPage() {
  const lang = useLang();
  const [services, setServices] = useState<Service[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [manage, setManage] = useState(false);
  const [costs, setCosts] = useState(false);
  const [editing, setEditing] = useState<Service | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const request = useRef<{ id: string; fingerprint: string } | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    getCurrentSession<{ user: { role: string; staff?: { permissions?: { canManageStock?: boolean; canViewReports?: boolean } } } }>()
      .then(({ user }) => { setManage(user.role === "ADMIN" || !user.staff || !!user.staff.permissions?.canManageStock); setCosts(user.role === "ADMIN" || !user.staff || !!user.staff.permissions?.canViewReports); })
      .catch(() => { setManage(false); setCosts(false); });
  }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ page: String(page), limit: "30", search: search.trim() });
      api.get<{ services: Service[]; total: number }>(`/services?${query}`)
        .then((data) => { if (!cancelled) { setServices(data.services); setTotal(data.total); setError(""); } })
        .catch((err) => { if (!cancelled) { setServices([]); setError(err instanceof Error ? err.message : "Could not load services"); } })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, search ? 250 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [page, search, refresh]);

  const open = useCallback((service: Service | null) => {
    setEditing(service); setName(service?.name || ""); setPrice(service?.defaultSellingPrice == null ? "" : String(service.defaultSellingPrice));
    setCost(service?.defaultEstimatedUnitCost ? String(service.defaultEstimatedUnitCost) : ""); setSaveError(""); request.current = null;
  }, []);
  async function save() {
    if (busy.current) return;
    if (!name.trim() || price === "") { setSaveError(lang === "sw" ? "Weka jina na bei ya kuuza." : "Enter a name and selling price."); return; }
    const body = { name: name.trim(), defaultSellingPrice: Number(price), ...(costs ? { defaultEstimatedUnitCost: Number(cost || 0) } : {}) };
    const fingerprint = JSON.stringify(body);
    if (!editing && request.current && request.current.fingerprint !== fingerprint) { setSaveError(lang === "sw" ? "Jaribu kuhifadhi maelezo ya awali kwanza ili kuepuka huduma mbili." : "Retry the original details first to avoid creating a duplicate service."); return; }
    if (!editing && !request.current) request.current = { id: crypto.randomUUID(), fingerprint };
    busy.current = true; setSaving(true); setSaveError("");
    try {
      if (editing) await api.patch(`/services/${editing.id}`, body);
      else await api.post("/services", { ...body, requestId: request.current?.id });
      request.current = null; setEditing(undefined); setPage(1); setRefresh((n) => n + 1);
    } catch (err) { setSaveError((err instanceof Error ? err.message : "Could not save") + (editing ? "" : (lang === "sw" ? " Ikiwa jibu limepotea, jaribu tena bila kubadili maelezo." : " If the response was lost, retry without changing the details."))); }
    finally { busy.current = false; setSaving(false); }
  }

  return <AppShell><main className="mx-auto max-w-3xl space-y-4 pb-24">
    <Link href="/inventory" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-brand-700"><ArrowLeft className="h-4 w-4" />{lang === "sw" ? "Rudi inventory" : "Back to inventory"}</Link>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-bold text-gray-900">{lang === "sw" ? "Huduma" : "Services"}</h1><p className="mt-1 text-sm text-gray-600">{lang === "sw" ? "Uza huduma kama kuosha gari bila kufuatilia stock." : "Sell services such as car washes without tracking stock."}</p></div>{manage && <button onClick={() => open(null)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand-700 px-3 text-sm font-semibold text-white"><Plus className="h-4 w-4" />{lang === "sw" ? "Ongeza huduma" : "Add service"}</button>}</div>
    <label className="block"><span className="sr-only">{lang === "sw" ? "Tafuta huduma" : "Search services"}</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={lang === "sw" ? "Tafuta huduma" : "Search services"} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base sm:text-sm" /></label>
    {error && <div role="alert" className="flex items-center justify-between gap-2 bg-amber-50 p-3 text-sm text-amber-900"><span>{error}</span><button onClick={() => setRefresh((n) => n + 1)} className="inline-flex items-center gap-1 font-bold"><RefreshCw className="h-4 w-4" />{lang === "sw" ? "Jaribu tena" : "Retry"}</button></div>}
    {loading ? <p className="py-4 text-sm text-gray-500">{lang === "sw" ? "Inapakia..." : "Loading..."}</p> : !error && !services.length ? <p className="py-4 text-sm text-gray-500">{lang === "sw" ? "Hakuna huduma zilizopatikana." : "No services found."}</p> : <ul className="divide-y divide-gray-200 border-y border-gray-200">{services.map((service) => <li key={service.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="break-words text-sm font-semibold text-gray-900">{service.name}</p><p className="text-sm text-gray-600">{service.defaultSellingPrice == null ? "" : formatTZS(service.defaultSellingPrice)}</p></div>{manage && <button onClick={() => open(service)} aria-label={`${lang === "sw" ? "Hariri" : "Edit"} ${service.name}`} title={lang === "sw" ? "Hariri" : "Edit"} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-700"><Edit2 className="h-4 w-4" /></button>}</li>)}</ul>}
    <div className="flex items-center justify-between text-sm text-gray-600"><button disabled={page <= 1} onClick={() => setPage((n) => n - 1)} className="min-h-10 font-semibold disabled:opacity-40">{lang === "sw" ? "Iliyotangulia" : "Previous"}</button><span>{page} / {Math.max(1, Math.ceil(total / 30))}</span><button disabled={page * 30 >= total} onClick={() => setPage((n) => n + 1)} className="min-h-10 font-semibold disabled:opacity-40">{lang === "sw" ? "Inayofuata" : "Next"}</button></div>
    {editing !== undefined && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"><div role="dialog" aria-modal="true" aria-labelledby="service-title" className="w-full max-w-md space-y-4 rounded-lg bg-white p-4"><h2 id="service-title" className="text-lg font-bold">{editing ? (lang === "sw" ? "Hariri huduma" : "Edit service") : (lang === "sw" ? "Ongeza huduma" : "Add service")}</h2><label className="grid gap-1 text-sm font-medium">{lang === "sw" ? "Jina la huduma" : "Service name"}<input value={name} onChange={(event) => setName(event.target.value)} maxLength={240} className="rounded-lg border border-gray-300 px-3 py-2 text-base" /></label><label className="grid gap-1 text-sm font-medium">{lang === "sw" ? "Bei ya kuuza (TZS)" : "Selling price (TZS)"}<CurrencyInput value={price} onChange={setPrice} className="rounded-lg border border-gray-300 px-3 py-2 text-base" /></label>{costs && <label className="grid gap-1 text-sm font-medium">{lang === "sw" ? "Gharama kwa huduma, ikijulikana (TZS)" : "Estimated cost per service, if known (TZS)"}<CurrencyInput value={cost} onChange={setCost} className="rounded-lg border border-gray-300 px-3 py-2 text-base" /><span className="text-xs font-normal text-gray-600">{lang === "sw" ? "Gharama isipojulikana, ripoti zitaonyesha kuwa haijakamilika. Rekodi vifaa tofauti bila kuvihesabu mara mbili." : "Unknown cost is flagged as incomplete in reports. Record supplies separately without counting them twice."}</span></label>}<p className="text-xs text-gray-600">{lang === "sw" ? "Huduma hizi pia hutumika kwenye quotation. Mabadiliko hayabadili mauzo ya zamani." : "These services are also used in quotations. Changes do not alter past sales."}</p>{saveError && <p role="alert" className="text-sm text-red-700">{saveError}</p>}<div className="flex gap-2"><button disabled={saving} onClick={() => setEditing(undefined)} className="min-h-11 flex-1 rounded-lg border border-gray-300 text-sm font-semibold">{lang === "sw" ? "Funga" : "Close"}</button><button disabled={saving} onClick={save} className="min-h-11 flex-1 rounded-lg bg-brand-700 text-sm font-semibold text-white disabled:opacity-50">{saving ? "..." : (lang === "sw" ? "Hifadhi" : "Save")}</button></div></div></div>}
  </main></AppShell>;
}
