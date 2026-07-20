import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import ServiceWorkerRegistrar from "@/components/ui/ServiceWorkerRegistrar";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.dukapilot.com"),
  title: {
    default: "DukaPilot - POS Tanzania, Inventory App, Mfumo wa Duka",
    template: "%s | DukaPilot",
  },
  description:
    "DukaPilot is an AI-powered POS and inventory app for Tanzanian shops. Track stock, sales, debts, expenses, supplier orders, and duka stock management in Kiswahili.",
  applicationName: "DukaPilot",
  authors: [{ name: "Necuva Group Limited", url: "https://www.dukapilot.com" }],
  creator: "Necuva Group Limited",
  publisher: "Necuva Group Limited",
  category: "Business Software",
  keywords: [
    "DukaPilot",
    "Duka Pilot",
    "dukapilot.com",
    "POS Tanzania",
    "inventory app Tanzania",
    "AI assistant for shops Tanzania",
    "mfumo wa duka",
    "duka stock management",
    "programu ya stock",
    "programu ya duka",
    "POS ya duka",
    "shop POS Tanzania",
    "stock management app Tanzania",
    "shop management Tanzania",
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
      "AI-powered POS for Tanzanian shops. Track stock, sales, debts, expenses, supplier orders, and profit in Kiswahili from your phone.",
    url: "/",
    siteName: "DukaPilot",
    type: "website",
    locale: "sw_TZ",
    alternateLocale: ["en_US"],
    images: [
      {
        url: "/marketing/phone-dashboard.png",
        width: 1200,
        height: 630,
        alt: "DukaPilot dashboard for Tanzanian shop owners",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DukaPilot - POS Tanzania, Inventory App, Mfumo wa Duka",
    description:
      "AI-powered POS and inventory app for Tanzanian shops. Track stock, sales, debts, expenses, and supplier orders in Kiswahili.",
    images: ["/marketing/phone-dashboard.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#16a34a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "DukaPilot",
      legalName: "Necuva Group Limited",
      url: "https://www.dukapilot.com",
      logo: "https://www.dukapilot.com/logo/dukapilot-icon-512.png",
      email: "support@dukapilot.com",
      telephone: "+255743910580",
      sameAs: ["https://www.instagram.com/dukapilot/"],
      contactPoint: [
        {
          "@type": "ContactPoint",
          telephone: "+255743910580",
          contactType: "customer support",
          areaServed: "TZ",
          availableLanguage: ["Swahili", "English"],
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "DukaPilot",
      alternateName: "Duka Pilot",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web, Android",
      url: "https://www.dukapilot.com",
      image: "https://www.dukapilot.com/marketing/phone-dashboard.png",
      description:
        "AI-powered POS and inventory app for Tanzanian shops. Track stock, sales, debts, expenses, supplier orders, and profit in Kiswahili.",
      offers: [
        {
          "@type": "Offer",
          name: "Basic",
          price: "15000",
          priceCurrency: "TZS",
          url: "https://www.dukapilot.com/pricing",
        },
        {
          "@type": "Offer",
          name: "Pro",
          price: "35000",
          priceCurrency: "TZS",
          url: "https://www.dukapilot.com/pricing",
        },
      ],
      publisher: {
        "@type": "Organization",
        name: "Necuva Group Limited",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "DukaPilot",
      alternateName: "Duka Pilot",
      url: "https://www.dukapilot.com",
      inLanguage: ["sw-TZ", "en"],
      potentialAction: {
        "@type": "SearchAction",
        target: "https://www.dukapilot.com/catalog?search={search_term_string}",
        "query-input": "required name=search_term_string",
      },
    },
  ];

  return (
    <html lang="sw">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <ToastProvider>
        <ServiceWorkerRegistrar />
        {children}
      </ToastProvider>
      </body>
    </html>
  );
}
