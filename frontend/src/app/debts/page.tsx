"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { api, formatTZS } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { MessageCircle, Trash2 } from "lucide-react";
import DateSelect from "@/components/ui/DateSelect";
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

export default function DebtsPage() {
  const lang = useLang();
  const { toast } = useToast();
  const [customers, setCustomers] = useState<DebtCustomer[]>([]);
  const [customerDebts, setCustomerDebts] = useState<Record<string, Debt[]>>({});
  const [expandedCustomers, setExpandedCustomers] = useState<Record<string, boolean>>({});
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({});
  const [summary, setSummary] = useState({ openCount: 0, totalOwed: 0 });
  const [form, setForm] = useState({ customerName: "", customerPhone: "", amount: "", dueDate: "", note: "" });
  const [paymentDrafts, setPaymentDrafts] = useState<Record<string, string>>({});
  const [paymentRequestKeys, setPaymentRequestKeys] = useState<Record<string, string>>({});
  const [assistantPrefill, setAssistantPrefill] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [shopName, setShopName] = useState("DukaPilot");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerPage, setCustomerPage] = useState(1);
  const [hasMoreCustomers, setHasMoreCustomers] = useState(false);
  const groupLoadSequence = useRef(0);

  function debtAge(createdAt: string) {
    const days = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000));
    return lang === "sw" ? `Imewekwa siku ${days} zilizopita` : `Opened ${days} day${days === 1 ? "" : "s"} ago`;
  }

  async function load(page = customerPage, search = customerSearch) {
    const requestId = ++groupLoadSequence.current;
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(page), limit: "25", search });
      const data = await api.get<{ customers: DebtCustomer[]; pagination: { hasMore: boolean }; summary: { openCount: number; totalOwed: number } }>(`/debts/groups?${query}`, lang);
      if (requestId !== groupLoadSequence.current) return;
      if (!data.customers.length && page > 1 && !search) {
        setCustomerPage(page - 1);
        return;
      }
      setCustomers(data.customers);
      setHasMoreCustomers(data.pagination.hasMore);
      setSummary(data.summary);
    } finally {
      if (requestId === groupLoadSequence.current) setLoading(false);
    }
  }

  async function loadCustomerDebts(phone: string) {
    const normalizedPhone = normalizeWhatsAppNumber(phone);
    const customerKey = normalizedPhone ? `+${normalizedPhone}` : phone;
    setDetailLoading((current) => ({ ...current, [customerKey]: true }));
    try {
      const data = await api.get<{ debts: Debt[] }>(`/debts/groups/${encodeURIComponent(phone)}`, lang);
      setCustomerDebts((current) => ({ ...current, [customerKey]: data.debts }));
    } finally {
      setDetailLoading((current) => ({ ...current, [customerKey]: false }));
    }
  }

  async function toggleCustomer(phone: string) {
    const isOpen = Boolean(expandedCustomers[phone]);
    setExpandedCustomers((current) => ({ ...current, [phone]: !isOpen }));
    if (!isOpen && !customerDebts[phone] && !detailLoading[phone]) {
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
  }, [customerPage, customerSearch]);

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
    await api.post("/debts", { ...form, amount: Number(form.amount) }, lang);
    setForm({ customerName: "", customerPhone: "", amount: "", dueDate: "", note: "" });
    setShowForm(false);
    setAssistantPrefill(false);
    setCustomerSearch("");
    setCustomerPage(1);
    await load(1, "");
  }

  async function recordPayment(debt: Debt, amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const requestKey = paymentRequestKeys[debt.id] || crypto.randomUUID();
    if (!paymentRequestKeys[debt.id]) {
      setPaymentRequestKeys((prev) => ({ ...prev, [debt.id]: requestKey }));
    }
    try {
      await api.post(`/debts/${debt.id}/payments`, { amount, requestKey }, lang);
      setPaymentDrafts((prev) => ({ ...prev, [debt.id]: "" }));
      setPaymentRequestKeys((prev) => {
        const next = { ...prev };
        delete next[debt.id];
        return next;
      });
      await Promise.allSettled([load(), loadCustomerDebts(debt.customerPhone)]);
    } catch (error) {
      // Preserve the key after a timeout so a retry returns the same receipt.
      throw error;
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
          <label className="grid gap-1 text-sm font-medium text-gray-700"><span>{lang === "sw" ? "Kiasi (TZS)" : "Amount (TZS)"}</span><input className={INPUT} required type="number" min="1" inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
          <DateSelect className="md:col-span-2" lang={lang} label={lang === "sw" ? "Tarehe ya mwisho" : "Due date"} value={form.dueDate} onChange={(dueDate) => setForm({ ...form, dueDate })} />
          <label className="grid gap-1 text-sm font-medium text-gray-700 md:col-span-4"><span>{lang === "sw" ? "Maelezo (hiari)" : "Note (optional)"}</span><input className={INPUT} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <button className="rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 md:col-span-2">{lang === "sw" ? "Hifadhi deni" : "Save debt"}</button>
        </form>}

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {loading ? (
            <div className="p-6 text-sm text-gray-500">{lang === "sw" ? "Inapakia..." : "Loading..."}</div>
          ) : customers.length === 0 && !customerSearch ? (
            <div className="p-6 text-sm text-gray-500">{lang === "sw" ? "Hakuna madeni bado." : "No debts yet."}</div>
          ) : <>
            <div className="border-b border-gray-200 bg-gray-50 p-3">
              <label className="block">
                <span className="sr-only">{lang === "sw" ? "Tafuta mteja kwa jina au simu" : "Search customers by name or phone"}</span>
                <input
                  type="search"
                  value={customerSearch}
                  onChange={(event) => { setCustomerSearch(event.target.value); setCustomerPage(1); }}
                  placeholder={lang === "sw" ? "Tafuta mteja kwa jina au simu" : "Search customers by name or phone"}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </label>
            </div>
            {customers.length === 0 ? <p className="p-6 text-center text-sm text-gray-500">{lang === "sw" ? "Hakuna mteja aliyepatikana." : "No matching customers."}</p> : customers.map((customer) => {
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
                  {detailLoading[customer.phone] ? <p className="p-4 text-sm text-gray-500">{lang === "sw" ? "Inapakia madeni..." : "Loading debts..."}</p> : history.length === 0 ? <p className="p-4 text-sm text-gray-500">{lang === "sw" ? "Hakuna madeni kwa mteja huyu." : "No debt records for this customer."}</p> : history.map((debt) => {
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
                    <input
                      value={paymentDrafts[debt.id] || ""}
                      onChange={(e) => {
                        setPaymentDrafts((prev) => ({ ...prev, [debt.id]: e.target.value }));
                        setPaymentRequestKeys((prev) => {
                          if (!prev[debt.id]) return prev;
                          const next = { ...prev };
                          delete next[debt.id];
                          return next;
                        });
                      }}
                      type="number"
                      min="1"
                      max={balance}
                      inputMode="numeric"
                      placeholder={lang === "sw" ? "Kiasi kilicholipwa" : "Amount paid"}
                      className={INPUT}
                    />
                    <button onClick={() => recordPayment(debt, Number(paymentDrafts[debt.id] || 0))} className="rounded-xl bg-brand-600 px-3 py-3 text-sm font-semibold text-white hover:bg-brand-700">
                      {lang === "sw" ? "Rekodi" : "Record"}
                    </button>
                    <button onClick={() => recordPayment(debt, balance)} className="rounded-xl border border-brand-600 px-3 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-50">
                      {lang === "sw" ? "Lipa yote" : "All paid"}
                    </button>
                    {debt.amountPaid === 0 && (
                      <button onClick={() => deleteDebt(debt)} className="inline-flex items-center justify-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm font-semibold text-red-700 hover:bg-red-100 sm:col-span-3">
                        <Trash2 className="h-4 w-4" />
                        {lang === "sw" ? "Futa deni lililoingizwa kimakosa" : "Delete mistaken debt"}
                      </button>
                    )}
                      </div>}
                    </div>;
                  })}
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
