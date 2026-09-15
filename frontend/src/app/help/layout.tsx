import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DukaPilot Help - POS, Biashara na Mashamba Tanzania",
  description:
    "Help for using DukaPilot: business setup, POS sales, inventory, Daily Close, crop and livestock operations, quotations, staff access, offline sync, payments, and AI Assistant.",
  keywords: [
    "DukaPilot help",
    "programu ya stock",
    "POS Tanzania",
    "inventory app Tanzania",
    "mfumo wa duka",
    "duka stock management",
    "shop management help",
    "quotation software Tanzania",
    "estimate app Tanzania",
    "Daily Close Tanzania",
    "farm management Tanzania",
    "crop records Tanzania",
  ],
  alternates: {
    canonical: "/help",
  },
  openGraph: {
    title: "DukaPilot Help",
    description:
      "Get help with business setup, sales, inventory, Daily Close, crops, staff access, offline sync, payments, and AI Assistant.",
    url: "/help",
    siteName: "DukaPilot",
    type: "website",
    images: [{ url: "/marketing/phone-dashboard.png", width: 1200, height: 630, alt: "DukaPilot help and dashboard" }],
  },
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
