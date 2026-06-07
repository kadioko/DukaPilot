"use client";

import { Mail, MessageCircle, Phone } from "lucide-react";
import PublicPageShell from "@/components/marketing/PublicPageShell";
import { useLang } from "@/lib/i18n";

export default function ContactPage() {
  const lang = useLang();

  return (
    <PublicPageShell>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-950">{lang === "sw" ? "Wasiliana na DukaPilot" : "Contact DukaPilot"}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600">
            {lang === "sw"
              ? "Tupo kusaidia wafanyabiashara wa Tanzania kuanza, kuweka bei, kuhamisha bidhaa na kutumia DukaPilot vizuri."
              : "We help Tanzanian shop owners get started, choose pricing, move inventory, and use DukaPilot well."}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            [MessageCircle, "WhatsApp", "+255 743 910 580", "https://wa.me/255743910580"],
            [Phone, lang === "sw" ? "Simu" : "Phone", "+255 743 910 580", "tel:+255743910580"],
            [Mail, "Email", "support@dukapilot.com", "mailto:support@dukapilot.com"],
          ].map(([Icon, title, value, href]) => (
            <a key={String(title)} href={String(href)} className="rounded-xl border border-gray-200 p-5 hover:border-brand-300">
              <Icon className="h-5 w-5 text-brand-700" />
              <p className="mt-4 font-semibold text-gray-950">{String(title)}</p>
              <p className="mt-1 text-sm text-gray-600">{String(value)}</p>
            </a>
          ))}
        </div>
      </div>
    </PublicPageShell>
  );
}
