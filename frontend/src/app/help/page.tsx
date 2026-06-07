"use client";

import Link from "next/link";
import PublicPageShell from "@/components/marketing/PublicPageShell";
import { useLang } from "@/lib/i18n";

export default function HelpPage() {
  const lang = useLang();
  const faqs = [
    [lang === "sw" ? "Ninaanzaje?" : "How do I start?", lang === "sw" ? "Jisajili, kamilisha duka, ongeza bidhaa chache, kisha rekodi mauzo ya kwanza." : "Register, complete shop setup, add a few products, then record your first sale."],
    [lang === "sw" ? "Nawezaje kushare catalog?" : "How do I share the catalog?", lang === "sw" ? "Fungua Catalog, chagua duka lako, kisha tuma link kwa WhatsApp au mitandao mingine." : "Open Catalog, choose your shop, then send the link on WhatsApp or other channels."],
    [lang === "sw" ? "Staff wanaingiaje?" : "How do staff sign in?", lang === "sw" ? "Owner anaongeza staff, simu na PIN kwenye ukurasa wa Staff. Staff hutumia simu na PIN kuingia." : "The owner adds staff, phone, and PIN on the Staff page. Staff use that phone and PIN to sign in."],
    [lang === "sw" ? "Offline inafanya kazi?" : "Does offline work?", lang === "sw" ? "App ina ukurasa wa offline na cache ya msingi. Mauzo ya offline-sync bado hayajawashwa, hivyo usitegemee kuuza bila mtandao mpaka kipengele hicho kikamilike." : "The app has a basic offline page and cache. Offline sale sync is not enabled yet, so do not rely on selling without internet until that feature is complete."],
  ];

  return (
    <PublicPageShell>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-950">{lang === "sw" ? "Msaada" : "Help"}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600">
            {lang === "sw" ? "Majibu ya haraka kwa maswali ya kawaida ya DukaPilot." : "Quick answers to common DukaPilot questions."}
          </p>
        </div>
        <div className="grid gap-4">
          {faqs.map(([q, a]) => (
            <section key={q} className="rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-950">{q}</h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">{a}</p>
            </section>
          ))}
        </div>
        <Link href="/contact" className="inline-flex rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-700">
          {lang === "sw" ? "Ongea na support" : "Talk to support"}
        </Link>
      </div>
    </PublicPageShell>
  );
}
