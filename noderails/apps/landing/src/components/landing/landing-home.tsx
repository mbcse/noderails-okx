import { NodeRailsLogo } from '@/components/noderails-logo';
import { TrackedLink } from '@/components/tracked-link';
import { HeroPreviewSwitcher } from '@/components/hero-preview-switcher';
import { FeedbackWidget } from '@/components/feedback-widget';
import { SectionHeader } from '@/components/landing/section-header';
import { ScreenshotFrame } from '@/components/landing/screenshot-frame';
import { MerchantsCollage } from '@/components/landing/merchants-collage';
import { AgentsHeroIllustration } from '@/components/landing/agents-hero-illustration';
import { WallCardHeroCard } from '@/components/landing/wallcard-hero-card';
import { SupportedBy } from '@/components/landing/supported-by';
import { InteractiveDemo } from '@/components/landing/interactive-demo';
import { FiatRailsSection } from '@/components/landing/fiat-rails-section';
import { LandingNav } from '@/components/landing/landing-nav';
import { FaqAccordion } from '@/components/landing/faq-accordion';
import { CountUp, Reveal, SpotlightGroup } from '@/components/landing/motion';
import { HeroClaimTypewriter } from '@/components/landing/hero-claim-typewriter';
import { NODERAILS_FINTECH_DISCLAIMER } from '@noderails/common';
import {
  ArrowRight,
  CreditCard,
  ArrowLeftRight,
  Coins,
  Shield,
  Check,
  Wallet,
  Fingerprint,
  Globe2,
  Gauge,
  Lock,
  Zap,
  Landmark,
  Send,
} from 'lucide-react';

const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3001';
const WALLCARD_URL = 'https://example.local/';
const X_URL = 'https://x.com/noderails';
const LINKEDIN_URL = 'https://www.linkedin.com/company/noderails';
const TELEGRAM_URL = 'https://t.me/+fzUTcAYr-zhhZjg1';
const DISCORD_URL = 'https://discord.gg/8uwSfv9Tvk';

