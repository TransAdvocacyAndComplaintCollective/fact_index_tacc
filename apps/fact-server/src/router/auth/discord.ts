import express from "express";
import passport from "passport";
import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import logger from "../../logger.ts";
import { 
  generateJWT, 
  verifyJWTAsync,
  revokeToken,
  generateOAuthStateJWT,
  verifyOAuthStateJWT,
  registerOAuthStateToken,
  consumeOAuthStateToken,
} from "../../auth/jwt.ts";
import { isDevModeActive } from "../../auth/passport-dev.ts";
import { redirectWithSecureToken } from "./tokenResponse.ts";
import {
  discordAccessTokenCookieOptions,
  discordRefreshTokenCookieOptions,
} from "../../config/securityConfig.ts";

const router = express.Router();

const STRATEGY = "discord";

// Scopes required to:
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

function queryValues(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter(Boolean);
  }
  if (typeof input !== "string") return [];
  const trimmed = input.trim();
  return trimmed ? [trimmed] : [];
}

function singleQueryValue(input: unknown): string | null {
  const values = queryValues(input);
  return values.length ? values[0] : null;
}

function findRepeatedQueryParam(
  query: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    if (queryValues(query[key]).length > 1) {
      return key;
    }
  }
  return null;
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

  if (!strategy && !isDevModeActive()) {
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

  logger.debug(`[auth] ${ctx(req, res)} Strategy '${STRATEGY}' is available (or dev mode active)`);
  return next();
}

// ---------- OAuth 2.0 Authorization Code Grant Flow with CSRF Protection ----------
/**
 * This implements the OAuth 2.0 Authorization Code Grant (RFC 6749) with stateless CSRF:
 *
 * 1. Client (browser) initiates login → /auth/discord
 *    - Server generates JWT-based state parameter for CSRF protection
 *    - State is a JWT token with 10-minute expiry (stateless)
 *    - Browser is redirected to Discord OAuth endpoint with state
 *
 * 2. User authorizes on Discord's server
 *    - Discord redirects back to /auth/discord/callback with:
 *      - code (authorization code)
 *      - state (echoed back by Discord)
 *
 * 3. Server validates the state JWT (stateless CSRF check)
 *    - Verifies JWT signature and expiry
 *    - If state is invalid/missing/expired, abort (CSRF protection)
 *    - Prevents attacks from malicious sites - no server database needed
 *
 * 4. Server exchanges code for tokens (back-channel)
 *    - Uses client_id + client_secret (server-to-server)
 *    - Receives access_token, refresh_token from Discord
 *
 * 5. Server issues JWT to client
 *    - JWT contains encrypted Discord tokens (AES-256-GCM)
 *    - User is redirected home with JWT in URL
 *    - No sensitive tokens exposed in URLs or to browser directly
 */

// ---------- routes ----------
router.get("/discord", ensureStrategy, (req: Request, res: Response, next: NextFunction) => {
  void (async () => {
    const stateJWT = await generateOAuthStateJWT();
    registerOAuthStateToken(stateJWT);
    logger.info(`[auth] ${ctx(req, res)} initiating OAuth 2.0 Authorization Code Grant flow with JWT state=${stateJWT.slice(0, 8)}...`);
    passport.authenticate(STRATEGY, { scope: [...DISCORD_SCOPE], state: stateJWT, session: false })(req, res, next);
  })().catch((err) => next(err));
});

