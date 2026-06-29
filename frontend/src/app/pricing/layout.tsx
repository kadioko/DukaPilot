import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DukaPilot Pricing - POS Tanzania, Inventory App, Mfumo wa Duka",
  description:
    "Simple DukaPilot pricing for Tanzanian shops. POS Tanzania, inventory app Tanzania, duka stock management, debts, expenses, supplier orders, and programu ya stock in Kiswahili.",
  keywords: [
    "POS Tanzania",
    "inventory app Tanzania",
    "mfumo wa duka",
    "duka stock management",
    "programu ya stock",
    "DukaPilot pricing",
    "shop management Tanzania",
  ],
  alternates: {
    canonical: "/pricing",
  },
  openGraph: {
    title: "DukaPilot Pricing - POS and Inventory App Tanzania",
    description:
      "Track stock, sales, debts, expenses, and supplier orders for Tanzanian shops. Start free, then pay by M-Pesa.",
    url: "/pricing",
    siteName: "DukaPilot",
    type: "website",
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
