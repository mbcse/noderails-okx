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

const app = await prisma.app.findUnique({
  where: { id: appId },
  select: {
    id: true,
    name: true,
    merchant: { select: { id: true, email: true, role: true } },
  },
});
if (!app?.merchant) throw new Error('Cursor merchant not found');
process.stdout.write(JSON.stringify({ appId: app.id, appName: app.name, ...app.merchant }));
await prisma.$disconnect();
