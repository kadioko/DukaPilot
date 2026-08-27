"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, FileText, PackageCheck, QrCode, ReceiptText, ShieldCheck, WalletCards } from "lucide-react";
import PublicPageShell from "@/components/marketing/PublicPageShell";
import WhatsAppCTA from "@/components/marketing/WhatsAppCTA";
import { useLang } from "@/lib/i18n";

const daySteps = [
  {
    icon: WalletCards,
    sw: { title: "Anza na pesa iliyo wazi", body: "Fungua siku ya cash, rekodi mauzo na malipo ya madeni, kisha linganisha pesa ya droo unapofunga siku." },
    en: { title: "Start with clear cash", body: "Open a cash session, record sales and debt collections, then compare the drawer to the expected cash at close." },
  },
  {
    icon: ReceiptText,
    sw: { title: "Uza na uache kumbukumbu", body: "Mauzo hubadilisha stock, yanaweka faida kwenye rekodi, na risiti inaweza kushirikiwa kwa WhatsApp, PNG, PDF, au kuchapishwa." },
    en: { title: "Sell with a record", body: "Sales update stock, preserve profit data, and receipts can be shared by WhatsApp, PNG, PDF, or print." },
  },
  {
    icon: PackageCheck,
    sw: { title: "Pokea stock kwa gharama halisi", body: "Weka supplier, invoice, bei ya kununua, usafiri na gharama nyingine. DukaPilot huhifadhi historia ya stock na gharama ya bidhaa." },
    en: { title: "Receive stock at its true cost", body: "Capture the supplier, invoice, buying cost, transport, and other costs. DukaPilot keeps the stock and landed-cost history." },
  },
  {
    icon: QrCode,
    sw: { title: "Geuza link kuwa oda", body: "Shiriki link au QR ya duka lako. Mteja anaona bidhaa na kutuma oda ambayo inaingia moja kwa moja dukani." },
    en: { title: "Turn a link into orders", body: "Share your shop link or QR. Customers browse products and send an order straight to the shop." },
  },
  {
    icon: FileText,
    sw: { title: "Anza kazi kwa nukuu iliyo wazi", body: "Kwa huduma na miradi, tengeneza nukuu yenye kazi, vifaa, labour, amana na masharti. Gharama na faida ya makadirio hubaki ndani ya biashara." },
    en: { title: "Start work with a clear quotation", body: "For services and projects, create a quotation with work, materials, labour, deposits, and terms. Estimated costs and profit stay inside the business." },
  },
];

