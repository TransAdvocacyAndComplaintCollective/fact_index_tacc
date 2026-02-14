import express from "express";
import passport from "passport";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import discordRouter from "./discord.ts";
import devRouter from "./dev.ts";
import adminRouter from "./admin.ts";
import {
  validateAndRefreshSession,
  validateJWTOnly,
} from "../../auth/passport-discord.ts";
import { isDevModeActive } from "../../auth/passport-dev.ts";
import { getFederationProviders } from "../../auth/federation-auth.ts";
import type { Request, Response } from "express";
import logger from "../../logger.ts";

const router = express.Router();
const ADMIN_ACTIONS = [
  "facts:read",
  "facts:write",
  "admin:config:read",
  "admin:config:write",
  "admin:users:write",
  "admin:guilds:read",
  "admin:guilds:write",
  "admin:roles:read",
  "admin:roles:write",
  "admin:whitelist:write",
];

const __filename = fileURLToPath(import.meta.url);
const __dirname_local = path.dirname(__filename);
const CONFIG_PATH = path.resolve(__dirname_local, "..", "..", "config", "discord-auth.json");

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

function loadRoleConfig(): {
  roles: Record<string, { permissions?: string[] }>;
  userRoles: Record<string, string[]>;
  adminUsers: string[];
} {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      return { roles: {}, userRoles: {}, adminUsers: [] };
    }
    const raw = fs.readFileSync(CONFIG_PATH, { encoding: "utf8" });
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      roles: parsed?.roles && typeof parsed.roles === "object" ? parsed.roles : {},
      userRoles:
        parsed?.userRoles && typeof parsed.userRoles === "object" && !Array.isArray(parsed.userRoles)
          ? parsed.userRoles
          : {},
      adminUsers: normalizeStringArray(parsed?.adminUsers),
    };
  } catch {
    return { roles: {}, userRoles: {}, adminUsers: [] };
  }
}

function derivePermissionsFromConfig(authStatus: any): string[] {
  if (!authStatus?.authenticated || !authStatus?.user?.id) return [];

  const userId = String(authStatus.user.id);
  const { roles, userRoles, adminUsers } = loadRoleConfig();
  const granted = new Set<string>();
  const roleKeys = new Set<string>();

  if (authStatus.user.isAdmin || adminUsers.includes(userId)) {
    ADMIN_ACTIONS.forEach((permission) => granted.add(permission));
  }

  normalizeStringArray(userRoles[userId]).forEach((roleId) => roleKeys.add(roleId));
  normalizeStringArray(authStatus.user.cachedMemberRoles).forEach((roleId) => roleKeys.add(roleId));

  for (const roleId of roleKeys) {
    const role = roles?.[roleId];
    normalizeStringArray(role?.permissions).forEach((permission) => granted.add(permission));
  }

  return Array.from(granted).sort();
}

// Provide a stable /auth/status endpoint consumed by the frontend.
router.get("/auth/status", validateAndRefreshSession, (req: Request, res: Response) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authStatus = (req as any).authStatus ?? { authenticated: false };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rotatedToken = (req as any).rotatedToken as string | undefined;

    const derivedPermissions = derivePermissionsFromConfig(authStatus);
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

// Reports whether auth is available, and which URL to use (dev bypass vs real OAuth).
router.get("/auth/available", (_req: Request, res: Response) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const strategiesObj = (passport as any)._strategies as Record<string, unknown> | undefined;
    const strategyNames = Object.keys(strategiesObj || {});

    const hasDiscord = strategyNames.includes("discord");
    const devModeActive = isDevModeActive();
    const federationEnabled = process.env.ENABLE_FEDERATION_LOGIN !== 'false';

    const providers = [];

    // Add Discord OAuth provider
    providers.push({
      name: "discord",
      available: hasDiscord,
      url: "/auth/discord",
    });

    // Add federation providers if enabled
    if (federationEnabled) {
      try {
        const federationProviders = getFederationProviders();
        federationProviders.forEach(provider => {
          providers.push({
            name: "federation",
            displayName: provider.name,
            entityId: provider.entityId,
            available: provider.available,
            url: `/auth/federation/login?op=${encodeURIComponent(provider.entityId)}`,
            type: "federation",
          });
        });
      } catch (err) {
        logger.error('[auth] Failed to get federation providers', { error: err });
      }
    }

    // Add dev bypass provider if dev mode is active
    // Federation providers are listed first for priority, but dev login remains available
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

    const derivedPermissions = derivePermissionsFromConfig(st);

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
// Federation login is prioritized through provider ordering, but dev login remains available
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
