import type { Metadata } from 'next';
import { ArrowRight, Check, CreditCard, BarChart3, Globe, Landmark, Shield, Wallet } from 'lucide-react';
import { ScreenshotFrame } from '@/components/landing/screenshot-frame';

export const metadata: Metadata = {
  title: 'Crypto Payments | NodeRails',
  description:
    'Accept crypto on EVM, Solana, and Sui. Track every payment from authorize to capture, refund, and settlement to a wallet or bank.',
};

const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3001';

export default function PaymentsPage() {
  return (
    <>
      <section className="py-24 lg:py-32 bg-gradient-to-b from-indigo-50/60 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <p className="text-indigo-600 font-semibold text-sm uppercase tracking-wide mb-3">Payments</p>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight mb-6">
              Accept crypto. Settle to a wallet or your bank.
            </h1>
            <p className="text-lg text-slate-600 leading-relaxed">
              One payment stack for checkout, payment links, invoices, and subscriptions. Customers pay on-chain.
              You see the full lifecycle, then settle leftover funds to a merchant wallet or a verified business bank account.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href={`${DASHBOARD_URL}/login`}
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-lg"
              >
                Start Accepting Payments <ArrowRight className="h-5 w-5 ml-2" />
              </a>
              <a
                href="/docs"
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Read the Docs
              </a>
            </div>
          </div>

          <ScreenshotFrame
            src="/screenshots/dashboard-overview.png"
            alt="NodeRails payment dashboard showing real-time stats, payments by network, and wallet balances"
          />
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Built for the full payment lifecycle</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Authorize, capture, refund, and settle from one dashboard. Fees, tax, and on-chain hashes stay attached to every intent.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard
              icon={Globe}
              title="EVM, Solana, and Sui"
              description="Enable chains and tokens per app. Checkout only shows networks that have a matching receiving wallet."
            />
            <FeatureCard
              icon={BarChart3}
              title="Live payment ops"
              description="Filter by status, chain, token, and source. Export for accounting. Open any row for fees, tax, and the customer."
            />
            <FeatureCard
              icon={Shield}
              title="Risk before settlement"
              description="Fraud scoring, wallet risk checks, and sanctions screening run on every payment before funds move on."
            />
            <FeatureCard
              icon={Wallet}
              title="Wallet settlement"
              description="After the escrow timelock, leftover funds settle to the wallet you signed for that payment. We never custody your balance."
            />
            <FeatureCard
              icon={Landmark}
              title="Bank settlement"
              description="Convert captured crypto and send fiat to a verified business bank account. Same payment, treasury-ready rail."
            />
            <FeatureCard
              icon={CreditCard}
              title="Partial refunds"
              description="Refund all or part of a capture. Settlement uses leftover amount, not the original charge, so books stay honest."
            />
          </div>
        </div>
      </section>

      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div className="mb-12 lg:mb-0">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Track every payment in real time</h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                Incoming payments from checkout, links, invoices, subscriptions, and the API land in one list.
                Click any row for the customer, fee split, tax, and explorer links.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-indigo-600 shrink-0" /> Statuses: Created, Captured, Partially refunded, Settled, Refunded</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-indigo-600 shrink-0" /> Sources tagged: checkout, payment link, invoice, subscription, API</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-indigo-600 shrink-0" /> One-click export for accounting</li>
              </ul>
            </div>
            <ScreenshotFrame
              src="/screenshots/payments-list.png"
              alt="Payments list with status filters and search"
            />
          </div>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div className="mb-12 lg:mb-0 order-2 lg:order-1">
              <ScreenshotFrame
                src="/screenshots/payment-details.png"
                alt="Payment detail panel showing fee breakdown and tax"
              />
            </div>
            <div className="order-1 lg:order-2">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Fees, tax, and the on-chain trail</h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                Each payment keeps the original capture for audit, then shows the leftover that can still settle or refund.
                Platform fee, tax, and destination amount are explicit. Transaction hashes open in a block explorer.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-indigo-600 shrink-0" /> Platform fee and tax breakdown on every intent</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-indigo-600 shrink-0" /> Settlement amount after refunds, not a stale capture total</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-indigo-600 shrink-0" /> Capture, refund, and settle hashes with explorer links</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div className="mb-12 lg:mb-0">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Know who paid you</h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                Every payment can attach to a customer. Open the profile for billing details, payment history, and lifetime spend without leaving the dashboard.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-indigo-600 shrink-0" /> Billing address and contact on the customer record</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-indigo-600 shrink-0" /> Payment history and total spend in one panel</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-indigo-600 shrink-0" /> Same customer object for invoices and subscriptions</li>
              </ul>
            </div>
            <ScreenshotFrame
              src="/screenshots/customers.png"
              alt="Customer list with detail panel showing billing and payment history"
            />
          </div>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div className="mb-12 lg:mb-0 order-2 lg:order-1">
              <ScreenshotFrame
                src="/screenshots/app-settings.png"
                alt="App settings with networks, wallets, and settlement"
              />
            </div>
            <div className="order-1 lg:order-2">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Settlement you configure once</h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                Pick the chains and tokens you accept, then choose how captured funds should land: a settlement wallet on one chain, or fiat to a bank account you verified in Bank.
                New authorizations pick up the live settings. Already-captured payments keep the snapshot they were created with.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-indigo-600 shrink-0" /> Receiving and payout wallets per chain family</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-indigo-600 shrink-0" /> Optional conversion into a settlement token you choose</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-indigo-600 shrink-0" /> <a href="/products/bank" className="font-medium text-indigo-600 hover:text-indigo-700">Bank</a> for fiat deposit, <a href="/products/payouts" className="font-medium text-indigo-600 hover:text-indigo-700">Payouts</a> to send crypto out</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 bg-indigo-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">Start accepting crypto payments today</h2>
          <p className="text-lg text-indigo-100 mb-10">Hosted checkout, payment links, or the API. Funds settle to your wallet or your bank.</p>
          <a
            href={`${DASHBOARD_URL}/login`}
            className="inline-flex items-center justify-center px-10 py-4 text-base font-semibold rounded-full text-indigo-600 bg-white hover:bg-indigo-50 transition-colors shadow-lg"
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
      <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center mb-4">
        <Icon className="h-5 w-5 text-indigo-600" />
      </div>
      <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
    </div>
  );
}
