import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DukaPilot Demo - POS Tanzania and Duka Stock Management",
  description:
    "Try the DukaPilot demo for Tanzanian shops and service businesses. See POS sales, inventory, quotations, debts, expenses, supplier orders, and AI Assistant workflows.",
  keywords: [
    "DukaPilot demo",
    "POS Tanzania",
    "inventory app Tanzania",
    "duka stock management",
    "mfumo wa duka",
    "programu ya stock",
    "shop POS demo Tanzania",
    "quotation software Tanzania",
  ],
  alternates: {
    canonical: "/demo",
  },
  openGraph: {
    title: "Try the DukaPilot Demo",
    description:
      "Use demo accounts to see sales, stock, quotations, deposits, debts, supplier orders, staff, billing, and AI Assistant workflows.",
    url: "/demo",
    siteName: "DukaPilot",
    type: "website",
    images: [{ url: "/marketing/phone-dashboard.png", width: 1200, height: 630, alt: "DukaPilot dashboard demo" }],
  },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
