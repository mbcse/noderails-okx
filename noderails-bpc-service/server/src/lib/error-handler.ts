import type { Request, Response, NextFunction } from 'express';
import { isBpcError } from './constants.js';
import type { Logger } from './logger.js';

export function errorHandler(logger: Logger) {
  return (err: Error, req: Request, res: Response, _next: NextFunction) => {
    if (isBpcError(err)) {
      if (err.statusCode >= 500) {
        logger.error(err.message, {
          code: err.code,
          statusCode: err.statusCode,
          path: req.path,
          method: req.method,
        });
      }

      res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
          ...(err.details ? { details: err.details } : {}),
        },
      });
      return;
    }

    logger.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });

    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  };
}
