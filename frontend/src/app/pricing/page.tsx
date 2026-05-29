"use client";
import Link from "next/link";
import { Check, Star, Zap, Shield, Phone } from "lucide-react";

const plans = [
  {
    id: "FREE_TRIAL",
    name: "Jaribio Bure",
    nameEn: "Free Trial",
    price: 0,
    period: "siku 14",
    periodEn: "14 days",
    color: "border-gray-200",
    badge: null,
    features: [
      "Bidhaa zote (inventory)",
      "Mauzo ya POS & online",
      "Ripoti ya msingi",
      "Maagizo ya wasambazaji",
      "Lugha: Kiswahili & English",
    ],
    featuresEn: [
      "Full inventory management",
      "POS & online sales",
      "Basic reports",
      "Supplier orders",
      "Swahili & English",
    ],
    cta: "Anza Bure",
    ctaEn: "Start Free",
    ctaHref: "/register",
    highlight: false,
  },
  {
    id: "BASIC",
    name: "Msingi",
    nameEn: "Basic",
    price: 15000,
    period: "kwa mwezi",
    periodEn: "per month",
    color: "border-brand-300",
    badge: "Maarufu",
    features: [
      "Kila kitu katika Jaribio",
      "Bidhaa zisizo na kikomo",
      "Ripoti za kina",
      "Usafirishaji wa data (CSV/PDF)",
      "Msaada wa WhatsApp",
    ],
    featuresEn: [
      "Everything in Trial",
      "Unlimited products",
      "Detailed reports",
      "Data export (CSV/PDF)",
      "WhatsApp support",
    ],
    cta: "Chagua Msingi",
    ctaEn: "Choose Basic",
    ctaHref: "/register",
    highlight: true,
  },
  {
    id: "PRO",
    name: "Pro",
    nameEn: "Pro",
    price: 35000,
    period: "kwa mwezi",
    periodEn: "per month",
    color: "border-purple-300",
    badge: "Bora Zaidi",
    features: [
      "Kila kitu katika Msingi",
      "Matawi mengi (branches)",
      "SMS notifications",
      "Akaunti nyingi za wafanyakazi",
      "Msaada wa kipaumbele 24/7",
    ],
    featuresEn: [
      "Everything in Basic",
      "Multi-branch support",
      "SMS notifications",
      "Multiple staff accounts",
      "Priority 24/7 support",
    ],
    cta: "Chagua Pro",
    ctaEn: "Choose Pro",
    ctaHref: "/register",
    highlight: false,
  },
];

const competitors = [
  { name: "DukaOS", price: "TZS 15,000/mwezi", highlight: true },
  { name: "QuickBooks POS", price: "TZS 150,000+/mwezi", highlight: false },
  { name: "Tally", price: "TZS 80,000+/mwezi", highlight: false },
  { name: "iKhokha", price: "TZS 50,000+/mwezi", highlight: false },
];

