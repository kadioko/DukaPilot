"use client";

import Link from "next/link";
import { CheckCircle2, ExternalLink, Languages, PackagePlus, Settings, Share2, ShoppingCart } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { useLang } from "@/lib/i18n";

const steps = [
  {
    icon: Settings,
    href: "/settings",
    sw: "Kamilisha taarifa za duka",
    en: "Complete shop setup",
    swBody: "Weka jina la duka, eneo, aina ya biashara, lugha na mawasiliano.",
    enBody: "Set shop name, location, business type, language, and contact details.",
  },
  {
    icon: PackagePlus,
    href: "/inventory",
    sw: "Ongeza bidhaa za kwanza",
    en: "Add first products",
    swBody: "Weka bei ya kununua, bei ya kuuza, stock na kiwango cha chini.",
    enBody: "Add buying price, selling price, stock level, and low-stock threshold.",
  },
  {
    icon: ShoppingCart,
    href: "/sales",
    sw: "Rekodi mauzo ya kwanza",
    en: "Record first sale",
    swBody: "Jaribu mauzo ya cash, M-Pesa au credit ili dashboard ianze kusoma biashara.",
    enBody: "Try a cash, M-Pesa, or credit sale so the dashboard starts reading the business.",
  },
  {
    icon: Share2,
    href: "/catalog",
    sw: "Share catalog link",
    en: "Share catalog link",
    swBody: "Tumia catalog kupokea order kutoka kwa wateja bila kuandika kila bidhaa WhatsApp.",
    enBody: "Use the catalog to receive customer orders without typing every product on WhatsApp.",
  },
  {
    icon: Languages,
    href: "/pricing",
    sw: "Chagua mpango na lugha",
    en: "Set pricing and language",
    swBody: "Hakiki mpango unaofaa, kisha tumia Kiswahili au English kwenye app.",
    enBody: "Review the right plan, then run the app in Swahili or English.",
  },
];

export default function OnboardingPage() {
  const lang = useLang();

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-2xl bg-brand-700 p-6 text-white">
          <p className="text-sm font-semibold text-brand-100">DukaPilot</p>
          <h1 className="mt-2 text-2xl font-bold">
            {lang === "sw" ? "Anzisha duka lako kwa hatua 5" : "Set up your shop in 5 steps"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-brand-100">
            {lang === "sw"
              ? "Ukimaliza hatua hizi, DukaPilot itaweza kukuonyesha mauzo, stock, madeni, matumizi na mapendekezo ya AI."
              : "Once these steps are done, DukaPilot can show sales, stock, debts, expenses, and AI recommendations."}
          </p>
        </section>

        <div className="grid gap-3">
          {steps.map((step, index) => (
            <Link
              key={step.href}
              href={step.href}
              className="group flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-brand-300"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <step.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-400">
                  {lang === "sw" ? `Hatua ${index + 1}` : `Step ${index + 1}`}
                </p>
                <h2 className="mt-1 font-semibold text-gray-950">{lang === "sw" ? step.sw : step.en}</h2>
                <p className="mt-1 text-sm leading-6 text-gray-600">{lang === "sw" ? step.swBody : step.enBody}</p>
              </div>
              <ExternalLink className="mt-1 h-4 w-4 text-gray-300 group-hover:text-brand-600" />
            </Link>
          ))}
        </div>

        <section className="rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-700" />
            <p className="text-sm leading-6 text-green-900">
              {lang === "sw"
                ? "Tip: ukiwa na bidhaa na mauzo machache tu, AI Assistant itaanza kutoa ushauri wa kuagiza bidhaa, kufuatilia madeni na kupunguza gharama."
                : "Tip: with just a few products and sales, the AI Assistant starts giving advice on restocking, debt follow-up, and cost control."}
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
