import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import ServiceWorkerRegistrar from "@/components/ui/ServiceWorkerRegistrar";

export const metadata: Metadata = {
  title: "DukaOS - Merchant OS Tanzania",
  description: "Stock, mauzo, na maagizo kwa maduka madogo Tanzania",
  manifest: "/manifest.json",
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
