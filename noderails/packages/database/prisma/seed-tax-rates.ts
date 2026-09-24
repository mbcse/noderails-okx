import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../envs/backend.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const app = await prisma.app.findUnique({
  where: { id: '2f07b892-3527-4ab4-91b5-52b30303c6b8' },
  select: { merchantId: true },
});
if (!app) throw new Error('app missing');

await prisma.taxRate.deleteMany({
  where: { merchantId: app.merchantId, displayName: { in: ['US sales tax', 'Germany VAT', 'UK VAT', 'Canada GST'] } },
});
await prisma.taxRate.createMany({
  data: [
    { merchantId: app.merchantId, displayName: 'US sales tax', percentage: 8, inclusive: false, jurisdiction: 'US' },
    { merchantId: app.merchantId, displayName: 'Germany VAT', percentage: 19, inclusive: true, jurisdiction: 'DE' },
    { merchantId: app.merchantId, displayName: 'UK VAT', percentage: 20, inclusive: true, jurisdiction: 'GB' },
    { merchantId: app.merchantId, displayName: 'Canada GST', percentage: 5, inclusive: false, jurisdiction: 'CA' },
  ],
});
console.log('tax rates ready');
await prisma.$disconnect();
