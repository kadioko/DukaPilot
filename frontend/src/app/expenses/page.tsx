"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, ChevronDown, Edit3, Filter, PackagePlus, Plus, ReceiptText, Repeat2, Search, Trash2, X } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import DateSelect from "@/components/ui/DateSelect";
import { useToast } from "@/components/ui/Toast";
import { api, formatTZS } from "@/lib/api";
import { useLang } from "@/lib/i18n";

interface Expense {
  id: string;
  title: string;
  amount: number;
  category: string;
  vendor: string | null;
  note: string | null;
  paymentMethod: string;
  spentAt: string;
}

interface RecurringExpense {
  id: string;
  title: string;
  amount: number;
  category: string;
  vendor: string | null;
  note: string | null;
  paymentMethod: string;
  nextDueAt: string;
}

interface ExpenseForm {
  title: string;
  amount: string;
  category: string;
  vendor: string;
  note: string;
  paymentMethod: "CASH" | "MPESA" | "BANK";
  spentAt: string;
  recurringMonthly: boolean;
}

interface Filters {
  search: string;
  vendor: string;
  category: string;
  from: string;
  to: string;
}

type Period = "today" | "week" | "month" | "all";

interface ExpenseSummary {
  total: number;
  count: number;
  totalSales: number;
  grossProfit: number;
  netProfit: number;
  expensePercentOfSales: number | null;
  previousTotal: number | null;
  changeAmount: number | null;
  changePercent: number | null;
  salesCount: number;
  topCategories: Array<{ category: string; total: number }>;
}

const categories = ["RENT", "SALARY", "UTILITIES", "TRANSPORT", "MARKETING", "TAX", "OTHER"];
const INPUT = "min-w-0 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base text-gray-950 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 sm:text-sm";

const CATEGORY_LABELS: Record<string, { sw: string; en: string }> = {
  RENT: { sw: "Kodi", en: "Rent" },
  SALARY: { sw: "Mishahara", en: "Salaries" },
  UTILITIES: { sw: "Umeme na huduma", en: "Utilities" },
  TRANSPORT: { sw: "Usafiri", en: "Transport" },
  MARKETING: { sw: "Matangazo", en: "Marketing" },
  TAX: { sw: "Kodi ya serikali", en: "Tax" },
  OTHER: { sw: "Mengine", en: "Other" },
};

const PAYMENT_LABELS: Record<string, { sw: string; en: string }> = {
  CASH: { sw: "Taslimu", en: "Cash" },
  MPESA: { sw: "M-Pesa", en: "M-Pesa" },
  BANK: { sw: "Benki", en: "Bank" },
};

const QUICK_EXPENSES = [
  { title: "Kodi", category: "RENT", label: { sw: "Kodi", en: "Rent" } },
  { title: "LUKU", category: "UTILITIES", label: { sw: "LUKU", en: "Electricity" } },
  { title: "Usafiri", category: "TRANSPORT", label: { sw: "Usafiri", en: "Transport" } },
  { title: "Mshahara", category: "SALARY", label: { sw: "Mshahara", en: "Salary" } },
  { title: "Data ya simu", category: "UTILITIES", label: { sw: "Data", en: "Data" } },
  { title: "Matengenezo", category: "OTHER", label: { sw: "Matengenezo", en: "Repairs" } },
];

const PERIODS: Array<{ value: Period; sw: string; en: string }> = [
  { value: "today", sw: "Leo", en: "Today" },
  { value: "week", sw: "Wiki", en: "Week" },
  { value: "month", sw: "Mwezi", en: "Month" },
  { value: "all", sw: "Muda Wote", en: "All time" },
];

const EMPTY_SUMMARY: ExpenseSummary = {
  total: 0, count: 0, totalSales: 0, grossProfit: 0, netProfit: 0,
  expensePercentOfSales: null, previousTotal: null, changeAmount: null,
  changePercent: null, salesCount: 0, topCategories: [],
};

function localDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function emptyExpenseForm(): ExpenseForm {
  return { title: "", amount: "", category: "OTHER", vendor: "", note: "", paymentMethod: "CASH", spentAt: localDateValue(), recurringMonthly: false };
}

