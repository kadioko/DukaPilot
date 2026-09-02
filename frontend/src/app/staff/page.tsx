"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";

interface StaffMember {
  id: string;
  name: string;
  phone: string | null;
  role: string;
  canSell: boolean;
  canManageStock: boolean;
  canManageFarm: boolean;
  canManageStaff: boolean;
  canViewReports: boolean;
  canRecordExpenses: boolean;
  canUseAssistant: boolean;
  canViewQuotations: boolean;
  canCreateQuotations: boolean;
  canEditSentQuotations: boolean;
  canViewQuotationCosts: boolean;
  canApproveQuotationDiscounts: boolean;
  canSendQuotations: boolean;
  canAcceptQuotations: boolean;
  canConvertQuotations: boolean;
  canRecordQuotationPayments: boolean;
  canArchiveQuotations: boolean;
  canDeleteQuotationDrafts: boolean;
  isActive: boolean;
  pin?: string | null;
}

interface SubscriptionStatus {
  plan: string;
  status: string;
}

const roles = ["MANAGER", "CASHIER", "STOCK_CLERK", "OWNER"];
const roleGuides = {
  OWNER: { en: "Full shop access, including staff, reports, stock, sales, and expenses.", sw: "Anaweza kila kitu: staff, ripoti, stock, mauzo na matumizi." },
  MANAGER: { en: "Runs day-to-day operations with the same default permissions as Owner.", sw: "Anaendesha shughuli za kila siku akiwa na ruhusa zote za msingi." },
  CASHIER: { en: "Records sales and handles the POS. Cannot view reports, stock, staff, or expenses.", sw: "Anauza kwa POS. Haoni ripoti, stock, staff au matumizi." },
  STOCK_CLERK: { en: "Manages inventory, receiving, and stock counts. Cannot sell or view finances.", sw: "Anasimamia inventory, kupokea bidhaa na stock count. Hauzi wala haoni fedha." },
};

