"use client";

import { CheckCircle2, MessageCircle } from "lucide-react";
import { useLang } from "@/lib/i18n";
import WhatsAppCTA from "@/components/marketing/WhatsAppCTA";

const faqs = [
  {
    sw: "Je, DukaPilot inafanya kazi kwenye simu?",
    en: "Does DukaPilot work on a phone?",
    swAnswer: "Ndiyo. Inafunguka kwenye kivinjari cha simu na inaweza kuwekwa kwenye skrini ya mwanzo kama programu.",
    enAnswer: "Yes. It runs in your phone browser and can be installed on the home screen like an app.",
  },
  {
    sw: "Nini hutokea intaneti ikikatika wakati wa mauzo?",
    en: "What happens if the internet drops during a sale?",
    swAnswer: "Mauzo yanaweza kuhifadhiwa kwenye simu na kusawazishwa intaneti ikirudi. Kagua hali ya usawazishaji kabla ya kufunga zamu.",
    enAnswer: "Sales can be queued on the device and synced when the connection returns. Check sync status before closing a shift.",
  },
  {
    sw: "Wafanyakazi wanaona taarifa gani?",
    en: "What can staff members access?",
    swAnswer: "Mmiliki huchagua ruhusa za kuuza, kusimamia bidhaa, wafanyakazi, matumizi na ripoti. Ruhusa ya ripoti inaweza kuficha taarifa za faida.",
    enAnswer: "The owner chooses permissions for sales, stock, staff, expenses, and reports. Report access can keep profit information private.",
  },
  {
    sw: "Naweza kutuma risiti kwa WhatsApp?",
    en: "Can I send receipts on WhatsApp?",
    swAnswer: "Ndiyo. Baada ya kukamilisha mauzo, DukaPilot huonyesha namba ya risiti na kitufe cha kuituma kwa WhatsApp.",
    enAnswer: "Yes. After completing a sale, DukaPilot shows the receipt number and a WhatsApp sharing button.",
  },
  {
    sw: "Jaribio la siku 14 linahitaji kadi?",
    en: "Does the 14-day trial require a card?",
    swAnswer: "Hapana. Anza bila kadi, ongeza bidhaa zako na ujaribu mauzo halisi kabla ya kuchagua mpango.",
    enAnswer: "No. Start without a card, add your products, and test real sales before choosing a plan.",
  },
  {
    sw: "Taarifa za duka langu zinalindwa vipi?",
    en: "How is my shop data protected?",
    swAnswer: "Taarifa hupatikana baada ya kuingia kwenye akaunti. Mmiliki ndiye anayechagua ruhusa za kila mfanyakazi, na mawasiliano na DukaPilot hutumia HTTPS.",
    enAnswer: "Shop data requires an authenticated account. The owner controls each staff member's permissions, and communication with DukaPilot uses HTTPS.",
  },
  {
    sw: "Nini hutokea nikiacha kulipia?",
    en: "What happens if I stop paying?",
    swAnswer: "Taarifa zako hazifutwi mpango unapoisha. Unaweza kuona rekodi zilizopo, lakini kuongeza au kubadilisha rekodi kunahitaji kuhuisha mpango.",
    enAnswer: "Your data is not deleted when the plan expires. You can still view existing records, but creating or changing records requires reactivation.",
  },
  {
    sw: "DukaPilot inafaa kwa ufugaji?",
    en: "Can DukaPilot work for a farm?",
    swAnswer: "Ndiyo. Chagua Ufugaji wa Mifugo na Kuku wakati wa usajili au Settings. Mbali na mauzo, stock, pesa na wateja, utaona makundi ya mifugo, matumizi ya feed, uzalishaji na packing. Hii ni mfumo wa biashara na uzalishaji, si ushauri wa afya ya mifugo.",
    enAnswer: "Yes. Choose Livestock & Poultry Farm during registration or in Settings. Alongside sales, stock, cash, and customers, it adds animal groups, feed use, production, and packing. It is a commercial and production tool, not animal-health advice.",
  },
];

export default function PublicFAQSection() {
  const lang = useLang();
  const proofPoints = lang === "sw"
    ? ["Jaribio la siku 14 bila kadi", "Kiswahili na Kiingereza", "Msaada wa mtu kupitia WhatsApp"]
    : ["14-day trial without a card", "Swahili and English", "Human support through WhatsApp"];

  return (
    <section className="bg-white py-12 sm:py-16">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="text-sm font-bold text-brand-700">{lang === "sw" ? "Uhakika kabla ya kuanza" : "Confidence before you start"}</p>
          <h2 className="mt-2 text-2xl font-bold text-gray-950 sm:text-3xl">{lang === "sw" ? "Maswali ya wamiliki wa maduka" : "Questions shop owners ask"}</h2>
          <div className="mt-5 space-y-3 text-sm text-gray-700">
            {proofPoints.map((item) => <p key={item} className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 flex-shrink-0 text-brand-700" />{item}</p>)}
          </div>
          <div className="mt-6"><WhatsAppCTA intent="help" label={lang === "sw" ? "Uliza kupitia WhatsApp" : "Ask on WhatsApp"} /><p className="mt-2 flex items-center gap-2 text-xs text-gray-500"><MessageCircle className="h-4 w-4" />+255 743 910 580</p></div>
        </div>
        <div className="divide-y divide-gray-200 border-y border-gray-200">
          {faqs.map((item) => <details key={item.en} className="py-4"><summary className="cursor-pointer list-none pr-8 text-sm font-bold text-gray-950 marker:hidden">{lang === "sw" ? item.sw : item.en}</summary><p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">{lang === "sw" ? item.swAnswer : item.enAnswer}</p></details>)}
        </div>
      </div>
    </section>
  );
}
