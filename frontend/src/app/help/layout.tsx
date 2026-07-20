import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DukaPilot Help - Programu ya Stock, POS Tanzania, Mfumo wa Duka",
  description:
    "Help for using DukaPilot: setup, POS sales, inventory, duka stock management, catalog links, staff, offline sales, subscription payments, and AI Assistant.",
  keywords: [
    "DukaPilot help",
    "programu ya stock",
    "POS Tanzania",
    "inventory app Tanzania",
    "mfumo wa duka",
    "duka stock management",
    "shop management help",
  ],
  alternates: {
    canonical: "/help",
  },
  openGraph: {
    title: "DukaPilot Help",
    description:
      "Get help with setup, sales, inventory, debts, catalog links, staff access, offline sales, payments, and AI Assistant.",
    url: "/help",
    siteName: "DukaPilot",
    type: "website",
    images: [{ url: "/marketing/phone-dashboard.png", width: 1200, height: 630, alt: "DukaPilot help and dashboard" }],
  },
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
