"use client";

import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import PublicPageShell from "@/components/marketing/PublicPageShell";
import WhatsAppCTA from "@/components/marketing/WhatsAppCTA";
import { TextReveal } from "@/components/ui/cascade-text";
import { useLang } from "@/lib/i18n";

export default function ContactPage() {
  const lang = useLang();
  const channels = [
    {
      Icon: Phone,
      title: lang === "sw" ? "Simu" : "Phone",
      value: "+255 743 910 580",
      detail: lang === "sw" ? "Piga kwa maswali ya haraka ya biashara." : "Call for quick business questions.",
      href: "tel:+255743910580",
    },
    {
      Icon: Mail,
      title: "Email",
      value: "support@dukapilot.com",
      detail: lang === "sw" ? "Tuma ujumbe rasmi au maelezo marefu." : "Send formal requests or longer details.",
      href: "mailto:support@dukapilot.com",
    },
  ];

  return (
    <PublicPageShell>
      <div className="space-y-6">
        <section className="grid gap-4 border-b border-gray-200 pb-6 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="text-sm font-semibold text-brand-700">
              <TextReveal text={lang === "sw" ? "Msaada wa DukaPilot" : "DukaPilot support"} fontSize="inherit" hoverColor="#15803d" />
            </p>
            <h1 className="mt-2 max-w-2xl text-3xl font-bold text-gray-950 sm:text-4xl">
              {lang === "sw" ? "Msaada kwa biashara yako." : "Support for your business."}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
              {lang === "sw" ? "Tuma swali au screenshot. Tutakusaidia kuweka mfumo na kupata suluhisho." : "Send a question or screenshot. We can help with setup and troubleshooting."}
            </p>
          </div>
          <WhatsAppCTA intent="contact" label={lang === "sw" ? "Tuma ujumbe WhatsApp" : "Message us on WhatsApp"} />
        </section>

        <section className="grid gap-3 sm:grid-cols-2" aria-label={lang === "sw" ? "Njia nyingine za mawasiliano" : "Other contact options"}>
          {channels.map(({ Icon, title, value, detail, href }) => (
            <a key={title} href={href} className="group rounded-xl border border-gray-200 bg-white p-4 transition hover:border-brand-300 hover:bg-brand-50/40 sm:p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                <Icon className="h-5 w-5" />
              </span>
              <p className="mt-3 font-semibold text-gray-950">{title}</p>
              <p className="mt-1 text-sm font-medium text-brand-700">{value}</p>
              <p className="mt-2 text-sm leading-5 text-gray-600">{detail}</p>
            </a>
          ))}
        </section>

        <section className="flex flex-col gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-950">{lang === "sw" ? "Majibu ya haraka yapo kwenye Help" : "Quick answers are in Help"}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-gray-600">
            {lang === "sw"
              ? "Pata mwongozo wa bidhaa, mauzo, wafanyakazi, malipo na AI."
              : "Find guides for products, sales, staff, payments, and AI."}
            </p>
          </div>
          <Link href="/help" className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:border-brand-400 hover:text-brand-800">
            {lang === "sw" ? "Fungua Help" : "Open Help"}
          </Link>
        </section>
      </div>
    </PublicPageShell>
  );
}
