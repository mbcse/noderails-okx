import type { Request, Response, NextFunction } from 'express';
import { getRedis } from './redis.js';

export function createRateLimiter(windowMs: number, max: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const redis = getRedis();
      const ip = req.ip ?? 'unknown';
      const key = `ratelimit:${ip}:${Math.floor(Date.now() / windowMs)}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, Math.ceil(windowMs / 1000));
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - count)));
      if (count > max) {
        res.status(429).json({
          success: false,
          error: { code: 'RATE_LIMITED', message: 'Too many requests' },
        });
        return;
      }
      next();
    } catch {
      next();
    }
  };
}