function amountInput(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits.slice(0, 12);
}

function formatAmountInput(value: string) {
  return value ? Number(value).toLocaleString("en-TZ") : "";
}

function toDateLabel(value: string, lang: "sw" | "en") {
  return new Date(value).toLocaleDateString(lang === "sw" ? "sw-TZ" : "en-US", { day: "numeric", month: "short", year: "numeric" });
}

function queryFromFilters(filters: Filters, period: Period) {
  const params = new URLSearchParams();
  params.set("period", period);
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.vendor.trim()) params.set("vendor", filters.vendor.trim());
  if (filters.category) params.set("category", filters.category);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const value = params.toString();
  return value ? `?${value}` : "";
}

export default function ExpensesPage() {
  const lang = useLang();
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary>(EMPTY_SUMMARY);
  const [period, setPeriod] = useState<Period>("month");
  const [form, setForm] = useState<ExpenseForm>(emptyExpenseForm);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({ search: "", vendor: "", category: "", from: "", to: "" });
  const [appliedFilters, setAppliedFilters] = useState<Filters>({ search: "", vendor: "", category: "", from: "", to: "" });
  const [assistantFocus, setAssistantFocus] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyRecurringId, setBusyRecurringId] = useState<string | null>(null);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);

  const filtersActive = Object.values(appliedFilters).some(Boolean);
  const amount = Number(form.amount || 0);
  const possibleDuplicate = useMemo(() => {
    if (!form.title.trim() || !amount || !form.spentAt) return null;
    return expenses.find((expense) => (
      expense.id !== editingExpense?.id
      &&
      expense.title.trim().toLowerCase() === form.title.trim().toLowerCase()
      && expense.amount === amount
      && (expense.vendor || "").trim().toLowerCase() === form.vendor.trim().toLowerCase()
      && expense.spentAt.slice(0, 10) === form.spentAt
    )) || null;
  }, [amount, editingExpense, expenses, form.spentAt, form.title, form.vendor]);

  async function load(nextFilters = appliedFilters, nextPeriod = period) {
    const data = await api.get<{ expenses: Expense[]; recurringExpenses: RecurringExpense[]; summary: ExpenseSummary }>(`/expenses${queryFromFilters(nextFilters, nextPeriod)}`, lang);
    setExpenses(data.expenses);
    setRecurringExpenses(data.recurringExpenses || []);
    setSummary({ ...EMPTY_SUMMARY, ...data.summary, topCategories: data.summary.topCategories || [] });
  }

  useEffect(() => {
    load().catch((error: unknown) => toast(error instanceof Error ? error.message : (lang === "sw" ? "Matumizi hayakuweza kupakiwa." : "Expenses could not be loaded."), "error"));
    setAssistantFocus(new URLSearchParams(window.location.search).get("focus") || "");
  // Load once. Filters explicitly control later requests.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateForm<K extends keyof ExpenseForm>(key: K, value: ExpenseForm[K]) {
    setDuplicateConfirmed(false);
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openAdd(preset?: { title: string; category: string }) {
    setEditingExpense(null);
    setDuplicateConfirmed(false);
    setForm({ ...emptyExpenseForm(), title: preset?.title || "", category: preset?.category || "OTHER" });
    setShowForm(true);
  }

  function openEdit(expense: Expense) {
    setEditingExpense(expense);
    setDuplicateConfirmed(false);
    setForm({
      title: expense.title,
      amount: String(expense.amount),
      category: expense.category,
      vendor: expense.vendor || "",
      note: expense.note || "",
      paymentMethod: (PAYMENT_LABELS[expense.paymentMethod] ? expense.paymentMethod : "CASH") as ExpenseForm["paymentMethod"],
      spentAt: expense.spentAt.slice(0, 10),
      recurringMonthly: false,
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingExpense(null);
    setDuplicateConfirmed(false);
  }

  async function saveExpense(event: React.FormEvent) {
    event.preventDefault();
    if (!amount) {
      toast(lang === "sw" ? "Weka kiasi sahihi cha TZS." : "Enter a valid TZS amount.", "error");
      return;
    }
    if (!editingExpense && possibleDuplicate && !duplicateConfirmed) {
      setDuplicateConfirmed(true);
      toast(lang === "sw" ? `Inaonekana ${possibleDuplicate.title} tayari imerekodiwa tarehe hii. Bonyeza Hifadhi tena kuthibitisha.` : `${possibleDuplicate.title} already appears on this date. Save again to confirm.`, "warning");
      return;
    }

    setSaving(true);
    try {
      const payload = { ...form, amount };
      if (editingExpense) {
        await api.patch(`/expenses/${editingExpense.id}`, payload, lang);
        toast(lang === "sw" ? "Matumizi yamebadilishwa." : "Expense updated.", "success");
      } else {
        await api.post("/expenses", payload, lang);
        toast(form.recurringMonthly
          ? (lang === "sw" ? "Matumizi yamehifadhiwa na ratiba ya kila mwezi imewekwa." : "Expense saved and monthly schedule created.")
          : (lang === "sw" ? "Matumizi yamehifadhiwa." : "Expense saved."), "success");
      }
      closeForm();
      await load();
    } catch (error: unknown) {
      toast(error instanceof Error ? error.message : (lang === "sw" ? "Matumizi hayakuweza kuhifadhiwa." : "Expense could not be saved."), "error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteExpense(expense: Expense) {
    const confirmed = window.confirm(lang === "sw"
      ? `Futa matumizi ya ${expense.title}? Hatua hii itahifadhiwa kwenye historia ya ukaguzi.`
      : `Delete ${expense.title}? This action will be kept in the audit history.`);
    if (!confirmed) return;
    try {
      await api.delete(`/expenses/${expense.id}`, lang);
      toast(lang === "sw" ? "Matumizi yamefutwa." : "Expense deleted.", "success");
      await load();
    } catch (error: unknown) {
      toast(error instanceof Error ? error.message : (lang === "sw" ? "Matumizi hayakuweza kufutwa." : "Expense could not be deleted."), "error");
    }
  }

  async function recordRecurring(recurringExpense: RecurringExpense) {
    const confirmed = window.confirm(lang === "sw"
      ? `Thibitisha malipo ya ${recurringExpense.title} ya ${formatTZS(recurringExpense.amount)}?`
      : `Record ${recurringExpense.title} for ${formatTZS(recurringExpense.amount)}?`);
    if (!confirmed) return;
    setBusyRecurringId(recurringExpense.id);
    try {
      await api.post(`/expenses/recurring/${recurringExpense.id}/record`, { spentAt: localDateValue() }, lang);
      toast(lang === "sw" ? "Matumizi ya kila mwezi yamehifadhiwa." : "Recurring expense recorded.", "success");
      await load();
    } catch (error: unknown) {
      toast(error instanceof Error ? error.message : (lang === "sw" ? "Matumizi hayakuweza kuhifadhiwa." : "Expense could not be recorded."), "error");
    } finally {
      setBusyRecurringId(null);
    }
  }

  async function stopRecurring(recurringExpense: RecurringExpense) {
    const confirmed = window.confirm(lang === "sw" ? `Sitisha ratiba ya ${recurringExpense.title}?` : `Stop the ${recurringExpense.title} schedule?`);
    if (!confirmed) return;
    try {
      await api.delete(`/expenses/recurring/${recurringExpense.id}`, lang);
      toast(lang === "sw" ? "Ratiba imesitishwa." : "Schedule stopped.", "success");
      await load();
    } catch (error: unknown) {
      toast(error instanceof Error ? error.message : (lang === "sw" ? "Ratiba haikuweza kusitishwa." : "Schedule could not be stopped."), "error");
    }
  }

  async function applyFilters(event: React.FormEvent) {
    event.preventDefault();
    setAppliedFilters(filters);
    try {
      await load(filters, period);
    } catch (error: unknown) {
      toast(error instanceof Error ? error.message : (lang === "sw" ? "Vichujio havikuweza kutumika." : "Filters could not be applied."), "error");
    }
  }

  async function clearFilters() {
    const clean = { search: "", vendor: "", category: "", from: "", to: "" };
    setFilters(clean);
    setAppliedFilters(clean);
    await load(clean, period);
  }

  async function selectPeriod(nextPeriod: Period) {
    if (nextPeriod === period && !filters.from && !filters.to) return;
    const cleanDates = { ...appliedFilters, from: "", to: "" };
    setPeriod(nextPeriod);
    setFilters((current) => ({ ...current, from: "", to: "" }));
    setAppliedFilters(cleanDates);
    try {
      await load(cleanDates, nextPeriod);
    } catch (error: unknown) {
      toast(error instanceof Error ? error.message : (lang === "sw" ? "Kipindi hakikuweza kubadilishwa." : "Could not change the period."), "error");
    }
  }

  const periodLabel = PERIODS.find((item) => item.value === period)?.[lang] || "";
  const largestCategoryTotal = Math.max(...summary.topCategories.map((item) => item.total), 0);
  const changeIsIncrease = (summary.changeAmount || 0) > 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-5 pb-24 lg:pb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-950">{lang === "sw" ? "Matumizi ya Biashara" : "Expense Tracking"}</h1>
            <p className="mt-1 text-sm text-gray-600">{lang === "sw" ? "Rekodi gharama za duka ili faida iwe ya kweli." : "Record shop costs so profit stays honest."}</p>
          </div>
          <button type="button" onClick={() => openAdd()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
            <Plus className="h-4 w-4" />
            {lang === "sw" ? "Ongeza matumizi" : "Add expense"}
          </button>
        </div>

        <section className="border-y border-gray-200 py-3" aria-label={lang === "sw" ? "Chagua kipindi" : "Select period"}>
          <div className="grid grid-cols-4 gap-1 rounded-lg bg-gray-100 p-1">
            {PERIODS.map((item) => <button key={item.value} type="button" onClick={() => selectPeriod(item.value)} className={`min-h-10 rounded-md px-2 text-xs font-semibold transition-colors ${period === item.value ? "bg-white text-brand-700 shadow-sm" : "text-gray-600 hover:text-gray-950"}`}>{item[lang]}</button>)}
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={lang === "sw" ? "Muhtasari wa matumizi" : "Expense overview"}>
          <Metric label={lang === "sw" ? `Matumizi: ${periodLabel}` : `Expenses: ${periodLabel}`} value={formatTZS(summary.total)} tone="amber" note={`${summary.count} ${lang === "sw" ? "rekodi" : "records"}`} />
          <Metric label={lang === "sw" ? "Tofauti na kipindi kilichopita" : "Compared with previous period"} value={summary.changeAmount == null ? "-" : formatTZS(Math.abs(summary.changeAmount))} tone={summary.changeAmount != null && changeIsIncrease ? "red" : "green"} note={summary.changeAmount == null ? (lang === "sw" ? "Hakuna ulinganisho wa muda wote" : "No all-time comparison") : `${changeIsIncrease ? (lang === "sw" ? "Imeongezeka" : "Increased") : (lang === "sw" ? "Imepungua" : "Decreased")}${summary.changePercent == null ? "" : ` ${Math.abs(summary.changePercent).toFixed(0)}%`}`} />
          <Metric label={lang === "sw" ? "Matumizi kwa mauzo" : "Expenses of sales"} value={summary.expensePercentOfSales == null ? "-" : `${summary.expensePercentOfSales.toFixed(1)}%`} tone="gray" note={summary.totalSales > 0 ? `${formatTZS(summary.totalSales)} ${lang === "sw" ? "mauzo" : "sales"}` : (lang === "sw" ? "Hakuna mauzo kwenye kipindi hiki" : "No sales this period")} />
          <Metric label={lang === "sw" ? "Faida baada ya matumizi" : "Net profit after expenses"} value={formatTZS(summary.netProfit)} tone={summary.netProfit < 0 ? "red" : "green"} note={`${formatTZS(summary.grossProfit)} ${lang === "sw" ? "faida kabla ya matumizi" : "gross profit"}`} />
        </section>

        <section className="border-y border-gray-200 py-4" aria-labelledby="expense-category-heading">
          <div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-brand-700" /><div><h2 id="expense-category-heading" className="text-sm font-semibold text-gray-950">{lang === "sw" ? "Makundi yenye matumizi makubwa" : "Top spending categories"}</h2><p className="mt-0.5 text-xs text-gray-500">{lang === "sw" ? `Makundi 3 yenye matumizi makubwa: ${periodLabel}` : `Top 3 categories: ${periodLabel}`}</p></div></div>
          {summary.topCategories.length > 0 ? <div className="mt-4 space-y-3">{summary.topCategories.map((item) => <div key={item.category} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1"><p className="truncate text-sm font-medium text-gray-800">{CATEGORY_LABELS[item.category]?.[lang] || item.category}</p><p className="text-sm font-semibold text-gray-950">{formatTZS(item.total)}</p><div className="col-span-2 h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-brand-600" style={{ width: `${largestCategoryTotal ? (item.total / largestCategoryTotal) * 100 : 0}%` }} /></div></div>)}</div> : <p className="mt-4 text-sm text-gray-500">{lang === "sw" ? "Hakuna matumizi kwenye kipindi hiki bado." : "No expenses in this period yet."}</p>}
        </section>

        <Link href="/inventory" className="flex items-start gap-3 border-y border-blue-200 bg-blue-50 px-4 py-3 text-blue-950 hover:bg-blue-100">
          <PackagePlus className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
          <span><span className="block text-sm font-semibold">{lang === "sw" ? "Nunua bidhaa kupitia Hifadhi ya Bidhaa" : "Receive stock through Inventory"}</span><span className="mt-0.5 block text-xs leading-5 text-blue-800">{lang === "sw" ? "Ongeza stock kwenye bidhaa ili gharama yake itumike mara moja tu pale bidhaa inapouzwa." : "Restock the product so its cost is recognised once, when the product sells."}</span></span>
        </Link>

        {assistantFocus && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">{assistantFocus === "profit"
              ? (lang === "sw" ? "DukaPilot imekufungua kukagua matumizi dhidi ya faida." : "DukaPilot opened expenses so you can review profit pressure.")
              : (lang === "sw" ? "DukaPilot imekufungua kwenye ukaguzi wa matumizi ya wiki." : "DukaPilot opened your weekly expense review.")}</p>
            <p className="mt-1 text-xs text-amber-800">{lang === "sw" ? "Angalia gharama kubwa, rekodi zilizokosekana, na matumizi yanayoweza kupunguzwa." : "Check large costs, missing records, and expenses that can be reduced."}</p>
          </div>
        )}

        {recurringExpenses.length > 0 && (
          <section className="overflow-hidden rounded-lg border border-blue-200 bg-blue-50" aria-labelledby="recurring-expenses-heading">
            <div className="flex items-center justify-between gap-3 border-b border-blue-100 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <Repeat2 className="h-4 w-4 shrink-0 text-blue-700" />
                <div className="min-w-0"><h2 id="recurring-expenses-heading" className="text-sm font-semibold text-blue-950">{lang === "sw" ? "Matumizi yanayojirudia" : "Recurring expenses"}</h2><p className="text-xs text-blue-800">{lang === "sw" ? "Rekodi malipo halisi, kisha tarehe inayofuata itasogea mwezi mmoja." : "Record the real payment, then the next date moves forward a month."}</p></div>
              </div>
            </div>
            <div className="divide-y divide-blue-100">
              {recurringExpenses.map((recurringExpense) => (
                <div key={recurringExpense.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-950">{recurringExpense.title}</p>
                    <p className="mt-0.5 text-xs text-blue-900">{formatTZS(recurringExpense.amount)} · {lang === "sw" ? "Inafuata" : "Next"} {toDateLabel(recurringExpense.nextDueAt, lang)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" onClick={() => recordRecurring(recurringExpense)} disabled={busyRecurringId === recurringExpense.id} className="min-h-9 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60">{busyRecurringId === recurringExpense.id ? (lang === "sw" ? "Inahifadhi..." : "Saving...") : (lang === "sw" ? "Rekodi sasa" : "Record now")}</button>
                    <button type="button" onClick={() => stopRecurring(recurringExpense)} title={lang === "sw" ? "Sitisha ratiba" : "Stop schedule"} aria-label={lang === "sw" ? `Sitisha ratiba ya ${recurringExpense.title}` : `Stop ${recurringExpense.title} schedule`} className="grid h-9 w-9 place-items-center rounded-lg border border-blue-200 text-blue-800 hover:bg-blue-100"><X className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white" aria-labelledby="expense-history-heading">
          <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 id="expense-history-heading" className="text-sm font-semibold text-gray-950">{lang === "sw" ? "Historia ya matumizi" : "Expense history"}</h2><p className="mt-0.5 text-xs text-gray-500">{filtersActive ? (lang === "sw" ? "Inaonyesha rekodi zilizochujwa." : "Showing filtered records.") : (lang === "sw" ? "Rekodi 100 za karibuni." : "Your 100 most recent records.")}</p></div>
            <button type="button" onClick={() => setShowFilters((open) => !open)} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"><Filter className="h-4 w-4" />{lang === "sw" ? "Chuja" : "Filter"}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${showFilters ? "rotate-180" : ""}`} /></button>
          </div>

          {showFilters && (
            <form onSubmit={applyFilters} className="grid gap-3 border-b border-gray-100 bg-gray-50 p-4 sm:grid-cols-2 lg:grid-cols-6">
              <label className="grid gap-1 text-xs font-medium text-gray-600 sm:col-span-2 lg:col-span-2"><span>{lang === "sw" ? "Tafuta" : "Search"}</span><span className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} className={`${INPUT} pl-9`} placeholder={lang === "sw" ? "Jina, muuzaji, au maelezo" : "Name, vendor, or note"} /></span></label>
              <label className="grid gap-1 text-xs font-medium text-gray-600 lg:col-span-1"><span>{lang === "sw" ? "Muuzaji" : "Vendor"}</span><input value={filters.vendor} onChange={(event) => setFilters((current) => ({ ...current, vendor: event.target.value }))} className={INPUT} placeholder={lang === "sw" ? "Mfano: TANESCO" : "Example: TANESCO"} /></label>
              <label className="grid gap-1 text-xs font-medium text-gray-600 lg:col-span-1"><span>{lang === "sw" ? "Aina" : "Category"}</span><select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))} className={INPUT}><option value="">{lang === "sw" ? "Aina zote" : "All categories"}</option>{categories.map((category) => <option key={category} value={category}>{CATEGORY_LABELS[category][lang]}</option>)}</select></label>
              <DateSelect className="sm:col-span-1 lg:col-span-1" lang={lang} label={lang === "sw" ? "Kuanzia" : "From"} value={filters.from} onChange={(from) => setFilters((current) => ({ ...current, from }))} />
              <DateSelect className="sm:col-span-1 lg:col-span-1" lang={lang} label={lang === "sw" ? "Hadi" : "To"} value={filters.to} onChange={(to) => setFilters((current) => ({ ...current, to }))} />
              <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-6"><button className="min-h-10 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">{lang === "sw" ? "Tumia vichujio" : "Apply filters"}</button>{filtersActive && <button type="button" onClick={() => clearFilters().catch(() => {})} className="min-h-10 rounded-lg border border-gray-300 px-4 text-sm font-semibold text-gray-700 hover:bg-white">{lang === "sw" ? "Ondoa vichujio" : "Clear filters"}</button>}</div>
            </form>
          )}

          {expenses.length === 0 ? (
            filtersActive ? (
              <div className="p-8 text-center"><Search className="mx-auto h-6 w-6 text-gray-400" /><p className="mt-3 text-sm font-semibold text-gray-800">{lang === "sw" ? "Hakuna matumizi yanayolingana." : "No expenses match these filters."}</p><button type="button" onClick={() => clearFilters().catch(() => {})} className="mt-3 text-sm font-semibold text-brand-700 hover:text-brand-900">{lang === "sw" ? "Ondoa vichujio" : "Clear filters"}</button></div>
            ) : (
              <div className="p-8 text-center"><ReceiptText className="mx-auto h-7 w-7 text-brand-600" /><p className="mt-3 text-sm font-semibold text-gray-950">{lang === "sw" ? "Rekodi matumizi yako ya kwanza" : "Record your first expense"}</p><p className="mx-auto mt-1 max-w-md text-sm text-gray-500">{lang === "sw" ? "Chagua gharama ya kawaida au ongeza matumizi mengine ya duka." : "Choose a common cost or add another shop expense."}</p><div className="mx-auto mt-4 flex max-w-lg flex-wrap justify-center gap-2">{QUICK_EXPENSES.map((expense) => <button type="button" key={expense.title} onClick={() => openAdd(expense)} className="min-h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:border-brand-300 hover:bg-brand-50">{expense.label[lang]}</button>)}</div></div>
            )
          ) : (
            <div className="divide-y divide-gray-100">
              {expenses.map((expense) => (
                <article key={expense.id} className="flex gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><p className="font-semibold text-gray-950">{expense.title}</p><span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">{CATEGORY_LABELS[expense.category]?.[lang] || expense.category}</span><span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">{PAYMENT_LABELS[expense.paymentMethod]?.[lang] || expense.paymentMethod}</span></div>
                    <p className="mt-1 text-xs text-gray-500">{toDateLabel(expense.spentAt, lang)}{expense.vendor ? ` · ${expense.vendor}` : ""}</p>
                    {expense.note && <p className="mt-1 text-sm text-gray-600">{expense.note}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2"><p className="text-sm font-bold text-gray-950">{formatTZS(expense.amount)}</p><div className="flex items-center gap-1"><button type="button" onClick={() => openEdit(expense)} title={lang === "sw" ? "Badilisha matumizi" : "Edit expense"} aria-label={lang === "sw" ? `Badilisha ${expense.title}` : `Edit ${expense.title}`} className="grid h-8 w-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900"><Edit3 className="h-4 w-4" /></button><button type="button" onClick={() => deleteExpense(expense)} title={lang === "sw" ? "Futa matumizi" : "Delete expense"} aria-label={lang === "sw" ? `Futa ${expense.title}` : `Delete ${expense.title}`} className="grid h-8 w-8 place-items-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-4 w-4" /></button></div></div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {showForm && (
        <ExpenseModal title={editingExpense ? (lang === "sw" ? "Badilisha matumizi" : "Edit expense") : (lang === "sw" ? "Ongeza matumizi" : "Add expense")} onClose={closeForm}>
          <form onSubmit={saveExpense} className="space-y-4">
            <label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Jina la matumizi" : "Expense name"}</span><input autoFocus required value={form.title} onChange={(event) => updateForm("title", event.target.value)} className={INPUT} placeholder={lang === "sw" ? "Mfano: Kodi ya mwezi" : "Example: Monthly rent"} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Kiasi (TZS)" : "Amount (TZS)"}</span><input required inputMode="numeric" value={formatAmountInput(form.amount)} onChange={(event) => updateForm("amount", amountInput(event.target.value))} className={INPUT} placeholder="150,000" /><span className="min-h-4 text-xs font-normal text-gray-500">{amount ? formatTZS(amount) : (lang === "sw" ? "Weka kiasi bila desimali" : "Whole TZS only")}</span></label>
              <label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Aina" : "Category"}</span><select value={form.category} onChange={(event) => updateForm("category", event.target.value)} className={INPUT}>{categories.map((category) => <option key={category} value={category}>{CATEGORY_LABELS[category][lang]}</option>)}</select></label>
            </div>
            <label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Muuzaji (hiari)" : "Vendor (optional)"}</span><input value={form.vendor} onChange={(event) => updateForm("vendor", event.target.value)} className={INPUT} placeholder={lang === "sw" ? "Mfano: TANESCO" : "Example: TANESCO"} /></label>
            <DateSelect lang={lang} label={lang === "sw" ? "Tarehe ya matumizi" : "Expense date"} required value={form.spentAt} onChange={(spentAt) => updateForm("spentAt", spentAt)} />
            <fieldset><legend className="mb-2 text-sm font-medium text-gray-700">{lang === "sw" ? "Njia ya malipo" : "Payment method"}</legend><div className="grid grid-cols-3 gap-2">{(["CASH", "MPESA", "BANK"] as const).map((paymentMethod) => <button type="button" key={paymentMethod} onClick={() => updateForm("paymentMethod", paymentMethod)} className={`min-h-10 rounded-lg border px-2 text-xs font-semibold ${form.paymentMethod === paymentMethod ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}>{PAYMENT_LABELS[paymentMethod][lang]}</button>)}</div></fieldset>
            <label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Maelezo (hiari)" : "Note (optional)"}</span><textarea value={form.note} onChange={(event) => updateForm("note", event.target.value)} className={`${INPUT} min-h-20 resize-y`} placeholder={lang === "sw" ? "Mfano: LUKU ya wiki ya kwanza" : "Example: First week's electricity"} /></label>
            {!editingExpense && <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3"><input type="checkbox" checked={form.recurringMonthly} onChange={(event) => updateForm("recurringMonthly", event.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-600" /><span><span className="block text-sm font-semibold text-blue-950">{lang === "sw" ? "Rudia kila mwezi" : "Repeat monthly"}</span><span className="mt-0.5 block text-xs text-blue-800">{lang === "sw" ? "Tutaweka ratiba, lakini hutarekodi gharama nyingine mpaka uthibitishe malipo yake." : "We will create a schedule, but no future cost is recorded until you confirm its payment."}</span></span></label>}
            {possibleDuplicate && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-semibold">{lang === "sw" ? "Inaweza kuwa nakala ya rekodi iliyopo" : "This may duplicate an existing record"}</p><p className="mt-1 text-xs text-amber-800">{formatTZS(possibleDuplicate.amount)} · {toDateLabel(possibleDuplicate.spentAt, lang)}{possibleDuplicate.vendor ? ` · ${possibleDuplicate.vendor}` : ""}</p></div>}
            <div className="flex gap-2 pt-1"><button type="button" onClick={closeForm} className="min-h-11 flex-1 rounded-lg border border-gray-300 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50">{lang === "sw" ? "Ghairi" : "Cancel"}</button><button type="submit" disabled={saving} className="min-h-11 flex-1 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">{saving ? (lang === "sw" ? "Inahifadhi..." : "Saving...") : (possibleDuplicate && !duplicateConfirmed ? (lang === "sw" ? "Thibitisha nakala" : "Confirm duplicate") : (editingExpense ? (lang === "sw" ? "Hifadhi mabadiliko" : "Save changes") : (lang === "sw" ? "Hifadhi" : "Save")))}</button></div>
          </form>
        </ExpenseModal>
      )}
    </AppShell>
  );
}

function Metric({ label, value, tone, note }: { label: string; value: string; tone: "amber" | "gray" | "brand" | "green" | "red"; note: string }) {
  const colors = { amber: "border-amber-200 bg-amber-50", gray: "border-gray-200 bg-white", brand: "border-brand-200 bg-brand-50", green: "border-green-200 bg-green-50", red: "border-red-200 bg-red-50" };
  return <div className={`rounded-lg border p-4 ${colors[tone]} min-w-0`}><p className="text-xs font-medium leading-5 text-gray-600">{label}</p><p className="mt-1 truncate text-lg font-bold text-gray-950">{value}</p><p className="mt-1 min-h-4 text-xs leading-4 text-gray-600">{note}</p></div>;
}

function ExpenseModal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4"><div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3"><h2 className="text-base font-semibold text-gray-950">{title}</h2><button type="button" onClick={onClose} aria-label="Close" title="Close" className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button></div><div className="p-4">{children}</div></div></div>;
}
