"use client";
import { useState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  ClipboardList,
  Truck,
  LogOut,
  Menu,
  X,
  Bell,
  AlertTriangle,
  ReceiptText,
  ChartNoAxesCombined,
  Users,
  HandCoins,
  Sparkles,
  CreditCard,
  Settings,
  ShoppingBag,
  ScanLine,
  WalletCards,
  PackageCheck,
  ChefHat,
  Gift,
  FileText,
} from "lucide-react";
import { clearToken, api, getCurrentSession, markSessionActive } from "@/lib/api";
import { t, useLang, setLanguage as setAppLanguage, type Lang } from "@/lib/i18n";
import LogoMark from "@/components/brand/LogoMark";
import ShortcutUsageTracker from "@/components/analytics/ShortcutUsageTracker";
import QuickStartGuide from "@/components/onboarding/QuickStartGuide";
import clsx from "clsx";

interface User {
  name: string;
  role: string;
  language?: Lang;
  shop?: { name: string; category?: string };
  supplier?: { name: string };
  staff?: {
    role: string;
    permissions: {
      canSell: boolean;
      canManageStock: boolean;
      canManageStaff: boolean;
      canViewReports: boolean;
      canRecordExpenses: boolean;
      canViewQuotations: boolean;
    };
  };
  features?: {
    staff: boolean;
    assistant: boolean;
    exports: boolean;
  };
}

interface NavItem {
  href: string;
  labelKey?: string;
  label?: string;
  icon: typeof LayoutDashboard;
  permission?: "canSell" | "canManageStock" | "canManageStaff" | "canViewReports" | "canRecordExpenses" | "canViewQuotations";
  feature?: "staff" | "assistant" | "exports";
  ownerOnly?: boolean;
  shopCategories?: string[];
  group?: "overview" | "ai" | "sell" | "stock" | "money" | "manage";
}

const merchantNav: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, permission: "canViewReports", group: "overview" },
  { href: "/assistant", labelKey: "nav.assistant", icon: Sparkles, permission: "canViewReports", feature: "assistant", group: "ai" },
  { href: "/sales", labelKey: "nav.sales", icon: ShoppingCart, permission: "canSell", group: "sell" },
  { href: "/daily-close", labelKey: "nav.dailyClose", icon: WalletCards, permission: "canSell", group: "sell" },
  { href: "/debts", labelKey: "nav.debts", icon: HandCoins, permission: "canSell", group: "sell" },
  { href: "/orders/customers", labelKey: "nav.customerOrders", icon: ShoppingBag, permission: "canSell", group: "sell" },
  { href: "/quotations", labelKey: "nav.quotations", icon: FileText, permission: "canViewQuotations", group: "sell" },
  { href: "/inventory", labelKey: "nav.inventory", icon: Package, permission: "canManageStock", group: "stock" },
  { href: "/receiving", labelKey: "nav.receiving", icon: PackageCheck, permission: "canManageStock", group: "stock" },
  { href: "/food-preparation", labelKey: "nav.foodPreparation", icon: ChefHat, permission: "canManageStock", shopCategories: ["bar", "restaurant"], group: "stock" },
  { href: "/barcodes", labelKey: "nav.barcodes", icon: ScanLine, permission: "canManageStock", group: "stock" },
  { href: "/suppliers", labelKey: "nav.suppliers", icon: Truck, permission: "canManageStock", group: "stock" },
  { href: "/orders", labelKey: "nav.orders", icon: ClipboardList, permission: "canManageStock", group: "stock" },
  { href: "/expenses", labelKey: "nav.expenses", icon: ReceiptText, permission: "canRecordExpenses", group: "money" },
  { href: "/profit", labelKey: "nav.profit", icon: ChartNoAxesCombined, permission: "canViewReports", group: "money" },
  { href: "/billing", labelKey: "nav.billing", icon: CreditCard, permission: "canManageStaff", group: "money" },
  { href: "/staff", labelKey: "nav.staff", icon: Users, permission: "canManageStaff", feature: "staff", group: "manage" },
  { href: "/referrals", labelKey: "nav.referrals", icon: Gift, ownerOnly: true, group: "manage" },
  { href: "/settings", labelKey: "nav.settings", icon: Settings, group: "manage" },
  { href: "/reports", labelKey: "nav.reportIssue", icon: AlertTriangle, group: "manage" },
];

const adminNav: NavItem[] = [
  { href: "/admin", label: "Admin", icon: LayoutDashboard },
  { href: "/suppliers", labelKey: "nav.suppliers", icon: Truck },
  { href: "/reports", label: "Reports", icon: AlertTriangle },
];

