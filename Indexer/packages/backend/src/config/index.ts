import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV === 'development',
  
  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://submission:disabled@127.0.0.1:1/disabled',
  
  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  
  // JWT
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  jwtExpiresIn: '24h',
  
  // Admin credentials
  adminEmail: process.env.ADMIN_EMAIL || 'admin@indexer.local',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  
  // Indexer settings
  indexer: {
    blockRange: parseInt(process.env.INDEXER_BLOCK_RANGE || '10', 10), // how many blocks per eth_getLogs call
    pollInterval: parseInt(process.env.INDEXER_POLL_INTERVAL || '5000', 10), // ms to wait when caught up
  },
  // Native transfer indexer (one getBlock per block)
  nativeIndexer: {
    blockRange: parseInt(process.env.NATIVE_INDEXER_BLOCK_RANGE || '3', 10),
    pollInterval: parseInt(process.env.NATIVE_INDEXER_POLL_INTERVAL || '5000', 10),
  },
  
  // Webhook settings
  webhook: {
    maxRetries: 5,
    initialDelay: 1000, // ms
    maxDelay: 60000, // ms
    timeout: 30000, // ms
  },
} as const;
