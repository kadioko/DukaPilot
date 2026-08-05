"use client";

import PublicHeader from "@/components/marketing/PublicHeader";

export default function PublicPageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <PublicHeader />
      <section className="mx-auto max-w-5xl px-4 py-10 sm:py-12">{children}</section>
    </main>
  );
}
