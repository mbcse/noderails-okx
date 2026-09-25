import type { Metadata } from 'next';
import { NodeRailsLogo } from '@/components/noderails-logo';
import { TrackedLink } from '@/components/tracked-link';
import { FeedbackWidget } from '@/components/feedback-widget';
import { ProductsNavDropdown } from '@/components/landing/products-nav-dropdown';
import {
  ChevronRight,
  Layers,
  ArrowRightLeft,
  Shield,
  Wallet,
  CreditCard,
  Server,
  Database,
  Globe,
  Lock,
  Link2,
  RefreshCw,
  FileText,
  Users,
  Zap,
  Eye,
  Radio,
  Key,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Architecture | NodeRails',
  description:
    'Complete technical architecture of NodeRails: smart contract escrow, MTXM transaction manager, multi-chain indexer, WallCard, checkout sessions, and Stellar integration plan.',
};

const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3001';

function SectionTitle({ label, title, description }: { label: string; title: string; description: string }) {
  return (
    <div className="text-center mb-16">
      <p className="text-indigo-600 font-semibold text-sm uppercase tracking-wide mb-3">{label}</p>
      <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">{title}</h2>
      <p className="text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed">{description}</p>
    </div>
  );
}

function DiagramBlock({ title, children }: { title: string; children: string }) {
  return (
    <div className="max-w-4xl mx-auto">
      {title && <h3 className="text-lg font-semibold text-slate-900 mb-4 text-center">{title}</h3>}
      <pre className="bg-slate-900 text-slate-100 rounded-2xl p-6 sm:p-8 text-[11px] sm:text-sm leading-relaxed overflow-x-auto font-mono">
        {children}
      </pre>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: typeof Shield; title: string; description: string }) {
  return (
    <div className="bg-slate-50 rounded-2xl p-7">
      <div className="w-11 h-11 bg-indigo-100 rounded-xl flex items-center justify-center mb-4">
        <Icon className="h-5 w-5 text-indigo-600" />
      </div>
      <h3 className="text-base font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
    </div>
  );
}