const navLinks = [
  { label: 'WallCard', href: '#wallcard' },
  { label: 'Developers', href: '#developers' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Docs', href: '/docs' },
];

const heroStats = [
  {
    icon: Gauge,
    title: '1% introductory fee',
    body: 'Simple pricing that scales with your business from day one.',
  },
  {
    icon: Globe2,
    title: 'Multi-chain support',
    body: 'Accept crypto across EVM and Solana with one integration.',
  },
  {
    icon: Shield,
    title: 'Built-in chargebacks',
    body: 'Real buyer protection with on-chain dispute resolution.',
  },
];

const products = [
  {
    icon: CreditCard,
    title: 'Payments & Checkout',
    description:
      'Accept crypto on EVM, Solana, and Sui. Hosted checkout, refunds, and settlement to a wallet or bank.',
    href: '/products/payments',
    span: 'md:col-span-2',
    color: 'bg-indigo-50 text-indigo-600',
  },
  {
    icon: Send,
    title: 'Payouts',
    description:
      'Pay one recipient or many. Send now, schedule, or run recurring payroll from a wallet you authorize once.',
    href: '/products/payouts',
    span: 'md:col-span-1',
    color: 'bg-violet-50 text-violet-600',
  },
  {
    icon: Landmark,
    title: 'Bank',
    description:
      'Verify your business, open global bank accounts, and settle captured crypto to a verified bank account.',
    href: '/products/bank',
    span: 'md:col-span-1',
    color: 'bg-teal-50 text-teal-700',
  },
  {
    icon: ArrowLeftRight,
    title: 'Payment Links',
    description:
      'Share a link in email or chat. Customers pay on hosted checkout. No code required.',
    href: '/products/payment-links',
    span: 'md:col-span-1',
    color: 'bg-purple-50 text-purple-600',
  },
  {
    icon: Coins,
    title: 'Subscriptions & Invoices',
    description:
      'Recurring plans with automatic charges, plus invoices with line items, tax, and a pay button.',
    href: '/products/subscriptions',
    span: 'md:col-span-1',
    color: 'bg-fuchsia-50 text-fuchsia-600',
  },
];

const wallcardFeatures = [
  {
    icon: CreditCard,
    title: 'Card-first checkout',
    body: 'Familiar PAN, CVV, PIN, and OTP steps. No seed phrase, and no "install another wallet" for every purchase.',
    color: 'bg-indigo-50 text-indigo-600',
  },
  {
    icon: Wallet,
    title: 'Solana + Ethereum',
    body: 'Same EIP-1193-style flow as mainstream wallet tooling: message signing, typed data, and sends on Solana and EVM.',
    color: 'bg-red-50 text-red-600',
  },
  {
    icon: Globe2,
    title: 'Network, not a bank branch',
    body: 'Visa- and Mastercard-style routing for programmable money, with interchange-style economics on the chains you already use.',
    color: 'bg-rose-50 text-rose-600',
  },
];

const faqItems = [
  {
    q: 'Are you compliant?',
    a: 'Yes, compliance and safety are core to how NodeRails is built. We are focused on delivering the true essence of blockchain: decentralization and control for both merchants and users. NodeRails is non-custodial and acts as a technology layer for payments, not a custody holder, so funds remain controlled by contract rules and wallet ownership. We run AML screening and fraud checks behind the scenes, and we make global payments much easier to start than the traditional multi-step setup flow merchants face with legacy gateways.',
  },
  {
    q: 'Are my funds safe?',
    a: 'Yes. Funds are secured in NodeRails escrow smart contracts with timelocks enforced on-chain. Once a payment is captured, that means funds are locked for that payment flow and are intended for you as the merchant. They are 100% going to your wallet unless a user raises a dispute and wins. If no dispute is raised (or if merchant wins), funds settle automatically to your wallet. And even if our server is delayed for any reason, you can still call settle directly on the smart contract. We cannot stop valid settlement from reaching your wallet. Funds can only go to merchant or user, no other party.',
  },
  {
    q: 'Do subscriptions really work?',
    a: 'Yes. Subscriptions work similar to fiat recurring billing: users are charged automatically on the configured schedule (monthly, yearly, or custom cycle). NodeRails handles recurring charge orchestration and lifecycle events so you can focus on your product, not billing operations.',
  },
  {
    q: 'How does the dispute mechanism work?',
    a: 'The lifecycle is: Authorize -> Capture -> Dispute -> Settle. Capture means funds are secured for this payment and on the path to merchant settlement. Users get receipts with an "open dispute" link and can also raise disputes from the NodeRails dispute portal during the dispute window. If a user does not raise a dispute, settlement happens automatically to merchant wallet. If a dispute is raised, outcome decides merchant vs user. If user loses, funds settle to merchant. If user wins, funds return to user. Also, if auto-settlement is delayed for any reason, settlement can be triggered on-chain directly. We cannot block rightful settlement.',
  },
  {
    q: 'How do I get onboarded?',
    a: 'Onboarding is fast. Sign up, create your account (individual or business), create your app, and start accepting payments. You can test safely on test networks before going to production.',
  },
  {
    q: 'The chain I need is not listed. What should I do?',
    a: `We are actively adding more chains and network capabilities. If you need a specific chain prioritized, send us a request through the portal or message us on Telegram or Discord.`,
  },
];

export function LandingHome() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-zinc-900 antialiased">
      <noscript>
        <style>{`.nr-reveal,.nr-enter,.nr-code-line,.nr-caret-slot{opacity:1!important;transform:none!important;filter:none!important;animation:none!important}.nr-count-live{display:none!important}.nr-count-static{visibility:visible!important}`}</style>
      </noscript>

      {/* Announcement */}
      <div className="nr-announcement">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-2 gap-y-1 px-6 py-2.5 text-center text-[13px] text-zinc-600 sm:px-8">
          <span className="rounded-full bg-indigo-600/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
            Live
          </span>
          <span>Accept crypto payments with hosted checkout, links, subscriptions, and built-in dispute protection.</span>
          <a href="/docs" className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-700">
            Read the docs
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* Nav */}
      <LandingNav links={navLinks} loginHref={`${DASHBOARD_URL}/login`} />

      {/* Hero */}
      <section id="top" className="relative overflow-hidden border-b border-zinc-200">
        <div className="nr-aurora" aria-hidden />
        <div
          className="nr-dot-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(75%_65%_at_50%_35%,black,transparent)]"
          aria-hidden
        />
        <div className="nr-grain pointer-events-none absolute inset-0" aria-hidden />

        <div className="relative mx-auto max-w-[1600px] px-4 pb-10 pt-16 sm:px-6 sm:pb-16 sm:pt-24 lg:px-10 lg:pb-20 lg:pt-28">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14 xl:gap-16">
            <div className="min-w-0 text-center lg:text-left">
              <div className="nr-enter mb-6 flex justify-center lg:justify-start">
                <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
                  Live on multiple blockchains
                </div>
              </div>

              <h1 className="nr-enter text-balance text-[2.35rem] font-medium leading-[1.06] tracking-[-0.03em] text-zinc-700 sm:text-[3.15rem] lg:text-[3.65rem] xl:text-[4rem]">
                Crypto <span className="nr-mark">payments</span>
                <span className="mt-1 block">
                  <span className="nr-mark">infrastructure</span>
                </span>
              </h1>

              <noscript>
                <p className="mx-auto mt-5 max-w-xl text-[17px] font-normal leading-snug tracking-[-0.012em] text-zinc-700 sm:text-[19px] lg:mx-0">
                  The most advanced and comprehensive gateway for checkout, payouts, and settlement.
                </p>
              </noscript>
              <HeroClaimTypewriter />

              <p
                className="nr-enter mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-zinc-700 sm:text-base lg:mx-0"
                style={{ '--nr-enter-delay': '160ms' } as React.CSSProperties}
              >
                Hosted checkout, payment links, subscriptions, and invoices. Fraud and compliance run in the
                background. Chargebacks and refunds are built in.
              </p>

              <div
                className="nr-enter mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start"
                style={{ '--nr-enter-delay': '240ms' } as React.CSSProperties}
              >
                <TrackedLink
                  href={`${DASHBOARD_URL}/login`}
                  event="landing_signup_clicked"
                  properties={{ location: 'hero_primary' }}
                  className="nr-btn-cloud group inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white"
                >
                  Start now
                  <ArrowRight className="h-4 w-4" />
                </TrackedLink>
                <TrackedLink
                  href="mailto:business@example.com"
                  event="landing_contact_sales_clicked"
                  properties={{ location: 'hero_secondary' }}
                  className="nr-btn-cloud-soft inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium"
                >
                  Contact sales
                </TrackedLink>
              </div>

              <div
                className="nr-enter mt-8 flex flex-wrap items-center justify-center gap-6 text-[13px] text-zinc-600 lg:justify-start"
                style={{ '--nr-enter-delay': '480ms' } as React.CSSProperties}
              >
                <span className="flex items-center gap-1.5">
                  <Shield className="h-4 w-4 text-indigo-600" /> Chargebacks built-in
                </span>
                <span className="flex items-center gap-1.5">
                  <Lock className="h-4 w-4 text-indigo-600" /> Non-custodial escrow
                </span>
                <span className="flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-emerald-600" /> Multi-chain checkout
                </span>
              </div>
            </div>

            <div
              className="nr-enter relative min-w-0 w-full"
              style={{ '--nr-enter-delay': '260ms' } as React.CSSProperties}
            >
              <HeroPreviewSwitcher />
            </div>
          </div>
        </div>

        <div className="relative pb-12 pt-2 sm:pb-16">
          <SpotlightGroup className="mx-auto grid max-w-5xl gap-4 px-6 sm:grid-cols-3 sm:px-8 lg:px-12">
            {heroStats.map((stat, i) => (
              <Reveal key={stat.title} delay={i * 90} className="nr-stat-card nr-spot p-5 sm:p-6">
                <div className="nr-icon-chip mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
                  <stat.icon className="h-5 w-5 text-indigo-600" aria-hidden />
                </div>
                <p className="text-[15px] font-bold leading-snug tracking-tight text-zinc-900">{stat.title}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-zinc-600">{stat.body}</p>
              </Reveal>
            ))}
          </SpotlightGroup>
        </div>
      </section>

      {/* Products */}
      <section id="products" className="nr-section py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-12">
          <SectionHeader
            eyebrow="Complete Payment Stack"
            title="Everything you need to accept crypto, pay out, and settle to bank"
            description="Checkout, payment links, subscriptions, invoices, payouts, and bank rails. Chargebacks and refunds stay on the payment. One API."
          />
          <SpotlightGroup className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
            {products.map((p, i) => (
              <Reveal key={p.title} delay={i * 80} className={`nr-product-card nr-spot ${p.span}`}>
                <a href={p.href} className="block h-full p-6">
                  <div className={`nr-icon-chip flex h-10 w-10 items-center justify-center rounded-xl ${p.color}`}>
                    <p.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-[17px] font-bold tracking-tight text-zinc-900">{p.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-zinc-600">{p.description}</p>
                </a>
              </Reveal>
            ))}
          </SpotlightGroup>
        </div>
      </section>

      <FiatRailsSection />

      {/* Risk & Compliance */}
      <section className="nr-section-muted overflow-visible py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <SectionHeader
                eyebrow="Built-In Safety Layer"
                title="Inbuilt fraud risk engine and compliance checks"
                description="NodeRails continuously runs fraud scoring, wallet risk detection, sanctions screening, and compliance checks in the background, including KYC/KYB for bank rails and settlement. Your team and your users can focus on payments while risk controls run automatically."
                className="mb-8"
              />
              <div className="space-y-4">
                <Reveal variant="left" className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-indigo-200">
                  <Shield className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
                  <div>
                    <p className="font-semibold text-zinc-900">Auto risk scoring</p>
                    <p className="text-sm text-zinc-600">
                      Every payment is evaluated in real time for suspicious behavior and anomalous patterns.
                    </p>
                  </div>
                </Reveal>
                <Reveal variant="left" delay={100} className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-emerald-200">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="font-semibold text-zinc-900">Compliance by default</p>
                    <p className="text-sm text-zinc-600">
                      Built-in checks and audit-ready traces reduce manual ops for both merchants and finance teams.
                    </p>
                  </div>
                </Reveal>
                <Reveal variant="left" delay={200} className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-indigo-200">
                  <Landmark className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
                  <div>
                    <p className="font-semibold text-zinc-900">Fiat rail screening</p>
                    <p className="text-sm text-zinc-600">
                      Global bank account setup and settle-to-bank transfers run through identity verification,
                      sanctions screening, and region-aware compliance before funds move.
                    </p>
                  </div>
                </Reveal>
              </div>
            </div>

            <div className="relative overflow-hidden py-4 sm:overflow-visible sm:py-8">
              <Reveal variant="scale">
                <ScreenshotFrame
                  src="/screenshots/payment-details.png"
                  alt="NodeRails payment detail showing fee breakdown, tax, and risk checks"
                />
              </Reveal>
              <div className="mt-4 flex flex-wrap gap-3 sm:mt-0">
                <Reveal delay={250} className="sm:absolute sm:bottom-2 sm:left-0">
                  <div className="nr-float rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Risk Engine</p>
                    <p className="text-sm font-medium text-emerald-900">Monitoring active</p>
                  </div>
                </Reveal>
                <Reveal delay={400} className="sm:absolute sm:top-2 sm:right-0">
                  <div className="nr-float rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 shadow-sm" style={{ animationDelay: '2.2s' }}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Compliance</p>
                    <p className="text-sm font-medium text-indigo-900">Checks running</p>
                  </div>
                </Reveal>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WallCard */}
      <section id="wallcard" className="nr-section py-20 sm:py-24">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div
            className="nr-panel nr-beam relative overflow-visible rounded-[2rem]"
            style={{
              '--nr-beam-c1': 'rgb(239 68 68 / 0.75)',
              '--nr-beam-c2': 'rgb(251 113 133 / 0.7)',
            } as React.CSSProperties}
          >
            <div
              className="pointer-events-none absolute inset-0 rounded-[2rem] opacity-[0.45] bg-[radial-gradient(rgb(239_68_68/0.04)_1px,transparent_1px)] bg-[size:22px_22px]"
              aria-hidden
            />

            <div className="relative px-5 py-11 sm:px-8 sm:py-12 lg:px-11 lg:py-14">
              <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-14">
                <Reveal variant="left" className="lg:col-span-7">
                  <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[13px] font-semibold text-red-600">
                    NodeRails Network
                  </span>

                  <h2 className="mt-6 text-3xl font-semibold tracking-[-0.02em] text-zinc-950 sm:text-4xl lg:text-5xl">
                    WallCard: pay with a card,{' '}
                    <span className="nr-serif nr-wallcard-gradient-text">sign like a wallet</span>
                  </h2>

                  <p className="mt-6 text-[16px] leading-relaxed text-zinc-600">
                    <strong className="font-semibold text-zinc-900">NodeRails Network</strong> is the on-chain
                    acceptance layer for programmable money: shared policies, HTTPS APIs, and signatures that settle
                    on Solana and EVM.{' '}
                    <strong className="font-semibold text-zinc-900">WallCard</strong> is the wallet shoppers see at
                    checkout (card number, CVV, PIN, and OTP) instead of another browser extension.
                  </p>
                  <p className="mt-4 text-[15px] leading-relaxed text-zinc-600">
                    Your app keeps calling the same{' '}
                    <code className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-sm text-indigo-700">
                      provider.request
                    </code>{' '}
                    surface for Solana message signing and Ethereum typed data and sends. WallCard handles the card
                    flow and secure signer so keys never leave the secure environment.
                  </p>
                </Reveal>

                <Reveal variant="right" delay={120} className="relative flex justify-center overflow-visible py-6 lg:col-span-5 lg:justify-end">
                  <div
                    className="pointer-events-none absolute -inset-8 rounded-[32px] bg-red-500/[0.08] blur-2xl"
                    aria-hidden
                  />
                  <WallCardHeroCard className="relative w-full max-w-[400px]" />
                </Reveal>
              </div>

              <SpotlightGroup className="mt-14 grid gap-4 sm:grid-cols-3 lg:mt-16">
                {wallcardFeatures.map((item, i) => (
                  <Reveal
                    key={item.title}
                    delay={i * 90}
                    className="nr-spot flex gap-4 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-5 transition-all hover:border-red-200 hover:bg-white hover:shadow-[var(--shadow-card)]"
                    style={{ '--nr-spot-color': 'rgb(239 68 68 / 0.07)' } as React.CSSProperties}
                  >
                    <span className={`nr-icon-chip flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.color}`}>
                      <item.icon className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className="text-[15px] font-semibold tracking-tight text-zinc-900">{item.title}</p>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-600">{item.body}</p>
                    </div>
                  </Reveal>
                ))}
              </SpotlightGroup>

              <Reveal className="mt-10 flex flex-col items-center gap-4 sm:items-start">
                <TrackedLink
                  href={WALLCARD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  event="landing_wallcard_cta_clicked"
                  properties={{ location: 'wallcard_section_primary' }}
                  className="nr-btn-cloud group inline-flex w-full items-center justify-center gap-2 rounded-full px-10 py-4 text-lg font-semibold text-white sm:w-auto"
                >
                  <Fingerprint className="h-6 w-6 shrink-0 text-indigo-100" aria-hidden />
                  Explore WallCard &amp; NodeRails Network
                  <ArrowRight className="h-6 w-6 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5" />
                </TrackedLink>
                <p className="text-center text-sm text-zinc-600 sm:text-left">
                  Live demo, SDK playground, and product details on{' '}
                  <span className="font-mono text-xs text-zinc-700">wallcard.example.local</span>
                </p>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* Developers */}
      <section id="developers" className="nr-section-muted py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
            <div>
              <SectionHeader
                eyebrow="Built for Developers & Businesses"
                title="Integrate crypto payments in minutes, not weeks"
                description="A clean REST API, production-ready SDK, pre-built checkout components, and comprehensive webhooks. Get chargeback and refund support out of the box."
                className="mb-8"
              />
              <ul className="mb-8 space-y-4">
                {[
                  'Any blockchain supported with one integration',
                  'Built-in chargebacks, refunds & dispute resolution',
                  'Hosted checkout, payment links & webhooks with HMAC',
                ].map((item, i) => (
                  <Reveal as="li" variant="left" delay={i * 90} key={item} className="flex items-start gap-3">
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <span className="text-zinc-700">{item}</span>
                  </Reveal>
                ))}
              </ul>
              <Reveal delay={200} className="flex flex-wrap gap-3">
                <a
                  href="/docs"
                  className="nr-btn-cloud inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white"
                >
                  Read the docs
                </a>
                <a
                  href="https://github.com/noderails"
                  className="nr-btn-cloud inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white"
                >
                  View on GitHub
                </a>
              </Reveal>
            </div>

            <Reveal variant="scale" className="relative">
              <div className="nr-terminal">
                <div className="flex items-center border-b border-zinc-800 px-4 py-3">
                  <div className="flex gap-2">
                    <div className="h-3 w-3 rounded-full bg-red-500" />
                    <div className="h-3 w-3 rounded-full bg-yellow-500" />
                    <div className="h-3 w-3 rounded-full bg-green-500" />
                  </div>
                  <div className="ml-4 font-mono text-xs text-zinc-500">create-payment-checkout.ts</div>
                </div>
                <div className="overflow-x-auto p-6">
                  <pre className="code-block text-sm leading-relaxed text-zinc-300">
                    <span className="nr-code-line" style={{ '--nr-line': 0 } as React.CSSProperties}>
                      <span className="text-purple-400">import</span> NodeRails{' '}
                      <span className="text-purple-400">from</span>{' '}
                      <span className="text-green-300">&apos;noderails-node&apos;</span>;
                    </span>
                    <span className="nr-code-line" style={{ '--nr-line': 1 } as React.CSSProperties}>
                      <span className="text-zinc-500">// Initialize with your secret key</span>
                    </span>
                    <span className="nr-code-line" style={{ '--nr-line': 2 } as React.CSSProperties}>
                      <span className="text-purple-400">const</span> noderails{' '}
                      <span className="text-purple-400">=</span>{' '}
                      <span className="text-purple-400">new</span>{' '}
                      <span className="text-blue-400">NodeRails</span>(
                      <span className="text-green-300">&apos;sk_xxx_...&apos;</span>);
                    </span>
                    <span className="nr-code-line" style={{ '--nr-line': 3 } as React.CSSProperties}>
                      <span className="text-zinc-500">// Create a hosted payment checkout session</span>
                    </span>
                    <span className="nr-code-line" style={{ '--nr-line': 4 } as React.CSSProperties}>
                      <span className="text-purple-400">const</span> checkout{' '}
                      <span className="text-purple-400">=</span>{' '}
                      <span className="text-purple-400">await</span> noderails.checkoutSessions.
                      <span className="text-blue-400">create</span>({'{'}
                    </span>
                    <span className="nr-code-line" style={{ '--nr-line': 5 } as React.CSSProperties}>
                      {'  '}mode: <span className="text-green-300">&quot;payment&quot;</span>,
                    </span>
                    <span className="nr-code-line" style={{ '--nr-line': 6 } as React.CSSProperties}>
                      {'  '}amount: <span className="text-orange-400">&quot;49.99&quot;</span>,
                    </span>
                    <span className="nr-code-line" style={{ '--nr-line': 7 } as React.CSSProperties}>
                      {'  '}currency: <span className="text-green-300">&quot;USD&quot;</span>,
                    </span>
                    <span className="nr-code-line" style={{ '--nr-line': 8 } as React.CSSProperties}>
                      {'  '}successUrl: <span className="text-green-300">&quot;https://app.com/success&quot;</span>,
                    </span>
                    <span className="nr-code-line" style={{ '--nr-line': 9 } as React.CSSProperties}>
                      {'  '}cancelUrl: <span className="text-green-300">&quot;https://app.com/cancel&quot;</span>,
                    </span>
                    <span className="nr-code-line" style={{ '--nr-line': 10 } as React.CSSProperties}>
                      {'}'});
                    </span>
                    <span className="nr-code-line" style={{ '--nr-line': 11 } as React.CSSProperties}>
                      <span className="text-zinc-500">// Redirect customer to hosted checkout URL</span>
                    </span>
                    <span className="nr-code-line" style={{ '--nr-line': 12 } as React.CSSProperties}>
                      console.<span className="text-blue-400">log</span>(checkout.checkoutUrl);
                      <span className="nr-caret-slot">
                        <span className="nr-caret" aria-hidden />
                      </span>
                    </span>
                  </pre>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="nr-section py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-6 text-center sm:px-8 lg:px-12">
          <SectionHeader
            align="center"
            eyebrow="Platform"
            title="Your wallet. Your payments. No middlemen."
            description="NodeRails handles multi-chain payment routing, chargebacks, and refunds with a single integration for your business."
            className="mx-auto"
          />

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { value: 'Multi-Chain', label: 'Blockchain Support' },
              { value: '99.99%', label: 'Uptime SLA' },
              { value: '1%', label: 'Per Transaction Fee' },
            ].map((m, i) => (
              <Reveal key={m.label} delay={i * 90} className="nr-metric-cell p-6 text-center">
                <p className="text-3xl font-black tracking-tight">
                  <CountUp value={m.value} className="nr-metric-value" />
                </p>
                <p className="mt-2 text-[15px] font-semibold text-zinc-700">{m.label}</p>
              </Reveal>
            ))}
          </div>

          <Reveal variant="scale" className="mt-16 overflow-visible">
            <ScreenshotFrame
              src="/screenshots/dashboard-overview.png"
              alt="NodeRails dashboard showing payment stats, networks, and wallet balances"
            />
          </Reveal>
        </div>
      </section>

      {/* Merchants */}
      <section className="nr-section-muted py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12">
          <SectionHeader
            eyebrow="For Merchants & Businesses"
            title="Everything merchants need. Zero friction."
            description="Create a complete payment experience for your customers with payment links, checkout sessions, subscriptions, and invoices, all powered by crypto and settled directly to your wallet."
          />

          <MerchantsCollage />

          <Reveal className="mt-12 text-center">
            <TrackedLink
              href={`${DASHBOARD_URL}/login`}
              event="landing_merchants_clicked"
              properties={{ location: 'humans_section' }}
              className="nr-btn-cloud group inline-flex items-center justify-center gap-2 rounded-full px-8 py-4 text-base font-semibold text-white"
            >
              Start Accepting Payments
              <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-0.5" />
            </TrackedLink>
          </Reveal>
        </div>
      </section>

      {/* Agents */}
      <section className="nr-section py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <SectionHeader
                eyebrow="Built for AI & Agents"
                title="Agent-to-Agent Payments Made Simple"
                description="Launch agent crypto cards and create seamless payment layers for autonomous systems. Enable gasless agent-to-agent transactions with built-in settlement and dispute resolution."
                className="mb-8"
              />
              <ul className="mb-8 space-y-4">
                {[
                  'Gasless agent-to-agent payments',
                  'Agent crypto card infrastructure',
                  'Automated dispute resolution',
                ].map((item, i) => (
                  <Reveal as="li" variant="left" delay={i * 90} key={item} className="flex items-start gap-3">
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
                    <span className="text-zinc-700">{item}</span>
                  </Reveal>
                ))}
              </ul>
              <Reveal delay={200}>
                <TrackedLink
                  href={`${DASHBOARD_URL}/login`}
                  event="landing_agents_clicked"
                  properties={{ location: 'agents_section' }}
                  className="nr-btn-cloud group inline-flex items-center justify-center gap-2 rounded-full px-8 py-4 text-base font-semibold text-white"
                >
                  Enable Agents
                  <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-0.5" />
                </TrackedLink>
              </Reveal>
            </div>

            <Reveal variant="right">
              <AgentsHeroIllustration className="mx-auto w-full max-w-xl" />
            </Reveal>
          </div>
        </div>
      </section>

      {/* Payouts */}
      <section className="nr-section-muted py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12">
          <SectionHeader
            eyebrow="Fast & Reliable Payouts"
            title="Multi-chain payouts from a wallet you authorize once"
            description="Send now, schedule a one-shot, or run recurring payroll. Bulk EVM lists, an address book, and CSV import. Recipients get the full amount."
          />

          <div className="grid gap-4 md:grid-cols-3">
            {[
              { value: '200', label: 'Recipients Per EVM Payout', hint: 'One recipient or a bulk list, plus payroll CSV import' },
              { value: 'UTC', label: 'Send, Schedule, Recurring', hint: 'One-shot time or every N days, with pause and resume' },
              { value: 'Multi-Chain', label: 'EVM and Solana', hint: 'Same catalog as checkout, after yearly wallet authorization' },
            ].map((m, i) => (
              <Reveal key={m.label} delay={i * 90} className="nr-metric-cell p-8 text-center">
                <p className="text-4xl font-black tracking-tight">
                  <CountUp value={m.value} className="nr-metric-value" />
                </p>
                <p className="mt-2 text-sm font-semibold uppercase tracking-wide text-zinc-600">{m.label}</p>
                <p className="mt-2 text-sm text-zinc-500">{m.hint}</p>
              </Reveal>
            ))}
          </div>

          <div className="mt-12 grid gap-12 border-t border-zinc-200 pt-12 md:grid-cols-2">
            <div>
              <Reveal as="h4" variant="blur" className="mb-6 text-xl font-bold text-zinc-900">Perfect For:</Reveal>
              <ul className="space-y-3">
                {[
                  'Team payroll and salary distribution',
                  'Bounty and reward programs',
                  'Referral commissions and affiliate payouts',
                  'Liquidity mining rewards and airdrops',
                ].map((item, i) => (
                  <Reveal as="li" variant="left" delay={i * 70} key={item} className="flex items-center gap-3 text-zinc-600">
                    <Check className="h-5 w-5 shrink-0 text-emerald-600" />
                    {item}
                  </Reveal>
                ))}
              </ul>
            </div>
            <div>
              <Reveal as="h4" variant="blur" className="mb-6 text-xl font-bold text-zinc-900">Features:</Reveal>
              <ul className="space-y-3">
                {[
                  'CSV import with row-level validation errors',
                  'Activity list with processing, executed, and failed',
                  'Funding strip for allowance and native coverage',
                  'Dashboard send or SDK create and execute',
                ].map((item, i) => (
                  <Reveal as="li" variant="left" delay={i * 70} key={item} className="flex items-center gap-3 text-zinc-600">
                    <Check className="h-5 w-5 shrink-0 text-emerald-600" />
                    {item}
                  </Reveal>
                ))}
              </ul>
            </div>
          </div>

          <Reveal className="mt-12 text-center">
            <TrackedLink
              href="/products/payouts"
              event="landing_payouts_clicked"
              properties={{ location: 'payouts_section' }}
              className="nr-btn-cloud group inline-flex items-center justify-center gap-2 rounded-full px-8 py-4 text-base font-semibold text-white"
            >
              See Payouts
              <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-0.5" />
            </TrackedLink>
          </Reveal>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="nr-section py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-12">
          <SectionHeader
            align="center"
            eyebrow="Pricing"
            title="Simple, transparent pricing"
            description="Simple, transparent pricing with plans that scale as you grow."
            className="mx-auto"
          />

          <SpotlightGroup className="grid gap-6 text-left md:grid-cols-3">
            <Reveal className="nr-panel nr-beam nr-spot border-indigo-200 p-8 ring-2 ring-indigo-100 transition-transform duration-300 hover:-translate-y-1">
              <p className="mb-3 text-sm font-semibold text-indigo-600">Introductory Offer</p>
              <p className="text-5xl font-extrabold text-zinc-900"><CountUp value="1%" /></p>
              <p className="mt-2 text-sm text-zinc-500">per successful transaction</p>
              <ul className="mt-6 space-y-2 text-sm text-zinc-700">
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-indigo-600" /> Hosted checkout and payment links</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-indigo-600" /> Refunds, payouts, and bank settlement</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-indigo-600" /> Webhooks and dashboard analytics</li>
              </ul>
              <TrackedLink
                href={`${DASHBOARD_URL}/login`}
                event="landing_signup_clicked"
                properties={{ location: 'pricing_intro_card' }}
                className="nr-btn-cloud mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white"
              >
                Get Started <ArrowRight className="h-4 w-4" />
              </TrackedLink>
            </Reveal>

            <Reveal delay={100} className="nr-panel nr-spot p-8 transition-transform duration-300 hover:-translate-y-1">
              <p className="mb-3 text-sm font-semibold text-zinc-700">Normal Pricing</p>
              <p className="text-5xl font-extrabold text-zinc-900"><CountUp value="2%" /></p>
              <p className="mt-2 text-sm text-zinc-500">per successful transaction</p>
              <ul className="mt-6 space-y-2 text-sm text-zinc-700">
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-zinc-700" /> Everything in Introductory</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-zinc-700" /> Subscriptions and invoice workflows</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-zinc-700" /> Priority support queue</li>
              </ul>
              <TrackedLink
                href={`${DASHBOARD_URL}/login`}
                event="landing_signup_clicked"
                properties={{ location: 'pricing_normal_card' }}
                className="nr-btn-cloud mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white"
              >
                Choose Plan <ArrowRight className="h-4 w-4" />
              </TrackedLink>
            </Reveal>

            <Reveal delay={200} className="nr-panel nr-spot p-8 transition-transform duration-300 hover:-translate-y-1" style={{ '--nr-spot-color': 'rgb(217 119 6 / 0.07)' } as React.CSSProperties}>
              <p className="mb-3 text-sm font-semibold text-amber-700">Enterprise</p>
              <p className="text-3xl font-extrabold text-zinc-900">Negotiate</p>
              <p className="mt-2 text-sm text-zinc-500">custom pricing and support</p>
              <ul className="mt-6 space-y-2 text-sm text-zinc-700">
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-amber-700" /> Custom commercial terms</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-amber-700" /> Dedicated onboarding and SLA</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-amber-700" /> Architecture and migration support</li>
              </ul>
              <TrackedLink
                href="/docs"
                event="landing_docs_clicked"
                properties={{ location: 'pricing_enterprise_card' }}
                className="nr-btn-cloud mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white"
              >
                Talk to Us <ArrowRight className="h-4 w-4" />
              </TrackedLink>
            </Reveal>
          </SpotlightGroup>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="nr-section-muted py-20 sm:py-24">
        <div className="mx-auto max-w-5xl px-6 sm:px-8 lg:px-12">
          <SectionHeader
            align="center"
            eyebrow="FAQ"
            title="Frequently asked questions"
            description="Everything merchants and users ask us before going live."
            className="mx-auto"
          />

          <FaqAccordion items={faqItems} />
        </div>
      </section>

      <SupportedBy />
      <InteractiveDemo />

      {/* CTA */}
      <section className="nr-section py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12">
          <div className="nr-cta-panel nr-beam relative overflow-hidden p-10 text-center sm:p-14">
            <div className="nr-aurora opacity-60" aria-hidden />
            <div className="nr-grain pointer-events-none absolute inset-0" aria-hidden />
            <div className="relative">
              <Reveal as="h2" variant="blur" className="text-balance text-3xl font-semibold tracking-[-0.02em] text-zinc-950 sm:text-4xl">
                Ready to accept crypto payments?
              </Reveal>
              <Reveal as="p" delay={120} className="mx-auto mt-4 max-w-xl text-base text-zinc-600">
                Start accepting payments directly to your wallet in minutes. No middlemen. Full chargeback and refund
                support built in.
              </Reveal>
              <Reveal delay={240} className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <TrackedLink
                  href={`${DASHBOARD_URL}/login`}
                  event="landing_signup_clicked"
                  properties={{ location: 'final_cta_primary' }}
                  className="nr-btn-cloud inline-flex items-center justify-center rounded-full px-8 py-3 text-base font-semibold text-white"
                >
                  Create account
                </TrackedLink>
                <TrackedLink
                  href="/docs"
                  event="landing_docs_clicked"
                  properties={{ location: 'final_cta_secondary' }}
                  className="nr-btn-cloud inline-flex items-center justify-center rounded-full px-8 py-3 text-base font-semibold text-white"
                >
                  Read the docs
                </TrackedLink>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-zinc-50 pt-16 pb-12">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 sm:grid-cols-2 lg:grid-cols-5 sm:px-8 lg:px-12">
          <div className="sm:col-span-2 lg:col-span-1">
            <NodeRailsLogo withText className="mb-3 h-auto w-[200px]" />
            <p className="max-w-xs text-[13px] leading-relaxed text-zinc-600">
              A product of Maartandrise International Ventures Private Limited
            </p>
            <p className="mt-4 text-xs text-zinc-400">&copy; {new Date().getFullYear()} All rights reserved.</p>
            <div className="mt-4 flex items-center gap-4">
              <a href={X_URL} target="_blank" rel="noreferrer" className="text-zinc-400 hover:text-zinc-600" aria-label="Twitter">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" /></svg>
              </a>
              <a href="https://github.com/noderails" target="_blank" rel="noreferrer" className="text-zinc-400 hover:text-zinc-600" aria-label="GitHub">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" /></svg>
              </a>
              <a href={LINKEDIN_URL} target="_blank" rel="noreferrer" className="text-zinc-400 hover:text-zinc-600" aria-label="LinkedIn">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6.94 8.5H3.56V20h3.38V8.5ZM5.25 7.02c1.08 0 1.75-.71 1.75-1.6-.02-.91-.67-1.6-1.73-1.6-1.06 0-1.75.69-1.75 1.6 0 .89.67 1.6 1.71 1.6h.02ZM20.44 13.43c0-3.43-1.83-5.03-4.27-5.03-1.97 0-2.85 1.09-3.35 1.85v-1.59H9.44c.04 1.05 0 11.34 0 11.34h3.38v-6.34c0-.34.02-.67.12-.92.27-.67.88-1.36 1.9-1.36 1.34 0 1.88 1.03 1.88 2.55V20h3.38v-6.57Z"/></svg>
              </a>
              <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" className="text-zinc-400 hover:text-zinc-600" aria-label="Telegram">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M21.47 4.35a1 1 0 0 0-1.06-.16L2.89 11.18a1 1 0 0 0 .09 1.88l4.27 1.36 1.6 5.08a1 1 0 0 0 1.71.36l2.38-2.44 4.66 3.43a1 1 0 0 0 1.58-.59l2.5-14.78a1 1 0 0 0-.21-.83ZM9.04 14.28l8.6-6.18-6.87 7.09-.44 2.43-1.29-3.34Z"/></svg>
              </a>
              <a href={DISCORD_URL} target="_blank" rel="noreferrer" className="text-zinc-400 hover:text-zinc-600" aria-label="Discord">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.32 4.37A18.2 18.2 0 0 0 15.78 3c-.2.36-.43.84-.59 1.22a16.9 16.9 0 0 0-5.38 0A12.7 12.7 0 0 0 9.22 3c-1.6.27-3.12.74-4.54 1.37C1.8 8.65 1.02 12.83 1.4 16.95c1.9 1.4 3.74 2.24 5.55 2.79.45-.62.85-1.27 1.2-1.96-.66-.24-1.3-.53-1.9-.86.16-.12.31-.24.46-.37 3.67 1.72 7.67 1.72 11.3 0 .15.13.3.25.46.37-.6.34-1.24.62-1.9.86.35.69.75 1.34 1.2 1.96 1.81-.55 3.65-1.4 5.55-2.79.45-4.78-.76-8.91-3.68-12.58ZM9 14.44c-1.1 0-2-.98-2-2.18 0-1.2.88-2.18 2-2.18 1.12 0 2 .98 2 2.18 0 1.2-.88 2.18-2 2.18Zm6 0c-1.1 0-2-.98-2-2.18 0-1.2.88-2.18 2-2.18 1.12 0 2 .98 2 2.18 0 1.2-.88 2.18-2 2.18Z"/></svg>
              </a>
            </div>
          </div>

          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">Products</p>
            <ul className="mt-3 space-y-2 text-[13px] text-zinc-600">
              <li><a href="/products/payments" className="hover:text-zinc-900">Payments</a></li>
              <li><a href="/products/checkout" className="hover:text-zinc-900">Checkout</a></li>
              <li><a href="/products/payment-links" className="hover:text-zinc-900">Payment Links</a></li>
              <li><a href="/products/subscriptions" className="hover:text-zinc-900">Subscriptions</a></li>
              <li><a href="/products/invoicing" className="hover:text-zinc-900">Invoicing</a></li>
              <li><a href="/products/payouts" className="hover:text-zinc-900">Payouts</a></li>
              <li><a href="/products/bank" className="hover:text-zinc-900">Bank</a></li>
              <li><a href={WALLCARD_URL} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-900">WallCard</a></li>
            </ul>
          </div>

          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">Resources</p>
            <ul className="mt-3 space-y-2 text-[13px] text-zinc-600">
              <li><a href="/docs" className="hover:text-zinc-900">Guides</a></li>
              <li><a href="/blog" className="hover:text-zinc-900">Blog</a></li>
            </ul>
          </div>

          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">Developers</p>
            <ul className="mt-3 space-y-2 text-[13px] text-zinc-600">
              <li><a href="/docs" className="hover:text-zinc-900">Documentation</a></li>
              <li><a href="/docs/api-reference/checkout-sessions" className="hover:text-zinc-900">API Reference</a></li>
              <li><a href="/docs/sdk" className="hover:text-zinc-900">SDKs</a></li>
              <li><a href="https://github.com/noderails" className="hover:text-zinc-900">GitHub</a></li>
            </ul>
          </div>

          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">Company</p>
            <ul className="mt-3 space-y-2 text-[13px] text-zinc-600">
              <li><a href="/about" className="hover:text-zinc-900">About</a></li>
              <li>
                <a href={LINKEDIN_URL} target="_blank" rel="noreferrer" className="hover:text-zinc-900">
                  LinkedIn
                </a>
              </li>
              <li><a href="/privacy" className="hover:text-zinc-900">Privacy</a></li>
              <li><a href="/terms" className="hover:text-zinc-900">Terms</a></li>
              <li><a href="/msa" className="hover:text-zinc-900">Merchant Services Agreement</a></li>
              <li>
                <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" className="hover:text-zinc-900">
                  Telegram
                </a>
              </li>
              <li>
                <a href={DISCORD_URL} target="_blank" rel="noreferrer" className="hover:text-zinc-900">
                  Discord Community
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-7xl px-6 sm:px-8 lg:px-12">
          <div className="rounded-xl border border-zinc-200 bg-white px-6 py-4 text-center shadow-sm">
            <div className="text-sm font-medium text-zinc-700">For queries and partnerships, reach out:</div>
            <a href="mailto:business@example.com" className="text-base font-semibold text-indigo-700 hover:underline">
              business@example.com
            </a>
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-7xl space-y-4 border-t border-zinc-200 px-6 pt-8 text-xs text-zinc-500 sm:px-8 lg:px-12">
          <p className="max-w-4xl leading-relaxed">
            {NODERAILS_FINTECH_DISCLAIMER}
          </p>
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-center sm:text-left">
              NodeRails is a product of Maartandrise International Ventures Pvt. Ltd. Payments are settled directly to
              merchant wallets.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
              <a href={DISCORD_URL} target="_blank" rel="noreferrer" className="hover:text-zinc-900" aria-label="Discord">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.32 4.37A18.2 18.2 0 0 0 15.78 3c-.2.36-.43.84-.59 1.22a16.9 16.9 0 0 0-5.38 0A12.7 12.7 0 0 0 9.22 3c-1.6.27-3.12.74-4.54 1.37C1.8 8.65 1.02 12.83 1.4 16.95c1.9 1.4 3.74 2.24 5.55 2.79.45-.62.85-1.27 1.2-1.96-.66-.24-1.3-.53-1.9-.86.16-.12.31-.24.46-.37 3.67 1.72 7.67 1.72 11.3 0 .15.13.3.25.46.37-.6.34-1.24.62-1.9.86.35.69.75 1.34 1.2 1.96 1.81-.55 3.65-1.4 5.55-2.79.45-4.78-.76-8.91-3.68-12.58ZM9 14.44c-1.1 0-2-.98-2-2.18 0-1.2.88-2.18 2-2.18 1.12 0 2 .98 2 2.18 0 1.2-.88 2.18-2 2.18Zm6 0c-1.1 0-2-.98-2-2.18 0-1.2.88-2.18 2-2.18 1.12 0 2 .98 2 2.18 0 1.2-.88 2.18-2 2.18Z"/></svg>
              </a>
              <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" className="hover:text-zinc-900" aria-label="Telegram">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M21.47 4.35a1 1 0 0 0-1.06-.16L2.89 11.18a1 1 0 0 0 .09 1.88l4.27 1.36 1.6 5.08a1 1 0 0 0 1.71.36l2.38-2.44 4.66 3.43a1 1 0 0 0 1.58-.59l2.5-14.78a1 1 0 0 0-.21-.83ZM9.04 14.28l8.6-6.18-6.87 7.09-.44 2.43-1.29-3.34Z"/></svg>
              </a>
              <a href="/terms" className="hover:text-zinc-900">Terms &amp; Conditions</a>
              <a href="/privacy" className="hover:text-zinc-900">Privacy Policy</a>
              <a href="/msa" className="hover:text-zinc-900">Merchant Services Agreement</a>
            </div>
          </div>
        </div>
      </footer>

      <FeedbackWidget />
    </div>
  );
}
