// Don't use .ts in runtime imports unless your bundler resolves it
import pinologger from '../logger/pino.ts';

const pinolog = pinologger.child({ component: 'logQuery' });

/**
 * Checks if an object is a Knex QueryBuilder or Raw query.
 */
function isKnexQuery(obj: unknown): obj is { toSQL: () => { sql: string }, then: (...args: any[]) => any } {
  return (
    !!obj &&
    typeof obj === 'object' &&
    'toSQL' in obj &&
    typeof (obj as any).toSQL === 'function' &&
    'then' in obj &&
    typeof (obj as any).then === 'function'
  );
}

/**
 * Checks if an object is a Promise.
 */
function isPromise<T = any>(obj: unknown): obj is Promise<T> {
  return (
    !!obj &&
    typeof obj === 'object' &&
    'then' in obj &&
    typeof (obj as any).then === 'function'
  );
}

/**
 * Safely converts a query to string for logging.
 */
function safeQueryToString(query: unknown): string {
  if (!query) return '[empty query]';
  if (typeof query === 'string') return query;
  if (isKnexQuery(query)) {
    try {
      return query.toSQL().sql;
    } catch {
      return '[unable to convert query builder to SQL]';
    }
  }
  if (typeof (query as any).toString === 'function') {
    try {
      return (query as any).toString();
    } catch {
      return '[toString error]';
    }
  }
  return '[no toString available]';
}

/**
 * Logs the query, executes it, logs result or error, and measures execution time.
 */
export async function logQuery<T = any>(
  query: unknown,
  label: string = 'QUERY'
): Promise<T> {
  const queryStr = safeQueryToString(query);
  pinolog.debug({ sql: queryStr }, `[${label}] SQL`);

  const start = process.hrtime.bigint();

  try {
    let result: T;

    if (isKnexQuery(query) || isPromise(query)) {
      // This covers Knex query builder, Raw, and plain promises
      result = await (query as Promise<T>);
    } else {
      throw new TypeError('Invalid argument passed to logQuery; must be QueryBuilder, Raw, or Promise');
    }

    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;

    // Array result (common for SELECT)
    if (Array.isArray(result)) {
      pinolog.debug({ count: result.length, durationMs }, `[${label}] RESULT array`);
    }
    // Postgres-style { rows: [...] }
    else if (result && typeof result === 'object' && 'rows' in result && Array.isArray((result as any).rows)) {
      pinolog.debug({ count: (result as any).rows.length, durationMs }, `[${label}] RESULT rows`);
    }
    // Object result
    else if (result && typeof result === 'object') {
      pinolog.debug({ keys: Object.keys(result), durationMs }, `[${label}] RESULT object`);
    }
    // Primitive/null result
    else {
      pinolog.debug({ result, durationMs }, `[${label}] RESULT primitive/null`);
    }

    return result;
  } catch (error: any) {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;
    pinolog.error({ err: error, sql: queryStr, durationMs }, `[${label}] ERROR`);
    throw error;
  }
}
