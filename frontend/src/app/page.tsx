"use client";
import Image from "next/image";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, getCurrentSession, getFriendlyErrorMessage, hasSessionHint, markSessionActive } from "@/lib/api";
import {
  ArrowRight,
  BadgeDollarSign,
  Brain,
  ChevronDown,
  Eye,
  EyeOff,
  FileText,
  Lock,
  MapPin,
  MessageCircle,
  PackageCheck,
  Phone,
  ReceiptText,
  Store,
  Tractor,
  TrendingUp,
} from "lucide-react";
import LogoMark from "@/components/brand/LogoMark";
import WhatsAppCTA from "@/components/marketing/WhatsAppCTA";
import PublicHeader from "@/components/marketing/PublicHeader";
import { TextReveal } from "@/components/ui/cascade-text";
import { t, useLang, setLanguage as setAppLanguage } from "@/lib/i18n";
import clsx from "clsx";
import { captureReferralCode, clearReferralCode, getAttribution, getReferralCode, trackMarketingEvent } from "@/lib/marketing";
import ProductProofSection from "@/components/marketing/ProductProofSection";
import PublicFAQSection from "@/components/marketing/PublicFAQSection";

function normalizePhone(value: string): string {
  return value.replace(/[\s()-]/g, "").trim();
}

function isValidPhone(value: string): boolean {
  return /^\+?[1-9]\d{8,14}$/.test(normalizePhone(value));
}

function isValidPin(value: string): boolean {
  return /^\d{4,8}$/.test(value.trim());
}

const SHOP_CATEGORIES = [
  { value: "grocery", sw: "Mboga na Vyakula", en: "Grocery" },
  { value: "pharmacy", sw: "Duka la Dawa", en: "Pharmacy" },
  { value: "beauty", sw: "Urembo", en: "Beauty & Cosmetics" },
  { value: "bar", sw: "Bar", en: "Bar" },
  { value: "restaurant", sw: "Mgahawa", en: "Restaurant" },
  { value: "hardware", sw: "Vifaa vya Ujenzi", en: "Hardware" },
  { value: "electronics", sw: "Umeme / Simu", en: "Electronics" },
  { value: "clothing", sw: "Nguo", en: "Clothing" },
  { value: "livestock", sw: "Ufugaji wa Mifugo na Kuku", en: "Livestock & Poultry Farm" },
  { value: "general", sw: "Bidhaa Mchanganyiko", en: "General / Mixed" },
];

const heroFeatures = [
  {
    icon: PackageCheck,
    sw: "Jua bidhaa zilizobaki kabla hazijaisha.",
    en: "Know what stock is left before it runs out.",
  },
  {
    icon: ReceiptText,
    sw: "Rekodi mauzo, madeni, matumizi na faida.",
    en: "Record sales, debts, expenses, and profit.",
  },
  {
    icon: FileText,
    sw: "Tengeneza nukuu za bei za kazi, huduma na miradi.",
    en: "Create quotations for services, work, and projects.",
  },
];

const heroProofPoints = [
  { sw: "AI inapanga kipaumbele cha leo", en: "AI ranks today's priorities" },
  { sw: "Mauzo, stock, madeni, matumizi na nukuu", en: "Sales, stock, debts, expenses, and quotations" },
  { sw: "Kwa maduka na biashara za huduma Tanzania", en: "For Tanzanian shops and service businesses" },
];

