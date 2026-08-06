"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import DateSelect from "@/components/ui/DateSelect";
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
const INPUT = "min-w-0 w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500 sm:text-sm";

function localDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function emptyExpenseForm() {
  return { title: "", amount: "", category: "OTHER", vendor: "", spentAt: localDateValue() };
}

const CATEGORY_LABELS: Record<string, { sw: string; en: string }> = {
  RENT: { sw: "Kodi", en: "Rent" },
  SALARY: { sw: "Mishahara", en: "Salaries" },
  UTILITIES: { sw: "Umeme na huduma", en: "Utilities" },
  TRANSPORT: { sw: "Usafiri", en: "Transport" },
  STOCK: { sw: "Ununuzi wa bidhaa", en: "Stock purchases" },
  MARKETING: { sw: "Matangazo", en: "Marketing" },
  TAX: { sw: "Kodi ya serikali", en: "Tax" },
  OTHER: { sw: "Mengine", en: "Other" },
};

export default function ExpensesPage() {
  const lang = useLang();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState({ total: 0, count: 0 });
  const [form, setForm] = useState(emptyExpenseForm);
  const [assistantFocus, setAssistantFocus] = useState("");

  async function load() {
    const data = await api.get<{ expenses: Expense[]; summary: { total: number; count: number } }>("/expenses", lang);
    setExpenses(data.expenses);
    setSummary(data.summary);
  }

  useEffect(() => {
    load().catch(console.error);
    setAssistantFocus(new URLSearchParams(window.location.search).get("focus") || "");
  }, []);

  async function addExpense(event: React.FormEvent) {
    event.preventDefault();
    await api.post("/expenses", { ...form, amount: Number(form.amount) }, lang);
    setForm(emptyExpenseForm());
    await load();
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6 pb-24 lg:pb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-950">{lang === "sw" ? "Matumizi ya Biashara" : "Expense Tracking"}</h1>
            <p className="mt-1 text-sm text-gray-600">
              {lang === "sw" ? "Rekodi gharama za duka ili faida iwe ya kweli." : "Record shop costs so profit stays honest."}
            </p>
          </div>
          <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>{formatTZS(summary.total)}</strong> - {summary.count} {lang === "sw" ? "rekodi" : "records"}
          </div>
        </div>

        {assistantFocus && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">
              {assistantFocus === "profit"
                ? (lang === "sw" ? "DukaPilot imekufungua kukagua matumizi dhidi ya faida." : "DukaPilot opened expenses so you can review profit pressure.")
                : (lang === "sw" ? "DukaPilot imekufungua kwenye ukaguzi wa matumizi ya wiki." : "DukaPilot opened your weekly expense review.")}
            </p>
            <p className="mt-1 text-xs text-amber-800">
              {lang === "sw" ? "Angalia gharama kubwa, rekodi zilizokosekana, na matumizi yanayoweza kupunguzwa." : "Check large costs, missing records, and expenses that can be reduced."}
            </p>
          </div>
        )}

        <form onSubmit={addExpense} className="grid min-w-0 gap-4 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
          <label className="grid min-w-0 gap-1 text-xs font-medium text-gray-600 sm:col-span-2 lg:col-span-4"><span>{lang === "sw" ? "Jina la matumizi" : "Expense name"}</span><input className={INPUT} required placeholder={lang === "sw" ? "Mfano: Kodi ya mwezi" : "Example: Monthly rent"} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label className="grid min-w-0 gap-1 text-xs font-medium text-gray-600 lg:col-span-2"><span>{lang === "sw" ? "Kiasi (TZS)" : "Amount (TZS)"}</span><input className={INPUT} required type="number" min="1" inputMode="numeric" placeholder="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
          <label className="grid min-w-0 gap-1 text-xs font-medium text-gray-600 lg:col-span-2"><span>{lang === "sw" ? "Aina" : "Category"}</span><select className={INPUT} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {categories.map((category) => <option key={category} value={category}>{CATEGORY_LABELS[category][lang]}</option>)}
          </select></label>
          <label className="grid min-w-0 gap-1 text-xs font-medium text-gray-600 sm:col-span-2 lg:col-span-4"><span>{lang === "sw" ? "Muuzaji (hiari)" : "Vendor (optional)"}</span><input className={INPUT} placeholder={lang === "sw" ? "Mfano: TANESCO" : "Example: TANESCO"} value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></label>
          <DateSelect className="sm:col-span-2 lg:col-span-6" lang={lang} label={lang === "sw" ? "Tarehe ya matumizi" : "Expense date"} required value={form.spentAt} onChange={(spentAt) => setForm({ ...form, spentAt })} />
          <button className="h-12 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 sm:col-span-2 lg:col-span-2">
            {lang === "sw" ? "Hifadhi" : "Save"}
          </button>
        </form>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {expenses.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">{lang === "sw" ? "Hakuna matumizi bado." : "No expenses yet."}</div>
          ) : expenses.map((expense) => (
            <div key={expense.id} className="grid gap-2 border-b border-gray-100 p-4 last:border-b-0 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="font-semibold text-gray-950">{expense.title}</p>
                <p className="text-sm text-gray-500">
                  {(CATEGORY_LABELS[expense.category] || { sw: expense.category, en: expense.category })[lang]} - {new Date(expense.spentAt).toLocaleDateString(lang === "sw" ? "sw-TZ" : "en-US")}
                  {expense.vendor ? ` - ${expense.vendor}` : ""}
                </p>
              </div>
              <p className="font-semibold text-gray-950">{formatTZS(expense.amount)}</p>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
