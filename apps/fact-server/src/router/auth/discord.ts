import express from "express";
import passport from "passport";
import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import logger from "../../logger.ts";
import { generateJWT, verifyJWT, clearDiscordTokensForUser } from "../../auth/passport-discord.ts";

const router = express.Router();

/**
 * Robust env boolean parsing.
 * Accepts TRUE/true/1/yes/on as truthy.
 */
function envFlag(name: string): boolean {
  const v = process.env[name];
  if (!v) return false;
  return ["true", "1", "yes", "y", "on"].includes(v.trim().toLowerCase());
}

const DEV_LOGIN = envFlag("DEV_LOGIN_MODE");
const STRATEGY = DEV_LOGIN ? "discord-dev-bypass" : "discord";

// Scopes required to:
// - list guilds: /users/@me/guilds (guilds)
// - read current user's roles in a guild: /users/@me/guilds/{guild.id}/member (guilds.members.read)
const DISCORD_SCOPE = ["identify", "guilds", "guilds.members.read"] as const;

// ---------- logging helpers ----------
function safeUA(req: Request): string {
  const ua = req.headers["user-agent"];
  if (!ua) return "";
  const s = Array.isArray(ua) ? ua.join(" ") : ua;
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
}

function requestId(req: Request, res: Response): string {
  const hdr = req.headers["x-request-id"];
  const existing = Array.isArray(hdr) ? hdr[0] : hdr;
  const id = (existing && String(existing).trim()) || res.locals.requestId || randomUUID();
  res.locals.requestId = id;
  return id;
}

function ctx(req: Request, res: Response): string {
  const id = requestId(req, res);
  return `id=${id} ${req.method} ${req.originalUrl}`;
}

function summarizeUser(user: unknown): Record<string, unknown> {
  if (!user) return { present: false };
  if (typeof user === "string" || typeof user === "number") return { present: true, value: user };

  if (typeof user === "object") {
    const u = user as Record<string, unknown>;
    const id = u.id ?? u.userId ?? u.discordId ?? u.username ?? undefined;

    return {
      present: true,
      type: u.constructor?.name ?? "object",
      id,
      keys: Object.keys(u).slice(0, 10),
    };
  }

  return { present: true, type: typeof user };
}

function summarizeInfo(info: unknown): Record<string, unknown> | string | undefined {
  if (!info) return undefined;
  if (typeof info === "string") return info;

  if (typeof info === "object") {
    const i = info as Record<string, unknown>;
    return {
      type: i.constructor?.name ?? "object",
      message: i.message,
      name: i.name,
      keys: Object.keys(i).slice(0, 10),
    };
  }

  return { type: typeof info } as any;
}

// Log every request that hits this router, plus response outcome.
router.use((req: Request, res: Response, next: NextFunction) => {
  const id = requestId(req, res);
  const start = process.hrtime.bigint();

  logger.debug(
    `[auth] --> id=${id} ${req.method} ${req.originalUrl} ip=${req.ip} ua="${safeUA(req)}"`,
  );

  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    logger.debug(
      `[auth] <-- id=${id} ${req.method} ${req.originalUrl} status=${res.statusCode} ${ms.toFixed(1)}ms`,
    );
  });

  res.on("close", () => {
    if (!res.writableEnded) {
      logger.warn(`[auth] xx  id=${id} connection closed before response finished`);
    }
  });

  next();
});

// ---------- strategy guard ----------
function ensureStrategy(req: Request, res: Response, next: NextFunction) {
  // Passport internals (ok for diagnostics); we still guard gracefully.
  const strategyLookup = (passport as any)._strategy as undefined | ((name: string) => unknown);
  const strategy =
    typeof strategyLookup === "function" ? strategyLookup.call(passport, STRATEGY) : undefined;

  if (!strategy && !DEV_LOGIN) {
    const strategiesObj = (passport as any)._strategies as Record<string, unknown> | undefined;
    const registered = strategiesObj ? Object.keys(strategiesObj) : [];

    logger.warn(
      `[auth] ${ctx(req, res)} Strategy '${STRATEGY}' not registered. Registered=[${registered.join(", ")}]`,
    );

    return res.status(503).json({
      error: "Discord auth is not configured on the server",
      strategy: STRATEGY,
      registeredStrategies: registered,
      requestId: res.locals.requestId,
    });
  }

  logger.debug(`[auth] ${ctx(req, res)} Strategy '${STRATEGY}' is available (or DEV_LOGIN active)`);
  return next();
}

// ---------- routes ----------
router.get(
  "/discord",
  (req: Request, res: Response, next: NextFunction) => {
    if (DEV_LOGIN) {
      logger.info(`[auth] ${ctx(req, res)} DEV_LOGIN active; redirecting to dev-login helper`);
      return res.redirect("/auth/discord/dev");
    }
    return next();
  },
  ensureStrategy,
  (req: Request, res: Response, next: NextFunction) => {
    logger.info(`[auth] ${ctx(req, res)} initiating OAuth flow strategy=${STRATEGY}`);
    next();
  },
  // IMPORTANT: disable sessions for stateless JWT auth
  passport.authenticate(STRATEGY, { scope: [...DISCORD_SCOPE], session: false }),
);

