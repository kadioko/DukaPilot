"use client";

import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, BadgeCheck, RefreshCw, Scale, Search, SlidersHorizontal, WalletCards } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { api, formatTZS } from "@/lib/api";
import { useLang } from "@/lib/i18n";

type AdminTransaction = {
  id: string;
  kind: string;
  status: string;
  amountTzs: number;
  platformFeeTzs: number;
  providerFeeTzs: number;
  totalDebitTzs: number;
  recipientPhone?: string | null;
  recipientName?: string | null;
  payoutRail?: string | null;
  providerStatus?: string | null;
  failureReason?: string | null;
  providerId?: string | null;
  createdAt: string;
  shop?: { id: string; name: string; ownerName?: string | null; ownerPhone?: string | null } | null;
};

type AdminOverview = {
  config: { enabled: boolean; feeBps: number; minimumWithdrawalTzs: number };
  wallets: { count: number; customerLiabilityTzs: number };
  pending: { depositTzs: number; withdrawalTzs: number; count: number };
  retainedPlatformFeeTzs: number;
  provider: { balanceTzs: number | null; settledExpectedBalanceTzs: number; expectedRangeMaxTzs: number; differenceTzs: number | null; withinPendingSettlementRange: boolean; error?: string | null };
};

type TransactionList = { transactions: AdminTransaction[]; pagination: { page: number; totalPages: number; total: number } };

