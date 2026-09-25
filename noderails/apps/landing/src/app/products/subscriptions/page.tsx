import type { Metadata } from 'next';
import { ArrowRight, Check, RefreshCcw, CalendarClock, CreditCard, Users } from 'lucide-react';
import { ScreenshotFrame } from '@/components/landing/screenshot-frame';

export const metadata: Metadata = {
  title: 'Subscriptions | NodeRails',
  description:
    'Recurring crypto billing with product plans, wallet authorization, automatic charges, and invoices you can pause or cancel from the dashboard.',
};

const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3001';

export default function SubscriptionsPage() {
  return (
    <>
      <section className="py-24 lg:py-32 bg-gradient-to-b from-pink-50/60 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <p className="text-pink-600 font-semibold text-sm uppercase tracking-wide mb-3">Subscriptions</p>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight mb-6">
              Recurring crypto billing, without the ops grind
            </h1>
            <p className="text-lg text-slate-600 leading-relaxed">
              Create product plans with a price and interval. The customer authorizes their wallet once, then each cycle
              charges on-chain and writes a payment plus an invoice. Pause, resume, or cancel from the dashboard or API.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href={`${DASHBOARD_URL}/login`}
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full text-white bg-pink-600 hover:bg-pink-700 transition-colors shadow-lg"
              >
                Set Up Subscriptions <ArrowRight className="h-5 w-5 ml-2" />
              </a>
              <a
                href="/docs/sdk/subscriptions"
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                SDK Reference
              </a>
            </div>
          </div>

          <ScreenshotFrame
            src="/screenshots/subscriptions.png"
            alt="Subscriptions list with active subscribers and plan details"
          />
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Everything for recurring revenue</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Plans, authorization, automatic charges, and subscriber tools in one place. Each cycle is a real payment you can refund or settle.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard icon={CreditCard} title="Product plans" description="Fixed or listed amounts, billing interval, and trial windows. Archive a plan without deleting history." />
            <FeatureCard icon={RefreshCcw} title="Automatic charges" description="Each cycle uses the standing wallet authorization. Failed charges stay on the subscription timeline." />
            <FeatureCard icon={CalendarClock} title="Billing timeline" description="Every charge, invoice, and status change is listed. Support can see why a renewal did or did not run." />
            <FeatureCard icon={Users} title="Subscriber control" description="Active, paused, and cancelled in one list. Same objects in the dashboard and the SDK." />
          </div>
        </div>
      </section>

      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div className="mb-12 lg:mb-0">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Create product plans in seconds</h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                Price, interval, and copy live on the plan. Each plan can have its own subscribe URL.
                Charges use the chains and tokens enabled on the app, the same catalog as checkout.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-pink-600 shrink-0" /> Weekly, monthly, or a custom interval</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-pink-600 shrink-0" /> Several plans on one product</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-pink-600 shrink-0" /> Active or archived without losing subscribers</li>
              </ul>
            </div>
            <ScreenshotFrame
              src="/screenshots/product-plans.png"
              alt="Product plans configuration with subscription types and pricing"
            />
          </div>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div className="mb-12 lg:mb-0 order-2 lg:order-1">
              <ScreenshotFrame
                src="/screenshots/subscription-details.png"
                alt="Subscription detail view with billing cycle, invoices, and timeline"
              />
            </div>
            <div className="order-1 lg:order-2">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Every renewal is a payment you already know</h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                Open a subscription for the wallet authorization, current cycle, invoices, and event timeline.
                Successful charges settle with the same wallet or bank rules as a one-off checkout.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-pink-600 shrink-0" /> Wallet authorization and approval details</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-pink-600 shrink-0" /> Invoice history with payment status</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-pink-600 shrink-0" /> Refunds and disputes attach to the cycle payment, not a side ledger</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 bg-pink-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Start collecting recurring revenue
          </h2>
          <p className="text-lg text-pink-100 mb-10">Create a plan, share the subscribe URL, and let the billing cycle run.</p>
          <a
            href={`${DASHBOARD_URL}/login`}
            className="inline-flex items-center justify-center px-10 py-4 text-base font-semibold rounded-full text-pink-600 bg-white hover:bg-pink-50 transition-colors shadow-lg"
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
      <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center mb-4">
        <Icon className="h-5 w-5 text-pink-600" />
      </div>
      <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
    </div>
  );
}
