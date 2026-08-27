"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Bot, CircleHelp, FileText, MessageCircle, PackagePlus, Settings, Share2, ShoppingCart, Sparkles, X } from "lucide-react";
import type { Lang } from "@/lib/i18n";

interface QuickStartGuideProps {
  lang: Lang;
}

const steps = [
  {
    href: "/settings",
    icon: Settings,
    en: "Set up your shop",
    sw: "Weka taarifa za duka",
    enBody: "Add your shop name, location, language, and contact details.",
    swBody: "Weka jina la duka, eneo, lugha na mawasiliano.",
  },
  {
    href: "/inventory",
    icon: PackagePlus,
    en: "Add products",
    sw: "Ongeza bidhaa",
    enBody: "Enter stock, buying price, selling price, and low-stock level.",
    swBody: "Weka stock, bei ya kununua, bei ya kuuza na kiwango cha chini.",
  },
  {
    href: "/quotations",
    icon: FileText,
    en: "Create a quotation",
    sw: "Tengeneza nukuu ya bei",
    enBody: "For custom jobs, services, materials, transport, and deposits. Share a secure link, then convert an accepted quote to a sale.",
    swBody: "Kwa kazi maalumu, huduma, vifaa, usafiri na amana. Tuma kiungo salama, kisha badilisha nukuu iliyokubaliwa kuwa mauzo.",
  },
  {
    href: "/sales",
    icon: ShoppingCart,
    en: "Record a sale",
    sw: "Rekodi mauzo",
    enBody: "Choose products, select how the customer paid, then complete the sale.",
    swBody: "Chagua bidhaa, chagua malipo ya mteja, kisha kamilisha mauzo.",
  },
  {
    href: "/assistant",
    icon: Bot,
    en: "Check what to do next",
    sw: "Ona hatua inayofuata",
    enBody: "Use the AI Assistant for restock, debt, and expense priorities.",
    swBody: "Tumia Msaidizi wa AI kwa kipaumbele cha stock, madeni na matumizi.",
  },
  {
    href: "/catalog",
    icon: Share2,
    en: "Share your catalog",
    sw: "Tuma catalog yako",
    enBody: "Send your shop link on WhatsApp so customers can order.",
    swBody: "Tuma kiungo cha duka WhatsApp ili wateja waagize.",
  },
];

export default function QuickStartGuide({ lang }: QuickStartGuideProps) {
  const [open, setOpen] = useState(false);
  const isSwahili = lang === "sw";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={isSwahili ? "Jinsi ya kutumia DukaPilot" : "How to use DukaPilot"}
        aria-expanded={open}
        className="group fixed bottom-5 right-4 z-20 inline-flex h-14 items-center gap-2 rounded-full border border-brand-200 bg-white px-1.5 pr-4 text-sm font-bold text-brand-900 shadow-lg shadow-brand-900/15 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 lg:bottom-7 lg:right-7"
      >
        <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-brand-700 text-white shadow-sm">
          <CircleHelp className="h-6 w-6" />
          <Sparkles className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-white p-0.5 text-brand-700" />
        </span>
        <span className="hidden sm:inline">{isSwahili ? "Jinsi ya kutumia" : "How to use"}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex justify-end bg-gray-950/40 p-0 sm:p-4" role="presentation" onMouseDown={() => setOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-start-title"
            onMouseDown={(event) => event.stopPropagation()}
            className="flex h-full w-full max-w-md flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[calc(100vh-2rem)] sm:rounded-2xl"
          >
            <header className="relative overflow-hidden bg-brand-800 px-5 pb-6 pt-5 text-white">
              <div className="absolute -right-7 -top-9 h-28 w-28 rounded-full border-[18px] border-white/10" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-brand-800 shadow-sm">
                    <CircleHelp className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-200">DukaPilot</p>
                    <h2 id="quick-start-title" className="mt-0.5 text-lg font-bold">
                      {isSwahili ? "Jinsi ya kutumia" : "How to use"}
                    </h2>
                  </div>
                </div>
                <button type="button" onClick={() => setOpen(false)} aria-label={isSwahili ? "Funga mwongozo" : "Close guide"} className="flex h-10 w-10 items-center justify-center rounded-xl text-brand-100 transition hover:bg-white/10 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="relative mt-4 max-w-sm text-sm leading-6 text-brand-100">
                {isSwahili
                  ? "Anza na hatua hizi. Duka lako litakuwa tayari kurekodi mauzo, kutengeneza nukuu, na kupata ushauri wa AI."
                  : "Start with these steps. Your shop will be ready to record sales, make quotations, and receive AI guidance."}
              </p>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <ol className="space-y-2">
                {steps.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <li key={step.href}>
                      <Link href={step.href} onClick={() => setOpen(false)} className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 transition hover:border-brand-300 hover:bg-brand-50/60 focus:outline-none focus:ring-2 focus:ring-brand-600">
                        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-black text-brand-800">{index + 1}</span>
                        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700 group-hover:bg-white group-hover:text-brand-700">
                          <Icon className="h-4.5 w-4.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-gray-950">{isSwahili ? step.sw : step.en}</span>
                          <span className="mt-0.5 block text-xs leading-5 text-gray-600">{isSwahili ? step.swBody : step.enBody}</span>
                        </span>
                        <ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-brand-700" />
                      </Link>
                    </li>
                  );
                })}
              </ol>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Link href="/onboarding" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-brand-200 px-4 py-2.5 text-sm font-bold text-brand-800 transition hover:bg-brand-50">
                  {isSwahili ? "Fungua checklist" : "Open checklist"}
                </Link>
                <a href="https://wa.me/255743910580?text=Habari%20DukaPilot%2C%20nahitaji%20msaada%20kuanza%20kutumia%20app." target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-800">
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </a>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
