"use client";

import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { useLang } from "@/lib/i18n";
import { Bell, Package, Sparkles } from "lucide-react";

export default function NotificationsPage() {
  const lang = useLang();

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5 pb-24 lg:pb-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-brand-50 p-3 text-brand-700">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-950">{lang === "sw" ? "Notifications" : "Notifications"}</h1>
            <p className="mt-1 text-sm leading-6 text-gray-600">
              {lang === "sw"
                ? "Hapa utaona alert muhimu za duka: stock kuisha, madeni, malipo, na hatua za AI."
                : "This is where important shop alerts will appear: low stock, debts, payments, and AI next steps."}
            </p>
          </div>
        </div>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <Package className="mt-0.5 h-5 w-5 text-red-600" />
            <div>
              <h2 className="font-semibold text-gray-950">{lang === "sw" ? "Low-stock alerts" : "Low-stock alerts"}</h2>
              <p className="mt-1 text-sm leading-6 text-gray-600">
                {lang === "sw"
                  ? "Kwa sasa alert za stock zinaonekana kwenye Inventory na Dashboard. Tutazikusanya hapa pia."
                  : "Low-stock alerts currently appear in Inventory and Dashboard. They will also collect here."}
              </p>
              <Link href="/inventory" className="mt-3 inline-flex text-sm font-semibold text-brand-700 hover:text-brand-900">
                {lang === "sw" ? "Fungua inventory" : "Open inventory"}
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-brand-200 bg-brand-50 p-5">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 text-brand-700" />
            <div>
              <h2 className="font-semibold text-brand-950">{lang === "sw" ? "AI next steps" : "AI next steps"}</h2>
              <p className="mt-1 text-sm leading-6 text-brand-900">
                {lang === "sw"
                  ? "DukaPilot AI Assistant ndiyo command center yako ya leo: agiza, fuatilia deni, punguza gharama, na promote bidhaa."
                  : "DukaPilot AI Assistant is today's command center: restock, collect debt, cut costs, and promote products."}
              </p>
              <Link href="/assistant" className="mt-3 inline-flex text-sm font-semibold text-brand-800 hover:text-brand-950">
                {lang === "sw" ? "Fungua AI Assistant" : "Open AI Assistant"}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
