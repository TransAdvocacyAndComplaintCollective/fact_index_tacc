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

export function info(message: string, meta?: Meta) {
  const line = format('info', message, meta);
  console.info(line);
  writeToFiles(line, false);
}

export function warn(message: string, meta?: Meta) {
  const line = format('warn', message, meta);
  console.warn(line);
  writeToFiles(line, false);
}

export function error(message: string, meta?: Meta) {
  const line = format('error', message, meta);
  console.error(line);
  writeToFiles(line, true);
}

export function debug(message: string, meta?: Meta) {
  const line = format('debug', message, meta);
  console.debug(line);
  writeToFiles(line, false);
}

// Express request logger middleware
export function requestLogger(req: Request, res: Response, next: NextFunction) {
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
export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  error(message, { stack });
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
  next();
}

export default { info, warn, error, debug, requestLogger, errorHandler };
