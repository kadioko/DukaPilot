"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, MessageCircle, RefreshCw, Search } from "lucide-react";
import { api, formatTZS } from "@/lib/api";
import { useLang } from "@/lib/i18n";

type ShopRow = {
  id: string; name: string; location: string; plan: string; computedStatus: string;
  onboardingStatus: string; daysLeft: number | null; lastContactedAt: string | null;
  nextFollowUpAt: string | null; supportAssigneeId?: string | null;
  supportAssignee?: { id: string; name: string } | null;
  user?: { id: string; name: string; phone: string } | null;
  branches?: Array<{ id: string; name: string; location: string; branchArchived: boolean }>;
  followUpNotes?: string | null;
};
type ShopList = { shops: ShopRow[]; total: number; page: number; totalPages: number };
type Detail = {
  shop: ShopRow;
  payments: Array<{ id: string; plan: string; amount: number; method: string; reference?: string | null; paidAt: string; status: string }>;
  reports: Array<{ id: string; title: string; type: string; status: string; priority: string; createdAt: string }>;
  syncFailures: Array<{ id: string; deviceLabel: string | null; operationKind: string; attempts: number; createdAt: string; resolutionStatus: string }>;
  sales: { count: number; lastAt: string | null };
  notes: Array<{ id: string; body: string; createdAt: string; author: { name: string } | null }>;
  noteCount: number; notePage: number;
  latestAdminAction: { action: string; createdAt: string; user: { name: string } | null } | null;
};

