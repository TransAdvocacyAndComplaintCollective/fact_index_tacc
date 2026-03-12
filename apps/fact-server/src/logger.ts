import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';

type Meta = Record<string, unknown> | undefined;

const LOG_DIR = path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (e) {
    // ignore
  }
}

const serverLogPath = path.join(LOG_DIR, 'server.log');
const errorLogPath = path.join(LOG_DIR, 'error.log');

const serverStream = fs.createWriteStream(serverLogPath, { flags: 'a' });
const errorStream = fs.createWriteStream(errorLogPath, { flags: 'a' });

function format(level: string, message: string, meta?: Meta) {
  const ts = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${ts}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

function writeToFiles(line: string, isError = false) {
  try {
    serverStream.write(line + '\n');
    if (isError) errorStream.write(line + '\n');
  } catch (e) {
    // ignore file write errors
  }
}

function info(message: string, meta?: Meta) {
  const line = format('info', message, meta);
  console.info(line);
  writeToFiles(line, false);
}

function warn(message: string, meta?: Meta) {
  const line = format('warn', message, meta);
  console.warn(line);
  writeToFiles(line, false);
}

function error(message: string, meta?: Meta) {
  const line = format('error', message, meta);
  console.error(line);
  writeToFiles(line, true);
}

function debug(message: string, meta?: Meta) {
  const line = format('debug', message, meta);
  console.debug(line);
  writeToFiles(line, false);
}

function toLogString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack || value.message;
  if (value === null || value === undefined) return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// Backward-compatible logger used by auth modules that pass varargs.
export function log(level: 'info' | 'warn' | 'error' | 'debug', ...args: unknown[]) {
  if (!args.length) {
    if (level === 'info') return info('');
    if (level === 'warn') return warn('');
    if (level === 'error') return error('');
    return debug('');
  }

  const message = toLogString(args[0]);
  const rest = args.slice(1);
  const detail = rest.length ? { details: rest.map((arg) => toLogString(arg)) } : undefined;

  if (level === 'info') return info(message, detail);
  if (level === 'warn') return warn(message, detail);
  if (level === 'error') return error(message, detail);
  return debug(message, detail);
}

// Express request logger middleware
function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const diff = Number((process.hrtime.bigint() - start) / BigInt(1e6));
    const auth = (req as any).authStatus?.authenticated ?? false;
    info(`${req.method} ${req.originalUrl} ${res.statusCode} - ${diff}ms`, {
      ip: req.ip,
      ua: req.get('user-agent'),
      auth,
    });
  });
  next();
}

// Simple error handler to ensure errors get logged
function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  error(message, { stack });
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
  next();
}

export default { info, warn, error, debug, log, requestLogger, errorHandler };
