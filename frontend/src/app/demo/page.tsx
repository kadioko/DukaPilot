"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import PublicPageShell from "@/components/marketing/PublicPageShell";
import { useLang } from "@/lib/i18n";

const accounts = [
  ["Merchant", "+255700000002", "Duka la Amina"],
  ["Supplier", "+255700000001", "Jumla Traders"],
  ["Admin", "+255743910580", "Admin DukaPilot"],
];

export default function DemoPage() {
  const lang = useLang();

  return (
    <PublicPageShell>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-950">{lang === "sw" ? "Jaribu Demo ya DukaPilot" : "Try the DukaPilot Demo"}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600">
            {lang === "sw"
              ? "Tumia akaunti hizi kuona mauzo, stock, maagizo, madeni, matumizi, staff na AI Assistant. PIN zote ni 1234."
              : "Use these accounts to see sales, stock, orders, debts, expenses, staff, and the AI Assistant. All PINs are 1234."}
          </p>
        </div>
        <div className="grid gap-3">
          {accounts.map(([role, phone, name]) => (
            <section key={phone} className="rounded-xl border border-gray-200 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-400">{role}</p>
              <h2 className="mt-1 font-semibold text-gray-950">{name}</h2>
              <p className="mt-1 text-sm text-gray-600">{phone} / 1234</p>
            </section>
          ))}
        </div>
        <Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-700">
          {lang === "sw" ? "Fungua login" : "Open login"}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </PublicPageShell>
  );
}
