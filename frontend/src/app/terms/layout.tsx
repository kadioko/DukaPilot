import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DukaPilot Terms of Service",
  description:
    "Read the DukaPilot terms of service for using the POS, inventory, sales, debts, expenses, supplier orders, catalog, and AI assistant features.",
  alternates: {
    canonical: "/terms",
  },
  openGraph: {
    title: "DukaPilot Terms of Service",
    description: "Terms for using DukaPilot POS, inventory, catalog, supplier orders, and AI assistant features.",
    url: "/terms",
    siteName: "DukaPilot",
    type: "website",
  },
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
