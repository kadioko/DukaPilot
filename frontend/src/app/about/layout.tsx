import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About DukaPilot - POS, Quotations, Daily Close and QR Orders for Tanzania",
  description:
    "Learn how DukaPilot helps Tanzanian shops and service businesses manage stock, sales, quotations, debts, expenses, Daily Close, landed-cost receiving, receipts, and QR customer orders from a phone.",
  keywords: [
    "about DukaPilot",
    "DukaPilot Tanzania",
    "Duka Pilot",
    "POS Tanzania",
    "inventory app Tanzania",
    "AI assistant for shops Tanzania",
    "mfumo wa duka",
    "Daily Close Tanzania",
    "QR shop ordering Tanzania",
    "quotation software Tanzania",
    "service business software Tanzania",
  ],
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "About DukaPilot",
    description:
      "DukaPilot helps Tanzanian shops and service businesses manage stock, sales, quotations, debts, daily cash, QR orders, and next actions.",
    url: "/about",
    siteName: "DukaPilot",
    type: "website",
    images: [{ url: "/marketing/phone-dashboard.png", width: 1200, height: 630, alt: "DukaPilot dashboard" }],
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
