"use client";

import Link from "next/link";
import { Mail, MessageCircle, Phone } from "lucide-react";
import PublicPageShell from "@/components/marketing/PublicPageShell";
import WhatsAppCTA from "@/components/marketing/WhatsAppCTA";
import { TextReveal } from "@/components/ui/cascade-text";
import { TheInfiniteGrid } from "@/components/ui/the-infinite-grid";
import { useLang } from "@/lib/i18n";

export default function ContactPage() {
  const lang = useLang();
  const whatsappSetupHref = `https://wa.me/255743910580?text=${encodeURIComponent(
    lang === "sw"
      ? "Habari DukaPilot, nataka kusaidiwa kuweka mfumo wa duka langu. Aina ya duka: "
      : "Hello DukaPilot, I want help setting up my shop. Shop type: "
  )}`;
  const channels = [
    {
      Icon: MessageCircle,
      title: "WhatsApp",
      value: "+255 743 910 580",
      detail: lang === "sw" ? "Njia ya haraka kwa kuweka mfumo, malipo na msaada." : "Fastest for setup, payments, and support.",
      href: whatsappSetupHref,
    },
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
      <div className="space-y-8">
        <section className="grid gap-6 border-b border-gray-200 pb-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-sm font-semibold text-brand-700">
              <TextReveal text={lang === "sw" ? "Msaada wa DukaPilot" : "DukaPilot support"} fontSize="inherit" hoverColor="#15803d" />
            </p>
            <h1 className="mt-3 max-w-2xl text-3xl font-bold text-gray-950 sm:text-4xl">
              {lang === "sw" ? "Ongea nasi kupitia WhatsApp." : "Talk to us on WhatsApp."}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600">
              {lang === "sw" ? "Tuma swali, picha ya skrini au kumbukumbu ya malipo. Tutakusaidia kuweka na kutumia duka lako." : "Send a question, screenshot, or payment reference. We will help you set up and run your shop."}
            </p>
          </div>
          <WhatsAppCTA intent="contact" label={lang === "sw" ? "Tuma ujumbe WhatsApp" : "Message us on WhatsApp"} />
        </section>
        <TheInfiniteGrid
          lang={lang}
          headingLevel="h2"
          headline={lang === "sw" ? "Support ya DukaPilot ipo karibu" : "DukaPilot support is close"}
          body={lang === "sw"
            ? "Tuma swali, picha ya skrini, kumbukumbu ya malipo au ombi la kuweka mfumo. Tutakusaidia bidhaa, mauzo, wafanyakazi, orodha ya bidhaa, malipo na msaidizi wa AI."
            : "Send a question, screenshot, payment reference, or setup request. We help with products, sales, staff, catalog, billing, and the AI assistant."}
          primaryCta={{
            href: whatsappSetupHref,
            label: lang === "sw" ? "Tuma WhatsApp" : "Send WhatsApp",
          }}
          secondaryCta={{
            href: "mailto:support@dukapilot.com",
            label: "Email support",
          }}
          features={channels.map(({ title, value, detail }) => ({
            title,
            description: `${value} - ${detail}`,
          }))}
        />

        <section className="grid gap-4 md:grid-cols-3">
          {channels.map(({ Icon, title, value, detail, href }) => (
            <a key={title} href={href} className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                <Icon className="h-5 w-5" />
              </span>
              <p className="mt-4 font-semibold text-gray-950">{title}</p>
              <p className="mt-1 text-sm font-medium text-brand-700">{value}</p>
              <p className="mt-3 text-sm leading-6 text-gray-600">{detail}</p>
            </a>
          ))}
        </section>

        <section className="grid gap-4 rounded-3xl border border-green-200 bg-green-50 p-6 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <h2 className="text-lg font-bold text-green-950">{lang === "sw" ? "Imejengwa kwa wamiliki wa maduka Tanzania" : "Built for Tanzanian shop owners"}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-green-900">
            {lang === "sw"
              ? "Tunasaidia duka kuanza haraka: bidhaa, mauzo, madeni, matumizi, staff, catalog na AI Assistant inayosema cha kufanya leo."
              : "We help shops get running fast: products, sales, debts, expenses, staff, catalog, and an AI Assistant that says what to do today."}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/help" className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-bold text-green-800 hover:bg-green-100">
              {lang === "sw" ? "Soma msaada" : "Read help"}
            </Link>
            <WhatsAppCTA intent="contact" label={lang === "sw" ? "Nataka kuweka mfumo" : "I want setup"} />
          </div>
        </section>
      </div>
    </PublicPageShell>
  );
}