function messageOf(error: unknown) { return error instanceof Error ? error.message : "The request could not be completed."; }
function dateOf(value: string) { return new Date(value).toLocaleString("en-TZ", { dateStyle: "medium", timeStyle: "short" }); }
function amountInput(value: string) { const digits = value.replace(/\D/g, ""); return digits ? Number(digits).toLocaleString("en-TZ") : ""; }
function statusClass(status: string) { return status === "COMPLETED" ? "bg-emerald-100 text-emerald-800" : ["PENDING", "REVIEW"].includes(status) ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"; }

export default function AdminWalletPage() {
  const lang = useLang();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [list, setList] = useState<TransactionList | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("ALL");
  const [kind, setKind] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [adjustmentShop, setAdjustmentShop] = useState<{ id: string; name: string } | null>(null);
  const [adjustmentDirection, setAdjustmentDirection] = useState("CREDIT");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");

  async function load(nextPage = page) {
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(nextPage), limit: "25" });
      if (status !== "ALL") query.set("status", status);
      if (kind !== "ALL") query.set("kind", kind);
      if (search.trim()) query.set("search", search.trim());
      const [summary, transactions] = await Promise.all([
        api.get<AdminOverview>("/wallet/admin/overview", lang),
        api.get<TransactionList>(`/wallet/admin/transactions?${query.toString()}`, lang),
      ]);
      setOverview(summary);
      setList(transactions);
    } catch (error) {
      setNotice(messageOf(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(page); }, [page]);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    void load(1);
  }

  async function reconcilePending() {
    setBusy("pending"); setNotice("");
    try {
      const result = await api.post<{ checked: number }>("/wallet/admin/reconcile-pending", { limit: 50 }, lang);
      setNotice(`Checked ${result.checked} pending wallet transaction${result.checked === 1 ? "" : "s"}.`);
      await load(page);
    } catch (error) { setNotice(messageOf(error)); } finally { setBusy(null); }
  }

  async function reconcile(transaction: AdminTransaction) {
    setBusy(transaction.id); setNotice("");
    try {
      await api.post(`/wallet/admin/transactions/${transaction.id}/reconcile`, {}, lang);
      setNotice(`Reconciled ${transaction.shop?.name || "wallet transaction"}.`);
      await load(page);
    } catch (error) { setNotice(messageOf(error)); } finally { setBusy(null); }
  }

  async function submitAdjustment(event: FormEvent) {
    event.preventDefault();
    const amountTzs = Number(adjustmentAmount.replace(/\D/g, ""));
    if (!adjustmentShop || !amountTzs || !adjustmentReason.trim()) {
      setNotice("Choose a business, amount, and written reconciliation reason.");
      return;
    }
    setBusy("adjustment"); setNotice("");
    try {
      await api.post("/wallet/admin/adjustments", {
        shopId: adjustmentShop.id,
        direction: adjustmentDirection,
        amountTzs,
        reason: adjustmentReason,
        requestKey: crypto.randomUUID(),
      }, lang);
      setNotice(`Recorded ${adjustmentDirection.toLowerCase()} adjustment for ${adjustmentShop.name}.`);
      setAdjustmentAmount(""); setAdjustmentReason(""); setAdjustmentShop(null);
      await load(page);
    } catch (error) { setNotice(messageOf(error)); } finally { setBusy(null); }
  }

  const difference = overview?.provider.differenceTzs;
  const withinPendingRange = Boolean(overview?.provider.withinPendingSettlementRange);
  return <AppShell>
    <div className="mx-auto max-w-6xl space-y-5 pb-24 lg:pb-8">
      <header className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-brand-700"><WalletCards className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-wide">DukaPilot Admin</span></div><h1 className="mt-1 text-xl font-bold text-gray-950">Merchant Wallet Reconciliation</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600">Customer balances are internal liabilities. Provider funds, platform withdrawal fees, and pending settlement must agree before money is moved again.</p></div><div className="flex gap-2"><button type="button" onClick={() => void load(page)} disabled={loading} className="inline-flex h-11 items-center gap-2 border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 hover:border-brand-400 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</button><button type="button" onClick={() => void reconcilePending()} disabled={busy === "pending"} className="inline-flex h-11 items-center gap-2 bg-brand-700 px-3 text-sm font-bold text-white hover:bg-brand-800 disabled:opacity-50"><BadgeCheck className="h-4 w-4" />{busy === "pending" ? "Checking..." : "Reconcile pending"}</button></div></header>
      {notice && <p role="status" className="border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-950">{notice}</p>}
      {!overview?.config.enabled && <div className="border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Controlled rollout is still off.</strong> Wallet records can be reviewed, but no new deposit or withdrawal provider request can be created until `NTZS_MERCHANT_BALANCE_ENABLED=true` is deliberately set in Railway.</div>}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Metric label="Customer liability" value={formatTZS(overview?.wallets.customerLiabilityTzs || 0)} note={`${overview?.wallets.count || 0} business wallets`} tone="brand" /><Metric label="Provider pool balance" value={overview?.provider.balanceTzs === null || overview?.provider.balanceTzs === undefined ? "Not refreshed" : formatTZS(overview.provider.balanceTzs)} note={overview?.provider.error || "nTZS pooled user wallet"} tone="sky" /><Metric label="Settled pool balance" value={formatTZS(overview?.provider.settledExpectedBalanceTzs || 0)} note={`Liability + ${formatTZS(overview?.retainedPlatformFeeTzs || 0)} retained fees`} tone="slate" /><Metric label="Reconciliation difference" value={difference === null || difference === undefined ? "-" : formatTZS(difference)} note={withinPendingRange ? "Within pending-payout timing range" : "Investigate before a fee sweep"} tone={withinPendingRange ? "green" : "amber"} /></section>
      <section className="grid gap-3 md:grid-cols-3"><Metric label="Pending deposits" value={formatTZS(overview?.pending.depositTzs || 0)} note="Not yet credited" tone="amber" /><Metric label="Pending withdrawals" value={formatTZS(overview?.pending.withdrawalTzs || 0)} note="Already reserved from available balance" tone="amber" /><Metric label="Items needing review" value={String(overview?.pending.count || 0)} note="Pending or review status" tone="slate" /></section>

      <section className="border border-gray-200 bg-white p-5"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" /><div><h2 className="font-bold text-gray-950">Manual correction is for evidence-backed reconciliation only</h2><p className="mt-1 text-sm leading-6 text-gray-600">It changes the DukaPilot ledger, not nTZS. Use it only after confirming a provider outcome or a documented operational correction. Every adjustment is audited.</p></div></div><form onSubmit={submitAdjustment} className="mt-4 grid gap-3 border-t border-gray-100 pt-4 lg:grid-cols-[1.1fr_0.7fr_0.8fr_1.7fr_auto]"><div className="min-w-0"><label className="grid gap-1 text-xs font-bold text-gray-600"><span>Business</span><input value={adjustmentShop ? adjustmentShop.name : ""} readOnly placeholder="Use Adjust on a transaction" className="min-h-10 border border-gray-300 bg-gray-50 px-3 text-sm text-gray-700" /></label></div><label className="grid gap-1 text-xs font-bold text-gray-600"><span>Direction</span><select value={adjustmentDirection} onChange={(event) => setAdjustmentDirection(event.target.value)} className="min-h-10 border border-gray-300 bg-white px-3 text-sm"><option value="CREDIT">Credit</option><option value="DEBIT">Debit</option></select></label><label className="grid gap-1 text-xs font-bold text-gray-600"><span>Amount TZS</span><input value={amountInput(adjustmentAmount)} inputMode="numeric" onChange={(event) => setAdjustmentAmount(event.target.value.replace(/\D/g, ""))} className="min-h-10 border border-gray-300 bg-white px-3 text-sm" /></label><label className="grid gap-1 text-xs font-bold text-gray-600"><span>Evidence / reason</span><input value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} maxLength={500} placeholder="Provider reference and reason" className="min-h-10 border border-gray-300 bg-white px-3 text-sm" /></label><button disabled={busy === "adjustment" || !adjustmentShop} className="mt-auto min-h-10 bg-gray-900 px-4 text-sm font-bold text-white disabled:opacity-50">{busy === "adjustment" ? "Saving..." : "Record"}</button></form></section>

      <section className="border border-gray-200 bg-white"><div className="border-b border-gray-100 p-5"><div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-gray-500" /><h2 className="font-bold text-gray-950">Wallet transaction queue</h2></div><form onSubmit={applyFilters} className="mt-4 grid gap-2 md:grid-cols-[1.4fr_0.8fr_0.8fr_auto]"><label className="relative"><span className="sr-only">Search business or provider ID</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search business or provider ID" className="min-h-10 w-full border border-gray-300 bg-white pl-9 pr-3 text-sm" /></label><select value={kind} onChange={(event) => setKind(event.target.value)} className="min-h-10 border border-gray-300 bg-white px-3 text-sm"><option value="ALL">All types</option><option value="DEPOSIT">Deposits</option><option value="WITHDRAWAL">Withdrawals</option><option value="ADJUSTMENT">Adjustments</option></select><select value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-10 border border-gray-300 bg-white px-3 text-sm"><option value="ALL">All statuses</option><option value="PENDING">Pending</option><option value="REVIEW">Review</option><option value="COMPLETED">Completed</option><option value="FAILED">Failed</option><option value="REVERSED">Reversed</option></select><button className="min-h-10 bg-brand-700 px-4 text-sm font-bold text-white">Apply</button></form></div>
        {loading ? <div className="p-8 text-center text-sm text-gray-500">Loading wallet records...</div> : !list?.transactions.length ? <div className="p-8 text-center text-sm text-gray-500">No wallet transactions match these filters.</div> : <div className="divide-y divide-gray-100">{list.transactions.map((transaction) => <article key={transaction.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[1.35fr_0.9fr_0.9fr_auto]"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-gray-950">{transaction.shop?.name || "Unknown business"}</p><span className={`px-2 py-0.5 text-[11px] font-bold ${statusClass(transaction.status)}`}>{transaction.status}</span><span className="border border-gray-200 px-2 py-0.5 text-[11px] font-bold text-gray-600">{transaction.kind}</span></div><p className="mt-1 text-xs text-gray-500">{transaction.shop?.ownerName || "No owner"}{transaction.shop?.ownerPhone ? ` · ${transaction.shop.ownerPhone}` : ""} · {dateOf(transaction.createdAt)}</p>{transaction.failureReason && <p className="mt-2 text-xs leading-5 text-red-700">{transaction.failureReason}</p>}</div><div><p className="text-xs font-semibold text-gray-500">{transaction.kind === "DEPOSIT" ? "Credit" : "Recipient"}</p><p className="mt-1 font-bold text-gray-950">{formatTZS(transaction.amountTzs)}</p>{transaction.recipientPhone && <p className="mt-1 text-xs text-gray-500">{transaction.recipientPhone}</p>}</div><div><p className="text-xs font-semibold text-gray-500">Fees / total debit</p><p className="mt-1 font-bold text-gray-950">{transaction.kind === "WITHDRAWAL" ? formatTZS(transaction.totalDebitTzs) : "-"}</p>{transaction.kind === "WITHDRAWAL" && <p className="mt-1 text-xs text-gray-500">Platform {formatTZS(transaction.platformFeeTzs)} · Provider {formatTZS(transaction.providerFeeTzs)}</p>}</div><div className="flex flex-wrap items-center gap-2 lg:justify-end"><button type="button" onClick={() => setAdjustmentShop(transaction.shop ? { id: transaction.shop.id, name: transaction.shop.name } : null)} disabled={!transaction.shop} className="h-10 border border-gray-300 bg-white px-3 text-xs font-bold text-gray-700 hover:border-gray-500 disabled:opacity-50">Adjust</button>{["PENDING", "REVIEW"].includes(transaction.status) && <button type="button" onClick={() => void reconcile(transaction)} disabled={busy === transaction.id} className="inline-flex h-10 items-center gap-1 bg-brand-700 px-3 text-xs font-bold text-white disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${busy === transaction.id ? "animate-spin" : ""}`} />Check</button>}</div></article>)}</div>}
        {(list?.pagination.totalPages || 1) > 1 && <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 text-sm"><button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="min-h-10 border border-gray-300 px-3 font-semibold text-gray-700 disabled:opacity-50">Previous</button><span className="text-xs text-gray-500">Page {page} of {list?.pagination.totalPages} · {list?.pagination.total} total</span><button onClick={() => setPage((current) => Math.min(list?.pagination.totalPages || current, current + 1))} disabled={page >= (list?.pagination.totalPages || 1)} className="min-h-10 border border-gray-300 px-3 font-semibold text-gray-700 disabled:opacity-50">Next</button></div>}
      </section>
      <section className="border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-700"><div className="flex gap-3"><Scale className="mt-0.5 h-5 w-5 flex-none text-brand-700" /><p><strong className="text-gray-950">Reconciliation rule:</strong> settled provider balance should equal customer liability plus withdrawal fees still retained in the pool. Pending payouts may not be debited yet, and a completed deposit may arrive before DukaPilot credits its ledger, so the provider balance can temporarily be as high as {formatTZS(overview?.provider.expectedRangeMaxTzs || 0)}. Investigate any balance outside that range before moving platform revenue.</p></div></section>
    </div>
  </AppShell>;
}

function Metric({ label, value, note, tone }: { label: string; value: string; note: string; tone: "brand" | "sky" | "slate" | "green" | "amber" }) {
  const styles = { brand: "border-brand-200 bg-brand-50", sky: "border-sky-200 bg-sky-50", slate: "border-gray-200 bg-gray-50", green: "border-emerald-200 bg-emerald-50", amber: "border-amber-200 bg-amber-50" }[tone];
  return <article className={`border p-4 ${styles}`}><p className="text-xs font-bold uppercase tracking-wide text-gray-600">{label}</p><p className="mt-2 text-xl font-bold text-gray-950">{value}</p><p className="mt-2 text-xs leading-5 text-gray-600">{note}</p></article>;
}
