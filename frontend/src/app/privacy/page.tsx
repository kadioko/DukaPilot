"use client";

import Link from "next/link";
import PublicPageShell from "@/components/marketing/PublicPageShell";
import { useLang } from "@/lib/i18n";

export default function PrivacyPage() {
  const lang = useLang();

  const sections = lang === "sw"
    ? [
        ["DukaPilot ni nani", "DukaPilot ni bidhaa inayoendeshwa na Necuva Group Limited kwa wamiliki wa maduka, wasimamizi, staff na suppliers nchini Tanzania."],
        ["Taarifa tunazokusanya", "Tunapokea jina na nambari ya simu ya akaunti yako; jina, eneo na aina ya duka; bidhaa na stock; mauzo, madeni, matumizi, maagizo, malipo na receipt; na majina, namba za simu na ruhusa za staff. Madeni, wateja na maagizo yanaweza kuwa na jina au namba ya simu unayoingiza. Pia tunahifadhi ujumbe wa support unaotutumia, logi za usalama na audit, na taarifa ndogo za kifaa zinazohitajika kwa notifications."],
        ["Tunavyotumia taarifa", "Tunatumia taarifa hizi kuendesha akaunti na catalog yako, kurekodi shughuli za biashara, kuonyesha ripoti na mapendekezo ya AI, kutekeleza ruhusa za staff, kutoa support, kuzuia matumizi mabaya, na kutimiza wajibu wa kisheria."],
        ["Vipimo vya tovuti", "Tovuti yetu hukusanya matukio manne ya kipimo yasiyo na jina: store_click, signup_started, trial_started na whatsapp_started. Kila tukio lina kitambulisho cha muda wa browser pamoja na product, source na campaign. Hatutumii jina, simu, barua pepe, majina ya wateja, au maelezo ya mauzo kwa vipimo hivi."],
        ["Huduma za wahusika wengine", "Tunatumia watoa miundombinu kuhifadhi na kuendesha huduma. SMS ya uthibitisho inaweza kutumwa kupitia NextSMS. Ukichagua kuwasiliana au kutuma taarifa kwa WhatsApp, WhatsApp hupokea namba na ujumbe unaotumwa; notification ya oda inaweza pia kutumwa kupitia WhatsApp pale duka limeiwezesha. Tunatumia Sentry kwa taarifa za hitilafu pale imewezeshwa. Hatuuzi taarifa zako wala hatutumii matangazo ya wahusika wengine."],
        ["Ulinzi wa taarifa", "Tovuti na API za uzalishaji hutumia HTTPS. Tunatumia session cookies salama, ruhusa kulingana na role, PIN zilizohifadhiwa kwa hash, na audit logs. Hatuahidi kiwango cha usimbaji wa hifadhidata ambacho hakijaelezwa na mtoa miundombinu; tafadhali usitume taarifa nyeti isiyohitajika kupitia WhatsApp au support."],
        ["Kuhifadhi na kufuta", "Tunahifadhi data ya akaunti na biashara wakati akaunti iko hai. Baada ya ombi lililothibitishwa, tunafuta data ya akaunti na duka ndani ya siku 30. Rekodi ndogo za usalama, audit, malipo, kodi au uthibitisho wa ombi zinaweza kubaki hadi siku 90, au zaidi inapohitajika kisheria. Backups zinaweza kuchukua hadi siku 90 kusafishwa."],
        ["Haki zako na mawasiliano", "Unaweza kuomba kurekebisha, kuuza nje, kufuta akaunti yote, au kufuta sehemu ya data yako. Tumia ukurasa wetu wa ufutaji au wasiliana na support@dukapilot.com / WhatsApp +255 743 910 580."],
      ]
    : [
        ["Who operates DukaPilot", "DukaPilot is a product operated by Necuva Group Limited for shop owners, managers, staff, and suppliers in Tanzania."],
        ["Information we collect", "We receive your account name and phone number; shop name, location, and category; products and stock; sales, debts, expenses, orders, payments, and receipts; and staff names, phone numbers, and permissions. Debt, customer, and order records may include names or phone numbers that you enter. We also keep support messages you send, security and audit logs, and limited device information needed for notifications."],
        ["How we use information", "We use this information to operate your account and catalog, record business activity, show reports and AI recommendations, enforce staff permissions, provide support, prevent misuse, and meet legal obligations."],
        ["Website measurement", "Our website records four anonymous measurement events: store_click, signup_started, trial_started, and whatsapp_started. Each event contains a browser-session identifier plus product, source, and campaign. These events do not include names, phone numbers, email addresses, customer names, or sales details."],
        ["Third-party services", "We use infrastructure providers to host and store the service. Verification SMS may be sent through NextSMS. When you choose to contact or send information through WhatsApp, WhatsApp receives the phone number and message sent; order notifications can also be sent through WhatsApp when a shop enables them. We use Sentry for error diagnostics when configured. We do not sell your data or use third-party advertising SDKs."],
        ["Protecting information", "Production website and API traffic use HTTPS. We use secure session cookies, role-based permissions, hashed PINs, and audit logs. We do not make an unverified claim about database-at-rest encryption; please do not send unnecessary sensitive information through WhatsApp or support channels."],
        ["Retention and deletion", "We retain account and business data while the account is active. After a verified request, we delete account and shop data within 30 days. Limited security, audit, payment, tax, or request-confirmation records may be kept for up to 90 days, or longer where required by law. Backups can take up to 90 days to age out."],
        ["Your choices and contact", "You can ask to correct, export, delete your full account, or delete some of your data. Use our deletion page or contact support@dukapilot.com / WhatsApp +255 743 910 580."],
      ];

  return (
    <PublicPageShell>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-950">{lang === "sw" ? "Sera ya Faragha" : "Privacy Policy"}</h1>
          <p className="mt-3 text-sm text-gray-500">{lang === "sw" ? "Ilisasishwa Agosti 25, 2026" : "Updated August 25, 2026"}</p>
        </div>
        <div className="space-y-6">
          {sections.map(([title, body]) => (
            <section key={title}>
              <h2 className="text-lg font-semibold text-gray-950">{title}</h2>
              <p className="mt-2 leading-7 text-gray-600">{body}</p>
            </section>
          ))}
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-950">{lang === "sw" ? "Kufuta akaunti na data" : "Account and data deletion"}</h2>
            <p className="mt-2 leading-7 text-gray-600">
              {lang === "sw"
                ? "Unaweza kuomba kufuta akaunti yako ya DukaPilot au baadhi ya data yako kupitia ukurasa wetu wa ufutaji."
                : "You can request deletion of your DukaPilot account or some of your data through our deletion request page."}
            </p>
            <Link href="/delete-account" className="mt-4 inline-flex rounded-xl bg-brand-700 px-5 py-3 text-sm font-bold text-white hover:bg-brand-800">
              {lang === "sw" ? "Fungua ukurasa wa ufutaji" : "Open deletion request page"}
            </Link>
          </section>
        </div>
      </div>
    </PublicPageShell>
  );
}
