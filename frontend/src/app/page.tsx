"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, getFriendlyErrorMessage, setToken } from "@/lib/api";
import { ShoppingBag, Phone, Lock, Eye, EyeOff, ArrowRight, Store, MapPin, ChevronDown } from "lucide-react";
import { t, useLang, setLanguage as setAppLanguage } from "@/lib/i18n";

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
  { value: "bar", sw: "Bar / Mgahawa", en: "Bar / Restaurant" },
  { value: "hardware", sw: "Vifaa vya Ujenzi", en: "Hardware" },
  { value: "electronics", sw: "Umeme / Simu", en: "Electronics" },
  { value: "clothing", sw: "Nguo", en: "Clothing" },
  { value: "general", sw: "Bidhaa Mchanganyiko", en: "General / Mixed" },
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
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [shopName, setShopName] = useState("");
  const [shopLocation, setShopLocation] = useState("");
  const [shopDistrict, setShopDistrict] = useState("");
  const [shopCategory, setShopCategory] = useState("general");
  const [role, setRole] = useState<"MERCHANT" | "SUPPLIER">("MERCHANT");

  // PIN recovery fields
  const [forgotPhone, setForgotPhone] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotNewPin, setForgotNewPin] = useState("");
  const [forgotStep, setForgotStep] = useState<"phone" | "code">("phone");
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

  function resetForms() {
    setError("");
    setForgotMsg("");
    setForgotStep("phone");
    setForgotPhone("");
    setForgotCode("");
    setForgotNewPin("");
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
            }
          : { phone: normalizedPhone, pin: normalizedPin };

      const data = await api.post<{ token: string; user: { role: string } }>(endpoint, body, lang);
      setToken(data.token);

      if (data.user.role === "SUPPLIER") {
        router.push("/supplier");
      } else if (data.user.role === "ADMIN") {
        router.push("/admin");
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
      await api.post("/auth/otp/request", { phone: normalizedPhone }, lang);
      setForgotMsg(lang === "sw" ? "Nambari ya uthibitisho imetumwa kwa simu yako." : "A verification code has been sent to your phone.");
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
    <div className="min-h-screen bg-gradient-to-br from-brand-700 to-brand-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Language switcher */}
        <div className="flex justify-center mb-6">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-1.5 border border-white/10 shadow-lg">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-center text-brand-100 px-3 pt-1 pb-2">
              {t("app.language", lang)}
            </div>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setAppLanguage("sw")}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${lang === "sw" ? "bg-white text-brand-700 shadow-sm" : "text-white hover:bg-white/10"}`}
              >
                {t("app.swahili", lang)}
              </button>
              <button
                type="button"
                onClick={() => setAppLanguage("en")}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${lang === "en" ? "bg-white text-brand-700 shadow-sm" : "text-white hover:bg-white/10"}`}
              >
                {t("app.english", lang)}
              </button>
            </div>
          </div>
        </div>

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-lg mb-4">
            <ShoppingBag className="w-8 h-8 text-brand-600" />
          </div>
          <h1 className="text-3xl font-bold text-white">DukaOS</h1>
          <p className="text-brand-200 mt-1 text-sm">Merchant OS • Tanzania</p>
        </div>

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
                      {lang === "sw" ? "Nambari ya Uthibitisho (SMS)" : "Verification Code (SMS)"}
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
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t("auth.yourName", lang)}</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Mama Amina"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
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
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">{t("auth.shopName", lang)}</label>
                          <input
                            type="text"
                            value={shopName}
                            onChange={(e) => setShopName(e.target.value)}
                            placeholder="Duka la Amina"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {lang === "sw" ? "Jiji / Mji" : "City / Town"}
                          </label>
                          <div className="relative">
                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                              type="text"
                              value={shopLocation}
                              onChange={(e) => setShopLocation(e.target.value)}
                              placeholder="Dar es Salaam"
                              className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {lang === "sw" ? "Mtaa / Wilaya (hiari)" : "District / Area (optional)"}
                          </label>
                          <input
                            type="text"
                            value={shopDistrict}
                            onChange={(e) => setShopDistrict(e.target.value)}
                            placeholder="Kariakoo"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {lang === "sw" ? "Aina ya Biashara" : "Shop Category"}
                          </label>
                          <div className="relative">
                            <select
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
                      </>
                    )}
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("auth.phone", lang)}</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("auth.pin", lang)}</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
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
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 min-h-0"
                    >
                      {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  {loading ? t("auth.loading", lang) : view === "register" ? t("auth.register", lang) : t("auth.login", lang)}
                  {!loading && <ArrowRight className="w-4 h-4" />}
                </button>
              </form>

              <div className="mt-4 space-y-2 text-center">
                <button
                  type="button"
                  onClick={() => switchView(view === "register" ? "login" : "register")}
                  className="text-brand-600 text-sm hover:underline min-h-0 block w-full"
                >
                  {view === "register" ? t("auth.haveAccount", lang) : t("auth.noAccount", lang)}
                </button>
                {view === "login" && (
                  <button
                    type="button"
                    onClick={() => switchView("forgot")}
                    className="text-gray-400 text-sm hover:text-brand-600 hover:underline min-h-0 block w-full"
                  >
                    {lang === "sw" ? "Umesahau PIN?" : "Forgot PIN?"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <Link
          href="/catalog"
          className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-sm font-semibold py-3 rounded-xl transition-colors"
        >
          <Store className="w-4 h-4" />
          {t("catalog.browse", lang)}
        </Link>

        <Link
          href="/pricing"
          className="mt-2 w-full inline-flex items-center justify-center gap-2 text-brand-200 hover:text-white text-sm py-2 transition-colors"
        >
          {lang === "sw" ? "Ona bei zetu ->" : "View pricing ->"}
        </Link>

        <p className="text-center text-brand-200 text-xs mt-4">
          DukaOS - Kujenga biashara Tanzania
        </p>
      </div>
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
