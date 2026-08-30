"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, Gift, MessageCircle, RefreshCw, Share2, Store } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";

type Referral = {
  id: string;
  status: "PENDING" | "QUALIFIED" | "REWARDED" | "REJECTED";
  salesCount: number;
  salesRemaining: number;
  qualifiedAt?: string | null;
  rewardedAt?: string | null;
  referredShop: { id: string; name: string; createdAt: string };
};

type ReferralData = {
  referralCode: string;
  salesRequired: number;
  rewardDays: number;
  referrals: Referral[];
};

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : "-";
}

export default function ReferralsPage() {
  const lang = useLang();
  const [data, setData] = useState<ReferralData | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setError("");
    try {
      setData(await api.get<ReferralData>("/referrals/mine", lang));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load referral rewards");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const referralUrl = data?.referralCode ? `https://www.dukapilot.com/register?ref=${encodeURIComponent(data.referralCode)}` : "";
  const message = useMemo(() => {
    if (!referralUrl) return "";
    return lang === "sw"
      ? `Natumia DukaPilot kufuatilia stock, mauzo na madeni ya duka. Kama una duka, jiunge kupitia link yangu: ${referralUrl}. Ukirekodi mauzo 10, nitapata wiki 1 bure.`
      : `I use DukaPilot to track shop stock, sales, and customer debts. If you run a shop, join through my link: ${referralUrl}. After 10 completed sales, I receive one free week.`;
  }, [lang, referralUrl]);

  async function copyLink() {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(lang === "sw" ? "Imeshindikana kunakili link." : "Could not copy the link.");
    }
  }

  if (loading) {
    return <AppShell><div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-brand-600" /></div></AppShell>;
  }

  const referrals = data?.referrals || [];
  const qualified = referrals.filter((referral) => referral.status === "QUALIFIED").length;
  const rewarded = referrals.filter((referral) => referral.status === "REWARDED").length;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-5 pb-20">
        <section className="overflow-hidden rounded-xl bg-brand-700 p-5 text-white sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/15"><Gift className="h-5 w-5" /></div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-100">DukaPilot</p>
                <h1 className="mt-1 text-xl font-bold">{lang === "sw" ? "Mialiko na Zawadi" : "Refer and earn"}</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-brand-100">
                  {lang === "sw"
                    ? "Mlete mwenye duka kwa link yako. Akijiandikisha na kurekodi mauzo 10, admin atakuongezea wiki 1 bure."
                    : "Invite a shop owner with your link. When they register and record 10 sales, an admin adds one free week to your account."}
                </p>
              </div>
            </div>
            <button onClick={load} className="inline-flex items-center justify-center gap-1 rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/25">
              <RefreshCw className="h-3.5 w-3.5" /> {lang === "sw" ? "Sasisha" : "Refresh"}
            </button>
          </div>
        </section>

        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {data && (
          <section className="rounded-xl border border-brand-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <Share2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-gray-950">{lang === "sw" ? "Link yako ya referral" : "Your referral link"}</h2>
                <p className="mt-1 text-sm leading-6 text-gray-600">{lang === "sw" ? "Link hii ndiyo inayomwambia admin kuwa umeleta duka jipya." : "This link tells the admin that you introduced the new shop."}</p>
                <div className="mt-3 break-all rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">{referralUrl}</div>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-3 text-sm font-bold text-white hover:bg-brand-800">
                <MessageCircle className="h-4 w-4" /> {lang === "sw" ? "Tuma WhatsApp" : "Share on WhatsApp"}
              </a>
              <button onClick={copyLink} className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                {copied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                {copied ? (lang === "sw" ? "Imenakiliwa" : "Copied") : (lang === "sw" ? "Nakili link" : "Copy link")}
              </button>
            </div>
          </section>
        )}

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-xs font-semibold text-gray-500">{lang === "sw" ? "Zilizofuatiliwa" : "Tracked"}</p><p className="mt-1 text-2xl font-bold text-gray-950">{referrals.length}</p></div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-semibold text-amber-800">{lang === "sw" ? "Tayari kwa zawadi" : "Ready for reward"}</p><p className="mt-1 text-2xl font-bold text-amber-950">{qualified}</p></div>
          <div className="rounded-xl border border-green-200 bg-green-50 p-4"><p className="text-xs font-semibold text-green-800">{lang === "sw" ? "Zawadi zilizotolewa" : "Rewards granted"}</p><p className="mt-1 text-2xl font-bold text-green-950">{rewarded}</p></div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3"><h2 className="text-sm font-semibold text-gray-950">{lang === "sw" ? "Maduka uliyoyaleta" : "Shops you referred"}</h2></div>
          {referrals.length === 0 ? (
            <div className="p-7 text-center"><Store className="mx-auto h-7 w-7 text-gray-400" /><p className="mt-3 text-sm font-semibold text-gray-700">{lang === "sw" ? "Bado hujaleta duka" : "No referrals yet"}</p><p className="mt-1 text-sm text-gray-500">{lang === "sw" ? "Tuma link yako ya WhatsApp kuanza." : "Share your WhatsApp link to get started."}</p></div>
          ) : (
            <div className="divide-y divide-gray-100">
              {referrals.map((referral) => (
                <div key={referral.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="font-semibold text-gray-950">{referral.referredShop.name}</p><p className="mt-1 text-xs text-gray-500">{lang === "sw" ? "Amejiunga" : "Joined"} {formatDate(referral.referredShop.createdAt)}</p></div>
                  <div className="text-left sm:text-right"><p className="text-sm font-semibold text-gray-800">{referral.salesCount}/{data?.salesRequired || 10} {lang === "sw" ? "mauzo" : "sales"}</p><p className={`mt-1 text-xs font-semibold ${referral.status === "REWARDED" ? "text-green-700" : referral.status === "QUALIFIED" ? "text-amber-700" : "text-gray-500"}`}>{referral.status === "REWARDED" ? (lang === "sw" ? `Wiki ${data?.rewardDays || 7} imeongezwa` : `${data?.rewardDays || 7} days added`) : referral.status === "QUALIFIED" ? (lang === "sw" ? "Admin anathibitisha zawadi" : "Admin is confirming reward") : referral.status === "REJECTED" ? (lang === "sw" ? "Haikustahili" : "Not eligible") : (lang === "sw" ? `${referral.salesRemaining} mauzo yamebaki` : `${referral.salesRemaining} sales remaining`)}</p></div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