router.get("/discord/callback", ensureStrategy, (req: Request, res: Response, next: NextFunction) => {
  const q = req.query as Record<string, unknown>;
  const queryKeys = Object.keys(q ?? {});
  const hasCode = typeof q.code === "string";
  const hasError = typeof q.error === "string";

  logger.info(
    `[auth] ${ctx(req, res)} callback received queryKeys=[${queryKeys.join(", ")}] hasCode=${hasCode} hasError=${hasError}`,
  );

  const middleware = passport.authenticate(
    STRATEGY,
    { session: false },
    (err: unknown, user: unknown, info: unknown, status?: number) => {
      if (err) {
        logger.error(
          `[auth] ${ctx(req, res)} authenticate error status=${status ?? "n/a"} info=${JSON.stringify(
            summarizeInfo(info),
          )}`,
          err as Error,
        );
        return next(err as Error);
      }

      if (!user) {
        logger.warn(
          `[auth] ${ctx(req, res)} authentication FAILED status=${status ?? "n/a"} info=${JSON.stringify(
            summarizeInfo(info),
          )}`,
        );

        let rawReason = "unknown";
        let reasonCode = "unknown";

        if (info && typeof info === "object") {
          const im = info as any;
          rawReason = String(im.message ?? rawReason);
          if (im.code && typeof im.code === "string") reasonCode = im.code;
          else if (/guild/i.test(rawReason)) reasonCode = "missing_guild";
          else if (/role/i.test(rawReason)) reasonCode = "missing_role";
          else reasonCode = "auth_failed";
        } else if (typeof info === "string") {
          rawReason = info as string;
          if (/guild/i.test(rawReason)) reasonCode = "missing_guild";
          else if (/role/i.test(rawReason)) reasonCode = "missing_role";
          else reasonCode = "auth_failed";
        }

        const userMessageMap: Record<string, string> = {
          missing_guild: "You are not a member of the required Discord server.",
          missing_role: "You do not have the required role in the Discord server. Ask an admin to grant the role.",
          auth_failed: "Authentication with Discord failed. Please try again or contact an administrator.",
          unknown: "Sign-in failed due to an unknown issue. Please try again or contact support.",
        };

        const encodedRaw = encodeURIComponent(rawReason);
        const encodedCode = encodeURIComponent(reasonCode);
        const encodedUserMessage = encodeURIComponent(userMessageMap[reasonCode] || userMessageMap.unknown);

        return res.redirect(
          `/login?error=discord&reason=${encodedRaw}&reasonCode=${encodedCode}&userMessage=${encodedUserMessage}`,
        );
      }

      logger.info(`[auth] ${ctx(req, res)} authentication OK user=${JSON.stringify(summarizeUser(user))}`);

      // Issue JWT (contains NO Discord OAuth tokens)
      const authUser = user as any;
      const token = generateJWT(authUser);

      logger.info(`[auth] ${ctx(req, res)} JWT generated for user ${authUser.id}; redirecting to home with token`);
      return res.redirect(`/?token=${encodeURIComponent(token)}`);
    },
  );

  return middleware(req, res, next);
});

router.post("/logout", (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const hasToken = Boolean(authHeader?.startsWith("Bearer "));

  logger.info(`[auth] ${ctx(req, res)} logout requested; token=${hasToken ? "present" : "missing"}`);

  // Optional server-side cleanup of stored Discord OAuth tokens
  if (hasToken) {
    const token = authHeader!.slice(7);
    const user = verifyJWT(token);
    if (user?.id) clearDiscordTokensForUser(user.id);
  }

  logger.info(`[auth] ${ctx(req, res)} logout successful`);
  return res.status(204).end();
});

// Development helper: establish a fake logged-in user for local testing.
if (DEV_LOGIN) {
  router.get("/discord/dev", (req: Request, res: Response) => {
    const userParam =
      typeof req.query.user === "string" && req.query.user.trim()
        ? req.query.user.trim()
        : "dev-user";

    const fakeUser = {
      id: `dev-${userParam}`,
      username: userParam,
      avatar: null,
      guild: null,
      hasRole: true,
      devBypass: true,
    };

    const token = generateJWT(fakeUser);
    logger.info(`[auth] ${ctx(req, res)} dev-login JWT generated for ${fakeUser.username}`);
    return res.redirect(`/?token=${encodeURIComponent(token)}`);
  });
}

// Router-local error logger
router.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  logger.error(`[auth] ${ctx(req, res)} UNHANDLED ROUTER ERROR`, err as Error);

  if (res.headersSent) return next(err as Error);

  const errMsg =
    err && typeof err === "object" && (err as any).message ? (err as any).message : undefined;

  const errStack =
    err && typeof err === "object" && (err as any).stack
      ? String((err as any).stack).split("\n").slice(0, 4).join("\n")
      : undefined;

  const payload: Record<string, unknown> = {
    error: "Authentication server error",
    requestId: res.locals.requestId,
  };

  if (errMsg) payload.errorMessage = errMsg;
  if (process.env.NODE_ENV === "development" && errStack) payload.errorStack = errStack;

  res.status(500).json(payload);
});

export default router;
