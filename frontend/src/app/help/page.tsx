"use client";

import Link from "next/link";
import { BookOpen, CheckCircle2, MessageCircle, Search, Sparkles } from "lucide-react";
import PublicPageShell from "@/components/marketing/PublicPageShell";
import ProductProofSection from "@/components/marketing/ProductProofSection";
import { useLang } from "@/lib/i18n";

export default function HelpPage() {
  const lang = useLang();
  const faqs = [
    [lang === "sw" ? "Ninaanzaje?" : "How do I start?", lang === "sw" ? "Jisajili, kamilisha duka, ongeza bidhaa chache, kisha rekodi mauzo ya kwanza." : "Register, complete shop setup, add a few products, then record your first sale."],
    [lang === "sw" ? "Nawezaje kushare catalog?" : "How do I share the catalog?", lang === "sw" ? "Fungua Catalog, chagua duka lako, kisha tuma link kwa WhatsApp au mitandao mingine." : "Open Catalog, choose your shop, then send the link on WhatsApp or other channels."],
    [lang === "sw" ? "Staff wanaingiaje?" : "How do staff sign in?", lang === "sw" ? "Owner anaongeza staff, simu na PIN kwenye ukurasa wa Staff. Staff hutumia simu na PIN kuingia." : "The owner adds staff, phone, and PIN on the Staff page. Staff use that phone and PIN to sign in."],
    [lang === "sw" ? "Offline inafanya kazi?" : "Does offline work?", lang === "sw" ? "Ukurasa wa Sales unaweza kuhifadhi mauzo kwenye browser ukiwa offline na kuyasawazisha internet ikirudi. Kagua sync history kwa hitilafu za stock." : "The Sales page can save sales locally while offline and sync them when internet returns. Check sync history for stock conflict errors."],
    [lang === "sw" ? "Ninalipaje subscription?" : "How do I pay for subscription?", lang === "sw" ? "Tuma M-Pesa kwenda +255 743 910 580, kisha weka reference kwenye Billing au tuma WhatsApp. Admin atahakiki na kuactivate plan." : "Send M-Pesa to +255 743 910 580, then submit the reference on Billing or WhatsApp. Admin verifies and activates the plan."],
    [lang === "sw" ? "AI Assistant inanisaidiaje?" : "How does the AI Assistant help?", lang === "sw" ? "Inapanga hatua za leo kama kuagiza bidhaa, kufuatilia madeni, kupunguza gharama na kushughulikia order." : "It ranks today's actions like restocking, following up debts, reducing costs, and handling orders."],
  ];

  return (
    <PublicPageShell>
      <div className="space-y-8">
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_320px] lg:items-center">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                <BookOpen className="h-6 w-6" />
              </div>
              <h1 className="mt-5 max-w-2xl text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
                {lang === "sw" ? "Msaada wa kuendesha duka lako vizuri." : "Help for running your shop better."}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-600 sm:text-base">
                {lang === "sw" ? "Majibu ya haraka kwa setup, catalog, staff, offline sales, malipo na AI assistant." : "Quick answers for setup, catalog links, staff, offline sales, payments, and the AI assistant."}
              </p>
            </div>
            <div className="rounded-2xl border border-brand-100 bg-brand-50 p-5">
              <Sparkles className="h-5 w-5 text-brand-700" />
              <p className="mt-3 font-semibold text-brand-950">{lang === "sw" ? "Unakwama?" : "Stuck?"}</p>
              <p className="mt-2 text-sm leading-6 text-brand-900">
                {lang === "sw" ? "Tuma screenshot au swali kwa WhatsApp, tutakuongoza hatua kwa hatua." : "Send a screenshot or question on WhatsApp and we will guide you step by step."}
              </p>
              <a href="https://wa.me/255743910580" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-3 text-sm font-bold text-white hover:bg-brand-800">
                <MessageCircle className="h-4 w-4" />
                WhatsApp support
              </a>
            </div>
          </div>
        </section>

        <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <Search className="h-5 w-5 flex-shrink-0 text-gray-400" />
          <p className="text-sm text-gray-600">
            {lang === "sw" ? "Maswali muhimu zaidi ya DukaPilot yapo hapa chini." : "The most important DukaPilot questions are answered below."}
          </p>
        </div>

        <ProductProofSection compact />

        <div className="grid gap-4 md:grid-cols-2">
          {faqs.map(([q, a]) => (
            <section key={q} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-700" />
                <h2 className="font-semibold leading-6 text-gray-950">{q}</h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-gray-600">{a}</p>
            </section>
          ))}
        </div>
        <div className="flex flex-col gap-3 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-sm leading-6 text-gray-600">
            {lang === "sw" ? "Bado unahitaji msaada? Tupo tayari kukusaidia kuifanya DukaPilot iwe tayari kwa duka lako." : "Still need help? We are ready to help make DukaPilot work for your shop."}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/contact" className="inline-flex items-center justify-center rounded-xl bg-brand-700 px-5 py-3 text-sm font-bold text-white hover:bg-brand-800">
            {lang === "sw" ? "Ongea na support" : "Talk to support"}
          </Link>
          <a href="https://wa.me/255743910580" className="inline-flex items-center justify-center rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white hover:bg-green-700">
            WhatsApp +255 743 910 580
          </a>
          </div>
        </div>
      </div>
    </PublicPageShell>
  );
}
