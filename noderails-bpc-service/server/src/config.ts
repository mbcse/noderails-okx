function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function parseCorsOrigin(value: string | undefined): string | string[] {
  const raw = value ?? 'http://localhost:3010';
  if (!raw.includes(',')) return raw;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const env = {
  PORT: parseInt(process.env.PORT ?? '8090', 10),
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  LOG_LEVEL: (process.env.LOG_LEVEL ?? 'info') as 'debug' | 'info' | 'warn' | 'error',
  DATABASE_URL: required('DATABASE_URL', process.env.DATABASE_URL),
  REDIS_URL: required('REDIS_URL', process.env.REDIS_URL),
  CORS_ORIGIN: parseCorsOrigin(process.env.CORS_ORIGIN),
  ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? '',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? '',
  JWT_SECRET: required('JWT_SECRET', process.env.JWT_SECRET),
  JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET),
  COINGECKO_API_KEY: process.env.COINGECKO_API_KEY ?? '',
  CRYPTOCOMPARE_API_KEY: process.env.CRYPTOCOMPARE_API_KEY ?? '',
  COINCAP_API_KEY: process.env.COINCAP_API_KEY ?? '',
  PRICE_CACHE_TTL_SEC: parseInt(process.env.PRICE_CACHE_TTL_SEC ?? '30', 10),
  PRICE_MAX_STALENESS_SEC: parseInt(process.env.PRICE_MAX_STALENESS_SEC ?? '300', 10),
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10),
  ONEINCH_API_KEY: process.env.ONEINCH_API_KEY ?? '',
  ONEINCH_BASE_URL: (process.env.ONEINCH_BASE_URL ?? 'https://prices.example.local').replace(/\/$/, ''),
  ONEINCH_TIMEOUT_MS: parseInt(process.env.ONEINCH_TIMEOUT_MS ?? '15000', 10),
};
