import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../envs/backend.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const MARK = { marketingShot: true } as const;
const APP_HINT = '2f07b892-3527-4ab4-91b5-52b30303c6b8';

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function wallet(seed: number): string {
  return `0x${(seed.toString(16) + 'a1b2c3d4e5f60789').repeat(4).slice(0, 40)}`;
}

function txHash(seed: number): string {
  return `0x${(seed.toString(16) + 'c0ffee').repeat(12).slice(0, 64)}`;
}

function units(usd: number, decimals: number): string {
  return BigInt(Math.round(usd * 10 ** decimals)).toString();
}

async function main() {
  const app =
    (await prisma.app.findUnique({ where: { id: APP_HINT } })) ??
    (await prisma.app.findFirst({ where: { name: 'Cursor' } })) ??
    (await prisma.app.findFirst({ orderBy: { createdAt: 'desc' } }));

  if (!app) throw new Error('No merchant app found to seed');

  const [appChains, appTokens] = await Promise.all([
    prisma.appChain.findMany({ where: { appId: app.id, isEnabled: true }, select: { chainId: true } }),
    prisma.appToken.findMany({
      where: { appId: app.id, isEnabled: true },
      select: { supportedToken: { select: { tokenKey: true } } },
    }),
  ]);

  const chainIds = appChains.map((row) => row.chainId);
  const tokenKeys = appTokens.map((row) => row.supportedToken.tokenKey);
  const chainId = chainIds[0] ?? 11155111;
  const tokenKey = tokenKeys.find((key) => key.toUpperCase().startsWith('USDC')) ?? tokenKeys[0] ?? `USDC-${chainId}`;
  const decimals = tokenKey.toUpperCase().includes('USDC') || tokenKey.toUpperCase().includes('USDT') ? 6 : 18;

  console.log(`Seeding marketing shots on app ${app.name} (${app.id})`);
  console.log(`Chains ${chainIds.join(',') || 'none'} · token ${tokenKey}`);

  await prisma.paymentIntent.deleteMany({ where: { appId: app.id, idempotencyKey: { startsWith: 'mkt_' } } });
  await prisma.invoice.deleteMany({ where: { appId: app.id, invoiceNumber: { startsWith: 'MKT-' } } });
  await prisma.subscription.deleteMany({ where: { appId: app.id, metadata: { path: ['marketingShot'], equals: true } } });
  await prisma.paymentLink.deleteMany({ where: { appId: app.id, metadata: { path: ['marketingShot'], equals: true } } });
  await prisma.productPlan.deleteMany({ where: { appId: app.id, metadata: { path: ['marketingShot'], equals: true } } });
  await prisma.customerAccount.deleteMany({ where: { appId: app.id, externalId: { startsWith: 'mkt_' } } });

  const customerRows = [
    { externalId: 'mkt_acme', name: 'Acme Robotics', email: 'ap@acmerobotics.com', city: 'San Francisco', country: 'US' },
    { externalId: 'mkt_northwind', name: 'Northwind Labs', email: 'finance@northwindlabs.io', city: 'Austin', country: 'US' },
    { externalId: 'mkt_helios', name: 'Helios Commerce', email: 'pay@helios.store', city: 'Berlin', country: 'DE' },
    { externalId: 'mkt_lumen', name: 'Lumen Studio', email: 'hello@lumen.studio', city: 'London', country: 'GB' },
    { externalId: 'mkt_orbit', name: 'Orbit Freight', email: 'billing@orbitfreight.com', city: 'Singapore', country: 'SG' },
    { externalId: 'mkt_vertex', name: 'Vertex Markets', email: 'ops@vertexmarkets.com', city: 'New York', country: 'US' },
    { externalId: 'mkt_sable', name: 'Sable Media', email: 'accounts@sable.media', city: 'Toronto', country: 'CA' },
    { externalId: 'mkt_pine', name: 'Pine Analytics', email: 'cfo@pineanalytics.com', city: 'Chicago', country: 'US' },
    { externalId: 'mkt_harbor', name: 'Harbor Pay', email: 'treasury@harborpay.co', city: 'Dublin', country: 'IE' },
    { externalId: 'mkt_nimbus', name: 'Nimbus AI', email: 'founders@nimbus.ai', city: 'Seoul', country: 'KR' },
    { externalId: 'mkt_copper', name: 'Copper Ledger', email: 'ap@copperledger.com', city: 'Sydney', country: 'AU' },
    { externalId: 'mkt_atlas', name: 'Atlas Guild', email: 'team@atlasguild.xyz', city: 'Lisbon', country: 'PT' },
  ];

  const customers = [];
  for (const row of customerRows) {
    customers.push(await prisma.customerAccount.create({
      data: {
        appId: app.id,
        ...row,
        address: '120 Market Street',
        metadata: MARK,
      },
    }));
  }

  const statuses = [
    'SETTLED', 'SETTLED', 'SETTLED', 'SETTLED', 'SETTLED', 'SETTLED',
    'CAPTURED', 'CAPTURED', 'CAPTURED', 'CAPTURED',
    'AUTHORIZED', 'CREATED', 'REFUNDED', 'PARTIALLY_REFUNDED',
  ] as const;
  const amounts = [
    28500, 24900, 18600, 15000, 12500, 9800, 8900, 7200, 6400, 4990,
    3600, 2800, 2400, 1840, 1500, 1200, 990, 890, 640, 490,
    390, 249, 199, 149, 129, 99, 79, 49,
  ];
  const sources = ['PAYMENT_LINK', 'CHECKOUT_SESSION', 'INVOICE', 'API', 'SUBSCRIPTION'] as const;

  for (let i = 0; i < 70; i += 1) {
    const status = statuses[i % statuses.length];
    const amount = amounts[i % amounts.length];
    const customer = customers[i % customers.length];
    const createdAt = new Date(Date.now() - i * 38 * 60 * 1000);
    const captured = status === 'CREATED' || status === 'AUTHORIZED' ? null : new Date(createdAt.getTime() + 20 * 60 * 1000);
    const settled = status === 'SETTLED' ? new Date(createdAt.getTime() + 3 * 24 * 60 * 60 * 1000) : null;
    const useChain = chainIds[i % Math.max(chainIds.length, 1)] ?? chainId;
    const useToken = tokenKeys[i % Math.max(tokenKeys.length, 1)] ?? tokenKey;

    await prisma.paymentIntent.create({
      data: {
        appId: app.id,
        customerAccountId: customer.id,
        externalId: `INV-${2400 + i}`,
        idempotencyKey: `mkt_${String(i + 1).padStart(3, '0')}`,
        amount,
        currency: 'USD',
        status,
        sourceType: sources[i % sources.length],
        captureMode: 'AUTOMATIC',
        platformFeeBps: 100,
        authorizationMethod: status === 'CREATED' ? null : 'PERMIT',
        authorizationChainId: status === 'CREATED' ? null : useChain,
        authorizationTokenKey: status === 'CREATED' ? null : useToken,
        authorizationWalletAddress: status === 'CREATED' ? null : wallet(i + 11),
        authorizationTxHash: status === 'CREATED' ? null : txHash(i + 100),
        authorizedAt: status === 'CREATED' ? null : createdAt,
        cryptoAmount: status === 'CREATED' ? null : units(amount, decimals),
        cryptoTokenKey: status === 'CREATED' ? null : useToken,
        cryptoTokenDecimals: status === 'CREATED' ? null : decimals,
        exchangeRate: status === 'CREATED' ? null : 1,
        captureTxHash: captured ? txHash(i + 200) : null,
        capturedAt: captured,
        settleAmount: captured ? units(amount * 0.99, decimals) : null,
        promisedSettlementAmount: captured ? units(amount * 0.99, decimals) : null,
        settledAt: settled,
        refundedAt: status === 'REFUNDED' ? daysAgo(2) : null,
        metadata: MARK,
        createdAt,
        updatedAt: createdAt,
      },
    });
  }

  const links = [
    { slug: 'pro-annual', name: 'Pro annual', amount: 990, usageCount: 86 },
    { slug: 'onboarding-deposit', name: 'Onboarding deposit', amount: 2500, usageCount: 41 },
    { slug: 'invoice-retainer', name: 'Invoice retainer', amount: 4800, usageCount: 19 },
    { slug: 'enterprise-kickoff', name: 'Enterprise kickoff', amount: 15000, usageCount: 7 },
    { slug: 'usage-topup', name: 'Usage top-up', amount: 249, usageCount: 128 },
    { slug: 'wallcard-demo', name: 'WallCard demo', amount: 49, usageCount: 214 },
  ];
  for (const link of links) {
    await prisma.paymentLink.create({
      data: {
        appId: app.id,
        ...link,
        currency: 'USD',
        description: `${link.name} billed in USDC`,
        isActive: true,
        metadata: MARK,
      },
    });
  }

  const pro = await prisma.productPlan.create({
    data: {
      appId: app.id,
      name: 'NodeRails Pro',
      description: 'Hosted checkout, payouts, and settlement',
      planType: 'SUBSCRIPTION',
      isActive: true,
      metadata: MARK,
      prices: {
        create: [
          { appId: app.id, amount: 99, currency: 'USD', billingInterval: 'MONTH', billingIntervalCount: 1, nickname: 'Monthly', isDefault: true, sortOrder: 0 },
          { appId: app.id, amount: 990, currency: 'USD', billingInterval: 'YEAR', billingIntervalCount: 1, nickname: 'Annual', sortOrder: 1 },
        ],
      },
    },
    include: { prices: true },
  });
  const monthly = pro.prices.find((price) => price.nickname === 'Monthly') ?? pro.prices[0];

  for (let i = 0; i < 8; i += 1) {
    const customer = customers[i];
    await prisma.subscription.create({
      data: {
        appId: app.id,
        customerAccountId: customer.id,
        productPlanId: pro.id,
        productPlanPriceId: monthly.id,
        status: i === 7 ? 'PAST_DUE' : 'ACTIVE',
        authorizationChainId: chainId,
        authorizationTokenKey: tokenKey,
        currentPeriodStart: daysAgo(12),
        currentPeriodEnd: daysAgo(-18),
        billingCycleAnchor: daysAgo(12),
        metadata: MARK,
      },
    });
  }

  for (let i = 0; i < 8; i += 1) {
    const customer = customers[i];
    const total = [390, 890, 1200, 2400, 4990, 7200, 8900, 12500][i];
    const status = i < 5 ? 'PAID' : i === 5 ? 'OPEN' : 'PAST_DUE';
    await prisma.invoice.create({
      data: {
        appId: app.id,
        customerAccountId: customer.id,
        invoiceNumber: `MKT-${2026}${String(i + 1).padStart(3, '0')}`,
        status,
        subtotal: total,
        taxAmount: Math.round(total * 0.08),
        total: Math.round(total * 1.08),
        currency: 'USD',
        dueDate: daysAgo(status === 'PAID' ? 20 : -5),
        paidAt: status === 'PAID' ? daysAgo(18) : null,
        memo: 'Settlement and platform usage',
        metadata: MARK,
        items: {
          create: [{ description: 'NodeRails settlement usage', amount: total, currency: 'USD', quantity: 1 }],
        },
      },
    });
  }

  const counts = await Promise.all([
    prisma.paymentIntent.count({ where: { appId: app.id } }),
    prisma.paymentIntent.aggregate({
      where: { appId: app.id, status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED', 'SETTLED'] } },
      _sum: { amount: true },
    }),
  ]);
  console.log(`Payments now ${counts[0]}. Captured+settled volume $${counts[1]._sum.amount ?? 0}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
