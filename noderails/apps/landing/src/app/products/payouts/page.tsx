import type { Metadata } from 'next';
import { ArrowRight, Check, BookUser, CalendarClock, Send, ShieldCheck, Upload, Wallet } from 'lucide-react';
import { ScreenshotFrame } from '@/components/landing/screenshot-frame';

export const metadata: Metadata = {
  title: 'Payouts | NodeRails',
  description:
    'Send crypto to one recipient or many. Authorize the payout wallet once, then send now, schedule, or run a recurring payroll from the dashboard or SDK.',
};

const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3001';

export default function PayoutsPage() {
  return (
    <>
      <section className="py-24 lg:py-32 bg-gradient-to-b from-violet-50/60 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <p className="text-violet-600 font-semibold text-sm uppercase tracking-wide mb-3">Payouts</p>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight mb-6">
              Pay recipients from the wallet you already authorized
            </h1>
            <p className="text-lg text-slate-600 leading-relaxed">
              Connect a payout wallet, sign a yearly authorization, and fund the token (or native balance).
              Then send now, schedule a one-shot, or run a recurring schedule. Recipients get the full amount. You pay the fee on top.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href={`${DASHBOARD_URL}/login`}
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full text-white bg-violet-600 hover:bg-violet-700 transition-colors shadow-lg"
              >
                Open Payouts <ArrowRight className="h-5 w-5 ml-2" />
              </a>
              <a
                href="/docs/sdk/payouts"
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                SDK Reference
              </a>
            </div>
          </div>

          <ScreenshotFrame
            src="/screenshots/dashboard-overview.png"
            alt="Merchant dashboard with payouts in the workspace and recent payout activity"
            url="merchant.example.local/dashboard/apps/cursor/payouts"
          />
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Payroll, affiliates, and rewards on-chain</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Dual authorization: your wallet signature plus NodeRails. Limits and history live in the dashboard, not in a custodial balance.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard
              icon={Send}
              title="Send now or later"
              description="One recipient or a bulk EVM list (up to 200 lines). Solana sends native SOL to one address. Sui create is stored; on-chain execute is not live yet."
            />
            <FeatureCard
              icon={CalendarClock}
              title="Schedules that keep running"
              description="A one-time UTC time, or every N days. Pause, resume, or cancel. A failed fire stays on the schedule so the next slot still runs."
            />
            <FeatureCard
              icon={BookUser}
              title="Address book"
              description="Save recipients per app. Pick them when you send instead of pasting the same wallet every payroll."
            />
            <FeatureCard
              icon={Upload}
              title="Payroll CSV"
              description="Import label, wallet, and amount. Row numbers stay on validation errors so you can fix the file and retry."
            />
            <FeatureCard
              icon={Wallet}
              title="Funding you can see"
              description="The strip shows ERC-20 allowance or native balance on the contract. Send stays blocked until coverage is enough."
            />
            <FeatureCard
              icon={ShieldCheck}
              title="Authorize once a year"
              description="Sign payout authorization in app settings. Changing the payout wallet clears that family's auth so a stale key cannot spend."
            />
          </div>
        </div>
      </section>

      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div className="mb-12 lg:mb-0">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Built for teams who send every week</h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                Use the dashboard for ops, or the SDK for productized payouts. Activity is a payments-style list:
                click a row for recipients, fee, hashes, and status (processing, executed, failed).
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-violet-600 shrink-0" /> Team payroll and contractor payments</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-violet-600 shrink-0" /> Referral and affiliate commissions</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-violet-600 shrink-0" /> Bounties, grants, and reward programs</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-violet-600 shrink-0" /> Need fiat instead? <a href="/products/bank" className="font-medium text-violet-600 hover:text-violet-700">Settle to bank</a> after capture</li>
              </ul>
            </div>
            <ScreenshotFrame
              src="/screenshots/app-settings.png"
              alt="App settings where merchants connect payout wallets and authorize payouts"
              url="merchant.example.local/dashboard/apps/cursor/settings"
            />
          </div>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">How a payout leaves the wallet</h2>
            <p className="text-lg text-slate-600">
              Standing approval in the dashboard. Create and execute from the UI or <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">noderails.payouts.create</code>.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <StepCard
              step="1"
              title="Authorize and fund"
              description="Connect the payout wallet, sign the yearly authorization, then approve the ERC-20 or deposit native for that chain."
            />
            <StepCard
              step="2"
              title="Add recipients"
              description="Type wallets, pick from the address book, or import a CSV. Review recipient total, fee, and what you pay."
            />
            <StepCard
              step="3"
              title="Send or schedule"
              description="Execute now, set a UTC time, or attach a recurring interval. Watch status on the Activity tab."
            />
          </div>
        </div>
      </section>

      <section className="py-24 bg-violet-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">Start sending payouts</h2>
          <p className="text-lg text-violet-100 mb-10">Authorize once. Send from the dashboard or the SDK. Recipients get the full amount.</p>
          <a
            href={`${DASHBOARD_URL}/login`}
            className="inline-flex items-center justify-center px-10 py-4 text-base font-semibold rounded-full text-violet-600 bg-white hover:bg-violet-50 transition-colors shadow-lg"
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
      <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center mb-4">
        <Icon className="h-5 w-5 text-violet-600" />
      </div>
      <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
    </div>
  );
}

function StepCard({ step, title, description }: { step: string; title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-violet-100 text-violet-700 font-bold text-lg flex items-center justify-center mx-auto mb-4">
        {step}
      </div>
      <h3 className="font-semibold text-slate-900 text-lg mb-2">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
    </div>
  );
}
