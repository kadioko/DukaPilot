"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, RefreshCw, ShieldCheck, Smartphone, Zap } from "lucide-react";
import { api, formatTZS } from "@/lib/api";
import type { Lang } from "@/lib/i18n";

interface Checkout { id: string; status: string; amount: number; plan: string; kind?: string; extraBranches?: number }
export default function NtzsCheckout({ plan, extraBranches = 0, kind = "RENEWAL", amount, lang, onConfirmed }: { plan: string; extraBranches?: number; kind?: string; amount?: number; lang: Lang; onConfirmed: () => void }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [phone, setPhone] = useState("");
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestKey = useRef<{ key: string; plan: string; phone: string; extraBranches: number; kind: string } | null>(null);
  const inFlight = useRef(false);
  const sw = lang === "sw";
  useEffect(() => {
    let active = true;
    api.get<{ enabled: boolean; prices: Record<string, number>; pending: Checkout | null }>("/subscription/checkout", lang).then((data) => {
      if (!active) return;
      setEnabled(data.enabled); setPrices(data.prices); setCheckout(data.pending);
    }).catch(() => { if (active) setEnabled(false); });
    return () => { active = false; };
  }, [lang]);
  useEffect(() => {
    // A retry key is deliberately tied to one exact commercial request.
    // Changing plan or branch capacity must start a distinct request.
    if (!checkout) requestKey.current = null;
  }, [plan, extraBranches, kind, checkout]);

  async function payOrCheck() {
    if (inFlight.current) return;
    if (!checkout && !requestKey.current && !/^(?:0[67]\d{8}|\+?255[67]\d{8})$/.test(phone.replace(/[\s()-]/g, ""))) {
      setError(sw ? "Weka namba sahihi ya simu ya Tanzania." : "Enter a valid Tanzanian mobile number.");
      return;
    }
    inFlight.current = true; setBusy(true); setError("");
    try {
      requestKey.current ||= { key: crypto.randomUUID(), plan, phone, extraBranches, kind };
      const result = checkout
        ? await api.post<Checkout>(`/subscription/checkout/${checkout.id}/${checkout.status === "REVIEW" ? "retry" : "check"}`, {}, lang)
        : await api.post<Checkout>("/subscription/checkout", { ...requestKey.current, requestKey: requestKey.current.key }, lang);
      setCheckout(result);
      if (result.status === "CONFIRMED") onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : (sw ? "Imeshindikana. Jaribu tena." : "Unable to check payment."));
    } finally { inFlight.current = false; setBusy(false); }
  }

  function startFreshAttempt() {
    setCheckout(null);
    requestKey.current = null;
    setError("");
  }

  return <section className="space-y-4 border border-emerald-200 bg-emerald-50/40 p-4" aria-live="polite">
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 flex-none items-center justify-center bg-emerald-700 text-white"><Zap className="h-5 w-5" /></span>
      <div>
        <h2 className="font-bold text-gray-950">nTZS online</h2>
        <p className="mt-1 text-sm leading-6 text-gray-600">{sw ? "Lipa moja kwa moja kwa mobile money na mpango uwashwe baada ya nTZS kuthibitisha malipo." : "Pay directly by mobile money and activate the plan after nTZS confirms the payment."}</p>
      </div>
    </div>
    {enabled === null ? <p className="text-sm text-gray-600">{sw ? "Inapakia..." : "Loading..."}</p> : !enabled && !checkout ? <p className="border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{sw ? "Malipo ya nTZS hayapatikani kwa sasa. Tumia Lipa namba au Tuma pesa." : "nTZS payments are unavailable right now. Use Lipa number or Send money."}</p> : <>
      <div className="flex flex-wrap items-end justify-between gap-3 border-y border-emerald-200 py-3">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{sw ? "Mpango unaolipia" : "Plan being paid"}</p><p className="mt-1 font-bold text-gray-950">{checkout?.plan || plan}</p></div>
        <div className="text-left sm:text-right"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{sw ? "Kiasi kamili" : "Exact amount"}</p><p className="mt-1 text-lg font-black text-emerald-800">{formatTZS(checkout?.amount ?? amount ?? prices[plan] ?? 0)}</p></div>
      </div>
      {!checkout && <>
        <div className="grid gap-2 text-sm leading-6 text-gray-700 sm:grid-cols-3">
          <p><strong className="block text-gray-950">1. {sw ? "Weka namba" : "Enter phone"}</strong>{sw ? "M-Pesa, Airtel Money, Mix by Yas, HaloPesa au TTCL." : "M-Pesa, Airtel Money, Mix by Yas, HaloPesa, or TTCL."}</p>
          <p><strong className="block text-gray-950">2. {sw ? "Thibitisha kwenye simu" : "Approve on phone"}</strong>{sw ? "Hakiki jina na kiasi kwenye ombi la mtandao." : "Check the name and amount in the network prompt."}</p>
          <p><strong className="block text-gray-950">3. {sw ? "Mpango unawashwa" : "Plan activates"}</strong>{sw ? "Uthibitisho wa nTZS ukifika, usajili unaongezwa moja kwa moja." : "Once nTZS confirms, the subscription updates automatically."}</p>
        </div>
        <label className="grid max-w-sm gap-1 text-sm font-semibold text-gray-800"><span>{sw ? "Namba ya simu ya kulipia" : "Payment phone number"}</span><input type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={(event) => { setPhone(event.target.value); }} placeholder="0712 345 678" className="min-h-11 border border-gray-300 bg-white px-3 text-base outline-none focus:border-emerald-600" disabled={busy || Boolean(requestKey.current)} /></label>
      </>}
      {checkout && <div className={`border p-3 text-sm leading-6 ${checkout.status === "CONFIRMED" ? "border-emerald-300 bg-emerald-100 text-emerald-950" : checkout.status === "FAILED" ? "border-red-200 bg-red-50 text-red-900" : checkout.status === "REVIEW" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-sky-200 bg-sky-50 text-sky-950"}`}><p className="flex items-start gap-2">{checkout.status === "CONFIRMED" ? <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none" /> : <RefreshCw className="mt-0.5 h-5 w-5 flex-none" />}<span>{checkout.status === "CONFIRMED" ? (sw ? "Malipo yamethibitishwa. Mpango wako umewashwa." : "Payment verified. Your subscription is active.") : checkout.status === "FAILED" ? (sw ? "Malipo hayakufanikiwa na mpango haujabadilika. Hakiki salio na namba, kisha jaribu ombi jipya." : "Payment failed and the plan was not changed. Check the balance and phone number, then start a new request.") : checkout.status === "REVIEW" ? (sw ? "Malipo yanahitaji uhakiki. Usilipe tena; tumia Angalia malipo au wasiliana na msaada." : "Payment needs review. Do not pay again; use Check payment or contact support.") : (sw ? "Ombi limetumwa. Thibitisha kwenye simu, kisha bonyeza Angalia malipo. Usitume ombi lingine." : "The request was sent. Approve it on your phone, then select Check payment. Do not send another request.")}</span></p></div>}
      {error && <p role="alert" className="text-sm text-red-700">{error} {sw ? "Usilipe tena ikiwa pesa zimekatwa." : "Do not pay again if money was deducted."}</p>}
      <div className="flex flex-wrap items-center gap-3">
        {(!checkout || !["CONFIRMED", "FAILED"].includes(checkout.status)) && <button type="button" onClick={payOrCheck} disabled={busy || (!checkout && !phone.trim())} className="inline-flex min-h-11 items-center gap-2 bg-emerald-700 px-4 py-2 font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{checkout ? <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> : <Smartphone className="h-4 w-4" />}{busy ? (sw ? "Inachakata..." : "Processing...") : checkout ? (sw ? "Angalia malipo" : "Check payment") : (sw ? "Tuma ombi la malipo" : "Send payment request")}</button>}
        {checkout?.status === "FAILED" && <button type="button" onClick={startFreshAttempt} className="inline-flex min-h-11 items-center gap-2 border border-gray-300 bg-white px-4 py-2 font-bold text-gray-800 hover:border-emerald-500">{sw ? "Jaribu ombi jipya" : "Start a new request"}</button>}
        <p className="flex items-center gap-2 text-xs text-gray-600"><ShieldCheck className="h-4 w-4 flex-none text-emerald-700" />{sw ? "PIN inawekwa kwenye simu yako tu, si DukaPilot." : "Enter your PIN only on your phone, never in DukaPilot."}</p>
      </div>
    </>}
  </section>;
}
