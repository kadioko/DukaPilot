"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import LogoMark from "@/components/brand/LogoMark";
import { setLanguage, useLang, type Lang } from "@/lib/i18n";
import { trackMarketingEvent } from "@/lib/marketing";
import clsx from "clsx";

const navItems = [
  { href: "/pricing", sw: "Bei", en: "Pricing" },
  { href: "/catalog", sw: "Orodha ya bidhaa", en: "Catalog" },
  { href: "/demo", sw: "Onyesho", en: "Demo" },
  { href: "/help", sw: "Msaada", en: "Help" },
  { href: "/contact", sw: "Mawasiliano", en: "Contact" },
  { href: "/about", sw: "Kuhusu", en: "About" },
];

interface PublicHeaderProps {
  lang?: Lang;
  onLanguageChange?: (lang: Lang) => void;
  onStart?: () => void;
  className?: string;
}

export default function PublicHeader({ lang: langProp, onLanguageChange, onStart, className }: PublicHeaderProps) {
  const appLang = useLang();
  const lang = langProp || appLang;
  const [mobileOpen, setMobileOpen] = useState(false);
  const changeLanguage = onLanguageChange || setLanguage;
  const handleStart = () => {
    setMobileOpen(false);
    trackMarketingEvent("store_click");
    onStart?.();
  };

  const startControl = onStart ? (
    <button type="button" onClick={handleStart} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-bold text-brand-800 hover:bg-brand-50">
      {lang === "sw" ? "Anza bure" : "Start free"}
    </button>
  ) : (
    <Link prefetch={false} href="/register" onClick={handleStart} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-bold text-brand-800 hover:bg-brand-50">
      {lang === "sw" ? "Anza bure" : "Start free"}
    </Link>
  );

  return (
    <header className={clsx("sticky top-0 z-30 border-b border-white/15 bg-[#0d6b3c]/95 text-white shadow-lg backdrop-blur", className)}>
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link prefetch={false} href="/" className="flex items-center gap-3">
          <LogoMark className="h-10 w-10 rounded-lg bg-white shadow-sm" />
          <div><p className="text-sm font-bold leading-tight">DukaPilot</p><p className="text-xs text-brand-100">Merchant OS - Tanzania</p></div>
        </Link>
        <div className="hidden items-center gap-3 lg:flex">
          <nav className="flex items-center gap-0.5 text-sm font-semibold text-brand-50">
            {navItems.map((item) => <Link prefetch={false} key={item.href} href={item.href} className="rounded-lg px-2.5 py-2 hover:bg-white/15">{item[lang]}</Link>)}
          </nav>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/10 p-1">
            {(["sw", "en"] as const).map((language) => <button key={language} type="button" onClick={() => changeLanguage(language)} className={clsx("min-h-0 rounded-md px-3 py-2 text-xs font-bold", lang === language ? "bg-white text-brand-800" : "text-brand-50 hover:bg-white/10")}>{language.toUpperCase()}</button>)}
          </div>
          <Link prefetch={false} href="/" className="rounded-lg px-3 py-2 text-sm font-semibold text-white hover:bg-white/10">{lang === "sw" ? "Ingia" : "Sign in"}</Link>
          {startControl}
        </div>
        <div className="flex items-center gap-2 lg:hidden">
          <button type="button" onClick={() => changeLanguage(lang === "sw" ? "en" : "sw")} className="flex h-10 min-w-10 items-center justify-center rounded-lg bg-white/10 px-2 text-xs font-bold">{lang === "sw" ? "EN" : "SW"}</button>
          <button type="button" onClick={() => setMobileOpen((open) => !open)} aria-expanded={mobileOpen} aria-label={mobileOpen ? "Close menu" : "Open menu"} className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-brand-800">{mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
      </div>
      {mobileOpen && <div className="absolute left-0 right-0 top-full border-t border-white/15 bg-[#0d6b3c] p-4 shadow-xl lg:hidden"><nav className="grid grid-cols-2 gap-1 text-sm font-semibold text-brand-50">{navItems.map((item) => <Link prefetch={false} key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-3 hover:bg-white/15">{item[lang]}</Link>)}</nav><div className="mt-3 grid grid-cols-2 gap-2"><Link prefetch={false} href="/" className="flex min-h-11 items-center justify-center rounded-lg border border-white/30 text-sm font-bold">{lang === "sw" ? "Ingia" : "Sign in"}</Link>{startControl}</div></div>}
    </header>
  );
}