export default function StaffPage() {
  const lang = useLang();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", role: "CASHIER", pin: "", canRecordExpenses: false, canManageFarm: false, canUseAssistant: false });

  async function load() {
    const [data, subscriptionStatus] = await Promise.all([
      api.get<{ staff: StaffMember[] }>("/staff", lang),
      api.get<SubscriptionStatus>("/subscription/status", lang),
    ]);
    setStaff(data.staff);
    setSubscription(subscriptionStatus);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  async function addStaff(event: React.FormEvent) {
    event.preventDefault();
    if (basicLimitReached) return;
    await api.post("/staff", form, lang);
    setForm({ name: "", phone: "", role: "CASHIER", pin: "", canRecordExpenses: false, canManageFarm: false, canUseAssistant: false });
    await load();
  }

  async function togglePermission(member: StaffMember, field: keyof Pick<StaffMember, "canSell" | "canManageStock" | "canManageFarm" | "canManageStaff" | "canViewReports" | "canRecordExpenses" | "canUseAssistant" | "canViewQuotations" | "canCreateQuotations" | "canEditSentQuotations" | "canViewQuotationCosts" | "canApproveQuotationDiscounts" | "canSendQuotations" | "canAcceptQuotations" | "canConvertQuotations" | "canRecordQuotationPayments" | "canArchiveQuotations" | "canDeleteQuotationDrafts" | "isActive">) {
    await api.patch(`/staff/${member.id}`, { [field]: !member[field] }, lang);
    await load();
  }

  const permissionLabels = {
    canSell: lang === "sw" ? "Kuuza" : "Sell",
    canManageStock: lang === "sw" ? "Bidhaa" : "Stock",
    canManageFarm: lang === "sw" ? "Kusimamia uzalishaji wa shamba" : "Manage farm production",
    canManageStaff: lang === "sw" ? "Wafanyakazi" : "Staff",
    canViewReports: lang === "sw" ? "Ripoti" : "Reports",
    canRecordExpenses: lang === "sw" ? "Kurekodi matumizi" : "Record expenses",
    canUseAssistant: lang === "sw" ? "Kutumia Msaidizi wa AI" : "Use AI Assistant",
    canViewQuotations: lang === "sw" ? "Kuona nukuu" : "View quotations",
    canCreateQuotations: lang === "sw" ? "Kutengeneza nukuu" : "Create quotations",
    canEditSentQuotations: lang === "sw" ? "Kurekebisha zilizotumwa" : "Revise sent quotations",
    canViewQuotationCosts: lang === "sw" ? "Kuona gharama/faida" : "View costs/profit",
    canApproveQuotationDiscounts: lang === "sw" ? "Kuidhinisha punguzo" : "Approve discounts",
    canSendQuotations: lang === "sw" ? "Kutuma nukuu" : "Send quotations",
    canAcceptQuotations: lang === "sw" ? "Kukubali/kukataa" : "Accept/reject quotations",
    canConvertQuotations: lang === "sw" ? "Kubadilisha kuwa mauzo" : "Convert to sales",
    canRecordQuotationPayments: lang === "sw" ? "Kurekodi malipo" : "Record quotation payments",
    canArchiveQuotations: lang === "sw" ? "Kuweka jalada" : "Archive quotations",
    canDeleteQuotationDrafts: lang === "sw" ? "Kufuta rasimu" : "Delete drafts",
  };
  const activeStaffCount = staff.filter((member) => member.isActive).length;
  const basicLimitReached = subscription?.plan === "BASIC" && activeStaffCount >= 1;
  const proAssistantAvailable = subscription?.plan === "PRO" && subscription?.status === "active";

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-950">{lang === "sw" ? "Majukumu ya Wafanyakazi" : "Staff Roles"}</h1>
          <p className="mt-1 text-sm text-gray-600">
            {lang === "sw"
              ? "Panga majukumu, ruhusa na PIN za kuingia kwa watu wanaosaidia duka."
              : "Assign roles, permissions, and login PINs for the people helping run the shop."}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {roles.map((role) => <div key={role} className="rounded-lg border border-gray-200 bg-white p-3"><p className="text-xs font-bold text-brand-700">{role.replace("_", " ")}</p><p className="mt-1 text-xs leading-5 text-gray-600">{lang === "sw" ? roleGuides[role as keyof typeof roleGuides].sw : roleGuides[role as keyof typeof roleGuides].en}</p></div>)}
        </div>

        {subscription?.plan === "BASIC" && (
          <section className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-950">
            <strong>{lang === "sw" ? "Basic:" : "Basic:"}</strong>{" "}
            {lang === "sw" ? `Unaweza kuwa na mfanyakazi 1 active (${activeStaffCount}/1). Zima mfanyakazi wa sasa kabla ya kuweka mwingine, au upgrade kwenda Pro kwa staff wengi.` : `You can have 1 active staff member (${activeStaffCount}/1). Deactivate the current member before adding another, or upgrade to Pro for more staff.`}
          </section>
        )}

        <form onSubmit={addStaff} className="grid gap-3 rounded-lg border border-gray-200 p-4 md:grid-cols-6">
          <label className="grid gap-1 text-xs font-medium text-gray-600"><span>{lang === "sw" ? "Jina" : "Name"}</span><input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="grid gap-1 text-xs font-medium text-gray-600"><span>{lang === "sw" ? "Simu" : "Phone"}</span><input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" required inputMode="tel" placeholder="07... au +255..." value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label className="grid gap-1 text-xs font-medium text-gray-600"><span>PIN ({lang === "sw" ? "hiari" : "optional"})</span><input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" inputMode="numeric" maxLength={8} placeholder="1234" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} /></label>
          <label className="grid gap-1 text-xs font-medium text-gray-600"><span>{lang === "sw" ? "Jukumu" : "Role"}</span><select className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {roles.map((role) => <option key={role} value={role}>{role.replace("_", " ")}</option>)}
          </select></label>
          <label className="flex min-h-10 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs font-medium text-gray-700"><input type="checkbox" checked={form.canRecordExpenses} onChange={(e) => setForm({ ...form, canRecordExpenses: e.target.checked })} />{lang === "sw" ? "Anaweza kurekodi matumizi" : "Can record expenses"}</label>
          <label className="flex min-h-10 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs font-medium text-gray-700"><input type="checkbox" checked={form.canManageFarm} onChange={(e) => setForm({ ...form, canManageFarm: e.target.checked })} />{lang === "sw" ? "Anaweza kusimamia shamba" : "Can manage farm"}</label>
          {proAssistantAvailable && <label className="flex min-h-10 items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs font-medium text-violet-950"><input type="checkbox" checked={form.canUseAssistant} onChange={(e) => setForm({ ...form, canUseAssistant: e.target.checked })} />{lang === "sw" ? "Anaweza kutumia AI" : "Can use AI"}</label>}
          <button disabled={basicLimitReached} title={basicLimitReached ? (lang === "sw" ? "Basic ina staff 1 active" : "Basic includes 1 active staff member") : undefined} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-gray-400">
            {lang === "sw" ? "Ongeza" : "Add"}
          </button>
        </form>
        <p className="-mt-3 text-xs text-gray-500">{basicLimitReached ? (lang === "sw" ? "Zima staff active ili kuongeza mwingine kwenye Basic." : "Deactivate the active staff member to add another on Basic.") : (lang === "sw" ? "PIN ikiachwa wazi, staff ataingia kwa 1234 na anaweza kuibadilisha kwenye Settings baada ya kuingia." : "When the PIN is blank, the staff member logs in with 1234 and can change it in Settings after signing in.")}{proAssistantAvailable ? (lang === "sw" ? " AI haiongezi ruhusa za fedha: cashier haoni faida, madeni, kiasi cha mauzo au matumizi." : " AI never adds financial access: a cashier cannot see profit, debts, sales amounts, or expenses.") : ""}</p>

        <div className="grid gap-3">
          {staff.length === 0 ? (
            <div className="rounded-lg border border-gray-200 p-6 text-sm text-gray-500">{lang === "sw" ? "Hakuna wafanyakazi bado." : "No staff yet."}</div>
          ) : staff.map((member) => (
            <section key={member.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-semibold text-gray-950">{member.name}</h2>
                  <p className="text-sm text-gray-500">{member.role.replace("_", " ")}{member.phone ? ` · ${member.phone}` : ""}</p>
                </div>
                <button onClick={() => togglePermission(member, "isActive")} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700">
                  {member.isActive ? (lang === "sw" ? "Hai" : "Active") : (lang === "sw" ? "Imezimwa" : "Inactive")}
                </button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
                {(Object.keys(permissionLabels) as Array<keyof typeof permissionLabels>).filter((field) => field !== "canUseAssistant" || proAssistantAvailable).map((field) => (
                  <label key={field} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                    <input type="checkbox" checked={member[field]} onChange={() => togglePermission(member, field)} />
                    {permissionLabels[field]}
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
