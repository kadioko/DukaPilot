"use client";

import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Clock3, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { api, formatTZS, getCurrentSession } from "@/lib/api";
import { useLang } from "@/lib/i18n";

type WalletTransaction = {
  id: string;
  kind: "DEPOSIT" | "WITHDRAWAL" | "ADJUSTMENT" | "SUBSCRIPTION";
  status: string;
  amountTzs: number;
  platformFeeTzs: number;
  providerFeeTzs: number;
  totalDebitTzs: number;
  recipientPhone?: string | null;
  recipientName?: string | null;
  payoutRail?: string | null;
  providerInstruction?: string | null;
  providerStatus?: string | null;
  failureReason?: string | null;
  canResume?: boolean;
  createdAt: string;
  completedAt?: string | null;
  reversedAt?: string | null;
};

type WalletResponse = {
  config: { enabled: boolean; feeBps: number; minimumWithdrawalTzs: number };
  wallet: { balanceTzs: number; pendingDepositTzs: number; pendingWithdrawalTzs: number };
  transactions: WalletTransaction[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

type WithdrawalQuote = {
  amountTzs: number;
  availableBalanceTzs: number;
  canWithdraw: boolean;
  platformFeeTzs: number;
  providerFeeTzs: number;
  totalDebitTzs: number;
  recipientName?: string | null;
  payoutRail?: string | null;
  quoteExpiresAt?: string | null;
};

function moneyInput(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits).toLocaleString("en-TZ") : "";
}

function amountOf(value: string) {
  return Number(value.replace(/\D/g, "")) || 0;
}

function dateOf(value: string, lang: "sw" | "en") {
  return new Date(value).toLocaleString(lang === "sw" ? "sw-TZ" : "en-TZ", { dateStyle: "medium", timeStyle: "short" });
}

function statusTone(status: string) {
  if (status === "COMPLETED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "PENDING" || status === "REVIEW") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-red-200 bg-red-50 text-red-800";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function isFailedStatus(status: string) {
  return ["FAILED", "REVERSED", "CANCELLED"].includes(status);
}

export default function WalletPage() {
  const lang = useLang();
  const sw = lang === "sw";
  const [data, setData] = useState<WalletResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositPhone, setDepositPhone] = useState("");
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [withdrawalPhone, setWithdrawalPhone] = useState("");
  const [withdrawalQuote, setWithdrawalQuote] = useState<WithdrawalQuote | null>(null);
  const [withdrawalConfirmed, setWithdrawalConfirmed] = useState(false);
  const [saving, setSaving] = useState<"deposit" | "quote" | "withdrawal" | string | null>(null);
  const [depositRequestKey, setDepositRequestKey] = useState<string | null>(null);
  const [withdrawalRequestKey, setWithdrawalRequestKey] = useState<string | null>(null);

  async function load(nextPage = page) {
    setLoading(true);
    setError("");
    try {
      const result = await api.get<WalletResponse>(`/wallet?page=${nextPage}&limit=12`, lang);
      setData(result);
    } catch (requestError) {
      setError(errorMessage(requestError, sw ? "Imeshindikana kufungua salio la duka." : "Could not load your merchant balance."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(page); }, [lang, page]);
  useEffect(() => {
    void getCurrentSession<{ user?: { phone?: string } }>().then((session) => {
      const phone = session.user?.phone;
      if (phone) {
        setDepositPhone((current) => current || phone);
        setWithdrawalPhone((current) => current || phone);
      }
    }).catch(() => null);
  }, []);

  async function submitDeposit(event: React.FormEvent) {
    event.preventDefault();
    const amountTzs = amountOf(depositAmount);
    if (!amountTzs || !depositPhone.trim()) {
      setNotice(sw ? "Weka kiasi na namba ya simu ya kulipia." : "Enter an amount and the mobile-money phone number.");
      return;
    }
    const requestKey = depositRequestKey || crypto.randomUUID();
    setDepositRequestKey(requestKey);
    setSaving("deposit");
    setNotice("");
    try {
      const result = await api.post<{ transaction: WalletTransaction; reused: boolean }>("/wallet/deposits", { amountTzs, phone: depositPhone, requestKey }, lang);
      setNotice(result.transaction.status === "COMPLETED"
        ? (sw ? "Amana imeongezwa kwenye salio lako." : "Your deposit has been added to the balance.")
        : isFailedStatus(result.transaction.status)
          ? (result.transaction.failureReason || (sw ? "Amana haikukamilika. Hakuna salio lililoongezwa." : "The deposit did not complete. No balance was added."))
          : result.transaction.canResume
            ? (sw ? "Mtandao haukuthibitisha ombi. Tumia Kagua kwenye historia ili kuendelea salama bila kutuma ombi mara mbili." : "The provider did not confirm the request. Use Check in the history to resume safely without sending it twice.")
            : (sw ? "Ombi la amana limetumwa. Kamilisha uthibitisho kwenye simu yako; salio litaongezwa baada ya kuthibitishwa." : "Your deposit request was sent. Complete the prompt on your phone; the balance updates after confirmation."));
      setDepositAmount("");
      setDepositOpen(false);
      setDepositRequestKey(null);
      await load(1);
      setPage(1);
    } catch (requestError) {
      setNotice(errorMessage(requestError, sw ? "Amana haikuanzishwa. Jaribu tena." : "The deposit could not be started. Try again."));
    } finally {
      setSaving(null);
    }
  }

  async function previewWithdrawal() {
    const amountTzs = amountOf(withdrawalAmount);
    if (!amountTzs || !withdrawalPhone.trim()) {
      setNotice(sw ? "Weka kiasi na namba ya kupokea pesa kwanza." : "Enter an amount and receiving number first.");
      return;
    }
    setSaving("quote");
    setNotice("");
    try {
      const result = await api.post<{ quote: WithdrawalQuote }>("/wallet/withdrawals/quote", { amountTzs, phone: withdrawalPhone }, lang);
      setWithdrawalQuote(result.quote);
      setWithdrawalConfirmed(false);
    } catch (requestError) {
      setWithdrawalQuote(null);
      setNotice(errorMessage(requestError, sw ? "Imeshindikana kupata makadirio ya kutoa pesa." : "Could not prepare the withdrawal quote."));
    } finally {
      setSaving(null);
    }
  }

  async function submitWithdrawal(event: React.FormEvent) {
    event.preventDefault();
    const amountTzs = amountOf(withdrawalAmount);
    if (!withdrawalQuote || !withdrawalConfirmed) {
      setNotice(sw ? "Pata makadirio, kisha thibitisha jumla ya makato." : "Preview the fees and confirm the total deduction first.");
      return;
    }
    const requestKey = withdrawalRequestKey || crypto.randomUUID();
    setWithdrawalRequestKey(requestKey);
    setSaving("withdrawal");
    setNotice("");
    try {
      const result = await api.post<{ transaction: WalletTransaction }>("/wallet/withdrawals", { amountTzs, phone: withdrawalPhone, requestKey, confirmedQuote: { providerFeeTzs: withdrawalQuote.providerFeeTzs, totalDebitTzs: withdrawalQuote.totalDebitTzs, recipientName: withdrawalQuote.recipientName || null, payoutRail: withdrawalQuote.payoutRail || null } }, lang);
      setNotice(result.transaction.status === "COMPLETED"
        ? (sw ? "Utoaji umekamilika." : "The withdrawal is complete.")
        : isFailedStatus(result.transaction.status)
          ? (result.transaction.failureReason || (sw ? "Utoaji haukukamilika. Kiasi kilichohifadhiwa kimerudishwa kwenye salio." : "The withdrawal did not complete. The reserved amount was returned to the balance."))
          : result.transaction.canResume
            ? (sw ? "Mtandao haukuthibitisha ombi. Tumia Kagua kwenye historia ili kuendelea salama bila kulipa mara mbili." : "The provider did not confirm the request. Use Check in the history to resume safely without paying twice.")
            : (sw ? "Utoaji unasubiri uthibitisho wa mtandao. Salio limehifadhiwa ili lisitolewe mara mbili." : "The withdrawal is awaiting provider confirmation. The balance is reserved so it cannot be paid twice."));
      setWithdrawalAmount("");
      setWithdrawalQuote(null);
      setWithdrawalConfirmed(false);
      setWithdrawalOpen(false);
      setWithdrawalRequestKey(null);
      await load(1);
      setPage(1);
    } catch (requestError) {
      setNotice(errorMessage(requestError, sw ? "Utoaji haukuanzishwa. Jaribu tena." : "The withdrawal could not be started. Try again."));
    } finally {
      setSaving(null);
    }
  }

  async function checkTransaction(transaction: WalletTransaction) {
    setSaving(transaction.id);
    setNotice("");
    try {
      const result = await api.post<{ transaction: WalletTransaction }>(`/wallet/transactions/${transaction.id}/check`, {}, lang);
      setNotice(result.transaction.status === "COMPLETED"
        ? (sw ? "Hali ya muamala imesasishwa." : "The transaction status is updated.")
        : isFailedStatus(result.transaction.status)
          ? (result.transaction.failureReason || (sw ? "Muamala haukukamilika." : "The transaction did not complete."))
          : result.transaction.canResume
            ? (sw ? "Ombi la awali linaweza kuendelea salama kwa namba ileile ya uthibitisho." : "The original request can be resumed safely with the same verification key.")
            : (sw ? "Muamala bado unasubiri uthibitisho wa mtandao." : "The transaction is still awaiting provider confirmation."));
      await load(page);
    } catch (requestError) {
      setNotice(errorMessage(requestError, sw ? "Imeshindikana kukagua muamala." : "Could not check the transaction."));
    } finally {
      setSaving(null);
    }
  }

  const wallet = data?.wallet || { balanceTzs: 0, pendingDepositTzs: 0, pendingWithdrawalTzs: 0 };
  const enabled = Boolean(data?.config.enabled);

  return <AppShell>
    <div className="mx-auto max-w-5xl space-y-5 pb-24 lg:pb-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-brand-700"><WalletCards className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-wide">DukaPilot</span></div>
          <h1 className="mt-1 text-xl font-bold text-gray-950">{sw ? "Salio la Duka" : "Merchant Balance"}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-600">{sw ? "Weka pesa, lipia usajili wa DukaPilot, au toa pesa kwa simu. Salio hili ni tofauti na mauzo, matumizi, na Funga Siku." : "Deposit money, pay for DukaPilot subscriptions, or withdraw to a phone. This balance is separate from sales, expenses, and Daily Close."}</p>
        </div>
        <button type="button" onClick={() => void load(page)} disabled={loading} title={sw ? "Sasisha salio" : "Refresh balance"} className="inline-flex h-11 items-center justify-center gap-2 border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 hover:border-brand-400 hover:text-brand-800 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />{sw ? "Sasisha" : "Refresh"}</button>
      </header>

      {error && <div role="alert" className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {notice && <div role="status" className="border border-brand-200 bg-brand-50 px-4 py-3 text-sm leading-6 text-brand-950">{notice}</div>}

      {!enabled && <section className="border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950"><div className="flex gap-3"><Clock3 className="mt-0.5 h-5 w-5 flex-none" /><div><h2 className="font-bold">{sw ? "Salio linaandaliwa" : "Merchant balance is being prepared"}</h2><p className="mt-1">{sw ? "DukaPilot inakamilisha majaribio ya usalama wa amana na utoaji. Mauzo na pesa za cash counter haziathiriki." : "DukaPilot is completing controlled deposit and withdrawal safety checks. Sales and cash-counter records are not affected."}</p></div></div></section>}

      <section className="grid gap-3 md:grid-cols-[1.35fr_1fr_1fr]">
        <article className="border border-brand-200 bg-brand-50 p-5"><p className="text-xs font-bold uppercase tracking-wide text-brand-700">{sw ? "Salio linalopatikana" : "Available balance"}</p><p className="mt-2 text-3xl font-bold text-brand-950">{formatTZS(wallet.balanceTzs)}</p><p className="mt-2 text-xs leading-5 text-brand-800">{sw ? "Pesa zilizohifadhiwa kwa utoaji unaosubiri tayari zimeondolewa hapa." : "Funds reserved for a pending withdrawal are already excluded here."}</p></article>
        <article className="border border-amber-200 bg-amber-50 p-5"><p className="text-xs font-bold uppercase tracking-wide text-amber-700">{sw ? "Amana zinazosubiri" : "Pending deposits"}</p><p className="mt-2 text-2xl font-bold text-amber-950">{formatTZS(wallet.pendingDepositTzs)}</p><p className="mt-2 text-xs text-amber-800">{sw ? "Ongeza salio baada ya mtandao kuthibitisha." : "Added after provider confirmation."}</p></article>
        <article className="border border-sky-200 bg-sky-50 p-5"><p className="text-xs font-bold uppercase tracking-wide text-sky-700">{sw ? "Utoaji unasubiri" : "Pending withdrawals"}</p><p className="mt-2 text-2xl font-bold text-sky-950">{formatTZS(wallet.pendingWithdrawalTzs)}</p><p className="mt-2 text-xs text-sky-800">{sw ? "Hakuna muamala mwingine unaoweza kutumia kiasi hiki." : "This amount cannot be spent twice."}</p></article>
      </section>

      {enabled && <section className="grid gap-4 lg:grid-cols-2">
        <article className="border border-gray-200 bg-white p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-bold text-gray-950">{sw ? "Weka pesa" : "Deposit money"}</h2><p className="mt-1 text-sm leading-6 text-gray-600">{sw ? "Tuma ombi la mobile money kwa namba yako. Salio huongezwa baada ya malipo kuthibitishwa." : "Send a mobile-money prompt to your number. The balance updates only after payment is confirmed."}</p></div><ArrowDownToLine className="h-5 w-5 text-emerald-700" /></div><button type="button" onClick={() => { setDepositOpen((current) => !current); setWithdrawalOpen(false); }} className="mt-4 inline-flex min-h-11 items-center gap-2 bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800">{depositOpen ? (sw ? "Funga" : "Close") : (sw ? "Weka pesa" : "Make deposit")}</button>
          {depositOpen && <form onSubmit={submitDeposit} className="mt-4 grid gap-3 border-t border-gray-100 pt-4"><label className="grid gap-1 text-sm font-semibold text-gray-700"><span>{sw ? "Kiasi (TZS)" : "Amount (TZS)"}</span><input value={moneyInput(depositAmount)} inputMode="numeric" onChange={(event) => setDepositAmount(event.target.value.replace(/\D/g, ""))} placeholder="10,000" className="min-h-11 border border-gray-300 bg-white px-3 text-base text-gray-950 outline-none focus:border-brand-600" /></label><label className="grid gap-1 text-sm font-semibold text-gray-700"><span>{sw ? "Namba ya simu ya kulipia" : "Mobile-money phone"}</span><input value={depositPhone} inputMode="tel" onChange={(event) => setDepositPhone(event.target.value)} placeholder="+255 7..." className="min-h-11 border border-gray-300 bg-white px-3 text-base text-gray-950 outline-none focus:border-brand-600" /></label><button disabled={saving === "deposit"} className="inline-flex min-h-11 items-center justify-center gap-2 bg-brand-700 px-4 text-sm font-bold text-white hover:bg-brand-800 disabled:opacity-50">{saving === "deposit" ? (sw ? "Inatuma..." : "Sending...") : (sw ? "Tuma ombi la malipo" : "Send payment prompt")}</button></form>}
        </article>

        <article className="border border-gray-200 bg-white p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-bold text-gray-950">{sw ? "Toa pesa" : "Withdraw money"}</h2><p className="mt-1 text-sm leading-6 text-gray-600">{sw ? `Utaona makato ya DukaPilot (${(data?.config.feeBps || 0) / 100}%) na ya mtandao kabla ya kuthibitisha.` : `See the DukaPilot fee (${(data?.config.feeBps || 0) / 100}%) and provider fee before you confirm.`}</p></div><ArrowUpFromLine className="h-5 w-5 text-sky-700" /></div><button type="button" onClick={() => { setWithdrawalOpen((current) => !current); setDepositOpen(false); }} className="mt-4 inline-flex min-h-11 items-center gap-2 bg-sky-700 px-4 text-sm font-bold text-white hover:bg-sky-800">{withdrawalOpen ? (sw ? "Funga" : "Close") : (sw ? "Toa pesa" : "Withdraw")}</button>
          {withdrawalOpen && <form onSubmit={submitWithdrawal} className="mt-4 grid gap-3 border-t border-gray-100 pt-4"><label className="grid gap-1 text-sm font-semibold text-gray-700"><span>{sw ? "Kiasi unachotaka kupokea (TZS)" : "Amount to receive (TZS)"}</span><input value={moneyInput(withdrawalAmount)} inputMode="numeric" onChange={(event) => { setWithdrawalAmount(event.target.value.replace(/\D/g, "")); setWithdrawalQuote(null); setWithdrawalConfirmed(false); }} placeholder={String(data?.config.minimumWithdrawalTzs || 5000)} className="min-h-11 border border-gray-300 bg-white px-3 text-base text-gray-950 outline-none focus:border-brand-600" /></label><label className="grid gap-1 text-sm font-semibold text-gray-700"><span>{sw ? "Namba ya kupokea pesa" : "Receiving phone"}</span><input value={withdrawalPhone} inputMode="tel" onChange={(event) => { setWithdrawalPhone(event.target.value); setWithdrawalQuote(null); setWithdrawalConfirmed(false); }} placeholder="+255 7..." className="min-h-11 border border-gray-300 bg-white px-3 text-base text-gray-950 outline-none focus:border-brand-600" /></label><button type="button" onClick={() => void previewWithdrawal()} disabled={saving === "quote"} className="inline-flex min-h-11 items-center justify-center gap-2 border border-sky-700 bg-white px-4 text-sm font-bold text-sky-800 hover:bg-sky-50 disabled:opacity-50">{saving === "quote" ? (sw ? "Inakokotoa..." : "Calculating...") : (sw ? "Angalia makato" : "Preview fees")}</button>
            {withdrawalQuote && <div className={`border p-4 text-sm ${withdrawalQuote.canWithdraw ? "border-sky-200 bg-sky-50 text-sky-950" : "border-red-200 bg-red-50 text-red-900"}`}><div className="flex justify-between gap-4"><span>{sw ? "Utapokea" : "You receive"}</span><strong>{formatTZS(withdrawalQuote.amountTzs)}</strong></div><div className="mt-2 flex justify-between gap-4"><span>{sw ? "Ada ya DukaPilot" : "DukaPilot fee"}</span><span>{formatTZS(withdrawalQuote.platformFeeTzs)}</span></div><div className="mt-2 flex justify-between gap-4"><span>{sw ? "Ada ya mtandao" : "Provider fee"}</span><span>{formatTZS(withdrawalQuote.providerFeeTzs)}</span></div><div className="mt-3 flex justify-between gap-4 border-t border-current/20 pt-3 font-bold"><span>{sw ? "Jumla itakayokatwa" : "Total deducted"}</span><span>{formatTZS(withdrawalQuote.totalDebitTzs)}</span></div>{withdrawalQuote.recipientName && <p className="mt-3 text-xs">{sw ? "Mpokeaji" : "Recipient"}: {withdrawalQuote.recipientName}</p>}{!withdrawalQuote.canWithdraw && <p className="mt-3 font-semibold">{sw ? "Salio linalopatikana halitoshi kwa jumla hii." : "Your available balance is not enough for this total."}</p>}<label className="mt-4 flex min-h-11 items-start gap-2 text-xs font-semibold"><input type="checkbox" checked={withdrawalConfirmed} onChange={(event) => setWithdrawalConfirmed(event.target.checked)} className="mt-0.5" /><span>{sw ? "Nimekagua kiasi, namba na jumla ya makato." : "I have checked the amount, phone number, and total deduction."}</span></label></div>}
            <button disabled={saving === "withdrawal" || !withdrawalQuote?.canWithdraw || !withdrawalConfirmed} className="inline-flex min-h-11 items-center justify-center gap-2 bg-sky-700 px-4 text-sm font-bold text-white hover:bg-sky-800 disabled:opacity-50">{saving === "withdrawal" ? (sw ? "Inatuma..." : "Sending...") : (sw ? "Thibitisha utoaji" : "Confirm withdrawal")}</button></form>}
        </article>
      </section>}

      <section className="border border-gray-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4"><div><h2 className="font-bold text-gray-950">{sw ? "Historia ya salio" : "Balance history"}</h2><p className="mt-1 text-sm text-gray-600">{sw ? "Kila amana, utoaji, malipo ya usajili na marekebisho hubaki kwenye historia." : "Every deposit, withdrawal, subscription payment, and correction remains in the history."}</p></div><span className="text-xs font-semibold text-gray-500">{data?.pagination.total || 0} {sw ? "miamala" : "transactions"}</span></div>
        {loading ? <div className="p-8 text-center text-sm text-gray-500">{sw ? "Inapakia..." : "Loading..."}</div> : !data?.transactions.length ? <div className="p-8 text-center text-sm text-gray-500">{sw ? "Bado hakuna muamala wa salio." : "No merchant-balance transactions yet."}</div> : <div className="divide-y divide-gray-100">{data.transactions.map((transaction) => <article key={transaction.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-gray-950">{transaction.kind === "DEPOSIT" ? (sw ? "Amana" : "Deposit") : transaction.kind === "WITHDRAWAL" ? (sw ? "Utoaji" : "Withdrawal") : transaction.kind === "SUBSCRIPTION" ? (sw ? "Malipo ya usajili" : "Subscription payment") : (sw ? "Marekebisho" : "Adjustment")}</p><span className={`border px-2 py-0.5 text-[11px] font-bold ${statusTone(transaction.status)}`}>{transaction.status}</span></div><p className="mt-1 text-xs text-gray-500">{dateOf(transaction.createdAt, lang)}{transaction.recipientPhone ? ` · ${transaction.recipientPhone}` : ""}{transaction.payoutRail ? ` · ${transaction.payoutRail}` : ""}</p>{transaction.providerInstruction && <p className="mt-2 max-w-xl text-xs leading-5 text-gray-600">{transaction.providerInstruction}</p>}{transaction.failureReason && <p className="mt-2 max-w-xl text-xs leading-5 text-red-700">{transaction.failureReason}</p>}</div><div className="flex items-center gap-3 sm:text-right"><div><p className={`font-bold ${transaction.kind === "DEPOSIT" ? "text-emerald-700" : "text-gray-950"}`}>{transaction.kind === "DEPOSIT" ? "+" : "-"}{formatTZS(transaction.kind === "DEPOSIT" ? transaction.amountTzs : transaction.totalDebitTzs)}</p>{transaction.kind === "WITHDRAWAL" && <p className="mt-1 text-xs text-gray-500">{sw ? "Kupokea" : "Receive"}: {formatTZS(transaction.amountTzs)}</p>}</div>{["PENDING", "REVIEW"].includes(transaction.status) && <button type="button" onClick={() => void checkTransaction(transaction)} disabled={saving === transaction.id} className="inline-flex h-10 items-center gap-1 border border-gray-300 bg-white px-3 text-xs font-bold text-gray-700 hover:border-brand-400 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${saving === transaction.id ? "animate-spin" : ""}`} />{sw ? "Kagua" : "Check"}</button>}</div></article>)}</div>}
        {(data?.pagination.totalPages || 1) > 1 && <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 text-sm"><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="min-h-10 border border-gray-300 bg-white px-3 font-semibold text-gray-700 disabled:opacity-40">{sw ? "Nyuma" : "Previous"}</button><span className="text-xs text-gray-500">{sw ? "Ukurasa" : "Page"} {page} / {data?.pagination.totalPages}</span><button type="button" onClick={() => setPage((current) => Math.min(data?.pagination.totalPages || current, current + 1))} disabled={page >= (data?.pagination.totalPages || 1)} className="min-h-10 border border-gray-300 bg-white px-3 font-semibold text-gray-700 disabled:opacity-40">{sw ? "Mbele" : "Next"}</button></div>}
      </section>

      <section className="border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-700"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-brand-700" /><div><strong className="text-gray-950">{sw ? "Ulinzi wa salio" : "Balance protection"}</strong><p className="mt-1">{sw ? "DukaPilot huongeza amana baada ya mtandao kuthibitisha. Utoaji huhifadhiwa kwanza ili request inayorudi au mtandao unaochelewa usilipe pesa mara mbili." : "DukaPilot credits a deposit only after provider confirmation. A withdrawal is reserved first so a retry or delayed network response cannot pay the same money twice."}</p></div></div></section>
    </div>
  </AppShell>;
}