export default function AdminSupportWorkspace({ onOpenBilling }: { onOpenBilling: (shop: ShopRow) => void }) {
  const sw = useLang() === "sw";
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"action" | "all">("action");
  const [page, setPage] = useState(1);
  const [list, setList] = useState<ShopList | null>(null);
  const [listError, setListError] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [admins, setAdmins] = useState<Array<{ id: string; name: string }>>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");

  async function loadList() {
    setListLoading(true);
    setListError("");
    try {
      const params = new URLSearchParams({ page: String(page), filter });
      if (query) params.set("search", query);
      setList(await api.get<ShopList>(`/admin/support/shops?${params.toString()}`));
    } catch (error) {
      setListError(error instanceof Error ? error.message : "Could not load shops");
    } finally { setListLoading(false); }
  }

  async function loadDetail(id: string, notePage = 1) {
    setDetailLoading(true);
    setDetailError("");
    try { setDetail(await api.get<Detail>(`/admin/support/shops/${id}?notePage=${notePage}`)); }
    catch (error) { setDetailError(error instanceof Error ? error.message : "Could not load shop"); }
    finally { setDetailLoading(false); }
  }

  useEffect(() => { void loadList(); }, [page, filter, query]);
  useEffect(() => {
    api.get<{ admins: Array<{ id: string; name: string }> }>("/admin/support/admins")
      .then((result) => setAdmins(result.admins)).catch(() => setAdmins([]));
  }, []);

  async function saveSupport(patch: Record<string, unknown>) {
    if (!selectedId) return;
    setSaving(true); setActionError("");
    try {
      await api.patch(`/admin/support/shops/${selectedId}`, patch);
      await Promise.all([loadDetail(selectedId), loadList()]);
    } catch (error) { setActionError(error instanceof Error ? error.message : "Could not save support details"); }
    finally { setSaving(false); }
  }

  async function addNote(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedId || !note.trim()) return;
    setSaving(true); setActionError("");
    try {
      await api.post(`/admin/support/shops/${selectedId}/notes`, { body: note.trim() });
      setNote("");
      await loadDetail(selectedId);
    } catch (error) { setActionError(error instanceof Error ? error.message : "Could not save note"); }
    finally { setSaving(false); }
  }

  const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString(sw ? "sw-TZ" : "en-TZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dar_es_Salaam" }) : (sw ? "Hakuna" : "None");
  const detailShop = detail?.shop;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(330px,420px)]">
      <section className={`min-w-0 ${selectedId ? "hidden lg:block" : ""}`}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div><h2 className="text-base font-semibold text-gray-950">{sw ? "Huduma kwa biashara" : "Shop support"}</h2><p className="text-xs text-gray-500">{sw ? "Tafuta na fuatilia biashara zinazohitaji msaada." : "Find and follow up with shops that need help."}</p></div>
          <button type="button" onClick={() => void loadList()} aria-label={sw ? "Onyesha upya biashara" : "Refresh shops"} title={sw ? "Onyesha upya" : "Refresh"} className="rounded border border-gray-200 p-2 text-gray-600"><RefreshCw className={`h-4 w-4 ${listLoading ? "animate-spin" : ""}`} /></button>
        </div>
        <form className="mb-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(search.trim()); }}>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={sw ? "Jina la biashara au simu" : "Shop, owner, or phone"} aria-label={sw ? "Tafuta biashara" : "Search shops"} className="min-w-0 flex-1 rounded border border-gray-200 px-3 py-2 text-sm" />
          <button type="submit" aria-label={sw ? "Tafuta" : "Search"} title={sw ? "Tafuta" : "Search"} className="rounded bg-brand-700 p-2 text-white"><Search className="h-4 w-4" /></button>
        </form>
        <div className="mb-3 flex gap-1 rounded bg-gray-100 p-1" role="group" aria-label={sw ? "Chuja biashara" : "Filter shops"}>
          {(["action", "all"] as const).map((option) => <button key={option} type="button" onClick={() => { setFilter(option); setPage(1); }} className={`flex-1 rounded px-3 py-2 text-sm font-semibold ${filter === option ? "bg-white text-brand-800 shadow-sm" : "text-gray-600"}`}>{option === "action" ? (sw ? "Zinahitaji hatua" : "Needs action") : (sw ? "Biashara zote" : "All shops")}</button>)}
        </div>
        {listError && <div role="alert" className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">{listError} <button type="button" onClick={() => void loadList()} className="ml-2 font-semibold underline">{sw ? "Jaribu tena" : "Retry"}</button></div>}
        {listLoading && <p role="status" className="py-5 text-sm text-gray-500">{sw ? "Inapakia biashara..." : "Loading shops..."}</p>}
        {!listLoading && list && <p className="mb-2 text-xs text-gray-500">{list.total} {sw ? "biashara" : "shops"}</p>}
        {!listLoading && !listError && list?.shops.length === 0 && <p className="rounded border border-gray-200 bg-white p-5 text-sm text-gray-600">{sw ? "Hakuna biashara kwenye orodha hii." : "No shops in this view."}</p>}
        <div className="space-y-2">
          {!listError && list?.shops.map((shop) => <button key={shop.id} type="button" onClick={() => { setSelectedId(shop.id); setDetail(null); void loadDetail(shop.id); }} className={`block w-full rounded border bg-white p-3 text-left text-sm ${selectedId === shop.id ? "border-brand-500" : "border-gray-200"}`}>
            <span className="flex items-start justify-between gap-2"><span className="min-w-0 font-semibold text-gray-950">{shop.name}</span><span className="shrink-0 text-xs font-semibold text-brand-700">{shop.computedStatus}</span></span>
            <span className="mt-1 block text-xs text-gray-600">{shop.user?.name || "-"} · {shop.user?.phone || "-"}</span>
            <span className="mt-1 block text-xs text-gray-500">{shop.onboardingStatus} · {sw ? "Mfuatiliaji" : "Assigned"}: {shop.supportAssignee?.name || (sw ? "Hakuna" : "None")} · {sw ? "Hatua inayofuata" : "Next follow-up"}: {formatDate(shop.nextFollowUpAt)}</span>
          </button>)}
        </div>
        {list && list.totalPages > 1 && <div className="mt-4 flex items-center justify-between text-sm"><button type="button" disabled={page <= 1 || listLoading} onClick={() => setPage(page - 1)} className="flex items-center gap-1 rounded border px-3 py-2 disabled:opacity-40"><ChevronLeft className="h-4 w-4" />{sw ? "Nyuma" : "Previous"}</button><span>{page} / {list.totalPages}</span><button type="button" disabled={page >= list.totalPages || listLoading} onClick={() => setPage(page + 1)} className="flex items-center gap-1 rounded border px-3 py-2 disabled:opacity-40">{sw ? "Mbele" : "Next"}<ChevronRight className="h-4 w-4" /></button></div>}
      </section>
      <section className="min-w-0 border-t border-gray-200 pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
        {selectedId && <button type="button" onClick={() => { setSelectedId(null); setDetail(null); }} className="mb-3 flex items-center gap-1 text-sm text-gray-600 lg:hidden"><ArrowLeft className="h-4 w-4" />{sw ? "Rudi kwenye orodha" : "Back to list"}</button>}
        {detailLoading && <p role="status" className="py-5 text-sm text-gray-500">{sw ? "Inapakia maelezo..." : "Loading details..."}</p>}
        {detailError && <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">{detailError} <button type="button" onClick={() => selectedId && void loadDetail(selectedId)} className="font-semibold underline">{sw ? "Jaribu tena" : "Retry"}</button></div>}
        {!detailLoading && !detailError && !detail && <p className="text-sm text-gray-500">{sw ? "Chagua biashara kuona maelezo." : "Select a shop to see its support details."}</p>}
        {detail && detailShop && !detailError && <div className="space-y-4 text-sm">
          <div><h3 className="text-lg font-bold text-gray-950">{detailShop.name}</h3><p className="text-gray-600">{detailShop.user?.name} · {detailShop.user?.phone}</p><p className="text-xs text-gray-500">{detailShop.plan} · {detailShop.computedStatus} · {detailShop.location}</p></div>
          <div className="grid grid-cols-2 gap-2 rounded border border-gray-200 p-3 text-xs"><p>{sw ? "Mauzo" : "Sales"}<strong className="block text-base text-gray-900">{detail.sales.count}</strong></p><p>{sw ? "Mauzo ya mwisho" : "Last sale"}<strong className="block text-gray-900">{formatDate(detail.sales.lastAt)}</strong></p><p>{sw ? "Mawasiliano ya mwisho" : "Last contact"}<strong className="block text-gray-900">{formatDate(detailShop.lastContactedAt)}</strong></p><p>{sw ? "Hatua ya mwisho ya admin" : "Last admin action"}<strong className="block text-gray-900">{detail.latestAdminAction?.action || "-"}</strong></p></div>
          <div className="grid gap-2 sm:grid-cols-2"><label className="text-xs font-semibold text-gray-700">{sw ? "Admin anayeshughulikia" : "Assigned admin"}<select value={detailShop.supportAssigneeId || ""} disabled={saving} onChange={(event) => void saveSupport({ supportAssigneeId: event.target.value || null })} className="mt-1 w-full rounded border border-gray-200 px-2 py-2 text-sm"><option value="">{sw ? "Hakuna" : "Unassigned"}</option>{admins.map((admin) => <option key={admin.id} value={admin.id}>{admin.name}</option>)}</select></label><label className="text-xs font-semibold text-gray-700">{sw ? "Tarehe ya kufuatilia" : "Next follow-up"}<input type="date" value={detailShop.nextFollowUpAt?.slice(0, 10) || ""} disabled={saving} onChange={(event) => void saveSupport({ nextFollowUpAt: event.target.value ? new Date(`${event.target.value}T09:00:00+03:00`).toISOString() : null })} className="mt-1 w-full rounded border border-gray-200 px-2 py-2 text-sm" /></label></div>
          <label className="block text-xs font-semibold text-gray-700">{sw ? "Hali ya msaada" : "Support status"}<select value={detailShop.onboardingStatus} disabled={saving} onChange={(event) => void saveSupport({ onboardingStatus: event.target.value })} className="mt-1 w-full rounded border border-gray-200 px-2 py-2 text-sm">{[
            ["NEW", "New", "Mpya"], ["CONTACTED", "Contacted", "Wamewasiliana"], ["NEEDS_HELP", "Needs help", "Inahitaji msaada"],
            ["SETUP_DONE", "Setup done", "Usanidi umekamilika"], ["ACTIVATED", "Activated", "Imeanza kutumia"],
            ["PAID", "Paid", "Imelipia"], ["CONVERTED", "Converted", "Imekuwa mteja"], ["CHURN_RISK", "Churn risk", "Hatari ya kuondoka"],
          ].map(([value, en, swLabel]) => <option key={value} value={value}>{sw ? swLabel : en}</option>)}</select></label>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => void saveSupport({ contacted: true })} className="rounded border border-brand-300 px-3 py-2 font-semibold text-brand-800 disabled:opacity-50">{sw ? "Nimewasiliana" : "Mark contacted"}</button><a href={`https://wa.me/${(detailShop.user?.phone || "").replace(/[^\d]/g, "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded bg-green-700 px-3 py-2 font-semibold text-white"><MessageCircle className="h-4 w-4" /> WhatsApp</a><button type="button" onClick={() => onOpenBilling(detailShop)} className="rounded border border-gray-300 px-3 py-2 font-semibold text-gray-700">{sw ? "Usajili" : "Billing"}</button></div>
          {actionError && <p role="alert" className="rounded bg-red-50 p-2 text-red-800">{actionError}</p>}
          <div className="border-t pt-3"><h4 className="font-semibold text-gray-900">{sw ? "Matawi" : "Branches"} ({detailShop.branches?.length || 0})</h4><p className="mt-1 text-xs text-gray-600">{detailShop.branches?.map((branch) => `${branch.name}${branch.branchArchived ? " (archived)" : ""}`).join(", ") || (sw ? "Hakuna" : "None")}</p></div>
          <div className="border-t pt-3"><h4 className="font-semibold text-gray-900">{sw ? "Malipo ya usajili" : "Subscription payments"}</h4>{detail.payments.length ? detail.payments.map((payment) => <p key={payment.id} className="mt-2 text-xs text-gray-600">{formatDate(payment.paidAt)} · {payment.plan} · {formatTZS(payment.amount)} · {payment.method}{payment.reference ? ` · ${payment.reference}` : ""}</p>) : <p className="mt-1 text-xs text-gray-500">{sw ? "Hakuna malipo" : "No payments"}</p>}</div>
          <div className="border-t pt-3"><h4 className="font-semibold text-gray-900">{sw ? "Ripoti za msaada" : "Support reports"}</h4>{detail.reports.length ? detail.reports.map((report) => <p key={report.id} className="mt-2 text-xs text-gray-600">{report.title} · {report.status} · {formatDate(report.createdAt)}</p>) : <p className="mt-1 text-xs text-gray-500">{sw ? "Hakuna ripoti" : "No reports"}</p>}</div>
          <div className="border-t pt-3"><h4 className="font-semibold text-gray-900">{sw ? "Hitilafu za usawazishaji" : "Open sync failures"}</h4>{detail.syncFailures.length ? detail.syncFailures.map((failure) => <p key={failure.id} className="mt-2 text-xs text-gray-600">{failure.deviceLabel || failure.operationKind} · {failure.resolutionStatus} · {formatDate(failure.createdAt)}</p>) : <p className="mt-1 text-xs text-gray-500">{sw ? "Hakuna hitilafu" : "No open failures"}</p>}</div>
          <div className="border-t pt-3"><h4 className="font-semibold text-gray-900">{sw ? "Historia ya maelezo" : "Note history"} ({detail.noteCount})</h4>{detailShop.followUpNotes && detail.noteCount === 0 && <p className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-600">{sw ? "Maelezo ya zamani" : "Previous note"}: {detailShop.followUpNotes}</p>}<form onSubmit={(event) => void addNote(event)} className="mt-2 space-y-2"><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={3} placeholder={sw ? "Andika maelezo mapya..." : "Add a dated support note..."} className="w-full rounded border border-gray-200 p-2 text-sm" /><button type="submit" disabled={saving || !note.trim()} className="rounded bg-brand-700 px-3 py-2 font-semibold text-white disabled:opacity-50">{sw ? "Hifadhi maelezo" : "Save note"}</button></form>{detail.notes.map((item) => <div key={item.id} className="mt-2 rounded bg-gray-50 p-2"><p className="whitespace-pre-wrap text-sm text-gray-800">{item.body}</p><p className="mt-1 text-xs text-gray-500">{item.author?.name || "Admin"} · {formatDate(item.createdAt)}</p></div>)}{detail.noteCount > 20 && <div className="mt-2 flex items-center justify-between text-xs"><button type="button" disabled={detail.notePage <= 1} onClick={() => selectedId && void loadDetail(selectedId, detail.notePage - 1)} className="underline disabled:opacity-40">{sw ? "Nyuma" : "Previous"}</button><span>{detail.notePage} / {Math.ceil(detail.noteCount / 20)}</span><button type="button" disabled={detail.notePage >= Math.ceil(detail.noteCount / 20)} onClick={() => selectedId && void loadDetail(selectedId, detail.notePage + 1)} className="underline disabled:opacity-40">{sw ? "Mbele" : "Next"}</button></div>}</div>
        </div>}
      </section>
    </div>
  );
}
