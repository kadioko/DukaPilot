import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Delete DukaPilot Account and Data",
  description:
    "Request deletion of a DukaPilot account or associated shop data. Learn what data is deleted, what may be retained, and how to contact support.",
  alternates: {
    canonical: "/delete-account",
  },
  openGraph: {
    title: "Delete DukaPilot Account and Data",
    description: "Request account or data deletion for DukaPilot.",
    url: "/delete-account",
    siteName: "DukaPilot",
    type: "website",
  },
};

export default function DeleteAccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
