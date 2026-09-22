import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "./index.js";

// ────────────────────────────────────────────────────────────
// PostgreSQL connection → Prisma 7 driver adapter
// ────────────────────────────────────────────────────────────

const connectionString = config.database.url;

// Prisma 7 + node-pg: SSL cert validation is strict. RDS/managed Postgres often need rejectUnauthorized: false.
// Set DATABASE_SSL_REJECT_UNAUTHORIZED=false to allow, or we auto-enable for RDS hosts.
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

export const prisma = new PrismaClient({ adapter });

/** Graceful shutdown helper */
export async function disconnectDatabase() {
  await prisma.$disconnect();
}
