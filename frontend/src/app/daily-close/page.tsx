"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign, LockKeyhole, RefreshCw, Search, WalletCards } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { api, formatTZS } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";

interface SessionSummary {
  cashSales: number;
  debtCollections: number;
  quotationCash: number;
  cashExpenses: number;
  saleCount: number;
  debtPaymentCount: number;
  quotationPaymentCount: number;
  expenseCount: number;
  expectedCash: number;
}

interface CashSession {
  id: string;
  status: "OPEN" | "CLOSED";
  openingCash: number;
  expectedCash?: number | null;
  countedCash?: number | null;
  variance?: number | null;
  note?: string | null;
  openedByName: string;
  openedAt: string;
  closedAt?: string | null;
  summary: SessionSummary;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface SessionResponse {
  session: CashSession | null;
  sessions: CashSession[];
  canManageAllSessions: boolean;
}

interface HistoryResponse {
  sessions: CashSession[];
  pagination: Pagination;
}

function localTime(value: string, lang: string) {
  return new Date(value).toLocaleTimeString(lang === "sw" ? "sw-TZ" : "en-TZ", { hour: "2-digit", minute: "2-digit" });
}

function localDateTime(value: string, lang: string) {
  return new Date(value).toLocaleString(lang === "sw" ? "sw-TZ" : "en-TZ", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function DailyClosePage() {
  const lang = useLang();
  const { toast } = useToast();
  const [data, setData] = useState<SessionResponse | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [openingCash, setOpeningCash] = useState("0");
  const [openNote, setOpenNote] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyFilters, setHistoryFilters] = useState({ status: "CLOSED", from: "", to: "", search: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get<SessionResponse>("/cash-sessions/current", lang));
    } catch (error: unknown) {
      toast(error instanceof Error ? error.message : (lang === "sw" ? "Imeshindikana kupakia shift." : "Could not load the cash session."), "error");
    } finally {
      setLoading(false);
    }
  }, [lang, toast]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const query = new URLSearchParams({ page: String(historyPage), limit: "10", status: historyFilters.status });
      if (historyFilters.from) query.set("from", historyFilters.from);
      if (historyFilters.to) query.set("to", historyFilters.to);
      if (historyFilters.search.trim()) query.set("search", historyFilters.search.trim());
      setHistory(await api.get<HistoryResponse>(`/cash-sessions/history?${query.toString()}`, lang));
    } catch (error: unknown) {
      toast(error instanceof Error ? error.message : (lang === "sw" ? "Imeshindikana kupakia historia." : "Could not load history."), "error");
    } finally {
      setHistoryLoading(false);
    }
  }, [historyFilters, historyPage, lang, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  function updateHistoryFilter(field: keyof typeof historyFilters, value: string) {
    setHistoryFilters((current) => ({ ...current, [field]: value }));
    setHistoryPage(1);
  }

  async function openSession() {
    const value = Number(openingCash || 0);
    if (!Number.isInteger(value) || value < 0) {
      toast(lang === "sw" ? "Weka pesa ya kuanzia kwa namba kamili." : "Enter opening cash as a whole amount.", "error");
      return;
    }
    setSaving(true);
    try {
      await api.post("/cash-sessions/open", { openingCash: value, note: openNote.trim() || undefined }, lang);
      setOpeningCash("0");
      setOpenNote("");
      toast(lang === "sw" ? "Shift imefunguliwa." : "Cash session opened.", "success");
      await Promise.all([load(), loadHistory()]);
    } catch (error: unknown) {
      toast(error instanceof Error ? error.message : "Could not open session", "error");
    } finally {
      setSaving(false);
    }
  }

  async function closeSession() {
    if (!data?.session) return;
    const value = Number(countedCash);
    if (!Number.isInteger(value) || value < 0) {
      toast(lang === "sw" ? "Hesabu pesa halisi kwa namba kamili." : "Enter the counted cash as a whole amount.", "error");
      return;
    }
    setSaving(true);
    try {
      const result = await api.post<{ session: CashSession }>(`/cash-sessions/${data.session.id}/close`, { countedCash: value, note: closeNote.trim() || undefined }, lang);
      const variance = result.session.variance || 0;
      toast(variance === 0 ? (lang === "sw" ? "Siku imefungwa. Pesa zinalingana." : "Day closed. Cash balances.") : (lang === "sw" ? "Siku imefungwa. Angalia tofauti ya pesa." : "Day closed. Review the cash variance."), variance === 0 ? "success" : "info");
      setCountedCash("");
      setCloseNote("");
      await Promise.all([load(), loadHistory()]);
    } catch (error: unknown) {
      toast(error instanceof Error ? error.message : "Could not close session", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <AppShell><div className="flex h-64 items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-brand-600" /></div></AppShell>;

  const current = data?.session;
  const todaySessions = data?.sessions || [];
  const pagination = history?.pagination;
  return (
    <AppShell>
      <main className="mx-auto max-w-4xl space-y-5 pb-24 lg:pb-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-xl font-bold text-gray-950">{lang === "sw" ? "Funga Siku / Z-Report" : "Daily Close / Z-Report"}</h1><p className="mt-1 text-sm text-gray-500">{lang === "sw" ? "Linganisha pesa halisi na mauzo ya taslimu ya shift yako." : "Reconcile counted cash against your shift's cash activity."}</p></div>
          <button type="button" onClick={() => { load(); loadHistory(); }} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 text-gray-600" title={lang === "sw" ? "Sasisha" : "Refresh"} aria-label={lang === "sw" ? "Sasisha" : "Refresh"}><RefreshCw className="h-4 w-4" /></button>
        </header>

        {!current ? <OpenShiftCard lang={lang} saving={saving} openingCash={openingCash} openNote={openNote} onOpeningCash={setOpeningCash} onOpenNote={setOpenNote} onOpen={openSession} /> : <CloseShiftCard lang={lang} saving={saving} session={current} countedCash={countedCash} closeNote={closeNote} onCountedCash={setCountedCash} onCloseNote={setCloseNote} onClose={closeSession} />}

        <section>
          <div className="mb-3 flex items-center gap-2"><CalendarDays className="h-4 w-4 text-brand-700" /><h2 className="text-base font-bold text-gray-950">{data?.canManageAllSessions ? (lang === "sw" ? "Shift za leo" : "Today's sessions") : (lang === "sw" ? "Shift zangu za leo" : "My sessions today")}</h2></div>
          <div className="space-y-2">{todaySessions.length ? todaySessions.map((session) => <SessionHistoryRow key={session.id} session={session} lang={lang} showDate={false} />) : <div className="border border-dashed border-gray-300 p-5 text-center text-sm text-gray-500">{lang === "sw" ? "Hakuna shift ya leo bado." : "No cash sessions today."}</div>}</div>
        </section>

        <section className="border-t border-gray-200 pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><div><h2 className="text-base font-bold text-gray-950">{lang === "sw" ? "Historia ya Daily Close" : "Daily Close history"}</h2><p className="mt-1 text-sm text-gray-500">{lang === "sw" ? "Fungua shift moja kuona Z-Report yake kamili." : "Open a shift only when you need its full Z-report."}</p></div>{pagination && <p className="text-xs font-medium text-gray-500">{pagination.total} {lang === "sw" ? "shift" : "sessions"}</p>}</div>
          <div className="mt-4 grid gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-xs font-medium text-gray-600"><span>{lang === "sw" ? "Hali" : "Status"}</span><select value={historyFilters.status} onChange={(event) => updateHistoryFilter("status", event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"><option value="CLOSED">{lang === "sw" ? "Iliyofungwa" : "Closed"}</option><option value="OPEN">{lang === "sw" ? "Iliyo wazi" : "Open"}</option><option value="ALL">{lang === "sw" ? "Zote" : "All"}</option></select></label>
            <label className="grid gap-1 text-xs font-medium text-gray-600"><span>{lang === "sw" ? "Kuanzia" : "From"}</span><input type="date" value={historyFilters.from} onChange={(event) => updateHistoryFilter("from", event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" /></label>
            <label className="grid gap-1 text-xs font-medium text-gray-600"><span>{lang === "sw" ? "Mpaka" : "To"}</span><input type="date" value={historyFilters.to} onChange={(event) => updateHistoryFilter("to", event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" /></label>
            <label className="grid gap-1 text-xs font-medium text-gray-600"><span>{lang === "sw" ? "Tafuta staff" : "Find staff"}</span><span className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" /><input value={historyFilters.search} onChange={(event) => updateHistoryFilter("search", event.target.value)} placeholder={lang === "sw" ? "Jina" : "Name"} className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-8 pr-3 text-sm" /></span></label>
          </div>
          <div className="mt-3 space-y-2">{historyLoading ? <div className="flex h-28 items-center justify-center"><RefreshCw className="h-5 w-5 animate-spin text-brand-600" /></div> : history?.sessions.length ? history.sessions.map((session) => <SessionHistoryRow key={session.id} session={session} lang={lang} />) : <div className="border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">{lang === "sw" ? "Hakuna shift zinazolingana na vichujio hivi." : "No sessions match these filters."}</div>}</div>
          {pagination && pagination.totalPages > 1 && <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3"><p className="text-xs text-gray-500">{lang === "sw" ? `Ukurasa ${pagination.page} kati ya ${pagination.totalPages}` : `Page ${pagination.page} of ${pagination.totalPages}`}</p><div className="flex gap-2"><button type="button" disabled={historyLoading || pagination.page <= 1} onClick={() => setHistoryPage((page) => page - 1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-700 disabled:opacity-40" aria-label={lang === "sw" ? "Ukurasa uliopita" : "Previous page"}><ChevronLeft className="h-4 w-4" /></button><button type="button" disabled={historyLoading || pagination.page >= pagination.totalPages} onClick={() => setHistoryPage((page) => page + 1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-700 disabled:opacity-40" aria-label={lang === "sw" ? "Ukurasa unaofuata" : "Next page"}><ChevronRight className="h-4 w-4" /></button></div></div>}
        </section>
      </main>
    </AppShell>
  );
}

function OpenShiftCard({ lang, saving, openingCash, openNote, onOpeningCash, onOpenNote, onOpen }: { lang: string; saving: boolean; openingCash: string; openNote: string; onOpeningCash: (value: string) => void; onOpenNote: (value: string) => void; onOpen: () => void }) {
  return <section className="border border-brand-200 bg-brand-50 p-5"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-brand-700"><WalletCards className="h-5 w-5" /></span><div><h2 className="font-semibold text-gray-950">{lang === "sw" ? "Fungua shift ya leo" : "Open today's shift"}</h2><p className="mt-1 text-sm leading-5 text-gray-600">{lang === "sw" ? "Weka pesa iliyoanza kwenye droo kabla ya kuuza." : "Record the cash already in the drawer before you sell."}</p></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Pesa ya kuanzia (TZS)" : "Opening cash (TZS)"}</span><input value={openingCash} onChange={(event) => onOpeningCash(event.target.value)} inputMode="numeric" type="number" min="0" step="1" className="rounded-lg border border-gray-300 px-3 py-3" /></label><label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Maelezo (hiari)" : "Note (optional)"}</span><input value={openNote} onChange={(event) => onOpenNote(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-3" placeholder={lang === "sw" ? "Mfano: Shift ya asubuhi" : "For example: morning shift"} /></label></div><button type="button" disabled={saving} onClick={onOpen} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><CircleDollarSign className="h-4 w-4" />{saving ? "..." : (lang === "sw" ? "Fungua shift" : "Open shift")}</button></section>;
}

function CloseShiftCard({ lang, saving, session, countedCash, closeNote, onCountedCash, onCloseNote, onClose }: { lang: string; saving: boolean; session: CashSession; countedCash: string; closeNote: string; onCountedCash: (value: string) => void; onCloseNote: (value: string) => void; onClose: () => void }) {
  return <section className="border border-green-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-green-500" /><h2 className="font-semibold text-gray-950">{lang === "sw" ? "Shift inaendelea" : "Shift in progress"}</h2></div><p className="mt-1 text-sm text-gray-500">{session.openedByName} - {lang === "sw" ? "imefunguliwa" : "opened"} {localTime(session.openedAt, lang)}</p></div><span className="rounded-md bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700">{lang === "sw" ? "WAZI" : "OPEN"}</span></div><SessionSummaryCard summary={session.summary} openingCash={session.openingCash} lang={lang} /><div className="mt-5 border-t border-gray-100 pt-4"><h3 className="font-semibold text-gray-950">{lang === "sw" ? "Funga shift" : "Close shift"}</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Pesa uliyoihesabu (TZS)" : "Cash counted (TZS)"}</span><input value={countedCash} onChange={(event) => onCountedCash(event.target.value)} inputMode="numeric" type="number" min="0" step="1" className="rounded-lg border border-gray-300 px-3 py-3" /></label><label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Maelezo ya kufunga (hiari)" : "Closing note (optional)"}</span><input value={closeNote} onChange={(event) => onCloseNote(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-3" /></label></div><button type="button" disabled={saving || countedCash === ""} onClick={onClose} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><LockKeyhole className="h-4 w-4" />{saving ? "..." : (lang === "sw" ? "Funga siku" : "Close day")}</button></div></section>;
}

function SessionHistoryRow({ session, lang, showDate = true }: { session: CashSession; lang: string; showDate?: boolean }) {
  const variance = session.variance ?? (session.countedCash == null ? null : session.countedCash - session.summary.expectedCash);
  return <details className="group border border-gray-200 bg-white"><summary className="cursor-pointer list-none p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-gray-950">{session.openedByName}</p><p className="mt-0.5 text-xs text-gray-500">{showDate ? localDateTime(session.openedAt, lang) : localTime(session.openedAt, lang)}{session.closedAt ? ` - ${showDate ? localDateTime(session.closedAt, lang) : localTime(session.closedAt, lang)}` : ""}</p></div><span className={`rounded-md px-2.5 py-1 text-xs font-bold ${session.status === "OPEN" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>{session.status === "OPEN" ? (lang === "sw" ? "WAZI" : "OPEN") : (lang === "sw" ? "IMEFUNGA" : "CLOSED")}</span></div><div className="mt-3 grid grid-cols-3 gap-2"><div><p className="text-[11px] text-gray-500">{lang === "sw" ? "Inayotarajiwa" : "Expected"}</p><p className="text-sm font-bold text-gray-950">{formatTZS(session.summary.expectedCash)}</p></div><div><p className="text-[11px] text-gray-500">{lang === "sw" ? "Iliyohesabiwa" : "Counted"}</p><p className="text-sm font-bold text-gray-950">{session.countedCash == null ? "-" : formatTZS(session.countedCash)}</p></div><div><p className="text-[11px] text-gray-500">{lang === "sw" ? "Tofauti" : "Variance"}</p><p className={`text-sm font-bold ${variance === 0 ? "text-green-700" : variance == null ? "text-gray-500" : "text-amber-700"}`}>{variance == null ? "-" : formatTZS(variance)}</p></div></div></summary><div className="border-t border-gray-100 px-4 pb-4"><SessionSummaryCard summary={session.summary} openingCash={session.openingCash} lang={lang} compact />{session.note && <p className="mt-3 text-sm text-gray-600"><span className="font-semibold text-gray-800">{lang === "sw" ? "Maelezo:" : "Note:"}</span> {session.note}</p>}{session.status === "CLOSED" && variance != null && <div className={`mt-3 flex items-center gap-2 text-sm font-semibold ${variance === 0 ? "text-green-700" : "text-amber-700"}`}><CheckCircle2 className="h-4 w-4" />{lang === "sw" ? "Tofauti" : "Variance"}: {formatTZS(variance)}</div>}</div></details>;
}

function SessionSummaryCard({ summary, openingCash, lang, compact = false }: { summary: SessionSummary; openingCash: number; lang: string; compact?: boolean }) {
  const rows = [[lang === "sw" ? "Pesa ya kuanzia" : "Opening cash", openingCash], [lang === "sw" ? `Mauzo ya taslimu (${summary.saleCount})` : `Cash sales (${summary.saleCount})`, summary.cashSales], [lang === "sw" ? `Malipo ya madeni (${summary.debtPaymentCount})` : `Debt collections (${summary.debtPaymentCount})`, summary.debtCollections], [lang === "sw" ? `Amana/malipo ya nukuu (${summary.quotationPaymentCount})` : `Quotation deposits/payments (${summary.quotationPaymentCount})`, summary.quotationCash], [lang === "sw" ? `Matumizi ya taslimu (${summary.expenseCount})` : `Cash expenses (${summary.expenseCount})`, -summary.cashExpenses]];
  return <div className={`mt-4 grid gap-2 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-4"}`}>{rows.map(([label, value]) => <div key={String(label)} className="border border-gray-100 bg-gray-50 p-3"><p className="text-xs text-gray-500">{label}</p><p className={`mt-1 text-sm font-bold ${Number(value) < 0 ? "text-red-700" : "text-gray-950"}`}>{Number(value) < 0 ? "-" : ""}{formatTZS(Math.abs(Number(value)))}</p></div>)}<div className="border border-brand-200 bg-brand-50 p-3"><p className="text-xs text-brand-700">{lang === "sw" ? "Pesa inayotarajiwa" : "Expected cash"}</p><p className="mt-1 text-sm font-bold text-brand-950">{formatTZS(summary.expectedCash)}</p></div></div>;
}
