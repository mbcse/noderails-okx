import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticationError, AUTH_CONFIG } from './constants.js';
import type { AuthenticatedRequest } from './response.js';
import { env } from '../config.js';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  type: string;
}

export function authenticateJwt() {
  return (req: Request, _res: Response, next: NextFunction) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      next(new AuthenticationError('Missing bearer token'));
      return;
    }

    try {
      const payload = jwt.verify(auth.slice(7), env.JWT_SECRET) as JwtPayload;
      if (payload.type !== 'access' || payload.role !== 'ADMIN') {
        next(new AuthenticationError('Invalid token'));
        return;
      }
      (req as AuthenticatedRequest).admin = { email: payload.email, role: payload.role };
      next();
    } catch {
      next(new AuthenticationError('Invalid or expired token'));
    }
  };
}

export function requireAdmin() {
  return (req: Request, _res: Response, next: NextFunction) => {
    const admin = (req as AuthenticatedRequest).admin;
    if (!admin || admin.role !== 'ADMIN') {
      next(new AuthenticationError('Admin access required'));
      return;
    }
    next();
  };
}
