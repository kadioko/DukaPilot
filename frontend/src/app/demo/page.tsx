"use client";

import Link from "next/link";
import { ArrowRight, Bird, Pill, PiggyBank, Sprout, Store, Truck, UtensilsCrossed, UsersRound, Wine } from "lucide-react";
import PublicPageShell from "@/components/marketing/PublicPageShell";
import ProductProofSection from "@/components/marketing/ProductProofSection";
import WhatsAppCTA from "@/components/marketing/WhatsAppCTA";
import { TextReveal } from "@/components/ui/cascade-text";
import { TheInfiniteGrid } from "@/components/ui/the-infinite-grid";
import { useLang } from "@/lib/i18n";

const accounts = [
  { icon: Store, role: { en: "Shop owner", sw: "Mmiliki wa biashara" }, phone: "+255700000002", name: "Duka la Amina", focus: { en: "Sales, stock, debts, supplier orders, AI", sw: "Mauzo, stock, madeni, maagizo, AI" } },
  { icon: UsersRound, role: { en: "Cashier and stock", sw: "Muuzaji na stock" }, phone: "+255700000008", name: "Rehema - Sales & Stock", focus: { en: "Sell and manage stock without profit reports", sw: "Uza na simamia stock bila ripoti za faida" } },
  { icon: Pill, role: { en: "Pharmacy owner", sw: "Mmiliki wa famasi" }, phone: "+255700000003", name: "Salum Pharmacy", focus: { en: "Expiry-aware inventory and supplier orders", sw: "Stock ya expiry na maagizo kwa wasambazaji" } },
  { icon: Wine, role: { en: "Bar owner", sw: "Mmiliki wa bar" }, phone: "+255700000004", name: "Hassan Bar & Kitchen", focus: { en: "Drinks, prepared food, recipes, portions", sw: "Vinywaji, chakula, recipe na portions" } },
  { icon: UtensilsCrossed, role: { en: "Restaurant owner", sw: "Mmiliki wa restaurant" }, phone: "+255700000009", name: "Mama Ntilie Restaurant", focus: { en: "Kitchen batches, plates, daily sales", sw: "Batch za jikoni, plates na mauzo ya kila siku" } },
  { icon: Sprout, role: { en: "Crops-only farm", sw: "Shamba la mazao" }, phone: "+255700000012", name: "Kijani Mazao Farm", focus: { en: "Plots, crop cycles, inputs, harvests, field plan", sw: "Mashamba, mzunguko wa mazao, pembejeo, mavuno" } },
  { icon: Bird, role: { en: "Poultry farm", sw: "Shamba la kuku" }, phone: "+255700000013", name: "Upendo Poultry & Pigs Farm", focus: { en: "Layers, pigs, feed, eggs, packing", sw: "Kuku, nguruwe, chakula, mayai na packing" } },
  { icon: PiggyBank, role: { en: "Beauty shop owner", sw: "Mmiliki wa beauty shop" }, phone: "+255700000005", name: "Fatuma Beauty Shop", focus: { en: "Retail stock and online sales", sw: "Stock ya reja reja na mauzo ya mtandaoni" } },
  { icon: Truck, role: { en: "Supplier", sw: "Msambazaji" }, phone: "+255700000001", name: "Jumla Traders Ltd", focus: { en: "Incoming shop orders and wholesale catalog", sw: "Maagizo ya maduka na catalog ya jumla" } },
  { icon: Truck, role: { en: "Beverage supplier", sw: "Msambazaji wa vinywaji" }, phone: "+255700000006", name: "Rafiki Beverages Ltd", focus: { en: "Drinks catalog for bar and shop ordering", sw: "Catalog ya vinywaji kwa bar na maduka" } },
  { icon: Truck, role: { en: "Beauty supplier", sw: "Msambazaji wa beauty" }, phone: "+255700000007", name: "Beauty Supplies TZ", focus: { en: "Cosmetics catalog and incoming orders", sw: "Catalog ya vipodozi na maagizo yanayoingia" } },
];

