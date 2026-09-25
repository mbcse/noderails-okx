import type { Metadata } from 'next';
import { ArrowRight, Check, FileText, Mail, Calculator, Clock } from 'lucide-react';
import { ScreenshotFrame } from '@/components/landing/screenshot-frame';

export const metadata: Metadata = {
  title: 'Invoicing | NodeRails',
  description:
    'Send crypto invoices with line items, tax rates, and a pay button. Customers check out on the hosted page. You track draft, sent, and paid.',
};

const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3001';

export default function InvoicingPage() {
  return (
    <>
      <section className="py-24 lg:py-32 bg-gradient-to-b from-emerald-50/60 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <p className="text-emerald-600 font-semibold text-sm uppercase tracking-wide mb-3">Invoicing</p>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight mb-6">
              Crypto invoices your customer can pay in one click
            </h1>
            <p className="text-lg text-slate-600 leading-relaxed">
              Build an invoice with line items, tax, and a due amount. We email it with a Pay invoice button that opens hosted checkout.
              When they pay, the invoice flips to paid and the payment follows your wallet or bank settlement settings.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href={`${DASHBOARD_URL}/login`}
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-lg"
              >
                Send Your First Invoice <ArrowRight className="h-5 w-5 ml-2" />
              </a>
              <a
                href="/docs/sdk/invoices"
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                SDK Reference
              </a>
            </div>
          </div>

          <ScreenshotFrame
            src="/screenshots/invoice-email.png"
            alt="Invoice email with line items, total amount, and Pay Invoice button"
            url="pay.example.local/invoices/MKT-2026005"
          />
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Invoicing for crypto businesses</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Create, send, and reconcile from the dashboard or the API. Tax rates you set once apply on the invoice and the receipt.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard icon={FileText} title="Line items" description="Quantities, unit prices, and descriptions. The customer sees the same breakdown on the email and at checkout." />
            <FeatureCard icon={Calculator} title="Tax rates" description="Inclusive or exclusive rates, by jurisdiction. The tax line is stored on the payment, not guessed later." />
            <FeatureCard icon={Mail} title="Email delivery" description="Sent to the customer with a Pay invoice button that opens the hosted checkout page." />
            <FeatureCard icon={Clock} title="Status tracking" description="Draft, sent, paid. Open the linked payment for fees, settlement, refunds, and disputes." />
          </div>
        </div>
      </section>

      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div className="mb-12 lg:mb-0">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Tax that matches the receipt</h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                Configure US sales tax, VAT, GST, or your own rate. Apply it on the invoice.
                Checkout and the receipt show the same numbers, so finance is not reconciling two stories.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Several rates per merchant</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Inclusive or exclusive calculation</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Tax line on the invoice, checkout, and receipt</li>
              </ul>
            </div>
            <ScreenshotFrame
              src="/screenshots/tax-rates.png"
              alt="Tax rate configuration form"
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
                alt="Payment receipt with dispute option"
                url="pay.example.local/receipts/ad7ecc27"
              />
            </div>
            <div className="order-1 lg:order-2">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Paid invoices still have buyer protection</h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                A paid invoice is a captured payment. The customer gets a receipt and can open a dispute while escrow is open.
                You refund from the payment, including a partial refund that reduces what still settles to wallet or bank.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Receipt email with a dispute option</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Escrow-backed refunds and chargebacks</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Dispute history next to the invoice in the dashboard</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 bg-emerald-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Send your first invoice today
          </h2>
          <p className="text-lg text-emerald-100 mb-10">Add line items, apply tax, send. Your customer pays on the same checkout as everyone else.</p>
          <a
            href={`${DASHBOARD_URL}/login`}
            className="inline-flex items-center justify-center px-10 py-4 text-base font-semibold rounded-full text-emerald-600 bg-white hover:bg-emerald-50 transition-colors shadow-lg"
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
      <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center mb-4">
        <Icon className="h-5 w-5 text-emerald-600" />
      </div>
      <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
    </div>
  );
}
