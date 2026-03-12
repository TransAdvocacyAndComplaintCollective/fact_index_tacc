import logger from '../logger.ts';

/**
 * Safely parse a string to an integer with validation
 * @param value - String to parse
 * @param defaultValue - Value to return if parsing fails
 * @param minValue - Minimum allowed value (default 1)
 * @param maxValue - Maximum allowed value (default infinity)
 * @throws Error if value is outside min/max range
 */
export function safeParseInt(
  value: string | number | undefined,
  defaultValue: number,
  minValue: number = 1,
  maxValue: number = Number.MAX_SAFE_INTEGER
): number {
  // Handle undefined/null
  if (value === undefined || value === null) {
    return defaultValue;
  }

  // If already a number, validate
  if (typeof value === 'number') {
    const num = Math.floor(value);
    if (isNaN(num) || num < minValue || num > maxValue) {
      throw new Error(
        `Invalid number: ${value} (must be between ${minValue} and ${maxValue})`
      );
    }
    return num;
  }

  // Parse string
  const parsed = parseInt(String(value).trim(), 10);

  // Validate parsing result
  if (isNaN(parsed)) {
    throw new Error(`Cannot parse "${value}" as integer`);
  }

  // Validate range
  if (parsed < minValue || parsed > maxValue) {
    throw new Error(
      `Parsed value ${parsed} is outside valid range [${minValue}, ${maxValue}]`
    );
  }

  return parsed;
}

/**
 * Safely parse a string to an integer, returning default on error instead of throwing
 * @param value - String to parse
 * @param defaultValue - Value to return if parsing fails
 * @param minValue - Minimum allowed value (default 1)
 * @param logError - Whether to log errors (default true)
 */
export function safeParseIntOrDefault(
  value: string | number | undefined,
  defaultValue: number,
  minValue: number = 1,
  logError: boolean = true
): number {
  try {
    return safeParseInt(value, defaultValue, minValue);
  } catch (err) {
    if (logError) {
      logger.error('[parsing] Failed to parse integer', {
        value,
        defaultValue,
        error: err instanceof Error ? err.message : String(err)
      });
    }
    return defaultValue;
  }
}

/**
 * Safely parse environment variable as integer
 * @param envVar - Environment variable name
 * @param defaultValue - Default value if not set or invalid
 * @param minValue - Minimum allowed value
 * @throws Error if value is outside valid range
 */
export function parseEnvInt(
  envVar: string,
  defaultValue: number,
  minValue: number = 1
): number {
  const value = process.env[envVar];
  
  if (!value) {
    return defaultValue;
  }

  try {
    return safeParseInt(value, defaultValue, minValue);
  } catch (err) {
    logger.error(`[parsing] Invalid environment variable ${envVar}`, {
      value,
      defaultValue,
      error: err instanceof Error ? err.message : String(err)
    });
    return defaultValue;
  }
}

/**
 * Safely parse JSON with fallback
 * @param jsonString - JSON string to parse
 * @param fallback - Value to return if parsing fails
 * @param logError - Whether to log errors (default true)
 */
export function safeJsonParse<T>(
  jsonString: string | null | undefined,
  fallback: T,
  logError: boolean = true
): T {
  if (!jsonString) {
    return fallback;
  }

  try {
    return JSON.parse(jsonString) as T;
  } catch (err) {
    if (logError) {
      // Only log first 200 chars to avoid logging huge payloads
      const preview = jsonString.substring(0, 200);
      logger.error('[parsing] Failed to parse JSON', {
        error: err instanceof Error ? err.message : String(err),
        preview: preview + (jsonString.length > 200 ? '...' : '')
      });
    }
    return fallback;
  }
}

/**
 * SafeJsonParse variant that throws on parse error
 * @param jsonString - JSON string to parse
 * @param context - Error context for logging
 */
export function safeJsonParseOrThrow<T>(
  jsonString: string | null | undefined,
  context: string = 'JSON parse'
): T {
  if (!jsonString) {
    throw new Error(`${context}: empty string`);
  }

  try {
    return JSON.parse(jsonString) as T;
  } catch (err) {
    const preview = jsonString.substring(0, 200);
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[parsing] ${context} failed`, {
      error: errorMsg,
      preview: preview + (jsonString.length > 200 ? '...' : '')
    });
    throw new Error(`${context}: ${errorMsg}`);
  }
}

/**
 * Validate that a value is numeric (used for query/param validation)
 */
export function isValidNumericId(value: any): value is string | number {
  if (typeof value === 'number') {
    return !isNaN(value) && isFinite(value);
  }
  if (typeof value === 'string') {
    const num = parseInt(value, 10);
    return !isNaN(num) && String(num) === value.trim();
  }
  return false;
}

/**
 * Extract numeric ID from express param/query safely
 */
export function extractNumericId(value: any, minValue: number = 1): number {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      throw new Error('ID parameter is empty array');
    }
    value = value[0];  // Use first value if array
  }

  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`Invalid ID type: ${typeof value}`);
  }

  const id = safeParseInt(value, undefined as any, minValue);
  
  if (id === undefined) {
    throw new Error(`Invalid ID format: ${value}`);
  }

  return id;
}
