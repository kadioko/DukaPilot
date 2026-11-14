"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, RefreshCw, WalletCards } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { ApiError, api, createApiRequestId, formatTZS, getCurrentSession, selectedBranchId } from "@/lib/api";
import { clearPendingCashHolding, readPendingCashHolding, savePendingCashHolding, type PendingCashHolding } from "@/lib/cashHoldingPending";
import { useLang } from "@/lib/i18n";

type Mode = "AUTO" | "MANUAL" | "HANDOVER";
type MovementKind = "OTHER_IN" | "OWNER_WITHDRAWAL" | "BANK_DEPOSIT" | "MOBILE_DEPOSIT" | "SHIFT_HANDOVER" | "REVERSAL" | "SOURCE_EVENT";
type Epoch = { id: string; mode: Mode; openingAmount: number; openedAt: string };
type Movement = { id: string; epochId: string; kind: MovementKind; amount: number; note: string | null; createdAt: string; sourceType: string | null; sourceId: string | null; relatedSourceType: string | null; relatedSourceId: string | null; reversal: { id: string } | null; reversesMovementId: string | null; epoch: { mode: Mode; openedAt: string } };
type PageInfo = { page: number; totalPages: number };
type Snapshot = { epoch: Epoch | null; balance: number | null; movements: Movement[]; pagination: PageInfo };
type Shift = { id: string; openedByName: string; closedAt: string; countedCash: number; cashTransferredOut: number; cashTransferDestination: string | null; previousHandoverId: string | null };
type Handovers = { sessions: Shift[]; pagination: PageInfo };

const enabled = process.env.NEXT_PUBLIC_CASH_HOLDING_ENABLED === "true";

function dateTime(value: string, sw: boolean) {
  return new Date(value).toLocaleString(sw ? "sw-TZ" : "en-TZ", { timeZone: "Africa/Dar_es_Salaam", dateStyle: "medium", timeStyle: "short" });
}

