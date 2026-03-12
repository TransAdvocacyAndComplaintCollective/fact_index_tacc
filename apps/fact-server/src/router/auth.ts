/**
 * Unified Authentication Router
 * 
 * Consolidates all authentication strategies:
 * - Discord OAuth 2.0
 * - Dev bypass (development only)
 * - Admin role management
 * 
 */

import express from "express";
import passport from "passport";
import discordRouter from "./auth/discord.ts";
import devRouter from "./auth/dev.ts";
import adminRouter from "./auth/admin.ts";
import {
  validateAndRefreshSession,
  validateJWTOnly,
} from "../auth/passport-discord.ts";
import { isDevModeActive } from "../auth/passport-dev.ts";
import { derivePermissionsFromDb } from "../auth/permissions.ts";
import type { Request, Response } from "express";
import logger from "../logger.ts";

const router = express.Router();

/**
 * GET /auth/status
 * Returns current authentication status with user details and permissions
 */
router.get("/auth/status", validateAndRefreshSession, async (req: Request, res: Response) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authStatus = (req as any).authStatus ?? { authenticated: false };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rotatedToken = (req as any).rotatedToken as string | undefined;

    const derivedPermissions = await derivePermissionsFromDb(authStatus);
    if (authStatus?.authenticated && authStatus?.user) {
      authStatus.user = {
        ...authStatus.user,
        permissions: derivedPermissions,
      };
    }

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

/**
 * GET /auth/available
 * Reports which authentication providers are available and their URLs
 */
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

/**
 * GET /auth/me
 * Returns current authentication status (lightweight JWT validation only, no Discord API calls)
 */
router.get("/auth/me", validateJWTOnly, async (req: Request, res: Response) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const st = (req as any).authStatus as any;

    if (!st?.authenticated) {
      return res.status(401).json({
        authenticated: false,
        error: st?.reason ?? "unauthenticated",
      });
    }

    const derivedPermissions = await derivePermissionsFromDb(st);

    return res.status(200).json({
      authenticated: true,
      user: {
        ...st.user,
        permissions: derivedPermissions,
      },
      devBypass: !!st.devBypass,
    });
  } catch (err: unknown) {
    logger.error("[auth] /auth/me error", { error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * Mount Discord OAuth endpoints (e.g., /auth/discord, /auth/discord/callback)
 */
router.use("/auth", discordRouter);

/**
 * Mount dev login endpoint if dev mode is active
 * Development-only bypass for testing without Discord credentials
 */
if (isDevModeActive()) {
  router.use("/auth", devRouter);
}

/**
 * Mount admin management endpoints under /auth/admin
 * Allows admins to manage user roles and permissions
 */
router.use("/auth/admin", adminRouter);

/**
 * GET /auth/debug
 * Development-only endpoint to inspect authentication state
 */
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

/**
 * GET /health
 * Health check endpoint
 */
router.get("/health", (_req: Request, res: Response) => {
  try {
    return res.status(200).json({ status: "ok", timestamp: new Date() });
  } catch (err: unknown) {
    logger.error("[auth] /health error", { error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ error: "internal_error" });
  }
});

export default router;
