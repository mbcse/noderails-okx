import "dotenv/config";

// ────────────────────────────────────────────────────────────
// Centralised environment configuration
// ────────────────────────────────────────────────────────────

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env variable: ${key}`);
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: parseInt(optional("PORT", "4000"), 10),
  nodeEnv: optional("NODE_ENV", "development"),
  get isDev() {
    return this.nodeEnv !== "production";
  },
  corsOrigin: optional("CORS_ORIGIN", "http://localhost:3000"),
  get logLevel() {
    return optional("LOG_LEVEL", this.isDev ? "debug" : "info");
  },

  database: {
    url: required("DATABASE_URL"),
  },

  redis: {
    url: optional("REDIS_URL", "redis://localhost:6379"),
  },

  jwt: {
    secret: required("JWT_SECRET"),
    /** Separate secret for refresh tokens — defaults to JWT_SECRET + "_refresh" */
    refreshSecret: optional("JWT_REFRESH_SECRET", required("JWT_SECRET") + "_refresh"),
    expiresIn: optional("JWT_EXPIRES_IN", "1d"),
    refreshExpiresIn: optional("JWT_REFRESH_EXPIRES_IN", "7d"),
  },

  encryption: {
    /** 32-byte hex string for AES-256-GCM (generate with: openssl rand -hex 32) */
    key: (() => {
      const k = required("ENCRYPTION_KEY");
      if (!/^[0-9a-fA-F]{64}$/.test(k)) {
        throw new Error("ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)");
      }
      return k;
    })(),
  },

  aws: {
    region: optional("AWS_REGION", "us-east-1"),
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
} as const;