export default function ArchitecturePage() {
  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      {/* Nav */}
      <nav className="fixed w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <a href="/"><NodeRailsLogo withText className="w-[220px] h-auto" /></a>
            <div className="hidden md:flex items-center space-x-8">
              <ProductsNavDropdown triggerClassName="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors" />
              <a href="/#developers" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Developers</a>
              <a href="/docs" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Docs</a>
              <a href="/about" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">About</a>
            </div>
            <TrackedLink
              href={`${DASHBOARD_URL}/login`}
              event="landing_login_clicked"
              properties={{ location: 'architecture_nav' }}
              className="hidden sm:inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-full text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm"
            >
              Merchant Login
              <ChevronRight className="h-4 w-4 ml-1" />
            </TrackedLink>
          </div>
        </div>
      </nav>

      <main className="pt-20">
        {/* ═══════════════════════════════════════════════════════════════
            HERO
        ═══════════════════════════════════════════════════════════════ */}
        <section className="py-24 lg:py-32 bg-gradient-to-b from-slate-50/80 to-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center">
              <p className="text-indigo-600 font-semibold text-sm uppercase tracking-wide mb-3">Technical Architecture</p>
              <h1 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight mb-6">
                How NodeRails works
              </h1>
              <p className="text-lg text-slate-600 leading-relaxed">
                Non-custodial crypto payment infrastructure with multi-chain smart contract escrow, a dedicated transaction manager, real-time on-chain event indexing, WallCard for card-first checkout, and a universal checkout session model inspired by Stripe.
              </p>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            1. HIGH-LEVEL SYSTEM OVERVIEW
        ═══════════════════════════════════════════════════════════════ */}
        <section className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionTitle
              label="System Overview"
              title="Platform at a glance"
              description="NodeRails is a monorepo with smart contracts, a unified backend server, four frontend apps, shared packages, and two self-hosted infrastructure services (MTXM and Indexer). Merchants integrate once and accept payments across EVM, Solana, and Sui."
            />
            <DiagramBlock title="">
{`  Merchant Dashboard    Payment UI    Admin Dashboard    Landing / Docs
         |                  |               |                  |
         +--------+---------+-------+-------+                  |
                  |                 |                           |
                  v                 v                           |
           noderails-server (Node.js, port 3000)               |
    ┌──────────────────────────────────────────┐               |
    │  Auth    Apps     API Keys    Webhooks    │               |
    │  Checkout Sessions    Payments    Prices  │               |
    │  Subscriptions   Invoices   Payouts       │               |
    │  Product Plans   Customers   Admin        │               |
    │  Disputes   Tax Rates   Feedback          │               |
    └──────────┬─────────────┬─────────────────┘               |
               │             │                                  |
        ┌──────┘             └──────┐                           |
        v                          v                            |
    PostgreSQL               Redis + BullMQ                     |
    (Prisma 7)            (queues, rate limits)                 |
                                   │                            |
                    ┌──────────────┼──────────────┐             |
                    v              v              v             |
              Webhook Worker  Email Worker  Subscription Worker |
              (retry + HMAC)  (SES + PDF)   (auto-billing)      |
                                                                |
    ┌───────────────────────────────────────────────────────────┘
    │
    │   MTXM (Transaction Manager)      Indexer (Event Listener)
    │       │                                │
    │       v                                v
    │   Signs + broadcasts             Watches contracts/programs
    │   Manages gas, retries           Decodes events (EVM/Solana/Sui)
    │   Webhooks back to server        Webhooks back to server
    │       │                                │
    │       └──────────┬─────────────────────┘
    │                  │
    │                  v
    │       On-chain Escrow Contracts
    │       EVM: NodeRailsEscrow.sol
    │       Solana: noderails_escrow (Anchor)
    │       Sui: noderails_escrow (Move)
    │
    │   WallCard (wallcard.example.local)
    │       Card-first payer wallet
    │       PAN / CVV / PIN / OTP flow
    │       Secure signer (keys never leave secure environment)
    │       Signs Solana + EVM transactions
    └───────────────────────────────────────────────────────────`}
            </DiagramBlock>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            2. SMART CONTRACTS
        ═══════════════════════════════════════════════════════════════ */}
        <section className="py-24 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionTitle
              label="On-chain Layer"
              title="Smart contract escrow"
              description="Every payment is captured into an on-chain escrow contract with timelock protection. Funds cannot be settled until the timelock expires. Buyers can raise disputes during the timelock window. NodeRails never holds funds."
            />

            <div className="grid md:grid-cols-2 gap-8 mb-16">
              <div className="bg-white rounded-2xl p-8 border border-slate-200">
                <h3 className="text-xl font-bold text-slate-900 mb-4">NodeRailsEscrow</h3>
                <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                  Handles payment capture, settlement, disputes, and refunds. Deployed on every supported chain. EVM uses Solidity with EIP-712 signatures. Solana uses an Anchor program. Sui uses Move.
                </p>
                <div className="space-y-3 text-sm">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    <span className="text-slate-700"><strong className="text-slate-900">captureNativePayment / captureERC20Payment</strong> accepts funds into escrow with packed timelocks (capture, dispute window, settlement)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    <span className="text-slate-700"><strong className="text-slate-900">settlePayment</strong> releases funds to merchant after timelock expiry</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    <span className="text-slate-700"><strong className="text-slate-900">initiateDispute</strong> lets buyer raise dispute during timelock (pauses settlement)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    <span className="text-slate-700"><strong className="text-slate-900">resolveDispute</strong> admin resolves in favor of merchant or buyer</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    <span className="text-slate-700"><strong className="text-slate-900">Fee deduction</strong> configurable fee (max 10%) split at settlement between merchant and platform</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-8 border border-slate-200">
                <h3 className="text-xl font-bold text-slate-900 mb-4">NodeRailsMerchantManager</h3>
                <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                  Stateless signature-verified transfer proxy for merchant payouts. No on-chain storage of amounts. All spending limits are tracked in the database. Merchants sign a time-limited session signature, and the backend co-signs to authorize each payout.
                </p>
                <div className="space-y-3 text-sm">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    <span className="text-slate-700"><strong className="text-slate-900">executePayout</strong> dual-signature (merchant session + backend EIP-712) transfer of ERC20 or native tokens</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    <span className="text-slate-700"><strong className="text-slate-900">Replay protection</strong> per-nonce tracking prevents double execution</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    <span className="text-slate-700"><strong className="text-slate-900">Session expiry</strong> merchant signature is time-bounded</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-8 border border-slate-200 max-w-3xl mx-auto">
              <h3 className="text-lg font-semibold text-slate-900 mb-4 text-center">Key hierarchy</h3>
              <pre className="text-sm text-slate-700 leading-relaxed overflow-x-auto">
{`SuperAdmin (multisig recommended)
├── Add/remove Admins
├── Emergency pause/unpause
└── Emergency withdraw

Admin
├── Add/remove TransactionKeys
├── Resolve disputes
└── Configuration changes

TransactionKey (hot wallets for backend)
├── captureERC20Payment / captureNativePayment
├── settlePayment
├── executePayout
└── Day-to-day operations`}
              </pre>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            3. MTXM (Transaction Manager)
        ═══════════════════════════════════════════════════════════════ */}
        <section className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionTitle
              label="Transaction Infrastructure"
              title="MTXM: Transaction Manager"
              description="MTXM is NodeRails' self-hosted transaction lifecycle manager. It handles signing, gas estimation, broadcasting, confirmation tracking, retries, and nonce management across all supported chains. The server never broadcasts transactions directly."
            />

            <div className="grid md:grid-cols-3 gap-8 mb-16">
              <FeatureCard
                icon={Key}
                title="Signing and broadcasting"
                description="MTXM holds transaction signing keys (TransactionKey role). When the server needs to capture a payment or settle funds, it sends structured calldata to MTXM. MTXM signs, estimates gas, broadcasts, and tracks the transaction through confirmation."
              />
              <FeatureCard
                icon={RefreshCw}
                title="Retries and gas management"
                description="If a transaction fails or is stuck, MTXM handles resubmission with bumped gas. Nonce management prevents gaps. On Solana, compute unit limits are capped at protocol maximum (1.4M CUs) and priority fees are configurable."
              />
              <FeatureCard
                icon={Radio}
                title="Webhook confirmation"
                description="When a transaction confirms on-chain, MTXM sends a webhook (tx.confirmed) back to the NodeRails server. The ingest module processes this webhook, verifies the HMAC signature, and updates the PaymentIntent status from CAPTURING to CAPTURED."
              />
            </div>

            <DiagramBlock title="MTXM capture flow">
{`  NodeRails Server                    MTXM                     Blockchain
       │                               │                          │
       │  POST /transactions/send      │                          │
       │  (calldata, chain, signer)    │                          │
       │──────────────────────────────>│                          │
       │                               │  Sign transaction        │
       │                               │  Estimate gas            │
       │                               │  Broadcast               │
       │                               │─────────────────────────>│
       │                               │                          │
       │                               │  Monitor for inclusion   │
       │                               │  Retry if stuck/failed   │
       │                               │<─────────────────────────│
       │                               │  Transaction confirmed   │
       │                               │                          │
       │  POST /webhooks/mtxm          │                          │
       │  (tx.confirmed, HMAC signed)  │                          │
       │<──────────────────────────────│                          │
       │                               │                          │
       │  Update PaymentIntent         │                          │
       │  CAPTURING -> CAPTURED        │                          │
       │  Record captureTxHash         │                          │`}
            </DiagramBlock>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            4. INDEXER
        ═══════════════════════════════════════════════════════════════ */}
        <section className="py-24 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionTitle
              label="On-chain Events"
              title="Multi-chain Indexer"
              description="The NodeRails Indexer is a self-hosted service that watches smart contracts and programs across EVM, Solana, and Sui. It decodes on-chain events, matches them to payment intents, and delivers structured webhooks to the server."
            />

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
              {[
                { icon: Eye, title: 'Contract watching', desc: 'Register any contract address and ABI. The indexer scans blocks and stores matching events.' },
                { icon: Layers, title: 'Multi-protocol', desc: 'Supports EVM (ABI events), Solana (Anchor IDL events and instruction signals), and Sui (Move events).' },
                { icon: Radio, title: 'Webhook delivery', desc: 'HMAC-signed JSON payloads delivered to your endpoint when events match. Includes decoded args and block metadata.' },
                { icon: ArrowRightLeft, title: 'Native transfers', desc: 'Track ETH, SOL, or SUI transfers to watched addresses. Deliver via the same webhook pipeline.' },
              ].map((item) => (
                <div key={item.title} className="bg-white rounded-2xl p-6 border border-slate-200">
                  <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center mb-4">
                    <item.icon className="h-5 w-5 text-indigo-600" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-2">{item.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl p-8 border border-slate-200 max-w-3xl mx-auto">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">How the indexer confirms payments</h3>
              <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                When the escrow contract emits a <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono">PaymentCaptured</code> event, the indexer decodes the <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono">paymentIntentId</code> (bytes32), converts it to UUID, and sends a webhook to the server. The server cross-validates against the Transaction record, verifies the on-chain paymentIntentId matches, and updates status. This provides a second confirmation path independent of MTXM.
              </p>
              <p className="text-sm text-slate-600 leading-relaxed">
                The same pipeline handles <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono">PaymentSettled</code>, <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono">DisputeInitiated</code>, <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono">DisputeResolved</code>, and <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono">PaymentRefunded</code> events with strict state machine validation.
              </p>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            5. CHECKOUT SESSION MODEL
        ═══════════════════════════════════════════════════════════════ */}
        <section className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionTitle
              label="Payment Model"
              title="Universal checkout sessions"
              description="Every payment in NodeRails flows through a CheckoutSession, inspired by Stripe. Payment links, invoices, subscriptions, and direct API calls all create a session first. The session drives the hosted checkout UI and the authorize/capture pipeline."
            />

            <DiagramBlock title="">
{`  Payment Link ──┐
  Invoice ───────┤──> CheckoutSession ──> PaymentIntent ──> MTXM ──> Escrow
  Subscription ──┤                              │
  Direct API ────┘                              │
                                                v
                                         Transaction record
                                                │
                                     ┌──────────┼──────────┐
                                     v          v          v
                               MTXM webhook  Indexer    Merchant
                               (confirms)    (verifies)  webhook`}
            </DiagramBlock>

            <div className="grid md:grid-cols-2 gap-8 mt-16">
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-slate-900">Payment link checkout flow</h3>
                <ol className="space-y-3 text-sm text-slate-600">
                  {[
                    'Customer visits /link/{slug} on the hosted payment UI',
                    'Frontend calls POST /checkout-sessions/from-link with the slug (public, no auth)',
                    'Server loads the payment link, resolves accepted chains and tokens from app config (App intersection with Link restrictions), creates a CheckoutSession',
                    'Returns session data with resolved chains, tokens, merchant display info, and product details',
                    'Customer selects chain, selects token, connects wallet',
                    'Customer signs permit (gasless EIP-2612) or approves (standard ERC20) or sends native transfer',
                    'Frontend calls POST /checkout/authorize with checkoutSessionId, wallet, chain, token, and authorization data',
                    'Server validates session (OPEN, not expired), validates chain/token/price, creates PaymentIntent, marks session COMPLETE',
                    'Server submits capture calldata to MTXM',
                    'MTXM broadcasts, confirms, sends webhook back. PaymentIntent moves to CAPTURED',
                  ].map((step, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-slate-900">Three authorization methods</h3>
                <div className="space-y-4">
                  <div className="bg-slate-50 rounded-xl p-5">
                    <h4 className="font-semibold text-slate-900 mb-1">Native Transfer</h4>
                    <p className="text-sm text-slate-600">User sends tokens directly from their wallet to the escrow contract. The frontend monitors for the transaction and reports capture to the server.</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-5">
                    <h4 className="font-semibold text-slate-900 mb-1">EIP-2612 Permit (gasless)</h4>
                    <p className="text-sm text-slate-600">User signs an off-chain permit. The server verifies the signature, simulates the permit call, then submits the capture transaction via MTXM. The user pays no gas.</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-5">
                    <h4 className="font-semibold text-slate-900 mb-1">EIP-7702 Delegation</h4>
                    <p className="text-sm text-slate-600">Account abstraction delegation for advanced flows. The wallet delegates execution to the escrow via EIP-7702, enabling batched or sponsored transactions.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            6. PAYMENT STATUS LIFECYCLE
        ═══════════════════════════════════════════════════════════════ */}
        <section className="py-24 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionTitle
              label="State Machines"
              title="Payment, subscription, and invoice lifecycles"
              description="Every entity follows a strict state machine. Status transitions are validated both in the server and by on-chain events. Invalid transitions are rejected."
            />
            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-white rounded-2xl p-6 border border-slate-200">
                <h3 className="font-semibold text-slate-900 mb-3">Payment intent</h3>
                <pre className="text-xs text-slate-600 leading-relaxed overflow-x-auto">
{`CREATED
  -> AUTHORIZED
    -> CAPTURING
      -> CAPTURED
        -> SETTLED
        -> DISPUTED
          -> DISPUTE_RESOLVED
          -> REFUNDED
      -> CAPTURE_FAILED
  -> EXPIRED
  -> CANCELLED`}
                </pre>
              </div>
              <div className="bg-white rounded-2xl p-6 border border-slate-200">
                <h3 className="font-semibold text-slate-900 mb-3">Subscription</h3>
                <pre className="text-xs text-slate-600 leading-relaxed overflow-x-auto">
{`CREATED
  -> TRIALING
    -> ACTIVE
  -> ACTIVE
    -> PAUSED -> ACTIVE
    -> PAST_DUE
      -> CANCELLED
    -> CANCELLED`}
                </pre>
              </div>
              <div className="bg-white rounded-2xl p-6 border border-slate-200">
                <h3 className="font-semibold text-slate-900 mb-3">Invoice</h3>
                <pre className="text-xs text-slate-600 leading-relaxed overflow-x-auto">
{`DRAFT
  -> OPEN -> PAID
  -> VOID
OPEN
  -> PAST_DUE
    -> UNCOLLECTIBLE
  -> VOID`}
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            7. WALLCARD
        ═══════════════════════════════════════════════════════════════ */}
        <section className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionTitle
              label="Payer Experience"
              title="WallCard: pay with a card, sign like a wallet"
              description="WallCard is the wallet shoppers see at checkout. Instead of installing a browser extension, they enter a card number, CVV, PIN, and OTP. Behind the scenes, WallCard runs a secure signer that signs blockchain transactions. Keys never leave the secure environment."
            />

            <div className="grid md:grid-cols-2 gap-8 mb-16">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-900">How WallCard works</h3>
                <ol className="space-y-3 text-sm text-slate-600">
                  <li className="flex gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-red-100 text-red-700 text-xs font-bold flex items-center justify-center">1</span>
                    <span>Shopper enters card details (PAN, CVV, expiry) at checkout</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-red-100 text-red-700 text-xs font-bold flex items-center justify-center">2</span>
                    <span>WallCard validates identity via PIN and OTP</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-red-100 text-red-700 text-xs font-bold flex items-center justify-center">3</span>
                    <span>Secure signer constructs and signs the blockchain transaction (Solana message signing, EVM typed data, or transaction send)</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-red-100 text-red-700 text-xs font-bold flex items-center justify-center">4</span>
                    <span>Signed transaction flows through the standard NodeRails capture pipeline (MTXM broadcast, indexer confirmation)</span>
                  </li>
                </ol>
              </div>
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-900">WallCard vs browser wallets</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="py-2 pr-4 font-semibold text-slate-900"></th>
                        <th className="py-2 pr-4 font-semibold text-slate-900">WallCard</th>
                        <th className="py-2 font-semibold text-slate-900">Browser wallet</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-600">
                      <tr className="border-b border-slate-100"><td className="py-2 pr-4 font-medium text-slate-900">Onboarding</td><td className="py-2 pr-4">Card details</td><td className="py-2">Install extension + seed phrase</td></tr>
                      <tr className="border-b border-slate-100"><td className="py-2 pr-4 font-medium text-slate-900">Key storage</td><td className="py-2 pr-4">Secure signer</td><td className="py-2">Browser extension</td></tr>
                      <tr className="border-b border-slate-100"><td className="py-2 pr-4 font-medium text-slate-900">Chains</td><td className="py-2 pr-4">Solana + EVM (Stellar planned)</td><td className="py-2">Per extension</td></tr>
                      <tr className="border-b border-slate-100"><td className="py-2 pr-4 font-medium text-slate-900">NodeRails custody</td><td className="py-2 pr-4">No</td><td className="py-2">No</td></tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-sm text-slate-600">
                  WallCard is live at <a href="https://example.local" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-700 font-medium">wallcard.example.local</a>. Developers interact with the same <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono">provider.request</code> surface they use with MetaMask or Phantom.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            8. MERCHANT PRODUCTS
        ═══════════════════════════════════════════════════════════════ */}
        <section className="py-24 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionTitle
              label="Merchant Features"
              title="Products and capabilities"
              description="Everything a merchant needs to accept crypto payments, bill recurring customers, issue invoices, manage payouts, and handle disputes."
            />
            <div className="grid md:grid-cols-3 gap-6">
              <FeatureCard icon={CreditCard} title="Payments and checkout" description="Accept crypto via hosted checkout pages, embeddable payment links, or direct API. Three authorization methods (native transfer, permit, EIP-7702). Funds settle directly to the merchant wallet." />
              <FeatureCard icon={Link2} title="Payment links" description="Generate shareable URLs for any amount. Slug-based routing, optional fixed amounts, per-link chain and token restrictions, usage tracking. Support subscription product plans for recurring billing via link." />
              <FeatureCard icon={RefreshCw} title="Subscriptions" description="Recurring billing with product plans, pricing tiers, billing intervals (day/week/month/year), trial periods, and auto-charge via capped ERC20 permit. Pause, resume, cancel with period-end option." />
              <FeatureCard icon={FileText} title="Invoices" description="Create invoices with line items, sequential numbering, customer accounts, tax rates, and payment emails via Amazon SES. Invoice checkout reuses the same payment pipeline." />
              <FeatureCard icon={Shield} title="Disputes and refunds" description="On-chain dispute resolution during the timelock window. Buyer portal with OTP-based cookie sessions. Admin resolves in favor of merchant or buyer. Automatic refund execution." />
              <FeatureCard icon={ArrowRightLeft} title="Payouts" description="Merchant outbound transfers via MerchantManager contract. Dual-signature (merchant session + backend) authorization. Wallet snapshot at creation prevents mid-flight address changes from affecting pending payouts." />
              <FeatureCard icon={Users} title="Customer accounts" description="Per-app customer records with billing address, linked wallets across chains, and external ID mapping. Customers are linked to payments, invoices, and subscriptions." />
              <FeatureCard icon={Database} title="Product plans and pricing" description="One-time or subscription products with multiple pricing options per plan. Billing intervals, default price selection, and dashboard management with image previews." />
              <FeatureCard icon={Globe} title="Multi-chain admin" description="Platform admin manages supported chains and tokens. Merchants enable specific chains and tokens per app. Disable cascade: turning off a chain at admin level auto-disables all tokens and merchant toggles on that chain." />
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            9. SECURITY AND COMPLIANCE
        ═══════════════════════════════════════════════════════════════ */}
        <section className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionTitle
              label="Security"
              title="Security, compliance, and audit trail"
              description="NodeRails is non-custodial by design. Funds flow through audited smart contracts, not our servers. Every wallet change is logged, every webhook is HMAC-verified, and every state transition is validated."
            />
            <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {[
                { icon: Lock, title: 'Non-custodial model', desc: 'All funds flow through on-chain escrow contracts. NodeRails orchestrates but never holds merchant or buyer funds. Settlement goes directly to merchant wallet.' },
                { icon: Shield, title: 'Wallet change audit trail', desc: 'Every wallet address change is logged in an immutable WalletChangeLog with previous address, new address, signature, and in-flight payment counts. PayoutIntents snapshot the active wallet at creation.' },
                { icon: Key, title: 'HMAC webhook verification', desc: 'All inbound webhooks (MTXM, Indexer, partner callbacks) are verified with HMAC-SHA256 signatures. Outbound merchant webhooks are signed the same way with per-webhook secrets.' },
                { icon: AlertTriangle, title: 'AML/CFT compliance', desc: 'Published compliance policy at example.local/compliance. Merchant KYC gates, suspension controls, and optional wallet screening before treasury release.' },
                { icon: Zap, title: 'Rate limiting and abuse prevention', desc: 'Per-endpoint rate limiting, Zod input validation, honeypot fields on public forms, IP hashing for privacy-safe abuse monitoring, and attack pattern rejection.' },
                { icon: Eye, title: 'Permit simulation', desc: 'Before submitting a permit-based capture, the server simulates the permit call on-chain. Invalid signatures, domain mismatches, or insufficient allowances fail fast instead of causing opaque contract reverts.' },
              ].map((item) => (
                <div key={item.title} className="bg-slate-50 rounded-xl p-6 flex items-start gap-4">
                  <div className="shrink-0 w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                    <item.icon className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-1">{item.title}</h4>
                    <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            10. STELLAR INTEGRATION
        ═══════════════════════════════════════════════════════════════ */}
        <section className="py-24 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionTitle
              label="Stellar"
              title="Stellar integration plan"
              description="NodeRails is adding Stellar as a first-class chain. The same checkout session model, payment intent lifecycle, and merchant dashboard experience extend to Stellar using ecosystem building blocks and WallCard."
            />

            <DiagramBlock title="Stellar payment flow (target state)">
{`  Payer arrives at checkout
      │
      ├── Stellar Wallets Kit  (existing Stellar wallet, e.g. Freighter)
      ├── Privy                (embedded email/social wallet)
      ├── WallCard             (card-first, Stellar transaction signing)
      │
      v
  NodeRails authorize -> PaymentIntent (chain: Stellar)
      │
      ├── Direct Stellar path
      │     Wallet-signed Stellar payment
      │
      ├── CCTP path
      │     USDC from EVM chain -> Stellar USDC (burn/mint)
      │
      ├── Mercuryo path
      │     Fiat on-ramp -> Stellar USDC before checkout
      │
      v
  Bridge settlement adapter
      │
      ├── Bridge webhooks -> ingest -> CAPTURED
      ├── DFNS signing custody for server-side transactions
      ├── Axelar cross-chain treasury sync (EVM <-> Stellar)
      │
      v
  Timelock / settlement logic -> merchant payout
      │
      v
  Anchor Platform (SEP-24/SEP-31 for fiat corridor where required)`}
            </DiagramBlock>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-16">
              {[
                { name: 'Stellar Wallets Kit', role: 'Payer wallet connection in hosted checkout. Freighter and other Stellar wallets.', time: 'Under 1 day' },
                { name: 'Privy', role: 'Embedded email and social wallets for new-to-crypto payers.', time: 'Under 1 day' },
                { name: 'WallCard', role: 'Card-first checkout with Stellar transaction signing. Internal product.', time: 'Internal' },
                { name: 'Mercuryo', role: 'Fiat to Stellar USDC on-ramp before checkout.', time: '1-2 weeks' },
                { name: 'Bridge', role: 'Stellar settlement, treasury, and merchant payout rails.', time: '1-5 days' },
                { name: 'CCTP (Circle)', role: 'Native 1:1 USDC from EVM chains into Stellar USDC.', time: '1-5 days' },
                { name: 'Axelar', role: 'Cross-chain treasury reconciliation across EVM, Solana, and Stellar.', time: 'TBD' },
                { name: 'DFNS', role: 'HSM-backed signing custody for platform and merchant Stellar wallets.', time: '1-5 days' },
                { name: 'Anchor Platform', role: 'SEP-compliant deposit and withdraw for merchant fiat corridors.', time: '1+ month' },
              ].map((item) => (
                <div key={item.name} className="bg-white rounded-xl p-5 border border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-slate-900 text-sm">{item.name}</h4>
                    <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full whitespace-nowrap">{item.time}</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{item.role}</p>
                </div>
              ))}
            </div>

            <div className="mt-16 max-w-3xl mx-auto">
              <h3 className="text-lg font-semibold text-slate-900 mb-4 text-center">What changes per component</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="py-3 pr-4 font-semibold text-slate-900">Component</th>
                      <th className="py-3 font-semibold text-slate-900">Stellar addition</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-600">
                    <tr className="border-b border-slate-100"><td className="py-3 pr-4 font-medium text-slate-900">Database</td><td className="py-3">STELLAR chain type enum, Stellar testnet and mainnet in supported_chains</td></tr>
                    <tr className="border-b border-slate-100"><td className="py-3 pr-4 font-medium text-slate-900">Admin</td><td className="py-3">Enable Stellar assets (USDC, XLM) per app</td></tr>
                    <tr className="border-b border-slate-100"><td className="py-3 pr-4 font-medium text-slate-900">payment-ui</td><td className="py-3">Wallets Kit + Privy + WallCard wallet picker, Mercuryo on-ramp widget, Stellar asset selection</td></tr>
                    <tr className="border-b border-slate-100"><td className="py-3 pr-4 font-medium text-slate-900">noderails-server</td><td className="py-3">Stellar authorize/capture handlers, Bridge adapter, CCTP bridge flow, Anchor flows</td></tr>
                    <tr className="border-b border-slate-100"><td className="py-3 pr-4 font-medium text-slate-900">Ingest</td><td className="py-3">Bridge, CCTP, Axelar, and Anchor webhook handlers with HMAC verification</td></tr>
                    <tr className="border-b border-slate-100"><td className="py-3 pr-4 font-medium text-slate-900">DFNS</td><td className="py-3">Platform Stellar wallets, server-side Stellar transaction signing</td></tr>
                    <tr className="border-b border-slate-100"><td className="py-3 pr-4 font-medium text-slate-900">WallCard</td><td className="py-3">Stellar keypair generation, Stellar XDR transaction construction in secure signer</td></tr>
                    <tr className="border-b border-slate-100"><td className="py-3 pr-4 font-medium text-slate-900">Dashboard</td><td className="py-3">Stellar balance, payout initiation, settlement history, Anchor corridor status</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 bg-gradient-to-r from-indigo-600 to-indigo-700">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Start building with NodeRails</h2>
            <p className="text-lg text-indigo-100 mb-8 max-w-2xl mx-auto">
              Read the API docs, explore the SDK, or create a merchant account to start accepting crypto payments.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <TrackedLink
                href={`${DASHBOARD_URL}/login`}
                event="arch_cta_clicked"
                properties={{ location: 'architecture_bottom_cta' }}
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full text-indigo-600 bg-white hover:bg-indigo-50 transition-colors shadow-lg"
              >
                Create Your Account
              </TrackedLink>
              <a
                href="/docs"
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full text-white border-2 border-white/30 hover:bg-white/10 transition-colors"
              >
                Read the Docs
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="col-span-2 md:col-span-1">
              <NodeRailsLogo withText className="w-[160px] h-auto brightness-200" />
              <p className="mt-4 text-sm text-slate-500">Crypto payment infrastructure for modern businesses.</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Products</h3>
              <ul className="space-y-3 text-sm">
                <li><a href="/products/payments" className="hover:text-white transition-colors">Payments</a></li>
                <li><a href="/products/checkout" className="hover:text-white transition-colors">Checkout</a></li>
                <li><a href="/products/payment-links" className="hover:text-white transition-colors">Payment Links</a></li>
                <li><a href="/products/subscriptions" className="hover:text-white transition-colors">Subscriptions</a></li>
                <li><a href="/products/invoicing" className="hover:text-white transition-colors">Invoicing</a></li>
                <li><a href="/products/payouts" className="hover:text-white transition-colors">Payouts</a></li>
                <li><a href="/products/bank" className="hover:text-white transition-colors">Bank</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Developers</h3>
              <ul className="space-y-3 text-sm">
                <li><a href="/docs" className="hover:text-white transition-colors">Documentation</a></li>
                <li><a href="/docs/api-reference/checkout-sessions" className="hover:text-white transition-colors">API Reference</a></li>
                <li><a href="/architecture" className="hover:text-white transition-colors">Architecture</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Company</h3>
              <ul className="space-y-3 text-sm">
                <li><a href="/about" className="hover:text-white transition-colors">About</a></li>
                <li><a href="/compliance" className="hover:text-white transition-colors">Compliance</a></li>
                <li><a href="/privacy" className="hover:text-white transition-colors">Privacy</a></li>
                <li><a href="/terms" className="hover:text-white transition-colors">Terms</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 mt-12 pt-8 text-center text-xs text-slate-500">
            &copy; {new Date().getFullYear()} Maartandrise International Ventures Pvt. Ltd. All rights reserved.
          </div>
        </div>
      </footer>
      <FeedbackWidget />
    </div>
  );
}