router.get("/discord/callback", ensureStrategy, (req: Request, res: Response, next: NextFunction) => {
  void (async () => {
  const q = req.query as Record<string, unknown>;
  const queryKeys = Object.keys(q ?? {});
  const codeParam = singleQueryValue(q.code);
  const errorParam = singleQueryValue(q.error);
  const errorDescriptionParam = singleQueryValue(q.error_description);
  const stateParam = singleQueryValue(q.state);
  const hasCode = Boolean(codeParam);
  const hasError = Boolean(errorParam);
  const hasState = Boolean(stateParam);

  logger.info(
    `[auth] ${ctx(req, res)} callback received queryKeys=[${queryKeys.join(", ")}] hasCode=${hasCode} hasError=${hasError} hasState=${hasState}`,
  );

  const repeatedParam = findRepeatedQueryParam(q, ["state", "code", "error", "error_description"]);
  if (repeatedParam) {
    logger.warn(
      `[auth] ${ctx(req, res)} Rejected callback due to duplicated query parameter "${repeatedParam}"`,
    );
    const userMessage = `Authentication failed: duplicated "${repeatedParam}" query parameter`;
    const encodedUserMessage = encodeURIComponent(userMessage);
    return res.redirect(`/login?error=csrf_failure&reasonCode=invalid_request&userMessage=${encodedUserMessage}`);
  }

  if (hasCode && hasError) {
    logger.warn(
      `[auth] ${ctx(req, res)} Rejected callback containing both code and error parameters`,
    );
    const userMessage = "Authentication failed: callback cannot include both code and error";
    const encodedUserMessage = encodeURIComponent(userMessage);
    return res.redirect(`/login?error=csrf_failure&reasonCode=invalid_request&userMessage=${encodedUserMessage}`);
  }

  // Validate state parameter (stateless CSRF protection for Authorization Code Grant)
  if (!hasState) {
    logger.warn(
      `[auth] ${ctx(req, res)} State parameter missing from callback - possible CSRF attack or misconfiguration`,
    );
    const userMessage = "Authentication failed: missing state parameter (CSRF protection)";
    const encodedUserMessage = encodeURIComponent(userMessage);
    return res.redirect(`/login?error=csrf_failure&reasonCode=missing_state&userMessage=${encodedUserMessage}`);
  }

  const state = String(stateParam);
  const stateData = await verifyOAuthStateJWT(state);
  
  if (!stateData) {
    logger.warn(
      `[auth] ${ctx(req, res)} State JWT validation failed - possible CSRF attack or expired state`,
    );
    const userMessage = "Authentication failed: invalid or expired state parameter";
    const encodedUserMessage = encodeURIComponent(userMessage);
    return res.redirect(`/login?error=csrf_failure&reasonCode=invalid_state&userMessage=${encodedUserMessage}`);
  }

  // Enforce one-time use (replay protection) without requiring any session cookie.
  if (!consumeOAuthStateToken(state)) {
    logger.warn(`[auth] ${ctx(req, res)} State replay/missing - rejecting callback`);
    const userMessage = "Authentication failed: invalid or replayed state parameter";
    const encodedUserMessage = encodeURIComponent(userMessage);
    return res.redirect(`/login?error=csrf_failure&reasonCode=invalid_state&userMessage=${encodedUserMessage}`);
  }

  // If Discord itself returned an error (user denied, etc.)
  if (hasError) {
    const discordError = String(errorParam ?? "unknown");
    const discordErrorDesc = String(errorDescriptionParam ?? "");
    logger.warn(
      `[auth] ${ctx(req, res)} Discord rejected request error=${discordError} description=${discordErrorDesc}`,
    );
    const userMessage = discordErrorDesc || `Discord denied the request (${discordError})`;
    const encodedRaw = encodeURIComponent(discordError);
    const encodedCode = encodeURIComponent("discord_denied");
    const encodedUserMessage = encodeURIComponent(userMessage);

    return res.redirect(
      `/login?error=discord&reason=${encodedRaw}&reasonCode=${encodedCode}&userMessage=${encodedUserMessage}`,
    );
  }

  const middleware = passport.authenticate(
    STRATEGY,
    { session: false },
    async (err: unknown, user: unknown, info: unknown, status?: number) => {
      if (err) {
        const errMsg = err && typeof err === "object" && (err as any).message ? (err as any).message : String(err);
        logger.error(
          `[auth] ${ctx(req, res)} authenticate error status=${status ?? "n/a"} message=${errMsg} info=${JSON.stringify(
            summarizeInfo(info),
          )}`,
          err instanceof Error ? { message: err.message, stack: err.stack } : { error: String(err) },
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
          missing_role: "You do not have the required role in the server. Ask an admin to grant it.",
          auth_failed: "Authentication with Discord failed. Please try again or contact an administrator.",
          member_fetch_failed:
            "Discord temporarily blocked the member lookup. Please wait a minute and try again.",
          discord_error: "Discord responded with an error. Try again or contact support if it keeps failing.",
          unknown: "Sign-in failed due to an unknown issue. Please try again or contact support.",
        };

        const fallbackUserMessage =
          userMessageMap[reasonCode] || rawReason || userMessageMap.unknown;
        const encodedRaw = encodeURIComponent(rawReason);
        const encodedCode = encodeURIComponent(reasonCode);
        const encodedUserMessage = encodeURIComponent(fallbackUserMessage);

        return res.redirect(
          `/login?error=discord&reason=${encodedRaw}&reasonCode=${encodedCode}&userMessage=${encodedUserMessage}`,
        );
      }

      logger.info(`[auth] ${ctx(req, res)} authentication OK user=${JSON.stringify(summarizeUser(user))}`);

      const authUser = user as any;

      // Persist Discord tokens as HttpOnly cookies for server-side use.
      if (authUser?.type === "discord") {
        if (typeof authUser.accessToken === "string" && authUser.accessToken.trim()) {
          res.cookie("discord_access_token", authUser.accessToken, discordAccessTokenCookieOptions);
        }
        if (typeof authUser.refreshToken === "string" && authUser.refreshToken.trim()) {
          res.cookie("discord_refresh_token", authUser.refreshToken, discordRefreshTokenCookieOptions);
        }
      }

      // Don't embed OAuth tokens in JWT.
      if (authUser && typeof authUser === "object") {
        delete authUser.accessToken;
        delete authUser.refreshToken;
        delete authUser.encryptedTokens;
      }

      const token = await generateJWT(authUser);

      logger.info(`[auth] ${ctx(req, res)} JWT generated for user ${authUser.id}; redirecting to home with secure token cookie`);
      return redirectWithSecureToken(res, token, "/");
    },
  );

  return middleware(req, res, next);
  })().catch((err) => next(err));
});