export default function CashOnHandPage() {
  const sw = useLang() === "sw";
  const [scope, setScope] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [shifts, setShifts] = useState<Handovers | null>(null);
  const [page, setPage] = useState(1);
  const [shiftPage, setShiftPage] = useState(1);
  const [mode, setMode] = useState<Mode>("MANUAL");
  const [count, setCount] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [kind, setKind] = useState<MovementKind>("OTHER_IN");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [pending, setPending] = useState<PendingCashHolding | "invalid" | "unavailable" | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    const [next, nextShifts] = await Promise.all([
      api.get<Snapshot>(`/cash-holding?page=${page}`),
      api.get<Handovers>(`/cash-holding/handovers?page=${shiftPage}`),
    ]);
    setSnapshot(next);
    setShifts(nextShifts);
    setMode(next.epoch?.mode || "MANUAL");
  }, [page, shiftPage]);

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    getCurrentSession<{ user: { id?: string; staff?: { id?: string } | null; shop?: { id?: string } } }>()
      .then(async ({ user }) => {
        if (!user.id || user.staff || !user.shop?.id) throw new Error(sw ? "Mmiliki pekee anaweza kufungua eneo hili." : "Only the business owner can open this area.");
        const nextScope = `${user.id}|${user.shop.id}|${selectedBranchId()}`;
        if (!active) return;
        setScope(nextScope);
        setPending(readPendingCashHolding(nextScope));
        await load();
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : (sw ? "Imeshindikana kupakia." : "Could not load cash records.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load, sw]);

  async function send(item: PendingCashHolding) {
    if (inFlight.current || !scope) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.post(item.path, item.body);
      const cleared = clearPendingCashHolding(scope);
      setPending(cleared ? null : "unavailable");
      setCount(""); setAmount(""); setNote(""); setShiftId(""); setConfirmed(false);
      setKind("OTHER_IN");
      setNotice(cleared ? (sw ? "Imehifadhiwa." : "Saved.") : (sw ? "Imehifadhiwa, lakini kivinjari hakiwezi kusafisha jaribio. Wasiliana na msaada." : "Saved, but the browser cannot clear the pending request. Contact support."));
      try { await load(); } catch { setError(sw ? "Imehifadhiwa, lakini orodha haijapakia. Fungua ukurasa upya." : "Saved, but the list could not refresh. Reload the page."); }
    } catch (cause: unknown) {
      if (cause instanceof ApiError && cause.status && [400, 403, 404, 409, 422].includes(cause.status)) {
        setPending(clearPendingCashHolding(scope) ? null : "unavailable");
        setError(cause.message);
      } else {
        setError(sw ? "Hatujathibitisha kama imehifadhiwa. Unganisha intaneti kisha jaribu ombi lilelile tena." : "We could not confirm whether this was saved. Reconnect and retry the same request.");
      }
    } finally { setBusy(false); inFlight.current = false; }
  }

  function submit(path: PendingCashHolding["path"], body: Record<string, unknown>) {
    if (!scope || pending || inFlight.current) return;
    const item: PendingCashHolding = { path, body: { ...body, ...(path === "/cash-holding/movements" ? { expectedEpochId: snapshot?.epoch?.id } : {}), requestKey: createApiRequestId() } };
    if (!savePendingCashHolding(scope, item)) {
      setError(sw ? "Kivinjari hakiwezi kuhifadhi jaribio salama. Hakuna kilichotumwa." : "This browser cannot preserve a safe retry. Nothing was submitted.");
      return;
    }
    setPending(item);
    void send(item);
  }

  const labels: Record<MovementKind, string> = {
    OTHER_IN: sw ? "Fedha kutoka chanzo kingine" : "Cash from another source",
    OWNER_WITHDRAWAL: sw ? "Mmiliki amechukua fedha" : "Owner withdrawal",
    BANK_DEPOSIT: sw ? "Imepelekwa benki" : "Taken to bank",
    MOBILE_DEPOSIT: sw ? "Imetumwa kwenye mobile money" : "Sent to mobile money",
    SHIFT_HANDOVER: sw ? "Fedha zilizokabidhiwa kutoka shift" : "Shift handover",
    REVERSAL: sw ? "Marekebisho ya rekodi" : "Movement reversal",
    SOURCE_EVENT: sw ? "Muamala uliorekodiwa kiotomatiki" : "Automatically recorded transaction",
  };

  return <AppShell><main className="mx-auto max-w-4xl space-y-5 pb-24">
    <header><h1 className="text-xl font-bold text-gray-950">{sw ? "Fedha zilizopo" : "Cash on hand"}</h1><p className="mt-1 text-sm text-gray-600">{sw ? "Rekodi ya fedha za biashara; si Salio la Duka." : "A record of physical business cash, separate from Merchant Balance."}</p></header>
    {!enabled ? <p role="status" className="border border-amber-200 bg-amber-50 p-4 text-sm">{sw ? "Eneo hili bado haliwezekani kutumika." : "This area is not available yet."}</p> : loading ? <p role="status">{sw ? "Inapakia..." : "Loading..."}</p> : <>
      {error && <p role="alert" className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {pending && <section className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p>{pending === "invalid" || pending === "unavailable" ? (sw ? "Jaribio salama haliwezi kusomwa. Wasiliana na msaada kabla ya kutuma tena." : "The safe retry cannot be read. Contact support before submitting again.") : (sw ? "Kuna ombi ambalo halijathibitishwa. Jaribu ombi lilelile tena." : "A request is unconfirmed. Retry the same request before recording another.")}</p>{typeof pending === "object" && <button type="button" disabled={busy} onClick={() => void send(pending)} className="mt-3 inline-flex items-center gap-2 bg-amber-900 px-3 py-2 font-semibold text-white disabled:opacity-50"><RefreshCw className="h-4 w-4" />{sw ? "Thibitisha ombi" : "Retry request"}</button>}</section>}
      {snapshot && <>
        <section className="border-b border-gray-200 pb-4"><div className="flex items-center gap-2 text-gray-600"><WalletCards className="h-5 w-5" /><h2 className="text-sm font-semibold">{snapshot.epoch?.mode === "AUTO" ? (sw ? "Makadirio ya fedha" : "Estimated cash balance") : (sw ? "Salio lililorekodiwa" : "Recorded cash balance")}</h2></div><p className="mt-2 text-2xl font-bold">{snapshot.balance === null ? "—" : formatTZS(snapshot.balance)}</p><p className="mt-1 text-sm text-gray-600">{snapshot.epoch?.mode === "AUTO" ? (sw ? "Makadirio kutoka hesabu ya mwanzo pamoja na miamala ya CASH iliyorekodiwa na utoaji ulioingizwa hapa. Hesabu fedha mara kwa mara." : "Estimate from the opening count, recorded cash transactions, and manual cash movements. Recount regularly.") : snapshot.epoch?.mode === "HANDOVER" ? (sw ? "Fedha zilizokabidhiwa kwa mmiliki; hazijumuishi shift zilizo wazi." : "Owner-held cash; open drawers are not included.") : snapshot.epoch ? (sw ? "Fedha zilizorekodiwa kwa mikono." : "Cash recorded manually.") : (sw ? "Hesabu fedha kuanza." : "Count cash to get started.")}</p></section>
        <section id="tracking-settings" className="border-b border-gray-200 pb-5"><h2 className="font-semibold">{sw ? "Njia ya kufuatilia" : "Tracking mode"}</h2><p className="mt-1 text-sm text-gray-600">{sw ? "Kila kubadili njia kunahitaji hesabu mpya ya fedha. Rekodi za zamani zinabaki." : "Changing mode requires a fresh physical count. Earlier records remain in history."}</p><fieldset disabled={busy || Boolean(pending)} className="mt-3 space-y-2"><label className="flex gap-2 text-sm"><input type="radio" name="mode" checked={mode === "AUTO"} onChange={() => setMode("AUTO")} />{sw ? "Otomatiki: makadirio ya fedha kwenye droo zote na salama, yakijumuisha miamala ya CASH iliyorekodiwa." : "Automatic: estimate cash across drawers and the safe from recorded cash transactions."}</label><label className="flex gap-2 text-sm"><input type="radio" name="mode" checked={mode === "HANDOVER"} onChange={() => setMode("HANDOVER")} />{sw ? "Makabidhiano: mmiliki anathibitisha fedha kutoka shift iliyofungwa." : "Handover: confirm cash received from a closed shift."}</label><label className="flex gap-2 text-sm"><input type="radio" name="mode" checked={mode === "MANUAL"} onChange={() => setMode("MANUAL")} />{sw ? "Kwa mikono: rekodi kila ongezeko na utoaji mwenyewe." : "Manual: record each cash addition and withdrawal yourself."}</label><label className="block text-sm font-medium">{sw ? "Fedha ulizohesabu (TZS)" : "Cash physically counted (TZS)"}<CurrencyInput value={count} onChange={setCount} className="mt-1 block w-full border border-gray-300 px-3 py-2" /></label><p className="text-xs text-gray-600">{mode === "AUTO" ? (sw ? "Kwa otomatiki, jumlisha fedha kwenye droo zote zilizo wazi na salama ya biashara." : "For Automatic, include cash in every open drawer and the business safe.") : (sw ? "Hesabu fedha zinazofunikwa na njia hii." : "Count the cash covered by this mode.")}</p><label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />{sw ? "Nimehesabu fedha kwa njia hii na ninathibitisha salio." : "I physically counted the cash covered by this mode and confirm the amount."}</label><button type="button" disabled={!confirmed || count === ""} onClick={() => submit("/cash-holding/count", { mode, countedCash: Number(count), expectedEpochId: snapshot.epoch?.id || null })} className="bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{sw ? "Hifadhi hesabu" : "Save count"}</button></fieldset></section>
        {snapshot.epoch && <section className="border-b border-gray-200 pb-5"><h2 className="font-semibold">{sw ? "Rekodi mwendo wa fedha" : "Record a cash movement"}</h2><p className="mt-1 text-sm text-gray-600">{snapshot.epoch.mode === "AUTO" ? (sw ? "Miamala ya CASH ya DukaPilot huingia yenyewe. Rekodi hapa fedha za nje, utoaji, au fedha zilizowekwa benki/mobile money pekee; usirudie muamala uliorekodiwa tayari." : "DukaPilot cash transactions are added automatically. Record other cash received, withdrawals, or deposits here; do not enter a transaction already recorded in DukaPilot again.") : (sw ? "Hii ni rekodi tu; haitumi fedha benki au mobile money. Tumia fedha ulizo nazo, si fedha kwenye shift iliyo wazi." : "This records a movement only; it does not send money. Use owner-held cash, not cash still in an open drawer.")}</p><fieldset disabled={busy || Boolean(pending)} className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm">{sw ? "Aina" : "Type"}<select value={kind} onChange={(event) => setKind(event.target.value as MovementKind)} className="mt-1 block w-full border border-gray-300 bg-white px-3 py-2">{(["OTHER_IN", "OWNER_WITHDRAWAL", "BANK_DEPOSIT", "MOBILE_DEPOSIT", ...(snapshot.epoch.mode === "HANDOVER" ? ["SHIFT_HANDOVER"] : [])] as MovementKind[]).map((value) => <option key={value} value={value}>{labels[value]}</option>)}</select></label>{kind === "SHIFT_HANDOVER" && <label className="text-sm">{sw ? "Shift iliyofungwa" : "Closed shift"}<select value={shiftId} onChange={(event) => setShiftId(event.target.value)} className="mt-1 block w-full border border-gray-300 bg-white px-3 py-2"><option value="">{sw ? "Chagua shift" : "Select shift"}</option>{shifts?.sessions.map((shift) => <option key={shift.id} value={shift.id}>{shift.openedByName} · {dateTime(shift.closedAt, sw)} · {formatTZS(shift.countedCash)}{shift.cashTransferredOut > 0 ? ` · ${sw ? "imehamishwa" : "transferred"} ${formatTZS(shift.cashTransferredOut)}` : ""}{shift.previousHandoverId ? (sw ? " · handover itarekebishwa" : " · handover replacement") : ""}</option>)}</select>{shifts && shifts.pagination.totalPages > 1 && <span className="mt-2 flex gap-2"><button type="button" disabled={shiftPage <= 1} onClick={() => { setShiftId(""); setShiftPage(shiftPage - 1); }} aria-label={sw ? "Shift zilizopita" : "Previous shifts"}><ChevronLeft /></button><span>{shiftPage} / {shifts.pagination.totalPages}</span><button type="button" disabled={shiftPage >= shifts.pagination.totalPages} onClick={() => { setShiftId(""); setShiftPage(shiftPage + 1); }} aria-label={sw ? "Shift zinazofuata" : "Next shifts"}><ChevronRight /></button></span>}</label>}<label className="text-sm">{sw ? "Kiasi (TZS)" : "Amount (TZS)"}<CurrencyInput value={amount} onChange={setAmount} className="mt-1 block w-full border border-gray-300 px-3 py-2" /></label><label className="text-sm">{sw ? "Maelezo / mahali fedha zilipopelekwa" : "Note / destination"}<input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} className="mt-1 block w-full border border-gray-300 px-3 py-2" /></label><button type="button" disabled={!amount || Number(amount) <= 0 || (kind === "SHIFT_HANDOVER" && !shiftId)} onClick={() => { const selected = shifts?.sessions.find((shift) => shift.id === shiftId); submit("/cash-holding/movements", { kind, amount: Number(amount), note: note.trim() || null, ...(kind === "SHIFT_HANDOVER" ? { cashSessionId: shiftId, ...(selected?.previousHandoverId ? { replacesMovementId: selected.previousHandoverId } : {}) } : {}) }); }} className="bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2">{sw ? "Hifadhi rekodi" : "Save movement"}</button></fieldset></section>}
        <section><h2 className="font-semibold">{sw ? "Historia ya fedha" : "Cash movement history"}</h2>{snapshot.movements.length === 0 ? <p className="mt-3 text-sm text-gray-500">{sw ? "Hakuna rekodi bado." : "No movements recorded yet."}</p> : <ul className="mt-2 divide-y divide-gray-200">{snapshot.movements.map((item) => <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm"><div><p className="font-semibold">{labels[item.kind] || item.kind}</p><p className="text-gray-600">{item.sourceType ? `${item.sourceType.replaceAll("_", " ")} · ` : ""}{item.relatedSourceType ? `${sw ? "Marekebisho ya" : "Correction of"} ${item.relatedSourceType.replaceAll("_", " ")} · ` : ""}{dateTime(item.createdAt, sw)}{item.note ? ` · ${item.note}` : ""}{item.reversal ? (sw ? " · Imerekebishwa" : " · Reversed") : ""}</p></div><span className="font-semibold">{item.amount > 0 ? "+" : "−"}{formatTZS(Math.abs(item.amount))}</span>{item.epochId === snapshot.epoch?.id && item.kind !== "REVERSAL" && item.kind !== "SOURCE_EVENT" && !item.reversal && <button type="button" disabled={busy || Boolean(pending)} onClick={() => { const reason = window.prompt(sw ? "Sababu ya kurekebisha:" : "Reason for reversal:"); if (reason?.trim()) submit("/cash-holding/movements", { kind: "REVERSAL", reversesMovementId: item.id, note: reason.trim() }); }} className="text-sm font-semibold text-red-700 underline disabled:opacity-50">{sw ? "Rekebisha" : "Reverse"}</button>}</li>)}</ul>}{snapshot.pagination.totalPages > 1 && <div className="mt-4 flex items-center gap-3"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label={sw ? "Ukurasa uliopita" : "Previous page"}><ChevronLeft /></button><span>{page} / {snapshot.pagination.totalPages}</span><button type="button" disabled={page >= snapshot.pagination.totalPages} onClick={() => setPage(page + 1)} aria-label={sw ? "Ukurasa unaofuata" : "Next page"}><ChevronRight /></button></div>}</section>
      </>}
      {!snapshot && error && <Link href="/dashboard" className="inline-block text-sm font-semibold text-brand-700 underline">{sw ? "Rudi kwenye muhtasari" : "Back to overview"}</Link>}
    </>}
  </main></AppShell>;
}
