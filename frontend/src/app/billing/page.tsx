"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import NtzsCheckout from "@/components/NtzsCheckout";
import { api, formatTZS } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { Check, CheckCircle2, ClipboardCopy, MessageCircle, ReceiptText, Send, Smartphone } from "lucide-react";

interface SubscriptionStatus {
  extraBranches?: number;
  plan: string;
  isActive: boolean;
  status: string;
  trialActive?: boolean;
  subActive?: boolean;
  daysLeft: number | null;
  trialEndsAt?: string | null;
  subscriptionEndsAt?: string | null;
  reminderStage?: string | null;
  validUntil?: string | null;
}

const plans = [
  { id: "BASIC", amount: 15000, label: "Basic", includes: "Sales, stock, debts, expenses, catalog, 1 staff member" },
  { id: "PRO", amount: 35000, label: "Pro", includes: "Everything in Basic plus unlimited staff and AI priority workflows" },
];

const paymentOptions = [
  {
    id: "MPESA_LIPA",
    title: "M-Pesa Lipa Number",
    value: "52806296",
    name: "Necuva Group Limited",
  },
  {
    id: "MIX_YAS_LIPA",
    title: "Mix by Yas Lipa Number",
    value: "18214626",
    name: "Necuva",
  },
  {
    id: "AZAMPESA_LIPA",
    title: "AzamPesa Lipa Number",
    value: "293726045",
    name: "Necuva Group Limited",
  },
  {
    id: "SELCOM_LIPA",
    title: "Selcom Lipa Number",
    value: "7006 3589",
    name: "Necuva Group Limited",
  },
  {
    id: "SEND_MONEY",
    title: "Send Money",
    value: "0743910580",
    name: "DukaPilot support",
  },
];

interface BillingReport {
  id: string;
  title: string;
  status: string;
  adminNotes?: string | null;
  createdAt: string;
}