export default function PricingPage() {
  const formatTZS = (amount: number) =>
    `TZS ${amount.toLocaleString("en-TZ")}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white">
      {/* Nav */}
      <nav className="px-4 py-4 flex items-center justify-between max-w-5xl mx-auto">
        <Link href="/" className="text-xl font-bold text-brand-700">
          DukaOS
        </Link>
        <div className="flex gap-3">
          <Link href="/" className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5">
            Nyumbani
          </Link>
          <Link
            href="/login"
            className="text-sm bg-brand-600 text-white px-4 py-1.5 rounded-lg hover:bg-brand-700"
          >
            Ingia
          </Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 pb-16">
        {/* Header */}
        <div className="text-center py-12">
          <div className="inline-flex items-center gap-2 bg-green-100 text-green-800 text-xs font-semibold px-3 py-1 rounded-full mb-4">
            <Zap className="w-3 h-3" />
            Jaribio la siku 14 BURE — hakuna kadi ya benki
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Bei Rahisi kwa Biashara ya Tanzania
          </h1>
          <p className="text-gray-500 text-sm">
            Affordable pricing for Tanzanian businesses — no hidden fees
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`bg-white rounded-2xl border-2 ${plan.color} p-6 relative ${
                plan.highlight ? "shadow-lg shadow-brand-100" : ""
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-brand-600 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                    <Star className="w-3 h-3" />
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="mb-4">
                <h2 className="text-lg font-bold text-gray-900">{plan.name}</h2>
                <p className="text-xs text-gray-500">{plan.nameEn}</p>
              </div>

              <div className="mb-6">
                {plan.price === 0 ? (
                  <div>
                    <span className="text-3xl font-bold text-gray-900">BURE</span>
                    <p className="text-xs text-gray-500 mt-1">kwa {plan.period} / {plan.periodEn}</p>
                  </div>
                ) : (
                  <div>
                    <span className="text-3xl font-bold text-gray-900">
                      {formatTZS(plan.price)}
                    </span>
                    <p className="text-xs text-gray-500 mt-1">{plan.period} / {plan.periodEn}</p>
                  </div>
                )}
              </div>

              <ul className="space-y-2.5 mb-6">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={plan.ctaHref}
                className={`block w-full text-center py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  plan.highlight
                    ? "bg-brand-600 text-white hover:bg-brand-700"
                    : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                }`}
              >
                {plan.cta} / {plan.ctaEn}
              </Link>
            </div>
          ))}
        </div>

        {/* Comparison */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-10">
          <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-brand-600" />
            DukaOS dhidi ya washindani / Compared to competitors
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 pr-4 text-gray-600 font-medium">Programu / App</th>
                  <th className="text-left py-2 text-gray-600 font-medium">Bei / Price</th>
                  <th className="text-left py-2 text-gray-600 font-medium">Swahili</th>
                  <th className="text-left py-2 text-gray-600 font-medium">Tanzania</th>
                </tr>
              </thead>
              <tbody>
                {competitors.map((c) => (
                  <tr key={c.name} className={`border-b border-gray-50 ${c.highlight ? "bg-brand-50" : ""}`}>
                    <td className="py-2 pr-4 font-medium text-gray-900">
                      {c.name}
                      {c.highlight && (
                        <span className="ml-2 text-xs bg-brand-600 text-white px-1.5 py-0.5 rounded">Sisi</span>
                      )}
                    </td>
                    <td className={`py-2 ${c.highlight ? "text-brand-700 font-bold" : "text-gray-600"}`}>
                      {c.price}
                    </td>
                    <td className="py-2">
                      {c.highlight ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <span className="text-red-400 text-xs">Hapana</span>
                      )}
                    </td>
                    <td className="py-2">
                      {c.highlight ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <span className="text-red-400 text-xs">Hapana</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ */}
        <div className="grid md:grid-cols-2 gap-4 mb-10">
          {[
            {
              q: "Je, ninahitaji kadi ya benki kuanza?",
              qEn: "Do I need a bank card to start?",
              a: "Hapana. Jaribu siku 14 bila malipo yoyote.",
              aEn: "No. Try free for 14 days, no payment required.",
            },
            {
              q: "Malipo yanafanywa vipi?",
              qEn: "How do I pay?",
              a: "M-Pesa, Tigo Pesa, Airtel Money, au benki.",
              aEn: "M-Pesa, Tigo Pesa, Airtel Money, or bank transfer.",
            },
            {
              q: "Ninaweza kubadilisha mpango?",
              qEn: "Can I upgrade/downgrade?",
              a: "Ndiyo, wakati wowote. Tofauti italipwa au kurudishwa.",
              aEn: "Yes, anytime. Difference is prorated.",
            },
            {
              q: "Data yangu iko salama?",
              qEn: "Is my data safe?",
              a: "Ndiyo. Data imehifadhiwa Tanzania kwenye seva salama.",
              aEn: "Yes. Data stored securely, backed up daily.",
            },
          ].map((faq, i) => (
            <div key={i} className="bg-gray-50 rounded-xl p-4">
              <p className="font-semibold text-gray-900 text-sm mb-1">{faq.q}</p>
              <p className="text-xs text-gray-500 mb-2">{faq.qEn}</p>
              <p className="text-sm text-gray-700">{faq.a}</p>
              <p className="text-xs text-gray-500">{faq.aEn}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="bg-brand-600 rounded-2xl p-8 text-center text-white">
          <h2 className="text-xl font-bold mb-2">Anza Leo — Bure kwa Siku 14</h2>
          <p className="text-brand-200 text-sm mb-6">Start today — free for 14 days, no credit card needed</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/register"
              className="bg-white text-brand-700 font-bold px-6 py-3 rounded-xl hover:bg-brand-50 transition-colors"
            >
              Jisajili Bure / Register Free
            </Link>
            <a
              href="https://wa.me/255700000000"
              className="bg-green-500 text-white font-bold px-6 py-3 rounded-xl hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
            >
              <Phone className="w-4 h-4" />
              WhatsApp: +255 700 000 000
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
