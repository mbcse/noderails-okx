import { PrismaClient } from '@prisma/client';

let db: PrismaClient | null = null;

function databaseUrlWithPool(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return url;
  if (/connection_limit=|pool_timeout=/i.test(url)) return url;

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}connection_limit=10&pool_timeout=20`;
}

export function createDatabaseClient(): PrismaClient {
  if (db) return db;
  db = new PrismaClient({
    datasources: {
      db: { url: databaseUrlWithPool() },
    },
  });
  return db;
}

export function getDatabaseClient(): PrismaClient {
  if (!db) throw new Error('Database not initialised');
  return db;
}

export async function disconnectDatabase(): Promise<void> {
  if (db) {
    await db.$disconnect();
    db = null;
  }
}