export default function BillingPage() {
  const lang = useLang();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [plan, setPlan] = useState("BASIC");
  const [extraBranches, setExtraBranches] = useState(0);
  const [kind, setKind] = useState("RENEWAL");
  const [quote, setQuote] = useState<{ amount: number; monthlyAmount: number } | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [paymentOption, setPaymentOption] = useState(paymentOptions[0].id);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [paymentPath, setPaymentPath] = useState("manual");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [statusError, setStatusError] = useState(false);
  const [reports, setReports] = useState<BillingReport[]>([]);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const selectedPlan = { ...(plans.find((item) => item.id === plan) || plans[0]), amount: quote?.amount ?? 0 };
  const subscriptionActive = Boolean(status?.isActive && (status?.trialActive || status?.subActive || status?.status === "active"));
  const renewalDate = status?.validUntil || status?.subscriptionEndsAt || status?.trialEndsAt;
  const needsReactivation = Boolean(status && !subscriptionActive && (status.status === "expired" || status.status === "suspended" || status.daysLeft === 0));

  async function copyPaymentNumber(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setMessage(lang === "sw" ? `Imeshindikana kunakili. Namba: ${value}` : `Could not copy. Number: ${value}`);
      return;
    }
    setCopiedValue(value);
    window.setTimeout(() => setCopiedValue((current) => current === value ? null : current), 1800);
  }

  useEffect(() => {
    api.get<SubscriptionStatus>("/subscription/status", lang).then((data) => { setStatus(data); if (data.plan === "PRO") { setPlan("PRO"); setExtraBranches(data.extraBranches || 0); } }).catch(() => setStatusError(true));
    api.get<{ reports: BillingReport[] }>("/reports/my?type=BILLING&limit=5", lang).then((data) => setReports(data.reports)).catch(() => null);
  }, [lang]);
  useEffect(() => {
    let active = true;
    setQuote(null); setQuoteError("");
    api.get<{ amount: number; monthlyAmount: number }>(`/subscription/quote?plan=${plan}&extraBranches=${plan === "PRO" ? extraBranches : 0}&kind=${kind}`, lang)
      .then((data) => { if (active) setQuote(data); })
      .catch((error) => { if (active) setQuoteError(error.message); });
    return () => { active = false; };
  }, [plan, extraBranches, kind, lang]);

  async function submitReference(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!quote) return;
    setMessage("");
    if (!reference.trim()) {
      setMessage(lang === "sw" ? "Weka reference au namba ya muamala." : "Enter the payment reference or transaction number.");
      return;
    }
    const selectedPaymentOption = paymentOptions.find((item) => item.id === paymentOption) || paymentOptions[0];
    submittingRef.current = true;
    setSubmitting(true);
    try {
    await api.post("/reports", {
      type: "BILLING",
      priority: "HIGH",
      title: `Subscription payment ${plan} ${reference.trim()}`,
      description: `Plan: ${plan}\nPurpose: ${kind}\nTotal extra branch slots: ${plan === "PRO" ? extraBranches : 0}\nAmount: ${formatTZS(selectedPlan.amount)}\nPayment option: ${selectedPaymentOption.title} ${selectedPaymentOption.value} (${selectedPaymentOption.name})\nReference: ${reference.trim()}\nNote: ${note.trim() || "-"}`,
    }, lang);
    setReference("");
    setNote("");
    const latest = await api.get<{ reports: BillingReport[] }>("/reports/my?type=BILLING&limit=5", lang).catch(() => null);
    if (latest) setReports(latest.reports);
    setMessage(lang === "sw" ? "Tumepokea reference. Admin atahakiki na kuactivate mpango." : "Reference received. Admin will verify and activate the plan.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (lang === "sw" ? "Imeshindikana kutuma. Jaribu tena." : "Could not submit. Please try again."));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const selectedPaymentOption = paymentOptions.find((item) => item.id === paymentOption) || paymentOptions[0];
  const waText = encodeURIComponent(`DukaPilot payment\nPlan: ${plan}\nAmount: ${formatTZS(selectedPlan.amount)}\nPaid via: ${selectedPaymentOption.title} ${selectedPaymentOption.value}\nReference: ${reference || "(nitaweka baada ya kulipa)"}`);
  const reminderCopy: Record<string, string> = {
    DUE_7_DAYS: lang === "sw" ? "Plan yako inaisha ndani ya siku 7. Lipa mapema ili huduma isiingiliwe." : "Your plan ends in 7 days. Pay early to avoid interruption.",
    DUE_3_DAYS: lang === "sw" ? "Plan yako inaisha ndani ya siku 3. Tuma malipo na reference." : "Your plan ends in 3 days. Send payment and submit the reference.",
    DUE_1_DAY: lang === "sw" ? "Plan yako inaisha kesho au leo. Lipa sasa ili duka lisizuiwe." : "Your plan ends today or tomorrow. Pay now to keep the shop active.",
    EXPIRED: lang === "sw" ? "Subscription imeisha. Admin akithibitisha malipo, duka litarudi active." : "Subscription expired. Once admin verifies payment, the shop becomes active again.",
    SUSPENDED: lang === "sw" ? "Duka limesimamishwa. Wasiliana na support ili kulirudisha." : "Shop is suspended. Contact support to reactivate it.",
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-5 pb-24 lg:pb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-950">{lang === "sw" ? "Malipo na usajili" : "Billing and subscription"}</h1>
          <p className="mt-1 text-sm leading-6 text-gray-600">
            {lang === "sw"
              ? "Chagua mpango na njia ya malipo. Huduma huwashwa baada ya malipo kuthibitishwa."
              : "Choose a plan and payment method. Your subscription starts after payment is verified."}
          </p>
        </div>

        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{lang === "sw" ? "Mpango" : "Plan"}</p>
            <p className="mt-1 text-lg font-bold text-gray-950">{status?.plan || (statusError ? "-" : "...")}</p>
            <p className="text-xs text-gray-500">{lang === "sw" ? "Mpango wa sasa" : "Current plan"}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{lang === "sw" ? "Hali" : "Status"}</p>
            <p className={`mt-1 text-lg font-bold ${subscriptionActive ? "text-green-700" : "text-red-700"}`}>
              {!status ? (statusError ? (lang === "sw" ? "Hali haipatikani" : "Status unavailable") : (lang === "sw" ? "Inapakia..." : "Loading...")) : subscriptionActive ? (lang === "sw" ? "Inatumika" : "Active") : status.status === "suspended" ? (lang === "sw" ? "Imesimamishwa" : "Suspended") : (lang === "sw" ? "Imeisha - rejesha" : "Expired - reactivate")}
            </p>
            <p className="text-xs text-gray-500">{status?.daysLeft !== null && status?.daysLeft !== undefined ? `${status.daysLeft} ${lang === "sw" ? "siku zimebaki" : "days left"}` : "-"}</p>
            {renewalDate && <p className="mt-1 text-xs font-medium text-gray-700">{lang === "sw" ? "Tarehe ya kuongeza muda" : "Renew by"}: {new Date(renewalDate).toLocaleDateString(lang === "sw" ? "sw-TZ" : "en-TZ", { day: "numeric", month: "long", year: "numeric" })}</p>}
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <MessageCircle className="h-5 w-5 text-green-700" />
            <p className="mt-2 text-sm font-semibold text-green-950">WhatsApp +255 743 910 580</p>
            <a href={`https://wa.me/255743910580?text=${waText}`} className="mt-2 inline-flex text-sm font-bold text-green-800 hover:text-green-950">
              {lang === "sw" ? "Tuma ujumbe" : "Send message"}
            </a>
          </div>
        </section>

        {status?.reminderStage && (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            <strong>{lang === "sw" ? "Kumbusho:" : "Reminder:"}</strong> {reminderCopy[status.reminderStage] || status.reminderStage}
          </section>
        )}

        {needsReactivation && (
          <section className="rounded-lg border-2 border-red-200 bg-red-50 p-5 text-sm leading-6 text-red-950">
            <h2 className="font-bold">{lang === "sw" ? "Rejesha huduma ya duka lako" : "Reactivate your shop"}</h2>
            <p className="mt-1">{lang === "sw" ? "Usajili umeisha, hivyo mauzo mapya, stock na matumizi vimesimamishwa hadi malipo yahakikiwe. Data yako bado ipo salama na unaweza kuiona." : "The subscription has ended, so new sales, stock changes, and expenses are paused until payment is verified. Your data is still safe and available to view."}</p>
            <ol className="mt-3 list-decimal space-y-1 pl-5">
              {paymentPath === "ntzs" ? <>
                <li>{lang === "sw" ? "Chagua Basic au Pro na uhakiki kiasi kinachoonyeshwa." : "Choose Basic or Pro and verify the displayed amount."}</li>
                <li>{lang === "sw" ? "Weka namba ya mobile money, tuma ombi, kisha thibitisha kwenye simu yako." : "Enter your mobile-money number, send the request, and approve it on your phone."}</li>
                <li>{lang === "sw" ? "nTZS ikithibitisha malipo, DukaPilot itawasha mpango moja kwa moja; hakuna reference ya kutuma kwa admin." : "After nTZS confirms payment, DukaPilot activates the plan automatically; no reference needs to be sent to an admin."}</li>
              </> : <>
                <li>{lang === "sw" ? "Chagua Basic au Pro, kisha lipa kwa namba rasmi hapa chini." : "Choose Basic or Pro, then pay using an official number below."}</li>
                <li>{lang === "sw" ? "Weka reference ya muamala kwenye fomu ya malipo." : "Enter the transaction reference in the payment form."}</li>
                <li>{lang === "sw" ? "Admin akithibitisha, duka litarudi active na utaendelea kutumia vipengele vyako." : "Once an admin verifies it, the shop becomes active and you can continue using its features."}</li>
              </>}
            </ol>
          </section>
        )}

        <fieldset className="border-y border-gray-200 py-4">
          <legend className="text-sm font-semibold">{lang === "sw" ? "Chagua njia ya malipo" : "Choose payment method"}</legend>
          <div className="flex flex-wrap gap-5">
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="paymentPath" checked={paymentPath === "manual"} onChange={() => setPaymentPath("manual")} />{lang === "sw" ? "1. Lipa namba / Tuma pesa" : "1. Lipa number / Send money"}</label>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="paymentPath" checked={paymentPath === "ntzs"} onChange={() => setPaymentPath("ntzs")} />2. nTZS online</label>
          </div>
        </fieldset>

        <fieldset className="flex flex-wrap gap-4 border-b border-gray-200 pb-4">
          <legend className="mb-2 text-sm font-semibold">{lang === "sw" ? "Chagua mpango" : "Select plan"}</legend>
          {plans.map((item) => <label key={item.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="plan" checked={plan === item.id} onChange={() => { setPlan(item.id); setKind("RENEWAL"); }} />{item.label} {formatTZS(item.amount)} / {lang === "sw" ? "mwezi" : "month"}</label>)}
        </fieldset>
        {plan === "PRO" && <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">{lang === "sw" ? "Matawi ya ziada juu ya 4 yaliyojumuishwa" : "Extra branches beyond the 4 included"}<input type="number" min={0} max={100} value={extraBranches} onChange={(e) => setExtraBranches(Number(e.target.value))} className="rounded-lg border p-3" /></label>
          <label className="grid gap-1 text-sm">{lang === "sw" ? "Aina ya malipo" : "Payment purpose"}<select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-lg border p-3"><option value="RENEWAL">{lang === "sw" ? "Ongeza muda wa mwezi mmoja" : "Renew for one month"}</option><option value="BRANCH_ADDON">{lang === "sw" ? "Ongeza matawi hadi usajili uishe" : "Add branches until current expiry"}</option></select></label>
        </div>}
        {quoteError ? <p role="alert" className="text-sm text-red-700">{quoteError}</p> : <p className="font-semibold">{lang === "sw" ? "Kiasi cha kulipa" : "Amount to pay"}: {quote ? formatTZS(quote.amount) : "..."}</p>}
        {kind === "BRANCH_ADDON" && <p className="text-sm text-gray-600">{lang === "sw" ? "TZS 10,000 kwa tawi kwa siku 30, kulingana na muda uliobaki. Tarehe ya usajili haibadiliki." : "TZS 10,000 per branch per 30 days, prorated for the remaining time. Your renewal date stays the same."}</p>}
        {paymentPath === "ntzs" && <NtzsCheckout plan={plan} extraBranches={plan === "PRO" ? extraBranches : 0} kind={kind} amount={quote?.amount} lang={lang} onConfirmed={() => { api.get<SubscriptionStatus>("/subscription/status", lang).then(setStatus).catch(() => setStatusError(true)); }} />}

        {paymentPath === "manual" && <>

        <section className="border-b border-gray-200 py-5">
          <div className="flex items-start gap-3">
            <Smartphone className="mt-0.5 h-5 w-5 text-brand-700" />
            <div>
              <h2 className="font-semibold text-gray-950">{lang === "sw" ? "Njia rasmi za kulipa" : "Official payment options"}</h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                {lang === "sw"
                  ? "Chagua mtandao wako. Hakikisha jina la mpokeaji kabla ya kulipa, kisha tuma namba ya kumbukumbu hapa chini."
                  : "Choose your network. Confirm the recipient name before paying, then submit the transaction reference below."}
              </p>
              <div className="mt-3 grid gap-2">
                {paymentOptions.map((option, index) => (
                  <div key={option.id} className={`flex items-center gap-2 rounded-lg border p-2 ${paymentOption === option.id ? "border-green-500 bg-green-50" : "border-gray-200 bg-white"}`}>
                    <label className="min-w-0 flex-1 cursor-pointer p-1 text-left text-sm">
                      <input type="radio" name="paymentNetwork" checked={paymentOption === option.id} onChange={() => setPaymentOption(option.id)} className="mr-2" />
                      <span className="text-xs font-bold uppercase tracking-wide text-gray-400">{index + 1}</span>
                      <span className="ml-2 font-bold text-gray-950">{option.title}</span>
                      <span className="mt-1 block text-lg font-black text-gray-950">{option.value}</span>
                      <span className="block text-xs leading-5 text-gray-500">{lang === "sw" ? "Jina" : "Name"}: {option.name}</span>
                    </label>
                    <button type="button" onClick={() => copyPaymentNumber(option.value)} aria-label={`${lang === "sw" ? "Nakili" : "Copy"} ${option.value}`} title={lang === "sw" ? "Nakili namba" : "Copy number"} className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:text-brand-700">
                      {copiedValue === option.value ? <Check className="h-4 w-4 text-green-700" /> : <ClipboardCopy className="h-4 w-4" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <form onSubmit={submitReference} className="py-5 space-y-3">
          <div className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-brand-700" />
            <h2 className="font-semibold text-gray-950">{lang === "sw" ? "Weka payment reference" : "Submit payment reference"}</h2>
          </div>
          <p className="text-sm font-semibold">{selectedPlan.label}: {formatTZS(selectedPlan.amount)} / {lang === "sw" ? "mwezi" : "month"}</p>
          <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-950">
            <strong>{lang === "sw" ? "Ulichagua" : "Selected"}:</strong> {selectedPaymentOption.title} {selectedPaymentOption.value} - {selectedPaymentOption.name}
          </div>
          <label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Reference ya malipo" : "Payment reference"}</span><input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={lang === "sw" ? "Mfano: QF123ABC45" : "Example: QF123ABC45"} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" /></label>
          <label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Maelezo ya ziada (hiari)" : "Extra note (optional)"}</span><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={lang === "sw" ? "Maelezo ya ziada, hiari" : "Extra note, optional"} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" /></label>
          {message && (
            <p className={`rounded-lg px-3 py-2 text-sm ${message.includes("received") || message.includes("Tumepokea") ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
              {message}
            </p>
          )}
          <button type="submit" disabled={submitting || !quote} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50">
            <Send className="h-4 w-4" />
            {submitting ? (lang === "sw" ? "Inatuma..." : "Submitting...") : (lang === "sw" ? "Tuma kwa admin" : "Send to admin")}
          </button>
        </form>
        </>}

        {reports.length > 0 && (
          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-950">{lang === "sw" ? "Maombi ya malipo" : "Payment requests"}</h2>
            <div className="mt-3 grid gap-2">
              {reports.map((report) => (
                <div key={report.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-gray-900">{report.title}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      report.status === "RESOLVED" ? "bg-green-100 text-green-700" :
                      report.status === "REJECTED" ? "bg-red-100 text-red-700" :
                      "bg-amber-100 text-amber-700"
                    }`}>{report.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{new Date(report.createdAt).toLocaleString()}</p>
                  {report.adminNotes && <p className="mt-1 text-xs text-gray-600">{report.adminNotes}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
          <div className="flex gap-2">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <p>
              {lang === "sw"
                ? "Baada ya kuthibitisha malipo yako, tutawasha mpango uliochagua."
                : "After verifying your payment, we will activate your selected plan."}
            </p>
          </div>
        </section>

        <Link href="/pricing" className="inline-flex text-sm font-semibold text-brand-700 hover:text-brand-900">
          {lang === "sw" ? "Angalia bei zote" : "View all pricing"}
        </Link>
      </div>
    </AppShell>
  );
}
