import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DukaPilot Catalog - Online Shop Links for Tanzanian Merchants",
  description:
    "DukaPilot catalog lets Tanzanian merchants share public shop links, receive customer orders, and connect catalog ordering with POS, inventory, and stock tracking.",
  keywords: [
    "DukaPilot catalog",
    "online catalog Tanzania",
    "shop catalog link Tanzania",
    "duka online Tanzania",
    "POS Tanzania",
    "inventory app Tanzania",
  ],
  alternates: {
    canonical: "/catalog",
  },
  openGraph: {
    title: "DukaPilot Catalog",
    description: "Share public shop links and receive customer orders connected to stock and sales.",
    url: "/catalog",
    siteName: "DukaPilot",
    type: "website",
    images: [{ url: "/marketing/phone-dashboard.png", width: 1200, height: 630, alt: "DukaPilot catalog" }],
  },
};

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