const aiThinkingCards = [
  {
    icon: Brain,
    swTitle: "AI inayosoma duka",
    enTitle: "AI that reads the shop",
    swBody: "Inaangalia mauzo, bidhaa, madeni, matumizi, nukuu na maagizo ili kuelewa kinachotokea.",
    enBody: "It reads sales, stock, debts, expenses, quotations, and orders to understand what is happening.",
  },
  {
    icon: TrendingUp,
    swTitle: "Inapanga cha kufanya kwanza",
    enTitle: "Ranks what to do first",
    swBody: "Taslimu, faida na uaminifu wa mteja vikiwa hatarini, hatua hiyo inapanda juu.",
    enBody: "When cash, profit, or customer trust is at risk, that action moves to the top.",
  },
  {
    icon: MessageCircle,
    swTitle: "Inageuka kuwa ujumbe",
    enTitle: "Turns insight into action",
    swBody: "Mmiliki anaweza kufuatilia deni, kuagiza bidhaa au kutuma muhtasari kwa WhatsApp.",
    enBody: "Owners can collect debt, reorder stock, or share a WhatsApp-ready summary.",
  },
];

type View = "login" | "register" | "forgot";

export function LoginPageContent({ initialView = "login" }: { initialView?: View }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useLang();
  const [view, setView] = useState<View>(initialView);

  // Login / Register fields
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [shopName, setShopName] = useState("");
  const [shopLocation, setShopLocation] = useState("");
  const [shopDistrict, setShopDistrict] = useState("");
  const [shopCategory, setShopCategory] = useState("general");
  const [role, setRole] = useState<"MERCHANT" | "SUPPLIER">("MERCHANT");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);

  // PIN recovery fields
  const [forgotPhone, setForgotPhone] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotNewPin, setForgotNewPin] = useState("");
  const [forgotStep, setForgotStep] = useState<"phone" | "code">("phone");
  const [forgotChannel, setForgotChannel] = useState<"SMS" | "WHATSAPP">("SMS");
  const [otpChannels, setOtpChannels] = useState({ sms: true, whatsapp: false });
  const [forgotMsg, setForgotMsg] = useState("");

  useEffect(() => {
    if (initialView !== "login") {
      return;
    }

    const requestedView = searchParams.get("view");
    if (requestedView === "register" || requestedView === "forgot") {
      setView(requestedView);
    }
  }, [initialView, searchParams]);

  useEffect(() => {
    setReferralCode(captureReferralCode());
  }, [searchParams]);

  useEffect(() => {
    if (view !== "forgot") return;
    let cancelled = false;
    api.get<{ sms: boolean; whatsapp: boolean }>("/auth/otp/channels", lang)
      .then((channels) => {
        if (cancelled) return;
        setOtpChannels(channels);
        if (!channels.whatsapp) setForgotChannel("SMS");
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [lang, view]);

  useEffect(() => {
    if (initialView !== "login" || searchParams.get("view")) return;
    if (!hasSessionHint()) return;

    let cancelled = false;
    getCurrentSession<{ user: { role: string; staff?: { permissions?: { canSell?: boolean; canManageStock?: boolean; canViewReports?: boolean } } } }>()
      .then(({ user }) => {
        if (cancelled) return;
        if (user.role === "SUPPLIER") router.replace("/supplier");
        else if (user.role === "ADMIN") router.replace("/admin");
        else if (user.staff?.permissions?.canViewReports) router.replace("/dashboard");
        else if (user.staff?.permissions?.canSell) router.replace("/sales");
        else if (user.staff?.permissions?.canManageStock) router.replace("/inventory");
        else if (!user.staff) router.replace("/dashboard");
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [initialView, router, searchParams]);

  function resetForms() {
    setError("");
    setForgotMsg("");
    setForgotStep("phone");
    setForgotPhone("");
    setForgotCode("");
    setForgotNewPin("");
    setForgotChannel("SMS");
    setConfirmPin("");
    setTermsAccepted(false);
  }

  function switchView(v: View) {
    resetForms();
    setView(v);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const normalizedPhone = normalizePhone(phone);
    const normalizedPin = pin.trim();
    const normalizedName = name.trim();

    if (!isValidPhone(normalizedPhone)) {
      setError(t("auth.error.invalidPhone", lang));
      return;
    }

    if (!isValidPin(normalizedPin)) {
      setError(t("auth.error.invalidPin", lang));
      return;
    }

    if (view === "register" && !normalizedName) {
      setError(t("auth.error.nameRequired", lang));
      return;
    }

    if (view === "register" && normalizedPin !== confirmPin.trim()) {
      setError(lang === "sw" ? "PIN mbili hazifanani." : "The two PINs do not match.");
      return;
    }

    if (view === "register" && !termsAccepted) {
      setError(lang === "sw" ? "Kubali Masharti na Sera ya Faragha ili kuendelea." : "Accept the Terms and Privacy Policy to continue.");
      return;
    }

    if (view === "register") trackMarketingEvent("signup_started");
    setLoading(true);

    try {
      const endpoint = view === "register" ? "/auth/register" : "/auth/login";
      const body =
        view === "register"
          ? {
              phone: normalizedPhone,
              pin: normalizedPin,
              name: normalizedName,
              role,
              shopName: shopName.trim() || undefined,
              shopLocation: shopLocation.trim() || undefined,
              shopDistrict: shopDistrict.trim() || undefined,
              shopCategory,
              acquisition: getAttribution(),
              referralCode: referralCode || getReferralCode(),
            }
          : { phone: normalizedPhone, pin: normalizedPin };

      const data = await api.post<{
        user: {
          role: string;
          staff?: {
            permissions?: {
              canSell?: boolean;
              canManageStock?: boolean;
              canManageStaff?: boolean;
              canViewReports?: boolean;
            };
          };
        };
      }>(endpoint, body, lang);
      markSessionActive();
      if (view === "register") clearReferralCode();
      if (view === "register" && data.user.role === "MERCHANT") trackMarketingEvent("trial_started");

      if (data.user.role === "SUPPLIER") {
        router.push("/supplier");
      } else if (data.user.role === "ADMIN") {
        router.push("/admin");
      } else if (view === "register" && data.user.role === "MERCHANT") {
        router.push("/onboarding");
      } else if (data.user.staff) {
        const permissions = data.user.staff.permissions || {};
        if (permissions.canViewReports) router.push("/dashboard");
        else if (permissions.canSell) router.push("/sales");
        else if (permissions.canManageStock) router.push("/inventory");
        else router.push("/reports");
      } else {
        router.push("/dashboard");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? getFriendlyErrorMessage(err.message, lang) : t("auth.error", lang));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotRequest(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setForgotMsg("");
    const normalizedPhone = normalizePhone(forgotPhone);
    if (!isValidPhone(normalizedPhone)) {
      setError(t("auth.error.invalidPhone", lang));
      return;
    }
    setLoading(true);
    try {
      const channel = forgotChannel === "WHATSAPP" && otpChannels.whatsapp ? "WHATSAPP" : "SMS";
      await api.post("/auth/otp/request", { phone: normalizedPhone, channel }, lang);
      setForgotMsg(lang === "sw"
        ? `Kama namba imesajiliwa, nambari ya uthibitisho imetumwa kwa ${channel === "WHATSAPP" ? "WhatsApp" : "SMS"}.`
        : `If the number is registered, a verification code has been sent by ${channel === "WHATSAPP" ? "WhatsApp" : "SMS"}.`);
      setForgotStep("code");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("auth.error", lang));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const normalizedPhone = normalizePhone(forgotPhone);
    if (!isValidPin(forgotNewPin.trim())) {
      setError(t("auth.error.invalidPin", lang));
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/otp/verify-reset", { phone: normalizedPhone, code: forgotCode.trim(), newPin: forgotNewPin.trim() }, lang);
      setForgotMsg(lang === "sw" ? "PIN imebadilishwa. Ingia na PIN mpya." : "PIN reset successfully. Log in with your new PIN.");
      setTimeout(() => switchView("login"), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("auth.error", lang));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#0b5d34_0%,#13763f_44%,#0d342c_100%)] px-4 py-3 lg:px-8 lg:py-4">
      <PublicHeader lang={lang} onLanguageChange={setAppLanguage} onStart={() => switchView("register")} className="top-3 mx-auto max-w-6xl rounded-lg border" />

      <div className="mx-auto grid min-h-[calc(100vh-6rem)] w-full max-w-6xl items-center gap-7 py-6 lg:grid-cols-[1.08fr_420px] lg:gap-8 lg:py-8">
        <section className="text-white">
          <div className="hidden items-center gap-3 lg:flex">
            <LogoMark className="h-12 w-12 rounded-2xl bg-white shadow-lg" />
            <div>
              <p className="text-2xl font-bold tracking-tight">
                <TextReveal text="DukaPilot" hoverColor="#dcfce7" staggerDelay={18} />
              </p>
              <p className="text-sm font-medium text-brand-100">Merchant OS - Tanzania</p>
            </div>
          </div>

          <div className="mt-5 max-w-2xl lg:mt-8">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-200/30 bg-amber-100 px-3 py-1.5 text-xs font-bold uppercase tracking-normal text-[#713f12] shadow-sm">
              <BadgeDollarSign className="h-4 w-4" />
              {lang === "sw" ? "Msaidizi wa AI wa duka" : "AI shop assistant"}
            </div>
            <h1 className="text-4xl font-bold leading-tight tracking-normal sm:text-5xl">
              {lang === "sw"
                ? "Mfumo wa duka kwenye simu."
                : "Your shop system on your phone."}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-brand-50 sm:text-lg">
              {lang === "sw"
                ? "DukaPilot husaidia wafanyabiashara Tanzania kufuatilia stock, mauzo, faida, madeni na kutengeneza nukuu za bei za kazi au huduma kwa Kiswahili."
                : "DukaPilot helps Tanzanian businesses track stock, sales, profit, customer debts, and quotations for custom work or services in Swahili or English."}
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {heroProofPoints.map((point) => (
              <span
                key={point.en}
                className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-brand-50"
              >
                {lang === "sw" ? point.sw : point.en}
              </span>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/register"
              onClick={() => trackMarketingEvent("store_click")}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-brand-800 shadow-lg shadow-black/10 transition-colors hover:bg-brand-50"
            >
              {lang === "sw" ? "Anza bure siku 14" : "Start free for 14 days"}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <WhatsAppCTA intent="setup" variant="light" />
          </div>

          <div className="mt-8 hidden max-w-2xl gap-3 sm:grid sm:grid-cols-3">
            {heroFeatures.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.en} className="rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                  <Icon className="h-5 w-5 text-brand-100" />
                  <p className="mt-3 text-sm font-semibold leading-5 text-white">
                    {lang === "sw" ? feature.sw : feature.en}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-8 hidden max-w-2xl gap-4 sm:grid sm:grid-cols-[170px_1fr]">
            <div className="rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur">
              <BadgeDollarSign className="h-5 w-5 text-brand-100" />
              <p className="mt-3 text-sm font-bold text-white">{lang === "sw" ? "Kuanzia TZS 15,000/mwezi" : "Plans from TZS 15,000/month"}</p>
              <p className="mt-1 text-xs leading-5 text-brand-100">
                {lang === "sw" ? "Msaidizi wa AI upo kwenye Pro: TZS 35,000/mwezi." : "AI Assistant is included with Pro: TZS 35,000/month."}
              </p>
            </div>
            <div className="overflow-hidden rounded-2xl border border-white/15 bg-white/95 p-3 shadow-2xl shadow-black/20">
              <Image
                src="/marketing/phone-dashboard.png"
                alt={lang === "sw" ? "Muonekano wa dashibodi ya DukaPilot" : "DukaPilot dashboard preview"}
                width={420}
                height={744}
                className="h-56 w-full rounded-xl object-cover object-top sm:h-64"
                priority
              />
            </div>
          </div>
        </section>

        <div className="w-full max-w-sm justify-self-center lg:justify-self-end">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          {/* ===== FORGOT PIN VIEW ===== */}
          {view === "forgot" && (
            <>
              <h2 className="text-xl font-semibold text-gray-800 mb-1">
                {lang === "sw" ? "Rudisha PIN" : "Reset PIN"}
              </h2>
              <p className="text-gray-500 text-sm mb-5">
                {lang === "sw"
                  ? "Tutakutumia nambari ya uthibitisho kwa simu yako."
                  : "We'll send a verification code to your phone."}
              </p>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>
              )}
              {forgotMsg && (
                <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-4 text-sm">{forgotMsg}</div>
              )}

              {forgotStep === "phone" ? (
                <form onSubmit={handleForgotRequest} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("auth.phone", lang)}</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="tel"
                        value={forgotPhone}
                        onChange={(e) => setForgotPhone(e.target.value)}
                        placeholder="+255 7XX XXX XXX"
                        className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        required
                      />
                    </div>
                  </div>
                  <fieldset>
                    <legend className="mb-2 text-sm font-medium text-gray-700">{lang === "sw" ? "Pokea nambari kupitia" : "Receive code by"}</legend>
                    <div className={`grid gap-2 ${otpChannels.whatsapp ? "grid-cols-2" : "grid-cols-1"}`}>
                      <button type="button" onClick={() => setForgotChannel("SMS")} aria-pressed={forgotChannel === "SMS"} className={`rounded-lg border px-3 py-2.5 text-sm font-semibold ${forgotChannel === "SMS" ? "border-brand-600 bg-brand-50 text-brand-800" : "border-gray-300 bg-white text-gray-700"}`}>
                        {lang === "sw" ? "Ujumbe wa SMS" : "SMS"}
                      </button>
                      {otpChannels.whatsapp && <button type="button" onClick={() => setForgotChannel("WHATSAPP")} aria-pressed={forgotChannel === "WHATSAPP"} className={`rounded-lg border px-3 py-2.5 text-sm font-semibold ${forgotChannel === "WHATSAPP" ? "border-green-600 bg-green-50 text-green-800" : "border-gray-300 bg-white text-gray-700"}`}>
                        <MessageCircle className="mr-1 inline h-4 w-4" />WhatsApp
                      </button>}
                    </div>
                  </fieldset>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    {loading ? "..." : lang === "sw" ? "Tuma Nambari" : "Send Code"}
                    {!loading && <ArrowRight className="w-4 h-4" />}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleForgotReset} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {lang === "sw" ? `Nambari ya Uthibitisho (${forgotChannel === "WHATSAPP" ? "WhatsApp" : "SMS"})` : `Verification Code (${forgotChannel === "WHATSAPP" ? "WhatsApp" : "SMS"})`}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={forgotCode}
                      onChange={(e) => setForgotCode(e.target.value)}
                      placeholder="123456"
                      maxLength={6}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {lang === "sw" ? "PIN Mpya" : "New PIN"}
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      value={forgotNewPin}
                      onChange={(e) => setForgotNewPin(e.target.value)}
                      placeholder="PIN"
                      maxLength={8}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    {loading ? "..." : lang === "sw" ? "Badilisha PIN" : "Reset PIN"}
                    {!loading && <ArrowRight className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setForgotStep("phone")}
                    className="w-full text-gray-500 text-sm hover:underline min-h-0"
                  >
                    {lang === "sw" ? "Tuma tena nambari" : "Resend code"}
                  </button>
                </form>
              )}

              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => switchView("login")}
                  className="text-brand-600 text-sm hover:underline min-h-0"
                >
                  {lang === "sw" ? "Rudi kwenye kuingia" : "Back to login"}
                </button>
              </div>
            </>
          )}

          {/* ===== LOGIN / REGISTER VIEW ===== */}
          {view !== "forgot" && (
            <>
              <h2 className="text-xl font-semibold text-gray-800 mb-1">
                {view === "register" ? t("auth.register", lang) : t("auth.welcome", lang)}
              </h2>
              <p className="text-gray-500 text-sm mb-6">
                {view === "register" ? t("auth.createAccount", lang) : t("auth.enterShop", lang)}
              </p>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
              {view === "register" && (
                <>
                  {referralCode && (
                    <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs leading-5 text-brand-900">
                      {lang === "sw" ? "Umejiunga kupitia mwaliko wa rafiki. Referral itaunganishwa baada ya usajili wako kukamilika." : "You are joining through a friend's invitation. The referral will be linked when your registration is completed."}
                    </div>
                  )}
                  <div>
                      <label htmlFor="register-name" className="block text-sm font-medium text-gray-700 mb-1">{t("auth.yourName", lang)}</label>
                      <input
                        id="register-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Mama Amina"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        autoComplete="name"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t("auth.iAm", lang)}</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setRole("MERCHANT")}
                          className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                            role === "MERCHANT"
                              ? "bg-brand-600 text-white border-brand-600"
                              : "bg-white text-gray-600 border-gray-300"
                          }`}
                        >
                          {t("app.merchant", lang)}
                        </button>
                        <button
                          type="button"
                          onClick={() => setRole("SUPPLIER")}
                          className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                            role === "SUPPLIER"
                              ? "bg-brand-600 text-white border-brand-600"
                              : "bg-white text-gray-600 border-gray-300"
                          }`}
                        >
                          {t("app.supplier", lang)}
                        </button>
                      </div>
                    </div>

                    {role === "MERCHANT" && (
                      <details className="rounded-lg border border-gray-200 p-3">
                        <summary className="cursor-pointer text-sm font-medium text-gray-700">
                          {lang === "sw" ? "Ongeza maelezo ya duka (hiari)" : "Add shop details (optional)"}
                        </summary>
                        <div className="mt-3 space-y-4">
                        <div>
                          <label htmlFor="register-shop-name" className="block text-sm font-medium text-gray-700 mb-1">{t("auth.shopName", lang)} ({lang === "sw" ? "hiari" : "optional"})</label>
                          <input
                            id="register-shop-name"
                            type="text"
                            value={shopName}
                            onChange={(e) => setShopName(e.target.value)}
                            placeholder="Duka la Amina"
                            autoComplete="organization"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                        </div>
                        <div>
                          <label htmlFor="register-shop-city" className="block text-sm font-medium text-gray-700 mb-1">
                            {lang === "sw" ? "Jiji / Mji (hiari)" : "City / Town (optional)"}
                          </label>
                          <div className="relative">
                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                              id="register-shop-city"
                              type="text"
                              value={shopLocation}
                              onChange={(e) => setShopLocation(e.target.value)}
                              placeholder="Dar es Salaam"
                              autoComplete="address-level2"
                              className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                          </div>
                        </div>
                        <div>
                          <label htmlFor="register-shop-district" className="block text-sm font-medium text-gray-700 mb-1">
                            {lang === "sw" ? "Mtaa / Wilaya (hiari)" : "District / Area (optional)"}
                          </label>
                          <input
                            id="register-shop-district"
                            type="text"
                            value={shopDistrict}
                            onChange={(e) => setShopDistrict(e.target.value)}
                            placeholder="Kariakoo"
                            autoComplete="address-level3"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                        </div>
                        <div>
                          <label htmlFor="register-shop-category" className="block text-sm font-medium text-gray-700 mb-1">
                            {lang === "sw" ? "Aina ya Biashara" : "Shop Category"}
                          </label>
                          <div className="relative">
                            <select
                              id="register-shop-category"
                              value={shopCategory}
                              onChange={(e) => setShopCategory(e.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none bg-white"
                            >
                              {SHOP_CATEGORIES.map((c) => (
                                <option key={c.value} value={c.value}>
                                  {lang === "sw" ? c.sw : c.en}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                          </div>
                          </div>
                        </div>
                      </details>
                    )}
                  </>
                )}

                <div>
                  <label htmlFor="auth-phone" className="block text-sm font-medium text-gray-700 mb-1">{t("auth.phone", lang)}</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      id="auth-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+255 7XX XXX XXX"
                      autoComplete="tel"
                      className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="auth-pin" className="block text-sm font-medium text-gray-700 mb-1">{t("auth.pin", lang)}</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      id="auth-pin"
                      type={showPin ? "text" : "password"}
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      placeholder="PIN"
                      maxLength={8}
                      inputMode="numeric"
                      autoComplete={view === "register" ? "new-password" : "current-password"}
                      className="w-full border border-gray-300 rounded-lg pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      aria-label={showPin ? "Hide PIN" : "Show PIN"}
                      className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-gray-400"
                    >
                      {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {view === "register" && (
                  <>
                    <div>
                      <label htmlFor="auth-confirm-pin" className="block text-sm font-medium text-gray-700 mb-1">
                        {lang === "sw" ? "Rudia PIN" : "Confirm PIN"}
                      </label>
                      <input
                        id="auth-confirm-pin"
                        type="password"
                        value={confirmPin}
                        onChange={(e) => setConfirmPin(e.target.value)}
                        placeholder={lang === "sw" ? "Rudia PIN yako" : "Enter your PIN again"}
                        maxLength={8}
                        inputMode="numeric"
                        autoComplete="new-password"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        required
                      />
                    </div>
                    <label className="flex items-start gap-2 text-sm text-gray-600">
                      <input type="checkbox" required checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} className="mt-1 h-4 w-4" />
                      <span>
                        {lang === "sw" ? "Ninakubali" : "I agree to the"} <Link href="/terms" className="font-semibold text-brand-700 underline">{lang === "sw" ? "Masharti" : "Terms"}</Link> {lang === "sw" ? "na" : "and"} <Link href="/privacy" className="font-semibold text-brand-700 underline">{lang === "sw" ? "Sera ya Faragha" : "Privacy Policy"}</Link>.
                      </span>
                    </label>
                  </>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-brand-700 hover:bg-brand-800 disabled:opacity-60 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  {loading ? t("auth.loading", lang) : view === "register" ? t("auth.register", lang) : t("auth.login", lang)}
                  {!loading && <ArrowRight className="w-4 h-4" />}
                </button>
              </form>

              <div className="mt-4 space-y-2 text-center">
                <button
                  type="button"
                  onClick={() => switchView(view === "register" ? "login" : "register")}
                  className="text-brand-700 text-sm font-medium hover:underline min-h-0 block w-full"
                >
                  {view === "register" ? t("auth.haveAccount", lang) : t("auth.noAccount", lang)}
                </button>
                {view === "login" && (
                  <button
                    type="button"
                    onClick={() => switchView("forgot")}
                    className="text-gray-600 text-sm hover:text-brand-700 hover:underline min-h-0 block w-full"
                  >
                    {lang === "sw" ? "Umesahau PIN?" : "Forgot PIN?"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <Link
          prefetch={false}
          href="/catalog"
          className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-sm font-semibold py-3 rounded-xl transition-colors"
        >
          <Store className="w-4 h-4" />
          {t("catalog.browse", lang)}
        </Link>

        <Link
          prefetch={false}
          href="/pricing"
          className="mt-2 w-full inline-flex items-center justify-center gap-2 text-brand-200 hover:text-white text-sm py-2 transition-colors"
        >
          {lang === "sw" ? "Ona bei zetu" : "View pricing"}<ArrowRight className="h-4 w-4" />
        </Link>

        <p className="text-center text-brand-200 text-xs mt-4">
          DukaPilot - Kujenga biashara Tanzania
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-brand-100">
          <Link prefetch={false} href="/about" className="hover:text-white">{lang === "sw" ? "Kuhusu" : "About"}</Link>
          <Link prefetch={false} href="/pricing" className="hover:text-white">{lang === "sw" ? "Bei" : "Pricing"}</Link>
          <Link prefetch={false} href="/contact" className="hover:text-white">{lang === "sw" ? "Mawasiliano" : "Contact"}</Link>
          <Link prefetch={false} href="/help" className="hover:text-white">{lang === "sw" ? "Msaada" : "Help"}</Link>
          <Link prefetch={false} href="/demo" className="hover:text-white">{lang === "sw" ? "Onyesho" : "Demo"}</Link>
          <Link prefetch={false} href="/terms" className="hover:text-white">{lang === "sw" ? "Masharti" : "Terms"}</Link>
          <Link prefetch={false} href="/privacy" className="hover:text-white">{lang === "sw" ? "Faragha" : "Privacy"}</Link>
        </div>
        </div>
      </div>
      <section className="mx-auto w-full max-w-6xl px-4 pb-10 lg:pb-14">
        <ProductProofSection />
      </section>
      <PublicFAQSection />
      <section className="mx-auto w-full max-w-6xl px-4 py-10 lg:py-14">
        <div className="grid gap-5 border-y border-white/20 py-6 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-6">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-brand-100 ring-1 ring-white/15"><Tractor className="h-5 w-5" /></span>
          <div>
            <p className="text-sm font-bold text-white">{lang === "sw" ? "Kwa wafugaji pia" : "Also for farms"}</p>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-brand-100">
              {lang === "sw"
                ? "DukaPilot bado inaanzia kwenye mauzo, stock, pesa na wateja. Akaunti iliyochagua Ufugaji wa Mifugo na Kuku hupata makundi ya mifugo, matumizi ya feed, uzalishaji na packing ya mayai au maziwa juu ya mfumo huo wa kawaida."
                : "DukaPilot still starts with sales, stock, cash, and customers. An account that chooses Livestock & Poultry Farm adds animal groups, feed use, production, and egg or milk packing on top of that normal commercial system."}
            </p>
          </div>
          <Link href="/register" className="inline-flex min-h-10 items-center justify-center gap-2 border border-white/25 px-4 py-2 text-sm font-bold text-white hover:bg-white/10">
            {lang === "sw" ? "Chagua Ufugaji" : "Choose Farm"}<ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
      <section className="mx-auto w-full max-w-6xl px-4 py-10 lg:py-14">
        <div className="overflow-hidden rounded-3xl border border-white/15 bg-white/95 shadow-2xl shadow-black/15">
          <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="bg-[#052e22] p-6 text-white sm:p-8 lg:p-10">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-white">
                <Brain className="h-5 w-5" />
              </div>
              <h2 className="mt-5 text-2xl font-black tracking-tight sm:text-3xl">
                <TextReveal
                  text={lang === "sw" ? "DukaPilot AI hufikiria hatua inayofuata" : "DukaPilot AI thinks about the next step"}
                  fontSize="inherit"
                  hoverColor="#bbf7d0"
                />
              </h2>
              <p className="mt-4 text-sm leading-6 text-brand-100 sm:text-base">
                {lang === "sw"
                  ? "Si sehemu ya mauzo tu. DukaPilot inageuza taarifa za kila siku kuwa orodha ya vipaumbele: nini uagize, nani umfuatilie, nukuu ipi ifuatiliwe, na gharama zipi zipunguzwe."
                  : "It is not just POS. DukaPilot turns daily data into a priority list: what to restock, who to follow up with, which quotation needs action, and which costs to reduce."}
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link href="/assistant" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-brand-800 hover:bg-brand-50">
                  {lang === "sw" ? "Ona Msaidizi wa AI" : "See AI Assistant"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link prefetch={false} href="/demo" className="inline-flex items-center justify-center rounded-xl border border-white/20 px-5 py-3 text-sm font-bold text-white hover:bg-white/10">
                  {lang === "sw" ? "Jaribu onyesho" : "Try demo"}
                </Link>
              </div>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6 lg:p-8">
              {aiThinkingCards.map(({ icon: Icon, swTitle, enTitle, swBody, enBody }) => (
                <div key={enTitle} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-sm font-bold text-gray-950">{lang === "sw" ? swTitle : enTitle}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{lang === "sw" ? swBody : enBody}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
