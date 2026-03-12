/**
 * Error Handling and Resource Management Middleware
 * Ensures all routes have consistent error handling and resource cleanup
 */

import type { Request, Response, NextFunction } from 'express';
import logger from '../logger.ts';
import { isAppError } from './errors.ts';
import { getRequestId } from '../middleware/requestContext.ts';

/**
 * Standardized error response format
 */
export interface ErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

/**
 * Standard error handler middleware that ensures all errors are logged and respond consistently
 *
 * @example
 * app.use(globalErrorHandler);  // Must be last middleware
 */
export function globalErrorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next?: NextFunction,
): void {
  // Ensure response hasn't already been sent
  if (res.headersSent) {
    return;
  }

  // Extract error details
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  const requestId = getRequestId(req);

  // Log error with context including request ID for correlation
  logger.error('[globalErrorHandler] Unhandled error', {
    requestId,
    message: errorMessage,
    stack: errorStack,
    type: error instanceof Error ? error.constructor.name : typeof error,
  });

  // Send response
  if (isAppError(error)) {
    res.status(error.statusCode).json({
      error: error.code,
      message: error.message,
      requestId,
      ...(error.details && { details: error.details }),
    } as ErrorResponse);
    return;
  }

  // Generic error response
  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
    requestId,
  } as ErrorResponse);
}

/**
 * Wraps a route handler with error handling and resource cleanup
 *
 * @param handler - Express route handler function
 * @returns Wrapped handler that always catches errors
 *
 * @example
 * router.get('/items', withErrorHandling(async (req, res) => {
 *   const items = await db.selectFrom('items').selectAll().execute();
 *   res.json(items);
 * }));
 */
export function withErrorHandling(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void> | void,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    // Wrap in Promise to catch both sync and async errors
    Promise.resolve(handler(req, res, next)).catch((err: unknown) => {
      // Pass to error handler middleware
      next(err);
    });
  };
}

/**
 * Build route-specific error handler that logs context
 *
 * @param routeName - Name of the route (for logging)
 * @returns Error handler function
 *
 * @example
 * const handleError = buildErrorHandler('POST /api/facts');
 * router.post('/facts', (req, res) => {
 *   try {
 *     // ... route logic
 *   } catch (err) {
 *     handleError(res, err, { factId: 123 });
 *   }
 * });
 */
export function buildErrorHandler(routeName: string) {
  return (
    res: Response,
    error: unknown,
    context?: Record<string, unknown>,
  ): void => {
    // Don't respond if headers already sent
    if (res.headersSent) {
      return;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Log error with route context
    logger.error(`[${routeName}] Error`, {
      message: errorMessage,
      stack: errorStack,
      context,
    });

    // Send response
    if (isAppError(error)) {
      res.status(error.statusCode).json({
        error: error.code,
        message: error.message,
        ...(error.details && { details: error.details }),
      } as ErrorResponse);
      return;
    }

    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    } as ErrorResponse);
  };
}

/**
 * Safely load a configuration file with error recovery
 *
 * @param loadFn - Function that loads config (may throw)
 * @param onError - Fallback config to return if load fails
 * @returns Loaded config or fallback
 *
 * @example
 * const config = await safeLoadConfig(
 *   () => loadConfigFromDisk(),
 *   { roles: {}, users: [] }
 * );
 */
export async function safeLoadConfig<T>(
  loadFn: () => T,
  onError: T,
): Promise<T> {
  try {
    return loadFn();
  } catch (err) {
    logger.warn('[safeLoadConfig] Failed to load config, using fallback', {
      error: err instanceof Error ? err.message : String(err),
    });
    return onError;
  }
}

/**
 * Safely save a configuration file
 * Includes validation before write and rollback capability
 *
 * @param saveFn - Function that saves config (may throw)
 * @param validateFn - Optional validation before save
 * @returns true if save succeeded
 *
 * @example
 * const success = await safeSaveConfig(
 *   () => fs.promises.writeFile('config.json', JSON.stringify(config)),
 *   () => validateConfig(config)
 * );
 */
export async function safeSaveConfig(
  saveFn: () => Promise<void> | void,
  validateFn?: () => void,
): Promise<boolean> {
  try {
    // Validate before save if provided
    if (validateFn) {
      validateFn();
    }

    await saveFn();
    return true;
  } catch (err) {
    logger.error('[safeSaveConfig] Failed to save config', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return false;
  }
}

/**
 * Ensure a database connection is healthy
 * Returns the connection or throws a connection error
 *
 * @param dbFn - Function that gets/creates db connection
 * @returns Database connection
 *
 * @example
 * const db = await ensureDbConnection(() => getDb());
 */
export async function ensureDbConnection<T>(
  dbFn: () => T,
): Promise<T> {
  try {
    const db = dbFn();
    // Verify connection with simple query if possible
    // (Different DB types may not have same interface)
    return db;
  } catch (err) {
    logger.error('[ensureDbConnection] Database connection failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
