// src/logger.ts
import whyIsNodeRunning from "why-is-node-running";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs, { readFileSync } from "node:fs";
import os from "node:os";
import pinoPkg from "pino";
import pinoCallerModule from "pino-caller";
import callsites from "callsites";
import pkg from "pino-std-serializers";
import pinoPretty from "pino-pretty";

const pino = pinoPkg;
const { wrapErrorSerializer, err: stdErr } = pkg;
const pinoCaller = (pinoCallerModule as any).default ?? pinoCallerModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LEVEL = process.env.LOG_LEVEL || "info";
const logDir = process.env.LOG_DIR ?? path.resolve(process.cwd(), "logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const jsonLogFile = path.join(logDir, "app.json.log");
const humanLogFile = path.join(logDir, "app.human.log");

// --- Streams ---
const destJson = pino.destination({ dest: jsonLogFile, mkdir: true, sync: false });
const destHuman = pino.destination({ dest: humanLogFile, mkdir: true, sync: false });
const prettyStdout = pinoPretty({
  colorize: true,
  translateTime: "yyyy-mm-dd HH:MM:ss",
  ignore: "pid,hostname",
  singleLine: false,
  messageFormat: "{filepath}:{line} [{func}] {msg}",
});

const streams = [
  { stream: destJson, level: LEVEL },
  { stream: destHuman, level: LEVEL },
  { stream: prettyStdout, level: LEVEL },
];

// --- Safe error normalization ---
function normalizeError(input: any) {
  if (input instanceof Error) {
    return {
      name: input.name,
      message: input.message,
      stack: input.stack,
    };
  }
  if (typeof input === "object" && input !== null) {
    return JSON.parse(JSON.stringify(input)); // safe clone
  }
  return { message: String(input) };
}

// --- Logger Config ---
const loggerBase = pino(
  {
    level: LEVEL,
    timestamp: pino.stdTimeFunctions.isoTime,
    mixin(logOptions: object & { includeOpenHandles?: boolean }, levelNum: number) {
      const frames = callsites();
      const site =
        frames.find((f) => {
          const file = f.getFileName() ?? "";
          return !file.includes("pino") && !file.includes("node_modules");
        }) ?? frames[frames.length - 1];

      const file = site.getFileName();
      const rel = file && path.isAbsolute(file) ? path.relative(process.cwd(), file) : file;
      const line = site.getLineNumber();
      const func = site.getFunctionName() || "<anonymous>";
      const levelLabel =
        typeof levelNum === "number" ? pino.levels.labels[levelNum] : undefined;

      const output: any = { filepath: rel, line, func, level: levelLabel };
      if (rel && line) output.vscode_filepath = `${rel}:${line}`;

      if (levelNum >= pino.levels.values.crit || logOptions?.includeOpenHandles) {
        console.warn("Critical log level reached – gathering open handles...");
        try {
          whyIsNodeRunning({
            error(msg: string) {
              output.whyMsg = msg;
            },
          });
        } catch (err) {
          console.error("Failed to run why-is-node-running:", err);
        }
      }
      return output;
    },
    serializers: {
      // Override err serializer to avoid bad stacks
      err: (value: any) => normalizeError(value),
      error: (value: any) => normalizeError(value),
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
  },
  pino.multistream(streams)
);

// --- pino-caller integration with safe wrapper ---
function safePinoCaller(instance: any) {
  const called = pinoCaller(instance, { relativeTo: __dirname, stackAdjustment: 2 });

  const wrapMethod = (method: keyof typeof called) => {
    const orig = called[method];
    if (typeof orig !== "function") return;
    called[method] = (...args: any[]) => {
      try {
        // sanitize err/error objects before calling
        args = args.map((a) => {
          if (a && typeof a === "object" && (a.err || a.error)) {
            return {
              ...a,
              err: normalizeError(a.err),
              error: normalizeError(a.error),
            };
          }
          return a;
        });
        return orig.apply(called, args);
      } catch (e) {
        console.error(`Logging failed for method ${String(method)}`, e, args);
      }
    };
  };

  ["error", "warn", "info", "debug", "trace", "fatal"].forEach(wrapMethod);
  return called;
}

const logger = safePinoCaller(loggerBase);

// Add a generic log method for ergonomic use
const finalLogger = logger as typeof logger & { log: typeof logger.info };
finalLogger.log = finalLogger.info.bind(finalLogger);

// --- Safe flush ---
function safeFlush() {
  if (typeof finalLogger.flush === "function") {
    try {
      finalLogger.flush();
    } catch {
      /* ignore */
    }
  }
}
process.on("exit", safeFlush);

// --- Process info collector ---
function getProcessInfo() {
  return {
    env: process.env,
    argv: process.argv,
    pid: process.pid,
    cwd: process.cwd(),
    uptime: process.uptime(),
    nodeVersion: process.version,
    platform: process.platform,
    memory: process.memoryUsage(),
    openHandles: (process as any)._getActiveHandles().length,
    openRequests: (process as any)._getActiveRequests().length,
    globals: Object.keys(global),
    custom: (global as any).appState,
    timestamp: new Date().toISOString(),
  };
}

// --- Fatal handler ---
async function handleFatal(err: Error, origin: "uncaughtException" | "unhandledRejection") {
  finalLogger.error(
    {
      error: normalizeError(err),
      origin,
      context: getProcessInfo(),
    },
    `${origin} occurred`
  );

  try {
    const handlesReport = whyIsNodeRunning();
    finalLogger.error({ handlesReport }, "why-is-node-running report");
  } catch (e) {
    finalLogger.warn({ err: normalizeError(e) }, "Failed to run why-is-node-running");
  }

  await new Promise((res) => setTimeout(res, 500));
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
