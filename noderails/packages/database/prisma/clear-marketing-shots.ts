import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../envs/backend.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const APP_ID = '2f07b892-3527-4ab4-91b5-52b30303c6b8';
const SHOT_TAX = ['US sales tax', 'Germany VAT', 'UK VAT', 'Canada GST'];

async function main() {
  const app =
    (await prisma.app.findUnique({ where: { id: APP_ID } })) ??
    (await prisma.app.findFirst({ where: { name: 'Cursor' } }));
  if (!app) throw new Error('Cursor app not found');

  const links = await prisma.paymentLink.findMany({
    where: { appId: app.id, metadata: { path: ['marketingShot'], equals: true } },
    select: { id: true },
  });
  const linkIds = links.map((row) => row.id);

  const plans = await prisma.productPlan.findMany({
    where: { appId: app.id, metadata: { path: ['marketingShot'], equals: true } },
    select: { id: true },
  });
  const planIds = plans.map((row) => row.id);

  if (linkIds.length) {
    const sessions = await prisma.checkoutSession.deleteMany({
      where: { appId: app.id, sourceId: { in: linkIds } },
    });
    console.log(`checkout sessions ${sessions.count}`);
  }

  const payments = await prisma.paymentIntent.deleteMany({
    where: {
      appId: app.id,
      OR: [
        { idempotencyKey: { startsWith: 'mkt_' } },
        { metadata: { path: ['marketingShot'], equals: true } },
      ],
    },
  });
  const invoices = await prisma.invoice.deleteMany({
    where: { appId: app.id, invoiceNumber: { startsWith: 'MKT-' } },
  });
  const subscriptions = await prisma.subscription.deleteMany({
    where: { appId: app.id, metadata: { path: ['marketingShot'], equals: true } },
  });
  const paymentLinks = await prisma.paymentLink.deleteMany({
    where: { appId: app.id, metadata: { path: ['marketingShot'], equals: true } },
  });
  const productPlans = planIds.length
    ? await prisma.productPlan.deleteMany({ where: { id: { in: planIds } } })
    : { count: 0 };
  const customers = await prisma.customerAccount.deleteMany({
    where: { appId: app.id, externalId: { startsWith: 'mkt_' } },
  });
  const taxRates = await prisma.taxRate.deleteMany({
    where: { merchantId: app.merchantId, displayName: { in: SHOT_TAX } },
  });

  console.log(
    JSON.stringify({
      appId: app.id,
      payments: payments.count,
      invoices: invoices.count,
      subscriptions: subscriptions.count,
      paymentLinks: paymentLinks.count,
      productPlans: productPlans.count,
      customers: customers.count,
      taxRates: taxRates.count,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
