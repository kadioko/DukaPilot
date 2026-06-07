"use client";

import Link from "next/link";
import LogoMark from "@/components/brand/LogoMark";
import { setLanguage, useLang, type Lang } from "@/lib/i18n";
import clsx from "clsx";

export default function PublicPageShell({ children }: { children: React.ReactNode }) {
  const lang = useLang();
  const languages: Array<{ key: Lang; label: string }> = [
    { key: "sw", label: "Kiswahili" },
    { key: "en", label: "English" },
  ];

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-3">
            <LogoMark className="h-9 w-9 rounded-lg" />
            <span className="font-bold">DukaPilot</span>
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <nav className="hidden items-center gap-3 text-sm font-medium text-gray-600 sm:flex">
              <Link href="/pricing" className="hover:text-brand-700">{lang === "sw" ? "Bei" : "Pricing"}</Link>
              <Link href="/help" className="hover:text-brand-700">{lang === "sw" ? "Msaada" : "Help"}</Link>
              <Link href="/contact" className="hover:text-brand-700">{lang === "sw" ? "Mawasiliano" : "Contact"}</Link>
            </nav>
            <div className="flex items-center gap-2 rounded-lg bg-gray-100 p-1">
              {languages.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setLanguage(item.key)}
                  className={clsx(
                    "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors min-h-0",
                    lang === item.key ? "bg-white text-brand-700 shadow-sm" : "text-gray-600 hover:text-gray-900"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-4xl px-4 py-12">{children}</section>
    </main>
  );
}
