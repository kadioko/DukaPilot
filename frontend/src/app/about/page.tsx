"use client";

import PublicPageShell from "@/components/marketing/PublicPageShell";
import { useLang } from "@/lib/i18n";

export default function AboutPage() {
  const lang = useLang();

  return (
    <PublicPageShell>
      <div className="space-y-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-700">DukaPilot</p>
          <h1 className="mt-3 text-3xl font-bold tracking-normal text-gray-950">
            {lang === "sw" ? "Rubani wa duka lako la kila siku" : "The daily pilot for your shop"}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-gray-600">
            {lang === "sw"
              ? "DukaPilot husaidia wafanyabiashara Tanzania kufuatilia bidhaa, mauzo, madeni, matumizi, maagizo na wafanyakazi kwa lugha wanayoitumia kazini."
              : "DukaPilot helps Tanzanian merchants track inventory, sales, debts, expenses, orders, and staff in the language they use at work."}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: lang === "sw" ? "Udhibiti" : "Control",
              body: lang === "sw" ? "Jua kinachouzwa, kinachobaki, na kinachohitaji kuagizwa." : "Know what sold, what remains, and what needs reordering.",
            },
            {
              title: lang === "sw" ? "Fedha" : "Money",
              body: lang === "sw" ? "Tenganisha mauzo, faida, matumizi, na madeni ya wateja." : "Separate sales, profit, expenses, and customer credit.",
            },
            {
              title: lang === "sw" ? "Msaidizi wa AI" : "AI assistant",
              body: lang === "sw" ? "DukaPilot inalenga kukupa tahadhari na ushauri unaotokana na data ya duka lako." : "DukaPilot is positioned to turn shop data into alerts and practical recommendations.",
            },
          ].map((item) => (
            <section key={item.title} className="rounded-lg border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-950">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">{item.body}</p>
            </section>
          ))}
        </div>
      </div>
    </PublicPageShell>
  );
}
