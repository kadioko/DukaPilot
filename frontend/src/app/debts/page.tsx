"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { api, formatTZS } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { MessageCircle, Trash2 } from "lucide-react";
import DateSelect from "@/components/ui/DateSelect";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { useToast } from "@/components/ui/Toast";
import { normalizeWhatsAppNumber } from "@/lib/phone";

interface Debt {
  id: string;
  customerName: string | null;
  customerPhone: string;
  amount: number;
  amountPaid: number;
  status: "OPEN" | "PARTIAL" | "PAID" | "CANCELLED";
  dueDate: string | null;
  note: string | null;
  saleId?: string | null;
  createdAt: string;
  payments?: Array<{
    id: string;
    amount: number;
    paymentMethod: string;
    paymentRef?: string | null;
    note?: string | null;
    createdAt: string;
  }>;
}

const INPUT = "rounded-xl border border-gray-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500 sm:text-sm";
type DebtCustomer = { phone: string; name: string; debtCount: number; openCount: number; outstanding: number; lastDebtAt: string };
type CustomerFilter = "OUTSTANDING" | "ALL" | "PAID";
type PaymentMethod = "CASH" | "MPESA" | "TIGOPESA" | "AIRTEL_MONEY" | "HALOPESA" | "BANK";
const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "MPESA", "TIGOPESA", "AIRTEL_MONEY", "HALOPESA", "BANK"];
function customerKey(phone: string) {
  const normalized = normalizeWhatsAppNumber(phone);
  return normalized ? `+${normalized}` : phone;
}

