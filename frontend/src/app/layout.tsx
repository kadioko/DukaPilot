import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import ServiceWorkerRegistrar from "@/components/ui/ServiceWorkerRegistrar";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.dukapilot.com"),
  title: "DukaPilot - Merchant OS Tanzania",
  description: "Stock, mauzo, na maagizo kwa maduka madogo Tanzania",
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
