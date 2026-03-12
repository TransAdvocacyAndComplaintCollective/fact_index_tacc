/**
 * Input validation middleware for facts endpoints
 * Uses express-validator for input sanitization and validation
 */

import { body, param, validationResult } from 'express-validator';
import type { Request, Response, NextFunction } from 'express';
import { ValidationError, UnauthorizedError } from './errors.ts';

/**
 * Validates fact input for POST /facts endpoint
 * All fields are optional to support partial updates
 */
export const factValidation = [
  body('fact_text')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 10000 })
    .withMessage('fact_text must be 1-10000 characters'),
  body('source')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('source must not exceed 500 characters'),
  body('type')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('type must not exceed 500 characters'),
  body('context')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('context must not exceed 5000 characters'),
  body('year')
    .optional()
    .isInt({ min: 1000, max: 9999 })
    .withMessage('year must be between 1000 and 9999'),
  body('subjects')
    .optional()
    .isArray()
    .withMessage('subjects must be an array')
    .custom((arr) => {
      if (!Array.isArray(arr)) return false;
      return arr.every(
        (s) => typeof s === 'string' && s.trim().length > 0 && s.length <= 200,
      );
    })
    .withMessage('subjects must be non-empty strings, max 200 chars each'),
  body('audiences')
    .optional()
    .isArray()
    .withMessage('audiences must be an array')
    .custom((arr) => {
      if (!Array.isArray(arr)) return false;
      return arr.every(
        (a) => typeof a === 'string' && a.trim().length > 0 && a.length <= 200,
      );
    })
    .withMessage('audiences must be non-empty strings, max 200 chars each'),
  body('suppressed')
    .optional()
    .isBoolean()
    .withMessage('suppressed must be a boolean'),
  body('is_public')
    .optional()
    .isBoolean()
    .withMessage('is_public must be a boolean'),
];

/**
 * Validates numeric ID parameter
 */
export const idParamValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID must be a positive integer'),
];

/**
 * Middleware to handle validation errors from express-validator
 * Must be used as a regular middleware (not as error handler)
 * Throws ValidationError if there are validation errors
 */
export function handleValidationErrors(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map((err) => ({
      field: err.location === 'params' ? `params.${err.path}` : `body.${err.path}`,
      message: err.msg,
      value:
        err.location === 'params'
          ? req.params[err.path]
          : err.location === 'body'
            ? err.value
            : undefined,
    }));
    next(new ValidationError('Request validation failed', details));
    return;
  }
  next();
}

/**
 * Validate query parameter 'q' for keyword search
 * Optional but if provided must be string with max length
 */
export function validateSearchQuery(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const q = req.query.q;
  if (q !== undefined && (typeof q !== 'string' || q.length > 1000)) {
    next(new ValidationError('Query parameter "q" must be a string with max 1000 characters', {
      field: 'query.q',
      value: q,
    }));
    return;
  }
  next();
}
