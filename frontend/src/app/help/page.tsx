"use client";

import Link from "next/link";
import { BookOpen, CheckCircle2, FileText, MessageCircle, Search, Sparkles } from "lucide-react";
import PublicPageShell from "@/components/marketing/PublicPageShell";
import ProductProofSection from "@/components/marketing/ProductProofSection";
import WhatsAppCTA from "@/components/marketing/WhatsAppCTA";
import { TextReveal } from "@/components/ui/cascade-text";
import { TheInfiniteGrid } from "@/components/ui/the-infinite-grid";
import { useLang } from "@/lib/i18n";

export default function HelpPage() {
  const lang = useLang();
  const faqs = [
    [lang === "sw" ? "Ninaanzaje?" : "How do I start?", lang === "sw" ? "Jisajili, kamilisha duka, ongeza bidhaa chache, kisha rekodi mauzo ya kwanza." : "Register, complete shop setup, add a few products, then record your first sale."],
    [lang === "sw" ? "Ninatumaje orodha ya bidhaa?" : "How do I share the catalog?", lang === "sw" ? "Fungua Orodha ya bidhaa, chagua duka lako, kisha tuma kiungo kwa WhatsApp au mitandao mingine." : "Open Catalog, choose your shop, then send the link on WhatsApp or other channels."],
    [lang === "sw" ? "Wafanyakazi wanaingiaje?" : "How do staff sign in?", lang === "sw" ? "Mmiliki anaongeza mfanyakazi, simu na PIN kwenye ukurasa wa Wafanyakazi. Mfanyakazi hutumia simu na PIN kuingia." : "The owner adds staff, phone, and PIN on the Staff page. Staff use that phone and PIN to sign in."],
    [lang === "sw" ? "Mfumo hufanya kazi bila intaneti?" : "Does offline work?", lang === "sw" ? "Ukurasa wa Mauzo unaweza kuhifadhi mauzo kwenye simu bila intaneti na kuyasawazisha intaneti ikirudi. Kagua historia ya usawazishaji kwa hitilafu za kiasi cha bidhaa." : "The Sales page can save sales locally while offline and sync them when internet returns. Check sync history for stock conflict errors."],
    [lang === "sw" ? "Ninalipaje mpango wangu?" : "How do I pay for subscription?", lang === "sw" ? "Njia ya kwanza: M-Pesa Lipa Namba 52806296 jina Necuva Group Limited. Njia ya pili: Mix by Yas Lipa Namba 18214626 jina Necuva. Njia ya tatu: tuma pesa 0743910580. Baada ya kulipa, weka namba ya kumbukumbu kwenye Malipo au tuma WhatsApp 0743910580." : "First option: M-Pesa Lipa Number 52806296, name Necuva Group Limited. Second option: Mix by Yas Lipa Number 18214626, name Necuva. Third option: send money to 0743910580. After paying, submit the reference in Billing or WhatsApp 0743910580."],
    [lang === "sw" ? "Nitajuaje malipo yamekubaliwa?" : "How do I know payment was confirmed?", lang === "sw" ? "Ukurasa wa Malipo unaonyesha maombi yako na hali yake. Msimamizi akithibitisha, mpango utaonekana umeanza." : "Billing shows your payment requests and status. Once admin confirms, your plan shows active."],
    [lang === "sw" ? "Msaidizi wa AI ananisaidiaje?" : "How does the AI Assistant help?", lang === "sw" ? "Anapanga hatua za leo kama kuagiza bidhaa, kufuatilia madeni, kupunguza gharama na kushughulikia maagizo." : "It ranks today's actions like restocking, following up debts, reducing costs, and handling orders."],
    [lang === "sw" ? "Ninatengenezaje nukuu ya bei?" : "How do I create a quotation?", lang === "sw" ? "Fungua Nukuu za Bei, chagua Nukuu mpya, weka mteja na kazi, kisha ongeza bidhaa za stock au mistari ya huduma, kazi, usafiri na gharama nyingine. Hifadhi rasimu, kagua PDF, halafu tuma link salama kwa mteja." : "Open Quotations, choose New quotation, add the customer and project, then add stock products or custom service, labour, transport, and other lines. Save a draft, review the PDF, then share the secure link."],
    [lang === "sw" ? "Nukuu ikikubaliwa, mauzo yanaanza moja kwa moja?" : "Does an accepted quotation automatically become a sale?", lang === "sw" ? "Hapana. Nukuu ni makadirio tu. Baada ya mteja kukubali, mmiliki huchagua Badilisha kuwa mauzo. Hapo ndipo bidhaa zilizolinkiwa hupunguzwa stock na salio linaweza kurekodiwa kama deni." : "No. A quotation is only an estimate. Once accepted, the owner chooses Convert to sale. Only then do linked products reduce stock and any balance become a receivable."],
    [lang === "sw" ? "Gharama na faida ya makadirio vinaonekana kwa mteja?" : "Can a customer see estimated costs or profit?", lang === "sw" ? "Hapana. Gharama za kununua, supplier, markup, faida ya makadirio na dokezo la ndani hubaki kwa biashara. Link, PDF na print ya mteja hutumia taarifa za mteja tu." : "No. Buying costs, suppliers, markup, estimated profit, and private notes remain inside the business. Customer links, PDFs, and print views use customer-safe information only."],
    [lang === "sw" ? "Nafutaje akaunti yangu?" : "How do I delete my account?", lang === "sw" ? "Fungua ukurasa wa Delete Account kuona hatua, aina ya data inayofutwa, na muda wa retention." : "Open the Delete Account page to see the steps, deleted data types, and retention period."],
  ];
  const walkthrough = [
    [lang === "sw" ? "Kuweka mfumo" : "Setup", lang === "sw" ? "Weka jina la duka, lugha, na mawasiliano." : "Set shop name, language, and contact details."],
    [lang === "sw" ? "Bidhaa" : "Products", lang === "sw" ? "Ongeza kiasi, bei ya kununua, bei ya kuuza na msambazaji." : "Add stock, buying price, selling price, and supplier."],
    [lang === "sw" ? "Mauzo" : "Sales", lang === "sw" ? "Rekodi mauzo ya taslimu, M-Pesa, benki au deni kwa simu." : "Record cash, M-Pesa, bank, or credit sales from the phone."],
    [lang === "sw" ? "Hatua za AI" : "AI actions", lang === "sw" ? "Fungua Msaidizi wa AI kuona cha kufanya leo." : "Open Assistant to see what to do today."],
    [lang === "sw" ? "Nukuu za Bei" : "Quotations", lang === "sw" ? "Tengeneza bei za huduma, kazi na bidhaa kabla ya mauzo kuthibitishwa." : "Price services, projects, and products before a sale is confirmed."],
  ];
  const quotationSettings = [
    [lang === "sw" ? "Prefix na muundo wa namba" : "Prefix and number format", lang === "sw" ? "Hizi huunda namba ya nukuu, mfano QT-0001. Unaweza kutumia {prefix}, {number} na {year}; kila namba lazima ibaki ya kipekee ndani ya duka lako." : "These create the quote number, for example QT-0001. Use {prefix}, {number}, and {year}; each number stays unique within your shop."],
    [lang === "sw" ? "Uhalali, sarafu na VAT" : "Validity, currency, and VAT", lang === "sw" ? "Weka siku ambazo nukuu hudumu, sarafu ya kawaida (TZS), na kodi ya kawaida. Unaweza kubadilisha kodi au tarehe kwenye nukuu moja bila kubadilisha default ya duka." : "Set the normal validity period, default currency (TZS), and tax. You can still change tax or dates on an individual quote without changing the shop default."],
    [lang === "sw" ? "Masharti, dokezo na sahihi" : "Terms, note, and signature", lang === "sw" ? "Masharti ya malipo, masharti na vigezo, dokezo kwa mteja, na jina la sahihi hujazwa kiotomatiki kwenye nukuu mpya. Badilisha kwenye nukuu husika pale kazi inahitaji tofauti." : "Payment terms, terms and conditions, a customer note, and signature name are prefilled on new quotations. Change them on a specific quote when the work needs different wording."],
    [lang === "sw" ? "Kiasi, bei, punguzo na sehemu" : "Quantities, prices, discounts, and sections", lang === "sw" ? "Amua kama mteja aone kiasi, bei kwa kipimo, punguzo la mstari, na vichwa kama Vifaa au Kazi. Hii hubadilisha PDF, print na link ya mteja tu; haionyeshi gharama za ndani." : "Choose whether customers see quantities, unit prices, line discounts, and headings such as Materials or Labour. This changes only the customer PDF, print, and link; it never exposes internal cost."],
    [lang === "sw" ? "Amana ya kawaida" : "Default deposit", lang === "sw" ? "Weka asilimia ya amana, kwa mfano 50%. Mfumo hukokotoa kiasi kinachotakiwa; malipo halisi huandikwa baadaye kama amana, hatua ya kazi, au malipo ya mwisho." : "Set a deposit percentage, for example 50%. DukaPilot calculates the required amount; actual money is recorded later as a deposit, milestone, or final payment."],
  ];
  const aiThinking = [
    [
      lang === "sw" ? "1. Inasoma data" : "1. Reads shop data",
      lang === "sw" ? "Mauzo, bidhaa, madeni, matumizi, maagizo na shughuli za wafanyakazi." : "Sales, stock, debts, expenses, orders, and staff activity.",
    ],
    [
      lang === "sw" ? "2. Inatafuta hatari" : "2. Finds risk",
      lang === "sw" ? "Bidhaa kuisha, deni kukaa muda mrefu, matumizi kupanda, au siku bila mauzo." : "Low stock, old debts, rising expenses, or quiet sales days.",
    ],
    [
      lang === "sw" ? "3. Inapanga kipaumbele" : "3. Ranks priority",
      lang === "sw" ? "Kinachoweza kuathiri fedha, faida au uaminifu wa mteja huja kwanza." : "Anything affecting cash, profit, or customer trust comes first.",
    ],
    [
      lang === "sw" ? "4. Inapendekeza hatua" : "4. Suggests action",
      lang === "sw" ? "Fuatilia deni, agiza bidhaa, punguza gharama au shughulikia agizo." : "Collect debt, restock, reduce costs, or handle pending orders.",
    ],
  ];

  return (
    <PublicPageShell>
      <div className="space-y-8">
        <TheInfiniteGrid
          lang={lang}
          headline={lang === "sw" ? "Pata msaada wa kuendesha duka vizuri" : "Get help running your shop better"}
          body={lang === "sw"
            ? "Majibu ya haraka kwa kuweka mfumo, orodha ya bidhaa, wafanyakazi, mauzo bila intaneti, malipo na msaidizi wa AI. Ukikwama, msaada wa WhatsApp upo karibu."
            : "Quick answers for setup, catalog links, staff, offline sales, payments, and the AI assistant. If you get stuck, WhatsApp support is close."}
          primaryCta={{ href: "/contact", label: lang === "sw" ? "Ongea na support" : "Talk to support" }}
          secondaryCta={{
            href: "https://wa.me/255743910580?text=Nahitaji%20msaada%20wa%20DukaPilot",
            label: "WhatsApp support",
          }}
          features={walkthrough.map(([title, body]) => ({ title, description: body }))}
        />
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_320px] lg:items-center">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                <BookOpen className="h-6 w-6" />
              </div>
              <h1 className="mt-5 max-w-2xl text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
                <TextReveal text={lang === "sw" ? "Msaada" : "Help"} hoverColor="#15803d" />
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-600 sm:text-base">
                {lang === "sw" ? "Majibu ya haraka kwa kuweka mfumo, orodha ya bidhaa, wafanyakazi, mauzo bila intaneti, malipo na msaidizi wa AI." : "Quick answers for setup, catalog links, staff, offline sales, payments, and the AI assistant."}
              </p>
            </div>
            <div className="rounded-2xl border border-brand-100 bg-brand-50 p-5">
              <Sparkles className="h-5 w-5 text-brand-700" />
              <p className="mt-3 font-semibold text-brand-950">{lang === "sw" ? "Unakwama?" : "Stuck?"}</p>
              <p className="mt-2 text-sm leading-6 text-brand-900">
                {lang === "sw" ? "Tuma screenshot au swali kwa WhatsApp, tutakuongoza hatua kwa hatua." : "Send a screenshot or question on WhatsApp and we will guide you step by step."}
              </p>
              <WhatsAppCTA intent="help" label="WhatsApp support" className="mt-4 w-full" />
            </div>
          </div>
        </section>

        <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <Search className="h-5 w-5 flex-shrink-0 text-gray-400" />
          <p className="text-sm text-gray-600">
            {lang === "sw" ? "Maswali muhimu zaidi ya DukaPilot yapo hapa chini." : "The most important DukaPilot questions are answered below."}
          </p>
        </div>

        <ProductProofSection compact />

        <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-gray-950">{lang === "sw" ? "Product walkthrough ya haraka" : "Quick product walkthrough"}</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {walkthrough.map(([title, body], index) => (
              <div key={title} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white">{index + 1}</span>
                <h3 className="mt-3 text-sm font-semibold text-gray-950">{title}</h3>
                <p className="mt-2 text-xs leading-5 text-gray-600">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-brand-100 bg-white shadow-sm">
          <div className="border-b border-brand-100 bg-brand-50 px-5 py-5 sm:px-6">
            <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-brand-700 shadow-sm"><FileText className="h-5 w-5" /></span><div><h2 className="text-lg font-bold text-gray-950">{lang === "sw" ? "Jinsi ya kutumia Nukuu za Bei" : "How to use Quotations"}</h2><p className="mt-1 text-sm leading-6 text-gray-600">{lang === "sw" ? "Kwa kazi za huduma, miradi, vifaa, labour, transport na amana bila kuharibu stock au ripoti za mauzo." : "For custom work, projects, materials, labour, transport, and deposits without changing stock or sales reports too early."}</p></div></div>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-6">
            {quotationSettings.map(([title, body]) => <div key={title} className="border-l-2 border-brand-300 pl-4"><h3 className="text-sm font-semibold text-gray-950">{title}</h3><p className="mt-1 text-sm leading-6 text-gray-600">{body}</p></div>)}
          </div>
          <div className="border-t border-gray-100 px-5 py-4 sm:px-6"><Link href="/quotations" className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-brand-700 hover:text-brand-800"><FileText className="h-4 w-4" />{lang === "sw" ? "Fungua Nukuu za Bei" : "Open Quotations"}</Link></div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-brand-100 bg-white shadow-sm">
          <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="bg-brand-900 p-6 text-white sm:p-8">
              <Sparkles className="h-6 w-6 text-brand-100" />
              <h2 className="mt-4 text-2xl font-black tracking-tight">
                <TextReveal
                  text={lang === "sw" ? "Jinsi DukaPilot AI inavyofikiri" : "How DukaPilot AI thinks"}
                  fontSize="inherit"
                  hoverColor="#bbf7d0"
                />
              </h2>
              <p className="mt-4 text-sm leading-6 text-brand-100">
                {lang === "sw"
                  ? "Lengo si kukuonyesha ripoti tu. Lengo ni kukuambia hatua inayofuata ili duka lisikwame."
                  : "The goal is not just to show reports. The goal is to tell you the next action before the shop gets stuck."}
              </p>
              <Link href="/assistant" className="mt-6 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-bold text-brand-800 hover:bg-brand-50">
                {lang === "sw" ? "Fungua Msaidizi wa AI" : "Open AI Assistant"}
              </Link>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
              {aiThinking.map(([title, body]) => (
                <div key={title} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <h3 className="text-sm font-bold text-gray-950">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          {faqs.map(([q, a]) => (
            <section key={q} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-700" />
                <h2 className="font-semibold leading-6 text-gray-950">{q}</h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-gray-600">{a}</p>
            </section>
          ))}
        </div>
        <div className="flex flex-col gap-3 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-sm leading-6 text-gray-600">
            {lang === "sw" ? "Bado unahitaji msaada? Tupo tayari kukusaidia kuifanya DukaPilot iwe tayari kwa duka lako." : "Still need help? We are ready to help make DukaPilot work for your shop."}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/contact" className="inline-flex items-center justify-center rounded-xl bg-brand-700 px-5 py-3 text-sm font-bold text-white hover:bg-brand-800">
            {lang === "sw" ? "Ongea na support" : "Talk to support"}
          </Link>
          <WhatsAppCTA intent="help" label="WhatsApp +255 743 910 580" />
          </div>
        </div>
      </div>
    </PublicPageShell>
  );
}
