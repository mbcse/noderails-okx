import type { Metadata } from 'next';
import Image from 'next/image';
import { ArrowRight, Building2, Check, Landmark, ShieldCheck, Wallet } from 'lucide-react';
import { ScreenshotFrame } from '@/components/landing/screenshot-frame';

export const metadata: Metadata = {
  title: 'Bank | NodeRails',
  description:
    'Verify your business, add your own bank account, open global bank accounts for local receiving, and settle captured crypto to fiat in 100+ countries.',
};

const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3001';

const COUNTRY_RAILS = [
  { code: 'USD', label: 'United States', hint: 'ACH · Wire · FedNow', flag: 'us' },
  { code: 'EUR', label: 'Europe', hint: 'SEPA', flag: 'eu' },
  { code: 'MXN', label: 'Mexico', hint: 'SPEI', flag: 'mx' },
  { code: 'BRL', label: 'Brazil', hint: 'Pix', flag: 'br' },
  { code: 'GBP', label: 'United Kingdom', hint: 'Faster Payments', flag: 'gb' },
  { code: 'COP', label: 'Colombia', hint: 'Local bank transfer', flag: 'co' },
] as const;

export default function BankPage() {
  return (
    <>
      <section className="py-24 lg:py-32 bg-gradient-to-b from-teal-50/60 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <p className="text-teal-700 font-semibold text-sm uppercase tracking-wide mb-3">Bank</p>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight mb-6">
              Accept crypto. Keep a bank account in the same dashboard.
            </h1>
            <p className="text-lg text-slate-600 leading-relaxed">
              Bank is the merchant rail for fiat. Verify identity, add your own business account, open global bank accounts
              so partners can pay you locally, and settle leftover crypto to a bank after escrow.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href={`${DASHBOARD_URL}/login`}
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full text-white bg-teal-700 hover:bg-teal-800 transition-colors shadow-lg"
              >
                Open Bank <ArrowRight className="h-5 w-5 ml-2" />
              </a>
              <a
                href="/products/payments"
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                See Payments
              </a>
            </div>
          </div>

          <ScreenshotFrame
            src="/screenshots/dashboard-overview.png"
            alt="Merchant dashboard with Bank in the sidebar next to payments and payouts"
            url="merchant.example.local/dashboard/bank"
          />
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Two ways to use Bank</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Receive local fiat on opened global bank accounts, or send captured crypto out as a bank deposit. Both sit under the same Bank page, split by test and live.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard
              icon={ShieldCheck}
              title="Identity first"
              description="Business KYC/KYB before an account goes live. Test and production stay separate so sandbox work never touches live rails."
            />
            <FeatureCard
              icon={Building2}
              title="Your own account"
              description="Add the business bank you already have. No extra account fee. After it is verified you can update details without starting identity over."
            />
            <FeatureCard
              icon={Landmark}
              title="Global bank accounts"
              description="Open receiving in USD, EUR, MXN, BRL, GBP, and COP. Partners pay through ACH, SEPA, Pix, SPEI, Faster Payments, and local transfer."
            />
            <FeatureCard
              icon={Wallet}
              title="Settle captured crypto"
              description="After the escrow timelock, convert leftover settlement balance and send fiat to the verified account. Webhooks track the transfer."
            />
          </div>
        </div>
      </section>

      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Open global bank accounts</h2>
            <p className="text-lg text-slate-600">
              Pick a country, complete identity, and open a global bank account. Deposit instructions and activity live on the account page, not in a separate product.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {COUNTRY_RAILS.map((rail) => (
              <article key={rail.code} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="relative h-36">
                  <Image
                    src={`/bank/${rail.flag}.jpg`}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 to-slate-950/10" />
                  <p className="absolute bottom-3 left-4 text-sm font-semibold text-white">{rail.label}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">{rail.code}</p>
                  <p className="text-sm text-slate-600">{rail.hint}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div className="mb-12 lg:mb-0">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Settle to bank after a crypto sale</h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                Checkout still captures on-chain. When bank settlement is on, leftover funds convert and land as a deposit
                to the account you verified. Coverage is built for merchant treasury: 100+ countries and 120+ currencies.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-teal-700 shrink-0" /> Same payment record from capture to bank deposit</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-teal-700 shrink-0" /> Partial refunds reduce what can still settle</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-teal-700 shrink-0" /> Sending crypto to wallets stays on <a href="/products/payouts" className="font-medium text-teal-700 hover:text-teal-800">Payouts</a></li>
              </ul>
            </div>
            <ScreenshotFrame
              src="/screenshots/app-settings.png"
              alt="App settlement settings where merchants choose wallet or bank destination"
              url="merchant.example.local/dashboard/apps/cursor/settings"
            />
          </div>
        </div>
      </section>

      <section className="py-24 bg-teal-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">Add Bank to your merchant account</h2>
          <p className="text-lg text-teal-100 mb-10">Verify once. Open the global bank accounts you need. Settle crypto sales to the account your finance team already uses.</p>
          <a
            href={`${DASHBOARD_URL}/login`}
            className="inline-flex items-center justify-center px-10 py-4 text-base font-semibold rounded-full text-teal-800 bg-white hover:bg-teal-50 transition-colors shadow-lg"
          >
            Get Started Free <ArrowRight className="h-5 w-5 ml-2" />
          </a>
        </div>
      </section>
    </>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-6">
      <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center mb-4">
        <Icon className="h-5 w-5 text-teal-700" />
      </div>
      <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
    </div>
  );
}
