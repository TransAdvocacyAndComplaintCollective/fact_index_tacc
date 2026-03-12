/**
 * Request Context Middleware
 * Adds correlation IDs and request tracking for better observability and debugging
 */

import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import logger from '../logger.ts';

/**
 * Extend Express Request type to include locals with correlation ID
 * This allows proper TypeScript support for req.locals
 */
declare global {
  namespace Express {
    interface Request {
      locals?: {
        requestId: string;
        startTime: number;
      };
    }
  }
}

/**
 * Request context middleware
 * Assigns unique ID to each request for correlation across logs
 * Tracks request duration and logs completion
 *
 * @example
 * app.use(requestContextMiddleware);
 */
export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Generate unique request ID
  const requestId = randomUUID();
  const startTime = Date.now();

  // Store in request locals for access in handlers/errors
  req.locals = {
    requestId,
    startTime,
  };

  // Set response header for client to track request
  res.setHeader('X-Request-ID', requestId);

  // Log request start
  logger.info('[request] Started', {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.get('user-agent'),
  });

  // Track when response finishes
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Log level based on status code
    const isError = statusCode >= 400;
    const logLevel = isError ? 'warn' : 'info';

    logger.log(logLevel, '[request] Completed', {
      requestId,
      method: req.method,
      path: req.path,
      status: statusCode,
      duration,
      durationMs: `${duration}ms`,
    });
  });

  // Track if response closes without finishing (connection dropped)
  res.on('close', () => {
    if (!res.writableEnded) {
      const duration = Date.now() - startTime;
      logger.warn('[request] Closed without finishing', {
        requestId,
        method: req.method,
        path: req.path,
        duration,
        durationMs: `${duration}ms`,
      });
    }
  });

  next();
}

/**
 * Utility to get request ID from request object
 * Useful in handlers or middlewares that need the correlation ID
 *
 * @param req Express Request object
 * @returns Correlation ID or 'unknown' if not available
 *
 * @example
 * const requestId = getRequestId(req);
 * logger.error('Error occurred', { requestId, error: err.message });
 */
export function getRequestId(req: Request): string {
  return req.locals?.requestId || 'unknown';
}

/**
 * Add correlation ID to logger context
 * Automatically includes request ID in all logs within request scope
 *
 * @param req Express Request object
 * @returns Logger context object to spread in log calls
 *
 * @example
 * logger.error('Error', { ...logContext(req), details: 'info' });
 */
export function logContext(req: Request) {
  return {
    requestId: getRequestId(req),
  };
}