export default function DebtsPage() {
  const lang = useLang();
  const { toast } = useToast();
  const [customers, setCustomers] = useState<DebtCustomer[]>([]);
  const [customerDebts, setCustomerDebts] = useState<Record<string, Debt[]>>({});
  const [historyPages, setHistoryPages] = useState<Record<string, number>>({});
  const [historyHasMore, setHistoryHasMore] = useState<Record<string, boolean>>({});
  const [expandedCustomers, setExpandedCustomers] = useState<Record<string, boolean>>({});
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({});
  const [summary, setSummary] = useState({ openCount: 0, totalOwed: 0 });
  const [form, setForm] = useState({ customerName: "", customerPhone: "", amount: "", dueDate: "", note: "" });
  const [paymentDrafts, setPaymentDrafts] = useState<Record<string, string>>({});
  const [paymentMethods, setPaymentMethods] = useState<Record<string, PaymentMethod>>({});
  const [paymentRefs, setPaymentRefs] = useState<Record<string, string>>({});
  const [paymentPending, setPaymentPending] = useState<Record<string, boolean>>({});
  const paymentInFlight = useRef(new Set<string>());
  const paymentAttempts = useRef<Record<string, { key: string; amount: number; method: PaymentMethod; paymentRef: string }>>({});
  const [assistantPrefill, setAssistantPrefill] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [creatingDebt, setCreatingDebt] = useState(false);
  const [shopName, setShopName] = useState("DukaPilot");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState<CustomerFilter>("OUTSTANDING");
  const [customerPage, setCustomerPage] = useState(1);
  const [hasMoreCustomers, setHasMoreCustomers] = useState(false);
  const groupLoadSequence = useRef(0);

  function debtAge(createdAt: string) {
    const days = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000));
    return lang === "sw" ? `Imewekwa siku ${days} zilizopita` : `Opened ${days} day${days === 1 ? "" : "s"} ago`;
  }

  async function load(page = customerPage, search = customerSearch, filter = customerFilter) {
    const requestId = ++groupLoadSequence.current;
    setLoading(true);
    setListError("");
    try {
      const query = new URLSearchParams({ page: String(page), limit: "25", search, filter });
      const data = await api.get<{ customers: DebtCustomer[]; pagination: { hasMore: boolean }; summary: { openCount: number; totalOwed: number } }>(`/debts/groups?${query}`, lang);
      if (requestId !== groupLoadSequence.current) return;
      if (!data.customers.length && page > 1) {
        setCustomerPage(page - 1);
        return;
      }
      setCustomers(data.customers);
      setHasMoreCustomers(data.pagination.hasMore);
      setSummary(data.summary);
    } catch (error) {
      if (requestId === groupLoadSequence.current) setListError(error instanceof Error ? error.message : (lang === "sw" ? "Wateja hawakupatikana." : "Customers could not be loaded."));
      throw error;
    } finally {
      if (requestId === groupLoadSequence.current) setLoading(false);
    }
  }

  async function loadCustomerDebts(phone: string, page = 1) {
    const key = customerKey(phone);
    setDetailLoading((current) => ({ ...current, [key]: true }));
    try {
      const query = new URLSearchParams({ page: String(page), limit: "20" });
      const data = await api.get<{ debts: Debt[]; pagination: { hasMore: boolean } }>(`/debts/groups/${encodeURIComponent(phone)}?${query}`, lang);
      setCustomerDebts((current) => ({ ...current, [key]: page === 1 ? data.debts : [...(current[key] || []), ...data.debts.filter((debt) => !(current[key] || []).some((existing) => existing.id === debt.id))] }));
      setHistoryPages((current) => ({ ...current, [key]: page }));
      setHistoryHasMore((current) => ({ ...current, [key]: data.pagination.hasMore }));
    } finally {
      setDetailLoading((current) => ({ ...current, [key]: false }));
    }
  }

  async function toggleCustomer(phone: string) {
    const isOpen = Boolean(expandedCustomers[phone]);
    setExpandedCustomers((current) => ({ ...current, [phone]: !isOpen }));
    if (!isOpen && !detailLoading[phone]) {
      try { await loadCustomerDebts(phone); }
      catch (error) { setExpandedCustomers((current) => ({ ...current, [phone]: false })); toast(error instanceof Error ? error.message : "Could not load customer debts.", "error"); }
    }
  }

  useEffect(() => {
    api.get<{ settings: { shop?: { name?: string } } }>("/settings", lang)
      .then((data) => setShopName(data.settings.shop?.name || "DukaPilot"))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => load().catch(console.error), 250);
    return () => window.clearTimeout(timer);
  }, [customerPage, customerSearch, customerFilter]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const customerName = params.get("customer") || "";
    const customerPhone = params.get("phone") || "";
    const amount = params.get("amount") || "";
    const note = params.get("note") || "";
    if (!customerName && !customerPhone && !amount && !note) return;
    setAssistantPrefill(true);
    setForm((prev) => ({
      ...prev,
      customerName: customerName || prev.customerName,
      customerPhone: customerPhone || prev.customerPhone,
      amount: amount || prev.amount,
      note: note || prev.note,
    }));
  }, []);

  async function addDebt(event: React.FormEvent) {
    event.preventDefault();
    if (creatingDebt) return;
    setCreatingDebt(true);
    try {
      await api.post("/debts", { ...form, amount: Number(form.amount) }, lang);
      setForm({ customerName: "", customerPhone: "", amount: "", dueDate: "", note: "" });
      setShowForm(false);
      setAssistantPrefill(false);
      setCustomerSearch("");
      setCustomerFilter("OUTSTANDING");
      setCustomerPage(1);
      toast(lang === "sw" ? "Deni limehifadhiwa." : "Debt saved.", "success");
      await load(1, "", "OUTSTANDING").catch(() => {});
    } catch (error) {
      toast(error instanceof Error ? error.message : (lang === "sw" ? "Deni halikuhifadhiwa." : "Debt could not be saved."), "error");
    } finally {
      setCreatingDebt(false);
    }
  }

  async function recordPayment(debt: Debt, amount: number) {
    if (paymentInFlight.current.has(debt.id)) return;
    if (!Number.isInteger(amount) || amount <= 0 || amount > debt.amount - debt.amountPaid) {
      toast(lang === "sw" ? "Weka kiasi halali kisichozidi deni lililobaki." : "Enter a valid amount no greater than the remaining balance.", "error");
      return;
    }
    const method = paymentMethods[debt.id] || "CASH";
    const paymentRef = method === "CASH" ? "" : (paymentRefs[debt.id] || "").trim();
    const previous = paymentAttempts.current[debt.id];
    const requestKey = previous?.amount === amount && previous.method === method && previous.paymentRef === paymentRef ? previous.key : crypto.randomUUID();
    paymentAttempts.current[debt.id] = { key: requestKey, amount, method, paymentRef };
    paymentInFlight.current.add(debt.id);
    setPaymentPending((current) => ({ ...current, [debt.id]: true }));
    try {
      const result = await api.post<{ debt: Debt }>(`/debts/${debt.id}/payments`, { amount, requestKey, paymentMethod: method, paymentRef: paymentRef || undefined }, lang);
      const key = customerKey(debt.customerPhone);
      const collected = Math.max(0, result.debt.amountPaid - debt.amountPaid);
      setCustomerDebts((current) => ({ ...current, [key]: (current[key] || []).map((item) => item.id === debt.id ? result.debt : item) }));
      setCustomers((current) => current.map((customer) => customer.phone === key ? {
        ...customer,
        outstanding: Math.max(0, customer.outstanding - collected),
        openCount: customer.openCount - (debt.status !== "PAID" && result.debt.status === "PAID" ? 1 : 0),
      } : customer).filter((customer) => customerFilter !== "OUTSTANDING" || customer.outstanding > 0));
      setSummary((current) => ({
        openCount: Math.max(0, current.openCount - (debt.status !== "PAID" && result.debt.status === "PAID" ? 1 : 0)),
        totalOwed: Math.max(0, current.totalOwed - collected),
      }));
      setPaymentDrafts((prev) => ({ ...prev, [debt.id]: "" }));
      setPaymentRefs((prev) => ({ ...prev, [debt.id]: "" }));
      delete paymentAttempts.current[debt.id];
      toast(lang === "sw" ? "Malipo yamehifadhiwa." : "Payment saved.", "success");
      const refresh = await Promise.allSettled([load(), loadCustomerDebts(debt.customerPhone)]);
      if (refresh.some((result) => result.status === "rejected")) {
        toast(lang === "sw" ? "Malipo yamehifadhiwa, lakini taarifa mpya hazikupatikana. Fungua tena ukurasa baadaye." : "Payment saved, but the latest list could not refresh. Reopen this page later.", "error");
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : (lang === "sw" ? "Malipo hayakuhifadhiwa. Jaribu tena." : "Payment could not be saved. Try again."), "error");
    } finally {
      paymentInFlight.current.delete(debt.id);
      setPaymentPending((current) => ({ ...current, [debt.id]: false }));
    }
  }

  async function deleteDebt(debt: Debt) {
    const confirmed = window.confirm(lang === "sw" ? "Futa deni hili lililoingizwa kimakosa? Hatua hii haiwezi kurudishwa." : "Delete this mistakenly entered debt? This cannot be undone.");
    if (!confirmed) return;
    try {
      await api.delete(`/debts/${debt.id}`, lang);
      toast(lang === "sw" ? "Deni limefutwa." : "Debt deleted.", "success");
      await Promise.allSettled([load(), loadCustomerDebts(debt.customerPhone)]);
    } catch (error: unknown) {
      toast(error instanceof Error ? error.message : (lang === "sw" ? "Deni halikuweza kufutwa." : "The debt could not be deleted."), "error");
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6 pb-24 lg:pb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-950">{lang === "sw" ? "Ufuatiliaji wa Madeni" : "Debt Tracking"}</h1>
            <p className="mt-1 text-sm text-gray-600">
              {lang === "sw" ? "Fuatilia wateja waliokopa na malipo yao." : "Track customer credit and repayments."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-900">
              <strong>{formatTZS(summary.totalOwed)}</strong> {lang === "sw" ? "bado kulipwa kutoka kwa wadaiwa" : "still owed across open debts"} ({summary.openCount})
            </div>
            <button type="button" onClick={() => setShowForm((open) => !open)} className="rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700">
              {showForm ? (lang === "sw" ? "Funga" : "Close") : (lang === "sw" ? "Ongeza deni" : "Add debt")}
            </button>
          </div>
        </div>

        {assistantPrefill && (
          <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-900">
            <p className="font-semibold">
              {lang === "sw" ? "DukaPilot imejaza deni hili kwa ajili ya ufuatiliaji." : "DukaPilot prefilled this debt follow-up."}
            </p>
            <p className="mt-1 text-xs text-brand-700">
              {lang === "sw" ? "Hakiki taarifa, rekodi malipo, au tuma WhatsApp kwa mteja." : "Review the details, record a payment, or WhatsApp the customer."}
            </p>
          </div>
        )}

        {showForm && <form onSubmit={addDebt} className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 md:grid-cols-6">
          <label className="grid gap-1 text-sm font-medium text-gray-700 md:col-span-2"><span>{lang === "sw" ? "Jina la mteja" : "Customer name"}</span><input className={INPUT} required autoComplete="name" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></label>
          <label className="grid gap-1 text-sm font-medium text-gray-700 md:col-span-2"><span>{lang === "sw" ? "Simu ya mteja" : "Customer phone"}</span><input className={INPUT} required type="tel" inputMode="tel" autoComplete="tel" value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} /></label>
          <label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Kiasi (TZS)" : "Amount (TZS)"}</span><CurrencyInput className={INPUT} required value={form.amount} onChange={(value) => setForm({ ...form, amount: value })} /></label>
          <DateSelect className="md:col-span-2" lang={lang} label={lang === "sw" ? "Tarehe ya mwisho" : "Due date"} value={form.dueDate} onChange={(dueDate) => setForm({ ...form, dueDate })} />
          <label className="grid gap-1 text-sm font-medium text-gray-700 md:col-span-4"><span>{lang === "sw" ? "Maelezo (hiari)" : "Note (optional)"}</span><input className={INPUT} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <button disabled={creatingDebt} className="rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 md:col-span-2">{creatingDebt ? (lang === "sw" ? "Inahifadhi..." : "Saving...") : (lang === "sw" ? "Hifadhi deni" : "Save debt")}</button>
        </form>}

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="space-y-3 border-b border-gray-200 bg-gray-50 p-3">
            <label className="block">
              <span className="sr-only">{lang === "sw" ? "Tafuta mteja kwa jina au simu" : "Search customers by name or phone"}</span>
              <input
                type="search"
                value={customerSearch}
                onChange={(event) => { setCustomerSearch(event.target.value); setCustomerPage(1); }}
                placeholder={lang === "sw" ? "Tafuta mteja kwa jina au simu" : "Search customers by name or phone"}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-500 sm:text-sm"
              />
            </label>
            <div className="flex gap-1 rounded-lg bg-gray-200 p-1" role="group" aria-label={lang === "sw" ? "Chuja madeni" : "Filter debts"}>
              {(["OUTSTANDING", "ALL", "PAID"] as CustomerFilter[]).map((filter) => (
                <button key={filter} type="button" aria-pressed={customerFilter === filter} onClick={() => { setCustomerFilter(filter); setCustomerPage(1); }} className={`min-h-10 flex-1 rounded-md px-2 text-sm font-semibold ${customerFilter === filter ? "bg-white text-gray-950 shadow-sm" : "text-gray-600"}`}>
                  {filter === "OUTSTANDING" ? (lang === "sw" ? "Bado" : "Outstanding") : filter === "PAID" ? (lang === "sw" ? "Yamelipwa" : "Paid") : (lang === "sw" ? "Yote" : "All")}
                </button>
              ))}
            </div>
          </div>
          {listError && <div role="alert" className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{listError} <button type="button" onClick={() => load().catch(() => {})} className="ml-2 font-semibold underline">{lang === "sw" ? "Jaribu tena" : "Retry"}</button></div>}
          {loading ? (
            <div className="p-6 text-sm text-gray-500">{lang === "sw" ? "Inapakia..." : "Loading..."}</div>
          ) : customers.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">{customerSearch ? (lang === "sw" ? "Hakuna mteja aliyepatikana." : "No matching customers.") : customerFilter === "OUTSTANDING" ? (lang === "sw" ? "Hakuna madeni yanayodaiwa kwa sasa." : "No outstanding debts right now.") : (lang === "sw" ? "Hakuna madeni kwenye orodha hii." : "No debts in this view.")}</div>
          ) : <>
            {customers.map((customer) => {
              const whatsappPhone = normalizeWhatsAppNumber(customer.phone);
              const customerName = customer.name || customer.phone;
              const isExpanded = Boolean(expandedCustomers[customer.phone]);
              const history = customerDebts[customer.phone] || [];
              return (
              <section key={customer.phone} className="border-b border-gray-200 last:border-b-0" aria-label={`${customerName} ${customer.phone}`}>
                <div className="flex flex-col gap-3 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                  <button type="button" onClick={() => toggleCustomer(customer.phone)} aria-expanded={isExpanded} className="min-w-0 text-left">
                    <h2 className="truncate font-semibold text-gray-950">{customerName}</h2>
                    <p className="text-sm text-gray-500">{customer.phone}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {customer.debtCount} {lang === "sw" ? "madeni kwa jumla" : `debt${customer.debtCount === 1 ? "" : "s"}`} · {customer.openCount} {lang === "sw" ? "bado wazi" : "open"}
                    </p>
                    <span className="mt-1 inline-block text-xs font-semibold text-brand-700">{isExpanded ? (lang === "sw" ? "Ficha madeni" : "Hide debts") : (lang === "sw" ? "Ona madeni yote" : "View all debts")}</span>
                  </button>
                  <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    <div className="sm:text-right">
                      <p className="text-xs text-gray-500">{lang === "sw" ? "Jumla inayodaiwa" : "Total outstanding"}</p>
                      <p className="font-bold text-gray-950">{formatTZS(customer.outstanding)}</p>
                    </div>
                    {whatsappPhone && customer.outstanding > 0 && <a
                      href={`https://wa.me/${whatsappPhone}?text=${encodeURIComponent(lang === "sw" ? `Habari ${customer.name}, huu ni ukumbusho kutoka ${shopName}. Jumla ya madeni yako yaliyobaki ni ${formatTZS(customer.outstanding)}.` : `Hello ${customer.name}, this is a reminder from ${shopName}. Your total outstanding balance is ${formatTZS(customer.outstanding)}.`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-1 rounded-lg bg-green-100 px-3 py-2.5 text-sm font-semibold text-green-700 hover:bg-green-200"
                    >
                      <MessageCircle className="h-4 w-4" /> WhatsApp
                    </a>}
                  </div>
                </div>
                {isExpanded && <div className="divide-y divide-gray-100 bg-gray-50/70">
                  {history.length === 0 && detailLoading[customer.phone] ? <p className="p-4 text-sm text-gray-500">{lang === "sw" ? "Inapakia madeni..." : "Loading debts..."}</p> : history.length === 0 ? <p className="p-4 text-sm text-gray-500">{lang === "sw" ? "Hakuna madeni kwa mteja huyu." : "No debt records for this customer."}</p> : history.map((debt) => {
                    const balance = debt.status === "CANCELLED" ? 0 : Math.max(0, debt.amount - debt.amountPaid);
                    return <div key={debt.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.2fr)] lg:items-center">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{lang === "sw" ? "Deni" : "Debt"} · {debtAge(debt.createdAt)}</p>
                        <p className="text-xs text-gray-500">{debt.status}{debt.dueDate ? ` · ${lang === "sw" ? "Mwisho" : "Due"} ${new Date(debt.dueDate).toLocaleDateString(lang === "sw" ? "sw-TZ" : "en-US")}` : ""}</p>
                        {debt.note && <p className="mt-1 break-words text-xs text-gray-600">{debt.note}</p>}
                        {debt.payments && debt.payments.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{debt.payments.slice(0, 3).map((payment) => <span key={payment.id} className="rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-800">{formatTZS(payment.amount)} {payment.paymentMethod} · {new Date(payment.createdAt).toLocaleDateString(lang === "sw" ? "sw-TZ" : "en-US")}</span>)}</div>}
                      </div>
                      <div className="text-sm lg:text-right">
                        <p className="font-semibold text-gray-950">{formatTZS(balance)}</p>
                        <p className="text-gray-500">{formatTZS(debt.amountPaid)} {lang === "sw" ? "imelipwa" : "paid"} / {formatTZS(debt.amount)}</p>
                      </div>
                      {balance > 0 && debt.status !== "CANCELLED" && <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <CurrencyInput
                      value={paymentDrafts[debt.id] || ""}
                      onChange={(value) => setPaymentDrafts((prev) => ({ ...prev, [debt.id]: value }))}
                      placeholder={lang === "sw" ? "Kiasi kilicholipwa" : "Amount paid"}
                      aria-label={`${lang === "sw" ? "Kiasi kilicholipwa kwa deni la" : "Amount paid for debt of"} ${customerName}`}
                      disabled={paymentPending[debt.id]}
                      className={`${INPUT} min-w-0 disabled:opacity-50`}
                    />
                    <label className="sm:col-span-3 grid gap-1 text-xs font-semibold text-gray-600">
                      <span>{lang === "sw" ? "Njia ya malipo" : "Payment method"}</span>
                      <select value={paymentMethods[debt.id] || "CASH"} disabled={paymentPending[debt.id]} onChange={(event) => setPaymentMethods((current) => ({ ...current, [debt.id]: event.target.value as PaymentMethod }))} className="min-h-11 rounded-lg border border-gray-300 bg-white px-3 text-base sm:text-sm">
                        {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method === "TIGOPESA" ? "Mix by Yas" : method === "AIRTEL_MONEY" ? "Airtel Money" : method === "HALOPESA" ? "HaloPesa" : method === "BANK" ? (lang === "sw" ? "Benki" : "Bank") : method === "CASH" ? (lang === "sw" ? "Taslimu" : "Cash") : "M-Pesa"}</option>)}
                      </select>
                    </label>
                    {(paymentMethods[debt.id] || "CASH") !== "CASH" && <input value={paymentRefs[debt.id] || ""} disabled={paymentPending[debt.id]} onChange={(event) => setPaymentRefs((current) => ({ ...current, [debt.id]: event.target.value }))} maxLength={100} placeholder={lang === "sw" ? "Namba ya kumbukumbu (hiari)" : "Payment reference (optional)"} aria-label={lang === "sw" ? "Namba ya kumbukumbu ya malipo" : "Payment reference"} className={`${INPUT} min-w-0 sm:col-span-3`} />}
                    <button disabled={paymentPending[debt.id]} onClick={() => recordPayment(debt, Number(paymentDrafts[debt.id] || 0))} className="rounded-xl bg-brand-600 px-3 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                      {paymentPending[debt.id] ? (lang === "sw" ? "Inahifadhi..." : "Saving...") : (lang === "sw" ? "Rekodi" : "Record")}
                    </button>
                    <button disabled={paymentPending[debt.id]} onClick={() => recordPayment(debt, balance)} className="rounded-xl border border-brand-600 px-3 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50">
                      {lang === "sw" ? "Lipa yote" : "All paid"}
                    </button>
                    {debt.amountPaid === 0 && (
                      <button disabled={paymentPending[debt.id]} onClick={() => deleteDebt(debt)} className="inline-flex items-center justify-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 sm:col-span-3">
                        <Trash2 className="h-4 w-4" />
                        {lang === "sw" ? "Futa deni lililoingizwa kimakosa" : "Delete mistaken debt"}
                      </button>
                    )}
                      </div>}
                    </div>;
                  })}
                  {historyHasMore[customer.phone] && <div className="p-3 text-center"><button type="button" disabled={detailLoading[customer.phone]} onClick={() => loadCustomerDebts(customer.phone, (historyPages[customer.phone] || 1) + 1).catch((error) => toast(error instanceof Error ? error.message : "Could not load more debts.", "error"))} className="min-h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 disabled:opacity-50">{detailLoading[customer.phone] ? (lang === "sw" ? "Inapakia..." : "Loading...") : (lang === "sw" ? "Ona madeni zaidi" : "Load more debts")}</button></div>}
                </div>}
              </section>
            );
            })}
            <div className="flex items-center justify-between gap-3 border-t border-gray-200 bg-white p-3">
              <button type="button" disabled={customerPage <= 1 || loading} onClick={() => setCustomerPage((page) => Math.max(1, page - 1))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50">{lang === "sw" ? "Wateja wa nyuma" : "Previous customers"}</button>
              <span className="text-xs text-gray-500">{lang === "sw" ? "Ukurasa" : "Page"} {customerPage}</span>
              <button type="button" disabled={!hasMoreCustomers || loading} onClick={() => setCustomerPage((page) => page + 1)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50">{lang === "sw" ? "Wateja zaidi" : "Next customers"}</button>
            </div>
          </>}
        </div>
      </div>
    </AppShell>
  );
}
