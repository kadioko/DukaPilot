"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { api, formatTZS } from "@/lib/api";
import { useLang } from "@/lib/i18n";

interface Expense {
  id: string;
  title: string;
  amount: number;
  category: string;
  vendor: string | null;
  spentAt: string;
}

const categories = ["RENT", "SALARY", "UTILITIES", "TRANSPORT", "STOCK", "MARKETING", "TAX", "OTHER"];

export default function ExpensesPage() {
  const lang = useLang();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState({ total: 0, count: 0 });
  const [form, setForm] = useState({ title: "", amount: "", category: "OTHER", vendor: "" });

  async function load() {
    const data = await api.get<{ expenses: Expense[]; summary: { total: number; count: number } }>("/expenses", lang);
    setExpenses(data.expenses);
    setSummary(data.summary);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  async function addExpense(event: React.FormEvent) {
    event.preventDefault();
    await api.post("/expenses", { ...form, amount: Number(form.amount) }, lang);
    setForm({ title: "", amount: "", category: "OTHER", vendor: "" });
    await load();
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-950">{lang === "sw" ? "Matumizi ya Biashara" : "Expense Tracking"}</h1>
            <p className="mt-1 text-sm text-gray-600">
              {lang === "sw" ? "Rekodi gharama za duka ili faida iwe ya kweli." : "Record shop costs so profit stays honest."}
            </p>
          </div>
          <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>{formatTZS(summary.total)}</strong> · {summary.count} {lang === "sw" ? "rekodi" : "records"}
          </div>
        </div>

        <form onSubmit={addExpense} className="grid gap-3 rounded-lg border border-gray-200 p-4 md:grid-cols-5">
          <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm md:col-span-2" required placeholder={lang === "sw" ? "Mfano: Kodi ya mwezi" : "Example: Monthly rent"} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" required type="number" min="1" placeholder={lang === "sw" ? "Kiasi" : "Amount"} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {categories.map((category) => <option key={category} value={category}>{category.replace("_", " ")}</option>)}
          </select>
          <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            {lang === "sw" ? "Hifadhi" : "Save"}
          </button>
        </form>

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {expenses.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">{lang === "sw" ? "Hakuna matumizi bado." : "No expenses yet."}</div>
          ) : expenses.map((expense) => (
            <div key={expense.id} className="grid gap-2 border-b border-gray-100 p-4 last:border-b-0 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="font-semibold text-gray-950">{expense.title}</p>
                <p className="text-sm text-gray-500">{expense.category.replace("_", " ")} · {new Date(expense.spentAt).toLocaleDateString(lang === "sw" ? "sw-TZ" : "en-US")}</p>
              </div>
              <p className="font-semibold text-gray-950">{formatTZS(expense.amount)}</p>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
