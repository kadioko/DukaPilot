"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { api, formatTZS } from "@/lib/api";
import { useLang } from "@/lib/i18n";

interface Debt {
  id: string;
  customerName: string | null;
  customerPhone: string;
  amount: number;
  amountPaid: number;
  status: "OPEN" | "PARTIAL" | "PAID" | "CANCELLED";
  dueDate: string | null;
  note: string | null;
}

export default function DebtsPage() {
  const lang = useLang();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [summary, setSummary] = useState({ openCount: 0, totalOwed: 0 });
  const [form, setForm] = useState({ customerName: "", customerPhone: "", amount: "", dueDate: "", note: "" });
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<{ debts: Debt[]; summary: { openCount: number; totalOwed: number } }>("/debts", lang);
      setDebts(data.debts);
      setSummary(data.summary);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  async function addDebt(event: React.FormEvent) {
    event.preventDefault();
    await api.post("/debts", { ...form, amount: Number(form.amount) }, lang);
    setForm({ customerName: "", customerPhone: "", amount: "", dueDate: "", note: "" });
    await load();
  }

  async function markPaid(debt: Debt) {
    await api.post(`/debts/${debt.id}/payments`, { amount: debt.amount - debt.amountPaid }, lang);
    await load();
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-950">{lang === "sw" ? "Ufuatiliaji wa Madeni" : "Debt Tracking"}</h1>
            <p className="mt-1 text-sm text-gray-600">
              {lang === "sw" ? "Fuatilia wateja waliokopa na malipo yao." : "Track customer credit and repayments."}
            </p>
          </div>
          <div className="rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-900">
            <strong>{formatTZS(summary.totalOwed)}</strong> {lang === "sw" ? "bado kulipwa" : "still owed"} · {summary.openCount}
          </div>
        </div>

        <form onSubmit={addDebt} className="grid gap-3 rounded-lg border border-gray-200 p-4 md:grid-cols-5">
          <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm md:col-span-1" placeholder={lang === "sw" ? "Jina la mteja" : "Customer name"} value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
          <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm md:col-span-1" required placeholder={lang === "sw" ? "Simu" : "Phone"} value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} />
          <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" required type="number" min="1" placeholder={lang === "sw" ? "Kiasi" : "Amount"} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            {lang === "sw" ? "Ongeza" : "Add"}
          </button>
        </form>

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {loading ? (
            <div className="p-6 text-sm text-gray-500">{lang === "sw" ? "Inapakia..." : "Loading..."}</div>
          ) : debts.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">{lang === "sw" ? "Hakuna madeni bado." : "No debts yet."}</div>
          ) : debts.map((debt) => {
            const balance = debt.amount - debt.amountPaid;
            return (
              <div key={debt.id} className="grid gap-3 border-b border-gray-100 p-4 last:border-b-0 md:grid-cols-[1fr_auto_auto] md:items-center">
                <div>
                  <p className="font-semibold text-gray-950">{debt.customerName || debt.customerPhone}</p>
                  <p className="text-sm text-gray-500">{debt.customerPhone} · {debt.status}</p>
                </div>
                <div className="text-sm md:text-right">
                  <p className="font-semibold text-gray-950">{formatTZS(balance)}</p>
                  <p className="text-gray-500">{formatTZS(debt.amountPaid)} {lang === "sw" ? "imelipwa" : "paid"}</p>
                </div>
                {balance > 0 && debt.status !== "CANCELLED" && (
                  <button onClick={() => markPaid(debt)} className="rounded-lg border border-brand-600 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">
                    {lang === "sw" ? "Lipa yote" : "Mark paid"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
