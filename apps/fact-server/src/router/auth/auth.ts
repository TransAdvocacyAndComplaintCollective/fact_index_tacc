import express from "express";
import passport from "passport";
import discordRouter from "./discord.ts";
import devRouter from "./dev.ts";
import adminRouter from "./admin.ts";
import {
  validateAndRefreshSession,
  validateJWTOnly,
} from "../../auth/passport-discord.ts";
import { isDevModeActive } from "../../auth/passport-dev.ts";
import { derivePermissionsFromDb } from "../../auth/permissions.ts";
import type { Request, Response } from "express";
import logger from "../../logger.ts";
import {
  discordAccessTokenCookieOptions,
  discordRefreshTokenCookieOptions,
} from "../../config/securityConfig.ts";

const router = express.Router();

function mergePermissions(base: string[], extra: string[] | null): string[] {
  const merged = [...base];
  if (Array.isArray(extra)) {
    for (const p of extra) {
      const s = String(p || "").trim();
      if (!s) continue;
      if (!merged.includes(s)) merged.push(s);
    }
  }
  return merged;
}

function setNoStore(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  // Prevent Express from returning 304 based on ETag for auth endpoints.
  res.removeHeader("ETag");
  res.setHeader("Surrogate-Control", "no-store");
}

// Provide a stable /auth/status endpoint consumed by the frontend.
router.get("/auth/status", validateAndRefreshSession, async (req: Request, res: Response) => {
  try {
    setNoStore(res);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authStatus = (req as any).authStatus ?? { authenticated: false };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rotatedToken = (req as any).rotatedToken as string | undefined;

    // If validateAndRefreshSession refreshed Discord OAuth tokens, persist them as cookies.
    const refreshed = (req as any).refreshedDiscordTokens as any;
    if (refreshed && typeof refreshed === "object") {
      if (typeof refreshed.accessToken === "string" && refreshed.accessToken.trim()) {
        res.cookie("discord_access_token", refreshed.accessToken, discordAccessTokenCookieOptions);
      }
      if (typeof refreshed.refreshToken === "string" && refreshed.refreshToken.trim()) {
        res.cookie("discord_refresh_token", refreshed.refreshToken, discordRefreshTokenCookieOptions);
      }
    }

    const devPermissionsRaw = (req as any)?.user?.devPermissions;
    const devPermissions = Array.isArray(devPermissionsRaw)
      ? devPermissionsRaw.map((p: unknown) => String(p).trim()).filter(Boolean)
      : null;

    const derived = await derivePermissionsFromDb(authStatus);
    const permissions =
      authStatus?.authenticated && authStatus?.devBypass ? mergePermissions(derived, devPermissions) : derived;

    if (authStatus?.authenticated && authStatus?.user) {
      authStatus.user = { ...authStatus.user, permissions };
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

// Reports whether auth is available, and which URL to use (dev bypass vs real OAuth).
router.get("/auth/available", (_req: Request, res: Response) => {
  try {
    setNoStore(res);
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

// GET /auth/me - Return current auth status (lightweight JWT validation, no Discord API calls)
router.get("/auth/me", validateJWTOnly, async (req: Request, res: Response) => {
  try {
    setNoStore(res);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const st = (req as any).authStatus as any;

    if (!st?.authenticated) {
      return res.status(401).json({
        authenticated: false,
        error: st?.reason ?? "unauthenticated",
      });
    }

    const devPermissionsRaw = (req as any)?.user?.devPermissions;
    const devPermissions = Array.isArray(devPermissionsRaw)
      ? devPermissionsRaw.map((p: unknown) => String(p).trim()).filter(Boolean)
      : null;

    const derived = await derivePermissionsFromDb(st);
    const derivedPermissions = st?.authenticated && st?.devBypass ? mergePermissions(derived, devPermissions) : derived;

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

// Expose all other auth-related endpoints under /auth — e.g. /auth/discord, /auth/logout
router.use("/auth", discordRouter);

// Expose dev login endpoint if dev mode is active
// Dev login is available in development mode
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
