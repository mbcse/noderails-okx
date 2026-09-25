import type { Metadata } from 'next';
import { ArrowRight, Check, Link2, Share2, BarChart3, Wallet } from 'lucide-react';
import { ScreenshotFrame } from '@/components/landing/screenshot-frame';

export const metadata: Metadata = {
  title: 'Payment Links | NodeRails',
  description:
    'Create shareable crypto payment links from the dashboard. No code. Customers pay on hosted checkout. You settle to a wallet or bank.',
};

const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3001';

export default function PaymentLinksPage() {
  return (
    <>
      <section className="py-24 lg:py-32 bg-gradient-to-b from-blue-50/60 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <p className="text-blue-600 font-semibold text-sm uppercase tracking-wide mb-3">Payment Links</p>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight mb-6">
              Accept payments without writing code
            </h1>
            <p className="text-lg text-slate-600 leading-relaxed">
              Set an amount and a description in the dashboard. Share the link in email, chat, or on your site.
              The customer opens hosted checkout, connects a wallet, and pays. The payment shows up next to every other intent.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href={`${DASHBOARD_URL}/login`}
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-lg"
              >
                Create a Payment Link <ArrowRight className="h-5 w-5 ml-2" />
              </a>
              <a
                href="/docs/sdk/payment-links"
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                SDK Reference
              </a>
            </div>
          </div>

          <ScreenshotFrame
            src="/screenshots/payment-links.png"
            alt="Payment links dashboard showing active links with URLs and usage stats"
          />
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">The simplest way to get paid in crypto</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              No checkout integration. Create a link, share it, and reconcile it like any other NodeRails payment.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard
              icon={Link2}
              title="Live in one step"
              description="Amount, description, create. The public URL is ready. You can also create links from the API or SDK."
            />
            <FeatureCard
              icon={Share2}
              title="Share anywhere"
              description="Copy the pay.example.local URL into email, Telegram, X, or a button on your site."
            />
            <FeatureCard
              icon={BarChart3}
              title="Usage you can audit"
              description="See opens, successful payments, and totals per link. Each charge is a normal payment intent."
            />
            <FeatureCard
              icon={Wallet}
              title="Same settlement rules"
              description="Link payments follow app settlement: leftover funds to your wallet, or fiat to a verified bank account."
            />
          </div>
        </div>
      </section>

      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div className="mb-12 lg:mb-0">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Works wherever you already sell</h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                Freelancers, stores, and creators use the same hosted page as checkout sessions.
                Customers still get a receipt and a dispute path. You still get webhooks and the payments list.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-blue-600 shrink-0" /> Project invoices and retainers without sending a formal invoice</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-blue-600 shrink-0" /> One-off catalog items and event tickets</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-blue-600 shrink-0" /> Tips and donations with a fixed or listed amount</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-blue-600 shrink-0" /> Need line items and tax? Use <a href="/products/invoicing" className="font-medium text-blue-600 hover:text-blue-700">Invoicing</a> instead</li>
              </ul>
            </div>
            <ScreenshotFrame
              src="/screenshots/dashboard-overview.png"
              alt="Dashboard overview showing payment stats and wallet balances"
            />
          </div>
        </div>
      </section>

      <section className="py-24 bg-blue-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Create your first payment link
          </h2>
          <p className="text-lg text-blue-100 mb-10">Under a minute. No code. Settlement uses the same wallet or bank settings as checkout.</p>
          <a
            href={`${DASHBOARD_URL}/login`}
            className="inline-flex items-center justify-center px-10 py-4 text-base font-semibold rounded-full text-blue-600 bg-white hover:bg-blue-50 transition-colors shadow-lg"
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
      <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center mb-4">
        <Icon className="h-5 w-5 text-blue-600" />
      </div>
      <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
    </div>
  );
}
