import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact DukaPilot - WhatsApp Support for Tanzanian Shops",
  description:
    "Contact DukaPilot support by WhatsApp, phone, or email for setup, subscription payment references, POS, inventory, catalog, staff, and AI assistant help.",
  keywords: [
    "contact DukaPilot",
    "DukaPilot support",
    "Duka Pilot WhatsApp",
    "POS Tanzania support",
    "inventory app Tanzania support",
    "support@dukapilot.com",
  ],
  alternates: {
    canonical: "/contact",
  },
  openGraph: {
    title: "Contact DukaPilot Support",
    description: "Get WhatsApp support for setup, payments, stock, sales, staff, catalog, and AI Assistant.",
    url: "/contact",
    siteName: "DukaPilot",
    type: "website",
    images: [{ url: "/marketing/phone-dashboard.png", width: 1200, height: 630, alt: "DukaPilot support" }],
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
