import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About DukaPilot - AI POS and Inventory App for Tanzanian Shops",
  description:
    "Learn about DukaPilot, the AI-powered POS, inventory, debts, expenses, staff, supplier order, and duka stock management app built for Tanzanian shop owners.",
  keywords: [
    "about DukaPilot",
    "DukaPilot Tanzania",
    "Duka Pilot",
    "POS Tanzania",
    "inventory app Tanzania",
    "AI assistant for shops Tanzania",
    "mfumo wa duka",
  ],
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "About DukaPilot",
    description:
      "DukaPilot helps Tanzanian shop owners track stock, sales, debts, expenses, staff, supplier orders, and the next best action.",
    url: "/about",
    siteName: "DukaPilot",
    type: "website",
    images: [{ url: "/marketing/phone-dashboard.png", width: 1200, height: 630, alt: "DukaPilot dashboard" }],
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
