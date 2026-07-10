"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { AlertTriangle, Bell, ChevronRight, CircleCheck, CreditCard, HandCoins, Package, RefreshCw, ShoppingBag, WifiOff } from "lucide-react";

interface NotificationItem {
  id: string;
  type: "LOW_STOCK" | "DEBT" | "CUSTOMER_ORDER" | "SYNC" | "SUBSCRIPTION";
  severity: "URGENT" | "WARNING" | "ACTION";
  title: string;
  titleSw: string;
  description: string;
  descriptionSw: string;
  href: string;
  count: number;
}

const icons = {
  LOW_STOCK: Package,
  DEBT: HandCoins,
  CUSTOMER_ORDER: ShoppingBag,
  SYNC: WifiOff,
  SUBSCRIPTION: CreditCard,
};

export default function NotificationsPage() {
  const lang = useLang();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await api.get<{ items: NotificationItem[] }>("/notifications", lang);
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load alerts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => null);
  }, []);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5 pb-24 lg:pb-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-brand-50 p-3 text-brand-700"><Bell className="h-5 w-5" /></div>
            <div>
              <h1 className="text-xl font-bold text-gray-950">{lang === "sw" ? "Taarifa za duka" : "Shop alerts"}</h1>
              <p className="mt-1 text-sm leading-6 text-gray-600">
                {lang === "sw" ? "Stock, madeni, maagizo, sync na billing zinazohitaji hatua." : "Stock, debts, orders, sync, and billing items that need action."}
              </p>
            </div>
          </div>
          <button onClick={() => load()} disabled={loading} aria-label={lang === "sw" ? "Sasisha taarifa" : "Refresh alerts"} className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</div>}

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-lg bg-gray-100" />)}</div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-8 text-center">
            <CircleCheck className="mx-auto h-10 w-10 text-green-600" />
            <h2 className="mt-3 font-bold text-green-950">{lang === "sw" ? "Hakuna jambo la haraka" : "Nothing urgent right now"}</h2>
            <p className="mt-1 text-sm text-green-800">{lang === "sw" ? "Duka lako liko sawa. Taarifa mpya zitaonekana hapa." : "Your shop is in good shape. New alerts will appear here."}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const Icon = icons[item.type];
              return (
                <Link key={item.id} href={item.href} className="flex min-h-24 items-start gap-3 rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-brand-300 hover:bg-brand-50/40">
                  <div className={`rounded-lg p-2.5 ${item.severity === "URGENT" ? "bg-red-50 text-red-700" : item.severity === "WARNING" ? "bg-amber-50 text-amber-700" : "bg-brand-50 text-brand-700"}`}><Icon className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-950">{lang === "sw" ? item.titleSw : item.title}</p>
                    <p className="mt-1 text-sm leading-5 text-gray-600">{lang === "sw" ? item.descriptionSw : item.description}</p>
                  </div>
                  <ChevronRight className="mt-2 h-4 w-4 flex-shrink-0 text-gray-400" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
