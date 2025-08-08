// src/logger/pino.ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import pinoPkg from 'pino';
import pinoCallerModule from 'pino-caller';
import callsites from 'callsites';
import pkg from 'pino-std-serializers';

const pino = pinoPkg;
const createTransport = pinoPkg.transport;
const { wrapErrorSerializer, err: stdErr } = pkg;

const pinoCaller: (
  logger: import('pino').Logger,
  opts?: { relativeTo?: string; stackAdjustment?: number }
) => import('pino').Logger =
  (pinoCallerModule as any).default ?? pinoCallerModule;

import type { Logger, LoggerOptions, TransportSingleOptions } from 'pino';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development';
const LEVEL = (process.env.LOG_LEVEL as import('pino').Level) || 'trace';
const logDir = process.env.LOG_DIR || path.resolve('logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const jsonLogFile = path.join(logDir, 'app.json.log');
const humanLogFile = path.join(logDir, 'app.human.log');

const targets: TransportSingleOptions[] = [
  {
    target: 'pino/file',
    options: { destination: jsonLogFile, mkdir: true, level: LEVEL },
  },
  {
    target: 'pino-pretty',
    options: {
      destination: humanLogFile,
      colorize: false,
      translateTime: 'yyyy-mm-dd HH:MM:ss',
      singleLine: false,
      ignore: 'pid,hostname',
      level: LEVEL,
    },
  },
  {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'yyyy-mm-dd HH:MM:ss',
      singleLine: false,
      ignore: 'pid,hostname',
      level: LEVEL,
    },
  },
];

let transportInstance: ReturnType<typeof createTransport> | undefined;
try {
  transportInstance = createTransport({ targets });
} catch (err) {
  console.error('Logger transport setup failed, using fallback:', err);
  transportInstance = createTransport({
    targets: [
      {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname',
          level: LEVEL,
        },
      },
    ],
  });
}

const baseOpts: LoggerOptions = {
  level: LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin() {
    const frames = callsites();
    let site;
    for (const f of frames) {
      const file = f.getFileName();
      if (!file) continue;
      if (file.includes('/node_modules/') || file.endsWith('pino.js')) continue;
      site = f;
      break;
    }
    if (!site) site = frames[frames.length - 1];

    const filepath = site.getFileName() || undefined;
    const line = site.getLineNumber() ?? undefined;
    return {
      filepath,
      vscode_filepath: filepath && line ? `${filepath}:${line}` : undefined,
      line,
      func: site.getFunctionName() || '<anonymous>',
    };
  },
  serializers: {
    err: wrapErrorSerializer((serialized: ReturnType<typeof stdErr>) => ({
      ...serialized,
    })),
  },
};

declare global {
  var __LOGGER_EVENT_HANDLERS_ATTACHED__: boolean | undefined;
}

interface LoggerWithLog extends Logger {
  log: Logger['info'];
}

const baseLogger: Logger = transportInstance
  ? pino(baseOpts, transportInstance)
  : pino(baseOpts);

const logger: LoggerWithLog = isDev
  ? (pinoCaller(baseLogger, {
      relativeTo: __dirname,
      stackAdjustment: 2,
    }) as LoggerWithLog)
  : (baseLogger as LoggerWithLog);

logger.log = logger.info.bind(logger);

// Graceful shutdown and error handling
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

process.on('uncaughtException', async (err: Error) => {
  logger.error({ err }, 'Uncaught exception');
  await delay(500);
  process.exit(1);
});

process.on('unhandledRejection', async (reason: unknown) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error({ err }, 'Unhandled promise rejection');
  await delay(500);
  process.exit(1);
});

const origExit = process.exit;
process.exit = ((code?: string | number | null | undefined) => {
  logger.trace({ code }, 'Called process.exit');
  return origExit.call(process, code);
}) as typeof process.exit;

process.on('exit', (code: number) => {
  logger.info({ code }, 'Process exit');
});

export default logger;
