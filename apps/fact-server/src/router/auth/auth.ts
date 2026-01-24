import express from "express";
import passport from "passport";
import discordRouter from "./discord.ts";
import {
  validateAndRefreshSession,
  verifyJWT,
  refreshAccessToken,
  generateJWT,
} from "../../auth/passport-discord.ts";
import type { Request, Response } from "express";
import logger from "../../logger.ts";

const router = express.Router();

// Robust env boolean parsing.
function envFlag(name: string): boolean {
  const v = process.env[name];
  if (!v) return false;
  return ["true", "1", "yes", "y", "on"].includes(v.trim().toLowerCase());
}

const DEV_LOGIN = envFlag("DEV_LOGIN_MODE");

// Provide a stable /auth/status endpoint consumed by the frontend.
router.get("/auth/status", validateAndRefreshSession, (req: Request, res: Response) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authStatus = (req as any).authStatus ?? { authenticated: false };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rotatedToken = (req as any).rotatedToken as string | undefined;

    // Keep UI shape: { discord: {...} }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = { discord: authStatus };

    // If server rotated JWT to reflect new claims, send it (frontend accepts this).
    if (rotatedToken) payload.token = rotatedToken;

    return res.status(200).json(payload);
  } catch (err: unknown) {
    logger.error("[auth] /auth/status handler error", { error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ error: "internal_error" });
  }
});

// Reports whether auth is available, and which URL to use (dev bypass vs real OAuth).
router.get("/auth/available", (_req: Request, res: Response) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const strategiesObj = (passport as any)._strategies as Record<string, unknown> | undefined;
    const strategyNames = Object.keys(strategiesObj || {});

    const hasDiscord = strategyNames.includes("discord");

    // If dev login is active, we *always* expose the dev URL regardless of passport strategies.
    const providers = [
      {
        name: "discord",
        available: DEV_LOGIN ? true : hasDiscord,
        url: DEV_LOGIN ? "/auth/discord/dev" : "/auth/discord",
        devBypass: DEV_LOGIN,
      },
    ];

    const anyAvailable = providers.some((p) => p.available);
    if (!anyAvailable) {
      return res.status(503).json({ available: false, providers, strategies: strategyNames });
    }

    return res.status(200).json({ available: true, providers, strategies: strategyNames });
  } catch (err: unknown) {
    logger.error("[auth] /auth/available error", { error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ available: false, error: String(err) });
  }
});

// GET /auth/me - Return current auth status (validated via middleware)
router.get("/auth/me", validateAndRefreshSession, (req: Request, res: Response) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const st = (req as any).authStatus as any;

    if (!st?.authenticated) {
      return res.status(401).json({
        authenticated: false,
        error: st?.reason ?? "unauthenticated",
      });
    }

    return res.status(200).json({
      authenticated: true,
      user: st.user,
      devBypass: !!st.devBypass,
    });
  } catch (err: unknown) {
    logger.error("[auth] /auth/me error", { error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ error: "internal_error" });
  }
});

// POST /auth/refresh - refresh Discord OAuth access token server-side (if possible) and rotate JWT expiry.
router.post("/auth/refresh", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "missing_token" });
    }

    const token = authHeader.slice(7);
    const user = verifyJWT(token);
    if (!user) return res.status(401).json({ error: "invalid_token" });

    // Dev bypass users don't need refresh.
    if (user.devBypass) {
      return res.status(200).json({ accessToken: generateJWT(user) });
    }

    try {
      await refreshAccessToken(user);
    } catch (err) {
      logger.warn("[auth] /auth/refresh failed:", err);
      return res.status(401).json({ error: "token_refresh_failed" });
    }

    // Rotate JWT (extends JWT expiry; does NOT embed Discord tokens).
    const newJwt = generateJWT(user);
    return res.status(200).json({ accessToken: newJwt });
  } catch (err: unknown) {
    logger.error("[auth] /auth/refresh error", { error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ error: "internal_error" });
  }
});

// Expose all other auth-related endpoints under /auth — e.g. /auth/discord, /auth/logout
router.use("/auth", discordRouter);

// Dev-only debug endpoint to inspect the current auth status/user state.
router.get("/auth/debug", (req: Request, res: Response) => {
  if (process.env.NODE_ENV !== "development") return res.status(404).json({ error: "not_found" });
  try {
    const info = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user: (req as any).user ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      authStatus: (req as any).authStatus ?? null,
      cookies: req.headers.cookie ?? null,
    };
    return res.status(200).json(info);
  } catch (err: unknown) {
    logger.error("[auth] /auth/debug error", { error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ error: "internal_error" });
  }
});

// GET /health - Health check endpoint
router.get("/health", (_req: Request, res: Response) => {
  try {
    return res.status(200).json({ status: "ok", timestamp: new Date() });
  } catch (err: unknown) {
    logger.error("[auth] /health error", { error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ error: "internal_error" });
  }
});

export default router;