router.post("/logout", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const headerToken =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";
  const cookieToken = typeof req.cookies?.auth_token === "string" ? req.cookies.auth_token.trim() : "";
  const token = headerToken || cookieToken;
  const tokenSource = headerToken ? "header" : cookieToken ? "cookie" : "missing";

  logger.info(`[auth] ${ctx(req, res)} logout requested; token=${token ? "present" : "missing"} source=${tokenSource}`);

  try {
    // Revoke JWT token and clear Discord OAuth tokens (logs user out of Discord)
    if (token) {
      const user = token ? await verifyJWTAsync(token) : null;
      
      if (user?.id && user?.type === "discord" && user?.jti) {
        const expiryTime = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days
        await revokeToken(user.jti, user.id, expiryTime, "logout");
        logger.info(`[auth] ${ctx(req, res)} user ${user.id} logged out: JWT revoked and Discord tokens cleared`);
      }
    }

    res.clearCookie("auth_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });
    res.clearCookie("discord_access_token", { path: "/" });
    res.clearCookie("discord_refresh_token", { path: "/" });

    logger.info(`[auth] ${ctx(req, res)} logout successful`);
    return res.status(204).end();
  } catch (err) {
    logger.error(`[auth] ${ctx(req, res)} logout error`, err instanceof Error ? { message: err.message, stack: err.stack } : { error: String(err) });
    res.clearCookie("auth_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });
    res.clearCookie("discord_access_token", { path: "/" });
    res.clearCookie("discord_refresh_token", { path: "/" });
    // Still return 204 to not leak information about errors
    return res.status(204).end();
  }
});

// Router-local error logger - redirect to login page with error details
router.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  logger.error(`[auth] ${ctx(req, res)} UNHANDLED ROUTER ERROR`, err instanceof Error ? { message: err.message, stack: err.stack } : { error: String(err) });

  if (res.headersSent) return next(err as Error);

  const errMsg =
    err && typeof err === "object" && (err as any).message ? (err as any).message : undefined;

  const errStack =
    err && typeof err === "object" && (err as any).stack
      ? String((err as any).stack).split("\n").slice(0, 4).join("\n")
      : undefined;

  // Derive a reasonCode from the error message
  let reasonCode = "server_error";
  let userMessage = "An error occurred during authentication. Please try again or contact support.";

  if (errMsg) {
    if (/invalid.*code/i.test(errMsg)) {
      reasonCode = "invalid_code";
      userMessage = "The authorization code from Discord is invalid or has expired. Please try logging in again.";
    } else if (/token/i.test(errMsg)) {
      reasonCode = "token_error";
      userMessage = "Failed to obtain a token from Discord. Please try again.";
    } else if (/network|connection|fetch|timeout/i.test(errMsg)) {
      reasonCode = "network_error";
      userMessage = "Network error connecting to Discord. Please check your connection and try again.";
    }
  }

  logger.warn(
    `[auth] ${ctx(req, res)} Redirecting to login with error reasonCode=${reasonCode} message=${errMsg ?? "n/a"}`,
  );

  const encodedRaw = encodeURIComponent(errMsg || "Unknown error");
  const encodedCode = encodeURIComponent(reasonCode);
  const encodedUserMessage = encodeURIComponent(userMessage);

  return res.redirect(
    `/login?error=discord&reason=${encodedRaw}&reasonCode=${encodedCode}&userMessage=${encodedUserMessage}`,
  );
});

export default router;
