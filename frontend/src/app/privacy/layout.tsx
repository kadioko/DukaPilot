import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DukaPilot Privacy Policy",
  description:
    "Read the DukaPilot privacy policy for Tanzanian merchants, including account data, shop data, sales, inventory, support, and deletion requests.",
  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    title: "DukaPilot Privacy Policy",
    description: "How DukaPilot handles merchant account, shop, sales, inventory, support, and deletion data.",
    url: "/privacy",
    siteName: "DukaPilot",
    type: "website",
  },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
