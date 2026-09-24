import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function requestId(): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    req.requestId = (req.headers['x-request-id'] as string) ?? randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  };
}
