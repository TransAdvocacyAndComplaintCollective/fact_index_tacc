/**
 * Dev Login Router
 * Provides development-only quick login without Discord OAuth credentials
 */

import express from "express";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import logger from "../../logger.ts";
import { generateJWT } from "../../auth/jwt.ts";
import { isDevModeActive } from "../../auth/passport-dev.ts";
import { redirectWithSecureToken } from "./tokenResponse.ts";
import { getLoginConstraints } from "../../../../../libs/db-core/src/authzRepository.ts";
import { ADMIN_ACTIONS } from "../../auth/permissions.ts";
import { setUserPermissions } from "../../../../../libs/db-core/src/authzRepository.ts";

const router = express.Router();

// ---------- Dev admin configuration ----------
const DEV_ADMIN_ID = process.env.DEV_ADMIN_ID || "";
const DEV_IS_ADMIN = process.env.DEV_IS_ADMIN === "true";

function isDevAdmin(userId: string): boolean {
  // If DEV_IS_ADMIN is true, all dev users are admins
  if (DEV_IS_ADMIN) return true;
  // Otherwise, only the specific DEV_ADMIN_ID user is admin
  if (!DEV_ADMIN_ID) return false;
  return userId === DEV_ADMIN_ID;
}

// ---------- logging helpers ----------
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

function getQueryParam(req: Request, name: string): string {
  try {
    const url = new URL(req.originalUrl || "", "http://localhost");
    return url.searchParams.get(name) ?? "";
  } catch {
    return "";
  }
}

/**
 * Dev login endpoint - creates a fake JWT token for local development
 * Only available when DEV_LOGIN_MODE=true
 *
 * Query Parameters:
 *   ?user=username     - Custom username (default: "dev-user")
 *   ?admin=true|false  - Override admin status (default: uses DEV_IS_ADMIN env var)
 *   ?roles=all         - Set cachedMemberRoles to all configured required Discord roles (DB + env)
 *   ?roles=1,2,3       - Set cachedMemberRoles to a comma-separated list of role IDs
 *   ?actions=all       - Set devPermissions to a default action set (dev-only UI override)
 *   ?actions=a,b,c     - Set devPermissions to a comma-separated list of permission strings
 *
 * Examples:
 *   GET /auth/dev                    - Login as dev-user with DEV_IS_ADMIN status
 *   GET /auth/dev?user=alice         - Login as alice with DEV_IS_ADMIN status
 *   GET /auth/dev?admin=false        - Login as dev-user with admin=false (for testing casbin restrictions)
 */
router.get("/dev", async (req: Request, res: Response) => {
  if (!isDevModeActive()) {
    logger.warn(`[auth] ${ctx(req, res)} Dev login attempted but DEV_LOGIN_MODE is not active`);
    return res.status(404).json({ error: "not_found" });
  }

  logger.debug(`[auth] ${ctx(req, res)} Dev login: generating fake JWT token`);

  const userParam =
    typeof req.query.user === "string" && req.query.user.trim()
      ? req.query.user.trim()
      : "dev-user";

  const userId = `dev-${userParam}`;

  // Allow query parameter to override admin status for testing casbin
  // This lets you test both admin access and restrictions on the same dev endpoint
  let isAdmin: boolean;
  if (typeof req.query.admin === "string") {
    const adminParam = req.query.admin.toLowerCase();
    isAdmin = adminParam === "true" || adminParam === "1" || adminParam === "yes";
    logger.info(`[auth] ${ctx(req, res)} Admin status overridden via query: admin=${isAdmin}`);
  } else {
    isAdmin = isDevAdmin(userId);
    logger.debug(`[auth] ${ctx(req, res)} Admin status from DEV_IS_ADMIN env: admin=${isAdmin}`);
  }

  const now = Date.now();

  const rolesParam = getQueryParam(req, "roles").trim();
  const resolveDevRoles = async (): Promise<string[] | undefined> => {
    if (!rolesParam) return undefined;
    if (rolesParam.toLowerCase() === "all") {
      const envRoleIds = String(process.env.DISCORD_ROLE_ID || "")
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean);

      const { requiredRolesByGuild } = await getLoginConstraints().catch(() => ({
        requiredRolesByGuild: {} as Record<string, string[]>,
      }));
      const dbRoleIds = Object.values(requiredRolesByGuild || {}).flat();

      return Array.from(new Set([...envRoleIds, ...dbRoleIds].map((r) => String(r).trim()).filter(Boolean)));
    }

    return rolesParam
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
  };

  let cachedMemberRoles: string[] | undefined;
  try {
    cachedMemberRoles = await resolveDevRoles();
  } catch (err) {
    logger.warn(`[auth] ${ctx(req, res)} Failed to resolve dev roles`, {
      error: err instanceof Error ? err.message : String(err),
    });
    cachedMemberRoles = undefined;
  }

  const actionsParam = getQueryParam(req, "actions").trim();
  const resolveDevPermissions = (): string[] | undefined => {
    if (!actionsParam) return undefined;
    if (actionsParam.toLowerCase() === "all") {
      return Array.from(new Set([...ADMIN_ACTIONS, "superuser"]));
    }
    return actionsParam
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
  };

  const devPermissions = resolveDevPermissions();
  logger.info(`[auth] ${ctx(req, res)} Dev login permissions resolved`, {
    actionsParam: actionsParam || null,
    devPermissionsCount: Array.isArray(devPermissions) ? devPermissions.length : 0,
  });

  // In dev mode, optionally persist requested permissions for this dev user into the DB.
  // This makes /auth/status consistent even if UI permissions are derived from DB.
  if (Array.isArray(devPermissions) && devPermissions.length) {
    try {
      await setUserPermissions(userId, devPermissions);
    } catch (err) {
      logger.warn(`[auth] ${ctx(req, res)} Failed to persist dev permissions`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const fakeUser: any = {
    type: "dev",
    id: userId,
    username: userParam,
    avatar: null,
    guild: null,
    hasRole: true,
    isAdmin,
    devBypass: true,
    cacheUpdatedAt: now,
    lastCheck: now,
    ...(cachedMemberRoles ? { cachedMemberRoles } : {}),
    ...(devPermissions ? { devPermissions } : {}),
  };

  const token = await generateJWT(fakeUser);
  logger.info(`[auth] ${ctx(req, res)} Dev login JWT generated for user=${fakeUser.username} isAdmin=${isAdmin}`);
  return redirectWithSecureToken(res, token, "/");
});

export default router;
