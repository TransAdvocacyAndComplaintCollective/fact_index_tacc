// src/logger.ts (refactor: no pino-caller, cheaper mixin, transports, dev-only pretty)
import whyIsNodeRunning from "why-is-node-running";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs, { readFileSync } from "node:fs";
import os from "node:os";
import pinoPkg from "pino";
import callsites from "callsites";
import pinoPretty from "pino-pretty"; // types only (when used as a transport target)

const pino = pinoPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProd = process.env.NODE_ENV === "production";
const LEVEL = process.env.LOG_LEVEL || (isProd ? "info" : "debug");
const ENABLE_CALLSITE = process.env.LOG_CALLSITE === "1"; // opt-in only

const logDir = process.env.LOG_DIR ?? path.resolve(process.cwd(), "logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const jsonLogFile = path.join(logDir, "app.json.log");
const humanLogFile = path.join(logDir, "app.human.log");

// --- Safe error normalization ---
function normalizeError(input: unknown) {
  if (input instanceof Error) {
    return { name: input.name, message: input.message, stack: input.stack };
  }
  if (typeof input === "object" && input !== null) {
    try {
      return JSON.parse(JSON.stringify(input));
    } catch {
      return { message: String(input) };
    }
  }
  return { message: String(input) };
}

// --- Build transport targets ---
function buildTransport() {
  if (!isProd) {
    // Dev: pretty to stdout only
    return {
      targets: [
        {
          target: "pino-pretty",
          level: LEVEL,
          options: {
            colorize: process.stdout.isTTY,
            translateTime: "yyyy-mm-dd HH:MM:ss",
            ignore: "pid,hostname",
            singleLine: false,
            messageFormat: "{filepath}:{line} [{func}] {msg}",
          } satisfies Parameters<typeof pinoPretty>[0],
        },
      ],
    } as const;
  }

  // Prod: JSON file + human (pretty) file written by worker thread
  return {
    targets: [
      {
        target: "pino/file",
        level: LEVEL,
        options: { destination: jsonLogFile, mkdir: true },
      },
      {
        target: "pino-pretty",
        level: LEVEL,
        options: {
          colorize: false,
          destination: humanLogFile,
          translateTime: "yyyy-mm-dd HH:MM:ss",
          ignore: "pid,hostname",
          singleLine: false,
          messageFormat: "{filepath}:{line} [{func}] {msg}",
        } satisfies Parameters<typeof pinoPretty>[0],
      },
    ],
  } as const;
}

// --- Logger Config ---
const loggerBase = pino({
  level: LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    // keep secrets out of logs in case user accidentally logs env/headers
    paths: [
      "env.*",
      "context.env.*",
      "headers.authorization",
      "authorization",
      "password",
      "token",
      "access_token",
      "refresh_token",
    ],
    censor: "[REDACTED]",
  },
  mixin(_logOptions: object, levelNum: number) {
    const levelLabel = typeof levelNum === "number" ? pino.levels.labels[levelNum] : undefined;
    const output: Record<string, unknown> = { level: levelLabel };

    // Only compute callsite metadata when explicitly enabled AND level is debug/trace
    if (ENABLE_CALLSITE && (levelLabel === "debug" || levelLabel === "trace")) {
      try {
        const frames = callsites();
        const site =
          frames.find((f) => {
            const file = f.getFileName() ?? "";
            return !file.includes("pino") && !file.includes("node_modules");
          }) ?? frames[frames.length - 1];

        const file = site?.getFileName?.();
        const rel = file && path.isAbsolute(file) ? path.relative(process.cwd(), file) : file;
        const line = site?.getLineNumber?.();
        const func = site?.getFunctionName?.() || "<anonymous>";
        if (rel) output.filepath = rel;
        if (line) output.line = line;
        if (func) output.func = func;
        if (rel && line) (output as any).vscode_filepath = `${rel}:${line}`;
      } catch {
        // ignore callsite failures
      }
    }
    return output;
  },
  serializers: {
    err: (value: unknown) => normalizeError(value),
    error: (value: unknown) => normalizeError(value),
  },
  base: {
    pid: process.pid,
    hostname: process.env.HOSTNAME || os.hostname(),
    nodeVersion: process.version,
    appName: (() => {
      try {
        const pkgPath = path.join(process.cwd(), "package.json");
        return JSON.parse(readFileSync(pkgPath, "utf8")).name;
      } catch {
        return undefined;
      }
    })(),
  },
  transport: buildTransport(),
});

// Add a generic log method for ergonomic use
const finalLogger = loggerBase as typeof loggerBase & { log: typeof loggerBase.info };
finalLogger.log = finalLogger.info.bind(finalLogger);

// --- Safe flush ---
function safeFlush() {
  // with transports, flush is less critical, but keep this in case
  try {
    // @ts-ignore - pino might expose flush depending on runtime
    if (typeof finalLogger.flush === "function") finalLogger.flush();
  } catch {
    /* ignore */
  }
}
process.on("exit", safeFlush);

// --- Process info collector (trimmed) ---
function getProcessInfo() {
  return {
    pid: process.pid,
    cwd: process.cwd(),
    uptime: process.uptime(),
    nodeVersion: process.version,
    platform: process.platform,
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  };
}

// --- Fatal handler ---
async function handleFatal(err: Error, origin: "uncaughtException" | "unhandledRejection") {
  finalLogger.error({ error: normalizeError(err), origin, context: getProcessInfo() }, `${origin} occurred`);

  try {
    const handlesReport = whyIsNodeRunning();
    finalLogger.error({ handlesReport }, "why-is-node-running report");
  } catch (e) {
    finalLogger.warn({ err: normalizeError(e) }, "Failed to run why-is-node-running");
  }

  // tiny delay to let transports flush
  await new Promise((res) => setTimeout(res, 400));
  safeFlush();
  process.exit(1);
}

process.on("uncaughtException", async (err) => {
  await handleFatal(err, "uncaughtException");
});
process.on("unhandledRejection", async (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  await handleFatal(err, "unhandledRejection");
});

export default finalLogger;
