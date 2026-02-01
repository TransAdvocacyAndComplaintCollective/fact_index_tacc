import express from "express";
import passport from "passport";
import discordRouter from "./discord.ts";
import devRouter from "./dev.ts";
import adminRouter from "./admin.ts";
import magicRouter from "./magic.ts";
import {
  validateAndRefreshSession,
  validateJWTOnly,
} from "../../auth/passport-discord.ts";
import { isDevModeActive } from "../../auth/passport-dev.ts";
import {
  verifyJWT,
} from "../../auth/jwt.ts";
import type { Request, Response } from "express";
import logger from "../../logger.ts";

const router = express.Router();

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
    const devModeActive = isDevModeActive();

    const providers = [];

    // Add Discord OAuth provider
    providers.push({
      name: "discord",
      available: hasDiscord,
      url: "/auth/discord",
    });

    // Add magic-link provider if strategy registered
    const hasMagic = strategyNames.includes("magiclink");
    providers.push({
      name: "magiclink",
      available: hasMagic,
      url: "/auth/magiclink",
    });

    // Add dev bypass provider if dev mode is active
    if (devModeActive) {
      providers.push({
        name: "dev",
        available: true,
        url: "/auth/dev",
        devBypass: true,
      });
    }

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

// GET /auth/me - Return current auth status (lightweight JWT validation, no Discord API calls)
router.get("/auth/me", validateJWTOnly, (req: Request, res: Response) => {
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

// Expose all other auth-related endpoints under /auth — e.g. /auth/discord, /auth/logout
router.use("/auth", discordRouter);

// Expose magic-link routes if enabled
router.use("/auth", magicRouter);

// Expose dev login endpoint if dev mode is active
if (isDevModeActive()) {
  router.use("/auth", devRouter);
}

// Expose admin management endpoints under /auth/admin
router.use("/auth/admin", adminRouter);

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
