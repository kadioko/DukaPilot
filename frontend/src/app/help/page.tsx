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
    [lang === "sw" ? "Offline inafanya kazi?" : "Does offline work?", lang === "sw" ? "Ukurasa wa Sales unaweza kuhifadhi mauzo kwenye browser ukiwa offline na kuyasawazisha internet ikirudi. Kagua sync history kwa hitilafu za stock." : "The Sales page can save sales locally while offline and sync them when internet returns. Check sync history for stock conflict errors."],
    [lang === "sw" ? "Ninalipaje subscription?" : "How do I pay for subscription?", lang === "sw" ? "Tuma M-Pesa kwenda +255 743 910 580, kisha weka reference kwenye Billing au tuma WhatsApp. Admin atahakiki na kuactivate plan." : "Send M-Pesa to +255 743 910 580, then submit the reference on Billing or WhatsApp. Admin verifies and activates the plan."],
    [lang === "sw" ? "AI Assistant inanisaidiaje?" : "How does the AI Assistant help?", lang === "sw" ? "Inapanga hatua za leo kama kuagiza bidhaa, kufuatilia madeni, kupunguza gharama na kushughulikia order." : "It ranks today's actions like restocking, following up debts, reducing costs, and handling orders."],
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
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/contact" className="inline-flex rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-700">
            {lang === "sw" ? "Ongea na support" : "Talk to support"}
          </Link>
          <a href="https://wa.me/255743910580" className="inline-flex rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white hover:bg-green-700">
            WhatsApp +255 743 910 580
          </a>
        </div>
      </div>
    </PublicPageShell>
  );
}
