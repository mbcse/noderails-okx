import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../envs/backend.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const appId = '2f07b892-3527-4ab4-91b5-52b30303c6b8';

async function main() {
  const [total, captured, settled, volume, payments, customers, links, invoices, subs, plans] = await Promise.all([
    prisma.paymentIntent.count({ where: { appId } }),
    prisma.paymentIntent.count({ where: { appId, status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] } } }),
    prisma.paymentIntent.count({ where: { appId, status: 'SETTLED' } }),
    prisma.paymentIntent.aggregate({
      where: { appId, status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED', 'SETTLED'] } },
      _sum: { amount: true },
    }),
    prisma.paymentIntent.findMany({
      where: { appId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { customerAccount: true },
    }),
    prisma.customerAccount.findMany({ where: { appId }, orderBy: { createdAt: 'desc' }, take: 10 }),
    prisma.paymentLink.findMany({ where: { appId }, orderBy: { usageCount: 'desc' }, take: 8 }),
    prisma.invoice.findMany({ where: { appId }, orderBy: { createdAt: 'desc' }, take: 8, include: { customerAccount: true } }),
    prisma.subscription.findMany({ where: { appId }, orderBy: { createdAt: 'desc' }, take: 8, include: { customerAccount: true, productPlan: true, productPlanPrice: true } }),
    prisma.productPlan.findMany({ where: { appId }, include: { prices: true } }),
  ]);

  const slim = {
    total,
    captured,
    settled,
    volume: Number(volume._sum.amount ?? 0),
    payments: payments.map((p) => ({
      id: p.id.slice(0, 8),
      amount: Number(p.amount),
      status: p.status,
      customer: p.customerAccount?.name,
      email: p.customerAccount?.email,
      token: p.cryptoTokenKey,
      createdAt: p.createdAt,
      externalId: p.externalId,
    })),
    customers: customers.map((c) => ({ name: c.name, email: c.email, city: c.city, country: c.country })),
    links: links.map((l) => ({ name: l.name, slug: l.slug, amount: Number(l.amount), usageCount: l.usageCount })),
    invoices: invoices.map((i) => ({
      number: i.invoiceNumber,
      total: Number(i.total),
      status: i.status,
      customer: i.customerAccount.name,
    })),
    subs: subs.map((s) => ({
      customer: s.customerAccount.name,
      plan: s.productPlan.name,
      amount: Number(s.productPlanPrice.amount),
      status: s.status,
    })),
    plans: plans.map((p) => ({
      name: p.name,
      type: p.planType,
      prices: p.prices.map((price) => ({ nick: price.nickname, amount: Number(price.amount) })),
    })),
  };
  console.log(JSON.stringify(slim, null, 2));
}

main().finally(() => prisma.$disconnect());