export default function DemoPage() {
  const lang = useLang();

  return (
    <PublicPageShell>
      <div className="space-y-8">
        <section className="border-b border-gray-200 pb-8">
          <p className="text-sm font-semibold text-brand-700">DukaPilot Demo</p>
          <h1 className="mt-2 text-3xl font-bold text-gray-950 sm:text-4xl">
            <TextReveal text={lang === "sw" ? "Ingia kwenye onyesho sasa" : "Enter the demo now"} hoverColor="#15803d" />
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600">
            {lang === "sw" ? "Chagua biashara inayofanana na yako. PIN ya kila akaunti ya demo ni 1234." : "Choose the business closest to yours. Every public demo account uses PIN 1234."}
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map(({ icon: Icon, role, phone, name, focus }) => (
              <section key={phone} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Icon className="h-4.5 w-4.5" /></span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase text-gray-400">{role[lang]}</p>
                    <h2 className="mt-1 font-semibold text-gray-950">{name}</h2>
                  </div>
                </div>
                <p className="mt-3 min-h-10 text-sm leading-5 text-gray-600">{focus[lang]}</p>
                <p className="mt-3 font-mono text-xs text-gray-500">{phone} / 1234</p>
              </section>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-gray-500">{lang === "sw" ? "Hizi ni akaunti za majaribio tu. Usiongeze taarifa binafsi za wateja au malipo halisi." : "These are test accounts only. Do not add real customer details or real payments."}</p>
          <Link href="/#sign-in" className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-700">
            {lang === "sw" ? "Fungua login ya demo" : "Open demo login"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
        <TheInfiniteGrid
          lang={lang}
          headingLevel="h2"
          headline={lang === "sw" ? "Jaribu onyesho kabla ya kuanza" : "Try the demo before you start"}
          body={lang === "sw"
            ? "Tumia akaunti za demo kuona mauzo, stock, maagizo, madeni, matumizi, nukuu za bei, staff, bar/restaurant, mashamba na AI Assistant. PIN zote ni 1234."
            : "Use demo accounts to see sales, stock, orders, debts, expenses, quotations, staff, bar/restaurant operations, farms, and the AI Assistant. All PINs are 1234."}
          primaryCta={{ href: "/#sign-in", label: lang === "sw" ? "Fungua login" : "Open login" }}
          secondaryCta={{
            href: "https://wa.me/255743910580?text=Nataka%20kusaidiwa%20kuweka%20mfumo%20baada%20ya%20onyesho%20la%20DukaPilot",
            label: lang === "sw" ? "Nataka kuweka mfumo" : "I want setup",
          }}
          features={[
            { title: lang === "sw" ? "Mmiliki" : "Business owner", description: lang === "sw" ? "Angalia duka kamili, dashibodi, bidhaa na mauzo." : "Explore a complete shop, dashboard, products, and sales." },
            { title: lang === "sw" ? "Muuzaji na stock" : "Cashier and stock", description: lang === "sw" ? "Jaribu kuuza na kusimamia stock bila kuona faida au ripoti." : "Try sales and stock work without profit or report access." },
            { title: lang === "sw" ? "Msambazaji" : "Supplier", description: lang === "sw" ? "Ona upande wa msambazaji na bidhaa za jumla." : "See the supplier side and wholesale products." },
            { title: lang === "sw" ? "Msaidizi wa AI" : "AI Assistant", description: lang === "sw" ? "Fungua mapendekezo ya hatua za leo." : "Open the recommended actions for today." },
            { title: lang === "sw" ? "Bar na restaurant" : "Bar and restaurant", description: lang === "sw" ? "Geuza ingredients kuwa portions zenye gharama sahihi." : "Turn ingredients into portions with an accurate cost." },
            { title: lang === "sw" ? "Mashamba" : "Farms", description: lang === "sw" ? "Fuatilia mazao, mavuno, kuku, nguruwe, feed na mayai." : "Track crops, harvests, chickens, pigs, feed, and eggs." },
            { title: lang === "sw" ? "Nukuu za Bei" : "Quotations", description: lang === "sw" ? "Ona rasimu, zilizotumwa, zilizokubaliwa na zilizokataliwa bila kubadilisha mauzo ya demo." : "See draft, sent, accepted, and rejected examples without changing demo sales." },
          ]}
        />
        <section className="rounded-xl border border-brand-200 bg-brand-50 p-5">
          <h2 className="font-semibold text-brand-950">{lang === "sw" ? "Hatua za onyesho za kujaribu" : "Demo flows to try"}</h2>
          <div className="mt-3 grid gap-2 text-sm text-brand-900 sm:grid-cols-2">
            <p>{lang === "sw" ? "1. Rekodi mauzo, kisha angalia dashibodi." : "1. Record a sale, then check the dashboard."}</p>
            <p>{lang === "sw" ? "2. Fungua Msaidizi wa AI uone hatua za leo." : "2. Open AI Assistant to see today's actions."}</p>
            <p>{lang === "sw" ? "3. Jaribu akaunti ya muuzaji kuona mipaka ya ruhusa." : "3. Try cashier to see role limits."}</p>
            <p>{lang === "sw" ? "4. Angalia Malipo na namba ya kumbukumbu." : "4. Check Billing and payment reference."}</p>
            <p>{lang === "sw" ? "5. Fungua Nukuu za Bei kuona kazi za huduma na mzunguko wa amana." : "5. Open Quotations to see service work and the deposit flow."}</p>
            <p>{lang === "sw" ? "6. Kwa chakula, fungua Andaa Chakula; kwa mashamba, fungua Mazao au Shamba." : "6. For food, open Prepare Food; for farms, open Crops or Farm."}</p>
          </div>
        </section>
        <ProductProofSection />
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/#sign-in" className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-700">
            {lang === "sw" ? "Fungua login" : "Open login"}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <WhatsAppCTA intent="demo" label={lang === "sw" ? "Nataka kuweka mfumo baada ya onyesho" : "I want setup after demo"} />
        </div>
      </div>
    </PublicPageShell>
  );
}
