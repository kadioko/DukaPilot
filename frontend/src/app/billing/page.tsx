"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { api, formatTZS } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { CheckCircle2, MessageCircle, ReceiptText, Send, Smartphone } from "lucide-react";

interface SubscriptionStatus {
  plan: string;
  isActive: boolean;
  status: string;
  trialActive?: boolean;
  subActive?: boolean;
  daysLeft: number | null;
  trialEndsAt?: string | null;
  subscriptionEndsAt?: string | null;
}

const plans = [
  { id: "BASIC", amount: 15000, label: "Basic" },
  { id: "PRO", amount: 35000, label: "Pro" },
];

export default function BillingPage() {
  const lang = useLang();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [plan, setPlan] = useState("BASIC");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const selectedPlan = plans.find((item) => item.id === plan) || plans[0];
  const subscriptionActive = Boolean(status?.isActive && (status?.trialActive || status?.subActive || status?.status === "active"));

  useEffect(() => {
    api.get<SubscriptionStatus>("/subscription/status", lang).then(setStatus).catch(() => null);
  }, [lang]);

  async function submitReference(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    if (!reference.trim()) {
      setMessage(lang === "sw" ? "Weka namba ya muamala wa M-Pesa." : "Enter the M-Pesa transaction reference.");
      return;
    }
    await api.post("/reports", {
      type: "BILLING",
      priority: "HIGH",
      title: `Subscription payment ${plan} ${reference.trim()}`,
      description: `Plan: ${plan}\nAmount: ${formatTZS(selectedPlan.amount)}\nReference: ${reference.trim()}\nNote: ${note.trim() || "-"}`,
    }, lang);
    setReference("");
    setNote("");
    setMessage(lang === "sw" ? "Tumepokea reference. Admin atahakiki na kuactivate mpango." : "Reference received. Admin will verify and activate the plan.");
  }

  const waText = encodeURIComponent(`DukaPilot payment\nPlan: ${plan}\nAmount: ${formatTZS(selectedPlan.amount)}\nReference: ${reference || "(nitaweka baada ya kulipa)"}`);

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-5 pb-24 lg:pb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-950">{lang === "sw" ? "Malipo na usajili" : "Billing and subscription"}</h1>
          <p className="mt-1 text-sm leading-6 text-gray-600">
            {lang === "sw"
              ? "Lipia kwa M-Pesa, weka reference, kisha admin atahakiki na kuactivate mpango wako."
              : "Pay by M-Pesa, submit the reference, and an admin will verify and activate your plan."}
          </p>
        </div>

        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{lang === "sw" ? "Mpango" : "Plan"}</p>
            <p className="mt-1 text-lg font-bold text-gray-950">{status?.plan || "FREE_TRIAL"}</p>
            <p className="text-xs text-gray-500">{status?.status || "checking"}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{lang === "sw" ? "Hali" : "Status"}</p>
            <p className={`mt-1 text-lg font-bold ${subscriptionActive ? "text-green-700" : "text-red-700"}`}>
              {subscriptionActive ? (lang === "sw" ? "Active" : "Active") : (lang === "sw" ? "Inahitaji malipo" : "Payment needed")}
            </p>
            <p className="text-xs text-gray-500">{status?.daysLeft !== null && status?.daysLeft !== undefined ? `${status.daysLeft} days left` : "-"}</p>
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <MessageCircle className="h-5 w-5 text-green-700" />
            <p className="mt-2 text-sm font-semibold text-green-950">WhatsApp +255 743 910 580</p>
            <a href={`https://wa.me/255743910580?text=${waText}`} className="mt-2 inline-flex text-sm font-bold text-green-800 hover:text-green-950">
              {lang === "sw" ? "Tuma ujumbe" : "Send message"}
            </a>
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <Smartphone className="mt-0.5 h-5 w-5 text-brand-700" />
            <div>
              <h2 className="font-semibold text-gray-950">{lang === "sw" ? "Maelekezo ya M-Pesa" : "M-Pesa instructions"}</h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                {lang === "sw"
                  ? "Tuma malipo kwa +255 743 910 580, jina DukaPilot. Baada ya kutuma, weka namba ya muamala hapa chini au tuma WhatsApp."
                  : "Send payment to +255 743 910 580, name DukaPilot. After paying, enter the transaction reference below or send it on WhatsApp."}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {plans.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPlan(item.id)}
                    className={`rounded-lg border p-3 text-left text-sm ${plan === item.id ? "border-brand-500 bg-brand-50" : "border-gray-200 bg-white"}`}
                  >
                    <span className="font-bold text-gray-950">{item.label}</span>
                    <span className="ml-2 text-gray-600">{formatTZS(item.amount)}/month</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <form onSubmit={submitReference} className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-brand-700" />
            <h2 className="font-semibold text-gray-950">{lang === "sw" ? "Weka payment reference" : "Submit payment reference"}</h2>
          </div>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={lang === "sw" ? "Mfano: QF123ABC45" : "Example: QF123ABC45"}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={lang === "sw" ? "Maelezo ya ziada, hiari" : "Extra note, optional"}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {message && (
            <p className={`rounded-lg px-3 py-2 text-sm ${message.includes("received") || message.includes("Tumepokea") ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
              {message}
            </p>
          )}
          <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700">
            <Send className="h-4 w-4" />
            {lang === "sw" ? "Tuma kwa admin" : "Send to admin"}
          </button>
        </form>

        <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
          <div className="flex gap-2">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <p>
              {lang === "sw"
                ? "Admin ataona ombi hili kwenye Reports, atalinganisha reference ya M-Pesa, kisha ataweka Paid Basic/Pro kwenye Admin > Subscriptions."
                : "Admin sees this request in Reports, matches the M-Pesa reference, then marks Paid Basic/Pro in Admin > Subscriptions."}
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
