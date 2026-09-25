import type { Metadata } from 'next';
import { ArrowRight, Check, ShieldCheck, Zap, Palette, Globe } from 'lucide-react';
import { ScreenshotFrame } from '@/components/landing/screenshot-frame';

export const metadata: Metadata = {
  title: 'Hosted Checkout | NodeRails',
  description:
    'Hosted crypto checkout for sessions, payment links, and invoices. Customers pick a chain, connect a wallet, and pay. You get webhooks and a receipt.',
};

const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3001';

export default function CheckoutPage() {
  return (
    <>
      <section className="py-24 lg:py-32 bg-gradient-to-b from-purple-50/60 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <p className="text-purple-600 font-semibold text-sm uppercase tracking-wide mb-3">Checkout</p>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight mb-6">
              A hosted checkout that converts
            </h1>
            <p className="text-lg text-slate-600 leading-relaxed">
              Create a checkout session from the API, or send a payment link or invoice. Customers land on a mobile-ready page:
              amount, chain, wallet, confirm. The same page powers every NodeRails collect flow.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href={`${DASHBOARD_URL}/login`}
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full text-white bg-purple-600 hover:bg-purple-700 transition-colors shadow-lg"
              >
                Try Checkout <ArrowRight className="h-5 w-5 ml-2" />
              </a>
              <a
                href="/docs/api-reference/checkout-sessions"
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                API Reference
              </a>
            </div>
          </div>

          <ScreenshotFrame
            src="/screenshots/checkout.png"
            alt="NodeRails hosted checkout with payment review, wallet authorization, and smart contract security"
            url="pay.example.local/checkout/cs_enterprise"
          />
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">How it works</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">Three steps from your app to a captured payment. No frontend payment UI to maintain.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <StepCard
              step="1"
              title="Create a session"
              description="Call the API with amount, currency, and return URLs. You get a hosted checkout URL. Payment links and invoices create this session for you."
            />
            <StepCard
              step="2"
              title="Customer pays on-chain"
              description="They pick a chain and token you enabled, connect a wallet, review fees and tax, then sign. Only networks with a receiving wallet appear."
            />
            <StepCard
              step="3"
              title="You get the webhook"
              description="payment.captured and later settlement events hit your endpoint. Leftover funds go to your settlement wallet or your bank, based on app settings."
            />
          </div>
        </div>
      </section>

      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div className="mb-12 lg:mb-0">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Built for conversion</h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                The page stays quiet on purpose. Customers see the amount, choose how to pay, and confirm.
                Optional conversion can move the captured token into the settlement asset you configured, without a second checkout.
              </p>
              <ul className="space-y-4">
                <FeatureItem icon={Globe} text="EVM, Solana, and Sui, limited to chains you enabled and funded with a receive address" />
                <FeatureItem icon={Zap} text="Live status from wallet connect through capture, with webhooks for your backend" />
                <FeatureItem icon={ShieldCheck} text="Risk scoring and compliance checks before settlement continues" />
                <FeatureItem icon={Palette} text="Receipt email after capture, with a dispute path when escrow is still open" />
              </ul>
            </div>
            <ScreenshotFrame
              src="/screenshots/payment-transactions.png"
              alt="Payment lifecycle timeline showing capture and settlement transactions"
            />
          </div>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div className="mb-12 lg:mb-0 order-2 lg:order-1">
              <ScreenshotFrame
                src="/screenshots/payment-receipt.png"
                alt="Payment receipt email with dispute option"
                url="pay.example.local/receipts/ad7ecc27"
              />
            </div>
            <div className="order-1 lg:order-2">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Buyer protection on every charge</h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                After capture, the customer gets a receipt they can use to open a dispute while escrow is active.
                Refunds and chargebacks run through the same payment record, including partial refunds that shrink what still settles.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-purple-600 shrink-0" /> Receipt email after a successful payment</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-purple-600 shrink-0" /> On-chain dispute path while funds sit in escrow</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-purple-600 shrink-0" /> Full or partial refunds from the dashboard or API</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 bg-purple-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Launch checkout in minutes
          </h2>
          <p className="text-lg text-purple-100 mb-10">One API call for a session. One redirect to collect. Settlement follows the rules you set on the app.</p>
          <a
            href={`${DASHBOARD_URL}/login`}
            className="inline-flex items-center justify-center px-10 py-4 text-base font-semibold rounded-full text-purple-600 bg-white hover:bg-purple-50 transition-colors shadow-lg"
          >
            Get Started Free <ArrowRight className="h-5 w-5 ml-2" />
          </a>
        </div>
      </section>
    </>
  );
}

function StepCard({ step, title, description }: { step: string; title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-700 font-bold text-lg flex items-center justify-center mx-auto mb-4">
        {step}
      </div>
      <h3 className="font-semibold text-slate-900 text-lg mb-2">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
    </div>
  );
}

function FeatureItem({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
      <p className="text-slate-700">{text}</p>
    </div>
  );
}
