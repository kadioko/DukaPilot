import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DukaPilot Demo - POS Tanzania and Duka Stock Management",
  description:
    "Try the DukaPilot demo for Tanzanian shop owners. See POS sales, inventory, debts, expenses, supplier orders, AI Assistant, and mfumo wa duka workflows.",
  keywords: [
    "DukaPilot demo",
    "POS Tanzania",
    "inventory app Tanzania",
    "duka stock management",
    "mfumo wa duka",
    "programu ya stock",
    "shop POS demo Tanzania",
  ],
  alternates: {
    canonical: "/demo",
  },
  openGraph: {
    title: "Try the DukaPilot Demo",
    description:
      "Use demo accounts to see sales, stock, debts, supplier orders, staff, billing, and AI Assistant workflows.",
    url: "/demo",
    siteName: "DukaPilot",
    type: "website",
    images: [{ url: "/marketing/phone-dashboard.png", width: 1200, height: 630, alt: "DukaPilot dashboard demo" }],
  },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
