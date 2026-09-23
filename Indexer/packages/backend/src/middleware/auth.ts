import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import prisma from '../lib/prisma.js';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      admin?: { email: string };
      project?: { id: string; name: string; apiKey: string };
    }
  }
}

// Admin JWT authentication middleware
export const adminAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No authorization token provided',
      });
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as { email: string };
      req.admin = { email: decoded.email };
      next();
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Authentication error',
    });
  }
};

// Project API key authentication middleware
export const projectAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'No API key provided',
      });
    }

    const project = await prisma.project.findUnique({
      where: { apiKey },
      select: { id: true, name: true, apiKey: true, isActive: true },
    });

    if (!project || !project.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or inactive API key',
      });
    }

    req.project = { id: project.id, name: project.name, apiKey: project.apiKey };
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Authentication error',
    });
  }
};

// Error handler middleware
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('Error:', err);
  
  res.status(500).json({
    success: false,
    error: config.isDev ? err.message : 'Internal server error',
  });
};
