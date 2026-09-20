"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, WalletCards } from "lucide-react";
import { api, formatTZS } from "@/lib/api";
import type { Lang } from "@/lib/i18n";

type WalletOverview = {
  config: { enabled: boolean };
  wallet: { balanceTzs: number };
};

type PaymentResult = {
  balanceTzs: number;
  subscriptionEndsAt?: string | null;
  reused: boolean;
  transaction: { id: string; status: string; amountTzs: number };
};

export default function MerchantBalanceCheckout({
  plan,
  extraBranches = 0,
  kind = "RENEWAL",
  amount,
  lang,
  onConfirmed,
}: {
  plan: string;
  extraBranches?: number;
  kind?: string;
  amount?: number;
  lang: Lang;
  onConfirmed: () => void;
}) {
  const sw = lang === "sw";
  const [overview, setOverview] = useState<WalletOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [paid, setPaid] = useState(false);
  const requestKey = useRef<string | null>(null);

  async function loadBalance() {
    setLoading(true);
    try {
      setOverview(await api.get<WalletOverview>("/wallet?page=1&limit=1", lang));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (sw ? "Imeshindikana kufungua salio." : "Could not load the balance."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadBalance(); }, [lang]);
  useEffect(() => {
    requestKey.current = null;
    setConfirmed(false);
    setMessage("");
    setPaid(false);
  }, [plan, extraBranches, kind, amount]);

  const balance = overview?.wallet.balanceTzs || 0;
  const exactAmount = amount || 0;
  const enough = exactAmount > 0 && balance >= exactAmount;
  const remaining = Math.max(0, balance - exactAmount);
  const shortfall = Math.max(0, exactAmount - balance);

  async function pay() {
    if (!confirmed || !enough || saving || paid) return;
    requestKey.current ||= crypto.randomUUID();
    setSaving(true);
    setMessage("");
    try {
      const result = await api.post<PaymentResult>("/wallet/subscription-payments", {
        requestKey: requestKey.current,
        plan,
        kind,
        extraBranches,
      }, lang);
      setOverview((current) => current ? { ...current, wallet: { ...current.wallet, balanceTzs: result.balanceTzs } } : current);
      setPaid(true);
      setMessage(sw ? "Malipo yamekamilika. Mpango wako umewashwa." : "Payment completed. Your subscription is active.");
      onConfirmed();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (sw ? "Malipo hayajakamilika. Salio halijakatwa." : "Payment did not complete. Your balance was not debited."));
      await loadBalance();
    } finally {
      setSaving(false);
    }
  }

  return <section className="border border-brand-200 bg-brand-50 p-5">
    <div className="flex items-start gap-3">
      <WalletCards className="mt-0.5 h-5 w-5 flex-none text-brand-700" />
      <div className="min-w-0 flex-1">
        <h2 className="font-bold text-gray-950">{sw ? "Lipa kwa Salio la Duka" : "Pay with Merchant Balance"}</h2>
        <p className="mt-1 text-sm leading-6 text-gray-700">{sw ? "Hakuna ombi jipya la mobile money wala ada ya kutoa pesa. Kiasi hukatwa baada tu ya uthibitisho wako hapa." : "No new mobile-money prompt or withdrawal fee applies. The amount is debited only after you confirm here."}</p>
      </div>
    </div>

    {loading ? <p className="mt-4 text-sm text-gray-600">{sw ? "Inapakia salio..." : "Loading balance..."}</p> : !overview?.config.enabled ? <div className="mt-4 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-semibold">{sw ? "Salio la Duka halijawashwa kwa biashara hii bado." : "Merchant Balance is not enabled for this business yet."}</p><Link href="/wallet" className="mt-2 inline-flex font-bold underline">{sw ? "Angalia Salio la Duka" : "Open Merchant Balance"}</Link></div> : <>
      <dl className="mt-4 grid gap-3 border-y border-brand-200 py-4 sm:grid-cols-3">
        <div><dt className="text-xs font-semibold text-gray-600">{sw ? "Salio linalopatikana" : "Available balance"}</dt><dd className="mt-1 font-bold text-gray-950">{formatTZS(balance)}</dd></div>
        <div><dt className="text-xs font-semibold text-gray-600">{sw ? "Kiasi cha mpango" : "Subscription amount"}</dt><dd className="mt-1 font-bold text-gray-950">{exactAmount ? formatTZS(exactAmount) : "..."}</dd></div>
        <div><dt className="text-xs font-semibold text-gray-600">{sw ? "Salio baada ya malipo" : "Balance after payment"}</dt><dd className="mt-1 font-bold text-gray-950">{enough ? formatTZS(remaining) : "-"}</dd></div>
      </dl>

      {!exactAmount ? <p className="mt-4 text-sm text-gray-600">{sw ? "Inakokotoa kiasi cha mpango..." : "Calculating the subscription amount..."}</p> : !enough ? <div className="mt-4 flex items-start gap-2 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 flex-none" /><div><p className="font-semibold">{sw ? `Salio halitoshi. Ongeza ${formatTZS(shortfall)}.` : `Balance is insufficient. Add ${formatTZS(shortfall)}.`}</p><Link href="/wallet" className="mt-2 inline-flex font-bold underline">{sw ? "Ongeza salio" : "Add money"}</Link></div></div> : !paid && <label className="mt-4 flex min-h-11 items-start gap-2 text-sm font-semibold text-gray-800"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" /><span>{sw ? `Nathibitisha kukata ${formatTZS(exactAmount)} kutoka Salio la Duka kwa mpango huu.` : `I confirm the ${formatTZS(exactAmount)} debit from Merchant Balance for this subscription.`}</span></label>}

      {message && <div role="status" className={`mt-4 flex items-start gap-2 border p-3 text-sm ${paid ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}>{paid && <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" />}<span>{message}</span></div>}
      <button type="button" onClick={() => void pay()} disabled={!enough || !confirmed || saving || paid} className="mt-4 inline-flex min-h-11 items-center justify-center bg-brand-700 px-4 text-sm font-bold text-white hover:bg-brand-800 disabled:opacity-50">{saving ? (sw ? "Inalipa..." : "Paying...") : paid ? (sw ? "Imelipwa" : "Paid") : (sw ? `Lipa ${exactAmount ? formatTZS(exactAmount) : ""} kutoka salio` : `Pay ${exactAmount ? formatTZS(exactAmount) : ""} from balance`)}</button>
    </>}
  </section>;
}
