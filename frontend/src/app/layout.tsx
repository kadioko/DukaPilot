import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import ServiceWorkerRegistrar from "@/components/ui/ServiceWorkerRegistrar";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.dukapilot.com"),
  title: "DukaPilot - POS Tanzania, Inventory App, Mfumo wa Duka",
  description:
    "DukaPilot is a POS and inventory app for Tanzanian shops. Track stock, sales, debts, expenses, supplier orders, and duka stock management in Kiswahili.",
  keywords: [
    "POS Tanzania",
    "inventory app Tanzania",
    "mfumo wa duka",
    "duka stock management",
    "programu ya stock",
    "shop management Tanzania",
    "DukaPilot",
  ],
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/logo/dukapilot-icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/logo/dukapilot-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/logo/dukapilot-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "192x192", type: "image/png" }],
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "DukaPilot - POS and Inventory App for Tanzanian Shops",
    description:
      "Track stock, sales, debts, expenses, supplier orders, and profit in Kiswahili from your phone.",
    url: "/",
    siteName: "DukaPilot",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#16a34a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sw">
      <body>
        <ToastProvider>
        <ServiceWorkerRegistrar />
        {children}
      </ToastProvider>
      </body>
    </html>
  );
}
