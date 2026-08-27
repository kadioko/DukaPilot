import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DukaPilot Pricing - POS Tanzania, Inventory App, Mfumo wa Duka",
  description:
    "Simple DukaPilot pricing for Tanzanian shops and service businesses. POS Tanzania, inventory, quotations, projects, debts, expenses, supplier orders, and programu ya stock in Kiswahili.",
  keywords: [
    "POS Tanzania",
    "inventory app Tanzania",
    "mfumo wa duka",
    "duka stock management",
    "programu ya stock",
    "DukaPilot pricing",
    "shop management Tanzania",
    "quotation software Tanzania",
    "estimate app Tanzania",
  ],
  alternates: {
    canonical: "/pricing",
  },
  openGraph: {
    title: "DukaPilot Pricing - POS and Inventory App Tanzania",
    description:
      "Track stock, sales, quotations, debts, expenses, and supplier orders for Tanzanian shops and service businesses. Start free, then pay by M-Pesa.",
    url: "/pricing",
    siteName: "DukaPilot",
    type: "website",
    images: [{ url: "/marketing/phone-dashboard.png", width: 1200, height: 630, alt: "DukaPilot pricing and dashboard" }],
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