const supplierNav: NavItem[] = [
  { href: "/supplier", labelKey: "nav.supplierPortal", icon: ClipboardList },
  { href: "/settings", labelKey: "nav.settings", icon: Settings },
  { href: "/reports", labelKey: "nav.reportIssue", icon: AlertTriangle },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const lang = useLang();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [subscription, setSubscription] = useState<{ daysLeft: number | null; status?: string; isActive?: boolean } | null>(null);
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    getCurrentSession<{ user: User }>()
      .then((d) => {
        markSessionActive();
        setUser(d.user);
        if (d.user.language === "sw" || d.user.language === "en") {
          setAppLanguage(d.user.language);
        }
      })
      .catch(() => router.push("/"))
      .finally(() => setAuthLoading(false));
  }, [router]);

  useEffect(() => {
    if (user?.role === "MERCHANT") {
      api.get<{ products: unknown[]; total?: number }>("/products/low-stock?limit=1")
        .then((d) => setLowStockCount(d.total ?? d.products.length))
        .catch(() => {});
      api.get<{ daysLeft: number | null; status?: string; isActive?: boolean }>("/subscription/status")
        .then((d) => setSubscription({ daysLeft: d.daysLeft ?? null, status: d.status, isActive: d.isActive }))
        .catch(() => {});
      api.get<{ unreadCount: number }>("/notifications")
        .then((d) => setNotificationCount(d.unreadCount || 0))
        .catch(() => {});
    }
  }, [user]);

  async function handleLogout() {
    try {
      await api.post("/auth/logout", {});
    } catch {}
    clearToken();
    router.push("/");
  }

  async function handleLanguageChange(nextLanguage: Lang) {
    const previousLanguage = user?.language;
    setAppLanguage(nextLanguage);
    setUser((current: User | null) => (current ? { ...current, language: nextLanguage } : current));
    try {
      await api.patch("/auth/language", { language: nextLanguage });
    } catch {
      setUser((current: User | null) => (current ? { ...current, language: previousLanguage || "sw" } : current));
      if (previousLanguage === "sw" || previousLanguage === "en") {
        setAppLanguage(previousLanguage);
      }
    }
  }

  const nav = user?.role === "ADMIN"
    ? [
        ...adminNav,
        ...(user?.supplier ? [{ href: "/supplier", label: "Supplier Portal", icon: ClipboardList }] : []),
      ]
    : user?.role === "SUPPLIER"
      ? supplierNav
      : merchantNav.filter((item) =>
          (!user?.staff || !item.permission || user.staff.permissions[item.permission]) &&
          (!item.feature || user?.features?.[item.feature] !== false) &&
          (!item.ownerOnly || !user?.staff) &&
          (!item.shopCategories || item.shopCategories.includes(String(user?.shop?.category || "").toLowerCase()))
        );
  const displayName = user?.shop?.name || user?.supplier?.name || user?.name || "DukaPilot";
  const subscriptionNeedsPayment = subscription?.status === "expired" || subscription?.status === "suspended" || subscription?.isActive === false;
  const subscriptionEndingSoon = !subscriptionNeedsPayment && subscription?.daysLeft !== null && subscription?.daysLeft !== undefined && subscription.daysLeft <= 7;
  const navGroupLabel: Record<NonNullable<NavItem["group"]>, string> = {
    overview: lang === "sw" ? "Muhtasari" : "Overview",
    ai: lang === "sw" ? "Msaidizi wa AI" : "AI Assistant",
    sell: lang === "sw" ? "Uuzaji" : "Sell",
    stock: lang === "sw" ? "Bidhaa" : "Stock",
    money: lang === "sw" ? "Fedha" : "Money",
    manage: lang === "sw" ? "Usimamizi" : "Manage",
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          "fixed top-0 left-0 h-full w-64 bg-brand-800 text-white flex flex-col z-30 transition-transform duration-200",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 p-5 border-b border-brand-700">
          <LogoMark className="h-10 w-10 rounded-xl bg-white shadow-sm" />
          <div className="min-w-0">
            <p className="font-bold text-sm leading-tight truncate">{displayName}</p>
            <p className="text-brand-300 text-xs">DukaPilot</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation menu"
            className="ml-auto lg:hidden text-brand-300 hover:text-white min-h-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Trial / subscription status banner */}
        {user?.role === "MERCHANT" && (subscriptionNeedsPayment || subscriptionEndingSoon) && (
          <div className={`mx-3 mt-3 px-3 py-2 rounded-xl text-xs font-medium ${
            subscriptionNeedsPayment
              ? "bg-red-500/20 text-red-200 border border-red-500/30"
              : "bg-yellow-500/20 text-yellow-200 border border-yellow-500/30"
          }`}>
            {subscriptionNeedsPayment
              ? (lang === "sw" ? "Usajili wako umeisha. Lipa na tuma reference ili duka lirudi active." : "Your subscription has expired. Pay and submit the reference to reactivate your shop.")
              : (lang === "sw" ? `Usajili wako unaisha baada ya siku ${subscription?.daysLeft}.` : `Your subscription ends in ${subscription?.daysLeft} days.`)}
            {" "}<Link href="/billing" className="underline hover:no-underline">
              {subscriptionNeedsPayment ? (lang === "sw" ? "Rejesha sasa" : "Reactivate now") : (lang === "sw" ? "Lipa sasa" : "Pay now")}
            </Link>
          </div>
        )}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {nav.map(({ href, labelKey, label, icon: Icon, group }, index) => (
            <div key={href}>
              {group && (index === 0 || group !== nav[index - 1]?.group) && <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-300">{navGroupLabel[group]}</p>}
              <Link href={href} onClick={() => setSidebarOpen(false)} className={clsx("flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors", pathname === href ? "bg-white/15 text-white" : "text-brand-200 hover:bg-white/10 hover:text-white")}>
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{href === "/barcodes" && lang === "sw" ? "Misimbo ya Bidhaa" : href === "/reports" && lang === "sw" ? "Ripoti Tatizo" : labelKey ? t(labelKey, lang) : label}</span>
                {href === "/inventory" && lowStockCount > 0 && <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">{lowStockCount}</span>}
              </Link>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-brand-700">
          <div className="px-3 py-3 mb-2 rounded-2xl bg-white/5 border border-white/10">
            <p className="text-[11px] uppercase tracking-[0.2em] text-brand-300 mb-2">{t("app.language", lang)}</p>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-brand-900/30 p-1">
              <button
                onClick={() => handleLanguageChange("sw")}
                className={clsx(
                  "px-2 py-2 rounded-lg text-xs font-semibold transition-colors min-h-0",
                  lang === "sw" ? "bg-white text-brand-800 shadow-sm" : "text-brand-100 hover:bg-white/10"
                )}
              >
                {t("app.swahili", lang)}
              </button>
              <button
                onClick={() => handleLanguageChange("en")}
                className={clsx(
                  "px-2 py-2 rounded-lg text-xs font-semibold transition-colors min-h-0",
                  lang === "en" ? "bg-white text-brand-800 shadow-sm" : "text-brand-100 hover:bg-white/10"
                )}
              >
                {t("app.english", lang)}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-8 h-8 bg-brand-600 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
              {user?.name?.[0]?.toUpperCase() || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-brand-300 text-xs">
                {user?.staff
                  ? user.staff.role.replace("_", " ")
                  : user?.role === "MERCHANT"
                    ? t("app.merchant", lang)
                    : user?.role === "ADMIN"
                      ? "Admin"
                      : t("app.supplier", lang)}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-brand-200 hover:bg-white/10 hover:text-white text-sm transition-colors"
          >
            <LogOut className="w-4 h-4" />
            {t("app.logout", lang)}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="min-w-0 flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-10 bg-white border-b border-gray-200 flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation menu"
            className="text-gray-600 min-h-0"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <LogoMark className="h-7 w-7 rounded-lg" />
            <span className="font-semibold text-gray-800 text-sm truncate">{displayName}</span>
          </div>
          <Link href="/notifications" aria-label={lang === "sw" ? "Taarifa za duka" : "Shop alerts"} className="relative flex h-11 w-11 items-center justify-center text-gray-600">
            <Bell className="w-5 h-5" />
            {notificationCount > 0 && <span className="absolute right-1.5 top-1.5 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-4 text-white">{Math.min(notificationCount, 9)}</span>}
          </Link>
        </header>

        {/* Page content */}
        <main className="min-w-0 flex-1 p-4 lg:p-8 overflow-y-auto">
          {user && <ShortcutUsageTracker merchant={user.role === "MERCHANT"} />}
          {authLoading ? (
            <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading account">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700" />
            </div>
          ) : user ? children : null}
          {user?.role === "MERCHANT" && <QuickStartGuide lang={lang} />}
        </main>
      </div>
    </div>
  );
}