export default function AboutPage() {
  const lang = useLang();
  const isSwahili = lang === "sw";

  return (
    <PublicPageShell>
      <div className="space-y-12 pb-5 sm:space-y-16">
        <section className="overflow-hidden bg-[#073c27] text-white">
          <div className="grid gap-8 px-5 py-8 sm:px-8 sm:py-10 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:px-10">
            <div>
              <p className="text-sm font-bold text-brand-200">DukaPilot | Tanzania</p>
              <h1 className="mt-3 max-w-xl text-3xl font-black leading-tight tracking-normal sm:text-5xl">
                {isSwahili ? "Siku ya duka iwe wazi, si ya kubahatisha." : "Make every shop day clear, not a guess."}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-brand-100 sm:text-lg">
                {isSwahili
                  ? "DukaPilot ni mfumo wa simu kwa wamiliki wa maduka na biashara za huduma Tanzania wanaotaka kuona stock, mauzo, madeni, matumizi, pesa ya siku, oda za wateja na nukuu za bei bila kutegemea daftari au kumbukumbu za WhatsApp pekee."
                  : "DukaPilot is a phone-first system for Tanzanian shops and service businesses that need a clear view of stock, sales, debts, expenses, daily cash, customer orders, and quotations without relying on notebooks or WhatsApp memory alone."}
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link href="/register" className="inline-flex min-h-11 items-center justify-center gap-2 bg-white px-5 py-3 text-sm font-bold text-brand-800 hover:bg-brand-50">
                  {isSwahili ? "Anza bure siku 14" : "Start free for 14 days"}<ArrowRight className="h-4 w-4" />
                </Link>
                <WhatsAppCTA intent="about" variant="light" label={isSwahili ? "Ongea nasi WhatsApp" : "Talk to us on WhatsApp"} />
              </div>
              <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-brand-100">
                <span>{isSwahili ? "Kiswahili na English" : "Kiswahili and English"}</span>
                <span>{isSwahili ? "Simu kwanza" : "Phone-first"}</span>
                <span>{isSwahili ? "Pesa kwa TZS" : "Money in TZS"}</span>
              </div>
            </div>
            <div className="mx-auto w-full max-w-[19rem] bg-white p-2 shadow-2xl sm:max-w-[22rem]">
              <Image
                src="/marketing/phone-dashboard.png"
                alt={isSwahili ? "Dashibodi halisi ya DukaPilot kwenye simu" : "DukaPilot dashboard on a phone"}
                width={640}
                height={1138}
                priority
                className="h-auto w-full"
              />
            </div>
          </div>
        </section>

        <section className="grid gap-7 lg:grid-cols-[0.72fr_1.28fr] lg:gap-12">
          <div>
            <p className="text-sm font-bold text-brand-700">{isSwahili ? "Mzunguko wa kila siku" : "The daily loop"}</p>
            <h2 className="mt-2 text-2xl font-black tracking-normal text-gray-950 sm:text-3xl">
              {isSwahili ? "Mfumo unaofuata kazi ya duka." : "A system that follows the work of a shop."}
            </h2>
            <p className="mt-4 text-base leading-7 text-gray-600">
              {isSwahili
                ? "Hatujajenga ripoti ya kuangalia mwisho wa mwezi tu. DukaPilot inaunganisha maamuzi ya counter, store na owner katika siku yenyewe ya biashara."
                : "This is not a report to open only at month end. DukaPilot connects the counter, the stock room, and the owner around the same trading day."}
            </p>
          </div>
          <div className="divide-y divide-gray-200 border-y border-gray-200">
            {daySteps.map(({ icon: Icon, sw, en }) => {
              const copy = isSwahili ? sw : en;
              return <article key={en.title} className="grid gap-3 py-5 sm:grid-cols-[44px_1fr] sm:gap-5"><span className="flex h-11 w-11 items-center justify-center bg-brand-50 text-brand-700"><Icon className="h-5 w-5" /></span><div><h3 className="font-bold text-gray-950">{copy.title}</h3><p className="mt-1 text-sm leading-6 text-gray-600">{copy.body}</p></div></article>;
            })}
          </div>
        </section>

        <section className="border-y border-gray-200 py-8 sm:py-10">
          <div className="grid gap-8 md:grid-cols-3">
            {[
              { title: isSwahili ? "Pesa ya leo iwe na jibu" : "Give today's cash an answer", body: isSwahili ? "Daily Close inaonyesha opening cash, mauzo ya cash, makusanyo ya deni, matumizi ya cash, hesabu inayotarajiwa na tofauti ya pesa iliyohesabiwa." : "Daily Close shows opening cash, cash sales, debt collections, cash expenses, expected cash, and the counted variance." },
              { title: isSwahili ? "Gharama zisiharibu faida kimya kimya" : "Keep costs from quietly distorting profit", body: isSwahili ? "Ununuzi wa stock huingia kupitia Receive Stock, si matumizi ya kawaida. Hii husaidia buying cost na faida ya bidhaa kubaki sahihi." : "Stock purchases go through Receive Stock, not ordinary expenses. This keeps buying cost and product profit meaningful." },
              { title: isSwahili ? "Kila mtu aone anachohitaji" : "Let each person see what they need", body: isSwahili ? "Owner anaweza kuweka ruhusa za kuuza, stock, matumizi na reports kwa kila staff. Watu bila Reports hawaoni buying cost au faida ya biashara." : "Owners can set selling, stock, expense, and report permissions per staff member. People without Reports cannot see buying cost or business profit." },
            ].map((item) => <article key={item.title}><ShieldCheck className="h-5 w-5 text-brand-700" /><h3 className="mt-3 font-bold text-gray-950">{item.title}</h3><p className="mt-2 text-sm leading-6 text-gray-600">{item.body}</p></article>)}
          </div>
        </section>

        <section className="grid gap-7 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <p className="text-sm font-bold text-brand-700">{isSwahili ? "Tulivyojenga" : "How we build"}</p>
            <h2 className="mt-2 text-2xl font-black tracking-normal text-gray-950 sm:text-3xl">{isSwahili ? "Anza na duka moja, ujifunze kwa kazi halisi." : "Start with one shop, learn from real work."}</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-gray-600">
              {isSwahili
                ? "DukaPilot iko tayari kwa duka moja. Multi-branch bado ni roadmap ya Pro, kwa sababu inahitaji stock transfer, ruhusa za branch na ripoti za branch ambazo zinapaswa kujengwa kwa ushahidi wa maduka yanayotumia mfumo kila siku."
                : "DukaPilot is ready for one shop today. Multi-branch remains a Pro roadmap because stock transfers, branch permissions, and branch reporting should be built from evidence gathered with shops using the product every day."}
            </p>
          </div>
          <div className="border-l-4 border-brand-600 pl-5"><p className="text-lg font-bold text-gray-950">{isSwahili ? "Lengo la setup ya kwanza" : "The first setup goal"}</p><p className="mt-2 text-base leading-7 text-gray-600">{isSwahili ? "Bidhaa 10, mauzo 10 halisi, halafu kurudi siku ya pili. Hapo mfumo unaanza kuwa sehemu ya biashara, si app nyingine tu kwenye simu." : "10 products, 10 real sales, then return on a second day. That is when the system starts becoming part of the business, not just another app on a phone."}</p></div>
        </section>

        <section className="bg-brand-700 px-6 py-8 text-white sm:px-8 sm:py-10">
          <p className="text-sm font-bold text-brand-100">DukaPilot</p>
          <h2 className="mt-2 max-w-2xl text-2xl font-black tracking-normal sm:text-3xl">{isSwahili ? "Tuone kama inafaa duka lako." : "Let us see whether it fits your shop."}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-brand-100 sm:text-base">{isSwahili ? "Tuambie aina ya duka, idadi ya bidhaa na jinsi unavyouza. Tutakusaidia kuanza na setup inayofaa, au kukuonyesha onyesho kwanza." : "Tell us your shop type, product count, and how you sell. We will help you start with the right setup, or show you a demo first."}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row"><WhatsAppCTA intent="about" label={isSwahili ? "Tuma WhatsApp" : "Send WhatsApp"} variant="light" /><Link href="/demo" className="inline-flex min-h-11 items-center justify-center gap-2 border border-white/35 px-5 py-3 text-sm font-bold hover:bg-white/10">{isSwahili ? "Ona onyesho" : "See the demo"}<ArrowRight className="h-4 w-4" /></Link></div>
        </section>
      </div>
    </PublicPageShell>
  );
}
