import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '../config/index.js';
import fs from 'fs';
import path from 'path';

const caPath = path.resolve(process.cwd(), 'src/ca.pem');
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};
const connectionString =
  config.databaseUrl || process.env.DATABASE_URL || "postgresql://submission:disabled@127.0.0.1:1/disabled";

const isRds = /\.rds\.(amazonaws|amazon)\./i.test(connectionString);
const useInsecureSsl =
  process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "false" || isRds;
const sslOption = useInsecureSsl ? { rejectUnauthorized: false } : undefined;


const adapter = new PrismaPg({
  connectionString,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  ...(sslOption && { ssl: sslOption }),
});


export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ['error'],
  });

if (config.isDev) {
  globalForPrisma.prisma = prisma;
}

export default prisma;
