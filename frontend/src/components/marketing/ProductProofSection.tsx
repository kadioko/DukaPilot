"use client";

import Image from "next/image";
import { Bot, ClipboardList, CreditCard, FileText, MessageCircle, PackageCheck, ReceiptText, QrCode } from "lucide-react";
import { useLang } from "@/lib/i18n";

const proofCards = [
  {
    icon: ReceiptText,
    title: { sw: "Mauzo / POS", en: "Sales / POS" },
    body: { sw: "Rekodi mauzo kwa taslimu, M-Pesa, benki au deni.", en: "Record sales by cash, M-Pesa, bank, or credit." },
    rows: [{ sw: "Sukari 1kg - TZS 3,200", en: "Sugar 1kg - TZS 3,200" }, { sw: "Maziwa - TZS 2,500", en: "Fresh milk - TZS 2,500" }, { sw: "Faida: TZS 1,100", en: "Profit: TZS 1,100" }],
  },
  {
    icon: PackageCheck,
    title: { sw: "Bidhaa dukani", en: "Inventory" },
    body: { sw: "Ona bidhaa zilizo chini ya kiwango na agiza mapema.", en: "Spot low-stock products and reorder early." },
    rows: [{ sw: "Mafuta 1L - pakiti 4 zimebaki", en: "Oil 1L - 4 left" }, { sw: "Mchele 5kg - mifuko 2 imebaki", en: "Rice 5kg - 2 left" }, { sw: "Tahadhari: agiza leo", en: "Alert: reorder today" }],
  },
  {
    icon: CreditCard,
    title: { sw: "Madeni", en: "Debts" },
    body: { sw: "Fuatilia deni la mteja na uweke malipo yakirudi.", en: "Track customer credit and mark payments when collected." },
    rows: [{ sw: "Asha - TZS 18,000", en: "Asha - TZS 18,000" }, { sw: "Salum - TZS 7,500", en: "Salum - TZS 7,500" }, { sw: "Hali: amelipa sehemu", en: "Status: partial" }],
  },
  {
    icon: MessageCircle,
    title: { sw: "Maagizo kwa wasambazaji", en: "Supplier orders" },
    body: { sw: "Tengeneza agizo na ujumbe tayari kutuma WhatsApp.", en: "Create an order with a WhatsApp-ready supplier message." },
    rows: [{ sw: "Jumla Traders", en: "Jumla Traders" }, { sw: "Bidhaa 6", en: "6 products" }, { sw: "Tuma WhatsApp", en: "Send on WhatsApp" }],
  },
  {
    icon: Bot,
    title: { sw: "Msaidizi wa AI", en: "AI Assistant" },
    body: { sw: "Pata hatua za leo: agiza, fuatilia deni, punguza gharama.", en: "See today's actions: restock, collect debt, reduce costs." },
    rows: [{ sw: "1. Agiza sukari", en: "1. Reorder sugar" }, { sw: "2. Fuatilia deni la Asha", en: "2. Follow up Asha's debt" }, { sw: "3. Tangaza bidhaa yenye faida", en: "3. Promote a high-margin product" }],
  },
  {
    icon: QrCode,
    title: { sw: "QR ya kuagiza", en: "QR ordering" },
    body: { sw: "Shiriki QR au link; mteja aone bidhaa na atume agizo.", en: "Share a QR or link so customers can browse and place an order." },
    rows: [{ sw: "Link ya duka", en: "Shop link" }, { sw: "Weka kwenye WhatsApp Status", en: "Share to WhatsApp Status" }, { sw: "Agizo linaingia dukani", en: "Order reaches the shop" }],
  },
  {
    icon: FileText,
    title: { sw: "Nukuu za bei", en: "Quotations" },
    body: { sw: "Tengeneza bei za huduma, kazi, vifaa na miradi kabla ya mauzo kuthibitishwa.", en: "Price services, labour, materials, and projects before a sale is confirmed." },
    rows: [{ sw: "Rasimu au tuma link salama", en: "Draft or share a secure link" }, { sw: "Amana na malipo ya hatua", en: "Deposits and milestone payments" }, { sw: "Gharama za ndani hubaki private", en: "Internal costs stay private" }],
  },
];

export default function ProductProofSection({ compact = false }: { compact?: boolean }) {
  const lang = useLang();

  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="grid gap-7 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <p className="text-sm font-bold text-brand-700">DukaPilot</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">
            {lang === "sw" ? "Ona kazi halisi kabla ya kuanza." : "See the real workflows before you start."}
          </h2>
          <p className="mt-3 text-sm leading-6 text-gray-600 sm:text-base">
            {lang === "sw"
              ? "DukaPilot si bei tu. Hizi ndizo sehemu ambazo mfanyabiashara hutumia kila siku: dashibodi, mauzo, bidhaa dukani, madeni, nukuu za bei, maagizo kwa wasambazaji na msaidizi wa AI."
              : "DukaPilot is more than pricing. These are the daily workflows a business owner uses: dashboard, sales, inventory, debts, quotations, supplier orders, and the AI Assistant."}
          </p>

          <div className="mt-5 flex justify-center overflow-hidden rounded-lg border border-brand-100 bg-brand-50 p-3">
            <Image
              src="/marketing/phone-dashboard.png"
              alt={lang === "sw" ? "Picha ya dashibodi ya DukaPilot" : "DukaPilot dashboard screenshot"}
              width={640}
              height={1138}
              className="h-auto max-h-[34rem] w-auto max-w-full rounded-lg object-contain shadow-sm"
            />
          </div>
        </div>

        <div className={`grid gap-3 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2"}`}>
          {proofCards.map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.title.en} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 ring-1 ring-brand-100">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-950">{card.title[lang]}</h3>
                    <p className="mt-1 text-sm leading-5 text-gray-600">{card.body[lang]}</p>
                  </div>
                </div>
                <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3">
                  {card.rows.map((row) => (
                    <div key={row.en} className="flex items-center gap-2 border-b border-gray-100 py-2 text-xs font-semibold text-gray-700 last:border-b-0">
                      <ClipboardList className="h-3.5 w-3.5 flex-shrink-0 text-brand-600" />
                      <span>{row[lang]}</span>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
