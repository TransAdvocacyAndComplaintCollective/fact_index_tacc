/**
 * Casbin Authorization Configuration
 * Defines RBAC (Role-Based Access Control) for the Fact Index API using Casbin + Kysely
 * Policies are stored in the database and can be managed via admin APIs
 */

import type { Request, Response, NextFunction } from "express";
import { getCasbinEnforcer } from "./casbin/enforcer.ts";
import { syncDiscordRolesForUser } from "./casbin/syncRoles.ts";
import { isDevModeActive } from "./passport-dev.ts";
import type { Enforcer } from "casbin";
import logger from "../logger.ts";
import { isTokenRevoked } from "./jwt.ts";
import type { AuthStatus } from "../../../../libs/types/src/index.ts";
import {
  deriveCasbinSubjects,
  derivePermissionsFromDb,
  mapRequestToPermission,
  parsePermission,
} from "./permissions.ts";
import { getLoginConstraints } from "../../../../libs/db-core/src/authzRepository.ts";

let loginConstraintsCache:
  | { loadedAtMs: number; value: { whitelistUsers: string[]; requiredRolesByGuild: Record<string, string[]> } }
  | null = null;

async function loadLoginConstraintsCached(): Promise<{
  whitelistUsers: string[];
  requiredRolesByGuild: Record<string, string[]>;
}> {
  const now = Date.now();
  if (loginConstraintsCache && now - loginConstraintsCache.loadedAtMs < 30_000) {
    return loginConstraintsCache.value;
  }
  const value = await getLoginConstraints().catch(() => ({ whitelistUsers: [], requiredRolesByGuild: {} }));
  loginConstraintsCache = { loadedAtMs: now, value };
  return value;
}

/**
 * Validate if user has required login roles for their guild
 * Returns { valid: boolean, reason?: string }
 * If user loses required login roles, they're logged out
 */
export async function validateLoginRoles(
  authStatus: AuthStatus | undefined | null
): Promise<{ valid: boolean; reason?: string }> {
  if (!authStatus?.authenticated) {
    return { valid: false, reason: "Not authenticated" };
  }

  const userId = String(authStatus.user?.id || "").trim();
  const discordRoles = Array.isArray(authStatus.user?.cachedMemberRoles)
    ? authStatus.user.cachedMemberRoles.map((r: any) => String(r).trim()).filter(Boolean)
    : [];
  const guildId = String(authStatus.user?.guild || "").trim();
  const devBypass = authStatus.devBypass;

  // Dev bypass always allowed
  if (devBypass) {
    return { valid: true };
  }

  const { whitelistUsers, requiredRolesByGuild } = await loadLoginConstraintsCached();

  if (!userId) return { valid: false, reason: "Missing user id" };

  // Whitelist bypass for users who are not yet in the required Discord roles.
  if (whitelistUsers.includes(userId)) {
    return { valid: true };
  }

  const requiredRoles = guildId ? requiredRolesByGuild[guildId] || [] : [];
  if (!requiredRoles.length) {
    return { valid: true };
  }

  const hasAnyRequiredRole = requiredRoles.some((roleId) => discordRoles.includes(roleId));
  if (!hasAnyRequiredRole) {
    return { valid: false, reason: "Missing required Discord role" };
  }

  return { valid: true };
}

/**
 * Determine casbin role(s) based on user authentication status
 * Returns array of roles a user has for casbin checks
 *
 * Assigns roles based on:
 * - Discord roles synced as `role:discord:{roleId}`
 * - Base `user` role for all authenticated users
 * - `nobody` role for unauthenticated users
 */
export function determineUserRoles(authStatus: AuthStatus | undefined | null): string[] {
  return deriveCasbinSubjects(authStatus);
}

function toPermission(resource: string, action: string): string {
  return `${resource}:${action}`;
}

function resolveRequestedPermission(
  req: Request,
  resource?: string,
  action?: string,
): string | null {
  if (resource && action) {
    return toPermission(resource, action);
  }
  const requestPath = req.baseUrl + req.path;
  return mapRequestToPermission(requestPath, req.method);
}

function isHighRiskPermission(permission: string): boolean {
  if (permission === "fact:write") return true;
  if (permission === "fact:pubwrite") return true;
  if (permission === "fact:admin") return true;
  if (permission === "idc:login") return true;
  return permission.startsWith("admin:");
}

function getRequestDiscordTokenJti(req: Request): string {
  const jti = (req as any)?.user?.jti;
  return typeof jti === "string" ? jti.trim() : "";
}

/**
 * Initialize casbin enforcer with DB-backed policies.
 * This seeds default policies if they don't exist.
 */
export async function initializeCasbin() {
  try {
    const enforcer = await getCasbinEnforcer();

    await enforcer.loadPolicy();

    logger.info("[casbin] Authorization system initialized with DB-backed policies");
    return enforcer;
  } catch (err) {
    logger.error("[casbin] Failed to initialize enforcer", { error: err });
    throw err;
  }
}

/**
 * Middleware to enforce casbin policies
 * Uses the subject, object, action pattern with role grouping
 */
export function casbinMiddleware(resource?: string, action?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const enforcer = await getCasbinEnforcer();

      const authStatus = (req as any).authStatus;
      const userId = authStatus?.user?.id;
      const devBypass = Boolean(authStatus?.devBypass);
      const devLoginMode = isDevModeActive();

      if (!authStatus?.authenticated || !userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Admin users (configured via Discord auth config) bypass Casbin entirely.
      if (Boolean(authStatus?.user?.isAdmin)) {
        return next();
      }

      // Dev-login admin sessions can bypass Casbin policy drift while testing.
      // Non-admin dev sessions must still respect authorization checks.
      if (devBypass && devLoginMode && Boolean(authStatus?.user?.isAdmin)) {
        logger.info("[casbin] Dev bypass active", {
          userId,
          action: action || req.method.toUpperCase(),
          resource: resource || req.baseUrl + req.path,
        });
        return next();
      }

      // First, validate user still has required login roles
      const loginValidation = await validateLoginRoles(authStatus);
      if (!loginValidation.valid) {
        logger.warn("[casbin] User session revoked", { userId, reason: loginValidation.reason });
        return res
          .status(401)
          .json({ error: "Unauthorized", message: loginValidation.reason });
      }

      // Always honor DB-derived superuser immediately, even if the enforcer policy cache is stale.
      // This also supports direct user permissions (`user:{id}`) without needing a grouping policy.
      const sessionPermissions = Array.isArray(authStatus?.user?.permissions)
        ? authStatus.user.permissions.map((p: any) => String(p).trim()).filter(Boolean)
        : [];
      if (sessionPermissions.includes("superuser")) {
        return next();
      }
      try {
        const dbPermissions = await derivePermissionsFromDb(authStatus);
        if (dbPermissions.includes("superuser")) {
          return next();
        }
      } catch (err) {
        logger.warn("[casbin] Failed to derive permissions from DB", {
          userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Use provided resource/action or derive from request
      const requestedPermission = resolveRequestedPermission(req, resource, action);
      if (!requestedPermission) {
        logger.warn("[casbin] No permission mapping for request", {
          userId,
          method: req.method,
          path: req.baseUrl + req.path,
        });
        return res.status(403).json({
          error: "Forbidden",
          message: "Permission mapping not configured for this endpoint",
        });
      }

      if (isHighRiskPermission(requestedPermission)) {
        if (devBypass) {
          // Dev-bypass sessions are not revocable via JTI (no Discord-issued tokens).
          // Skip revocation checks so dev mode can exercise admin endpoints.
        } else {
        const tokenJti = getRequestDiscordTokenJti(req);
        if (!tokenJti) {
          logger.warn("[casbin] High-risk route rejected due to missing token jti", {
            userId,
            permission: requestedPermission,
          });
          return res.status(401).json({
            error: "Unauthorized",
            message: "Revocation check unavailable for high-risk route",
          });
        }
        const revoked = await isTokenRevoked(tokenJti);
        if (revoked) {
          logger.warn("[casbin] High-risk route rejected due to revoked token", {
            userId,
            permission: requestedPermission,
            jti: tokenJti.slice(0, 8),
          });
          return res.status(401).json({
            error: "Unauthorized",
            message: "Token revoked",
          });
        }
        }
      }

      // Determine all applicable subjects for this user
      const userSubjects = determineUserRoles(authStatus);
      const [permResource, permAction] = (() => {
        const parsed = parsePermission(requestedPermission);
        return parsed ? [parsed.resource, parsed.action] : [requestedPermission, "read"];
      })();

      // Superuser can do everything.
      for (const sub of userSubjects) {
        try {
          if (await enforcer.enforce(sub, "global", "superuser", "allow")) {
            return next();
          }
        } catch {
          // ignore
        }
      }

      logger.info("[casbin] Authorization check", {
        userId,
        permission: requestedPermission,
        subjects: userSubjects,
      });

      // Any authenticated user can create/update non-public facts.
      if (requestedPermission === "fact:write") {
        return next();
      }

      // Check if ANY of the user's roles has permission for this resource/action
      let allowed = false;
      for (const sub of userSubjects) {
        try {
          if (await enforcer.enforce(sub, "global", permResource, permAction)) {
            allowed = true;
            logger.debug("[casbin] Access allowed", {
              userId,
              subject: sub,
              permission: requestedPermission,
            });
            break;
          }
        } catch (enforceErr) {
          logger.error("[casbin] Error calling enforce", {
            error: enforceErr,
            sub,
            resource: permResource,
            action: permAction,
          });
          return res.status(500).json({ error: "Authorization check failed" });
        }
      }

      if (!allowed) {
        logger.warn("[casbin] Access denied", {
          userId,
          subjects: userSubjects,
          permission: requestedPermission,
        });
        return res
          .status(403)
          .json({ error: "Forbidden", message: "Insufficient permissions" });
      }

      next();
    } catch (err) {
      logger.error("[casbin] Middleware error", { error: err });
      return res.status(500).json({ error: "Authorization check failed" });
    }
  };
}

/**
 * Middleware to validate user maintains required login roles
 * Runs on every request to check if user lost required roles and should be logged out
 */
export function validateLoginRolesMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authStatus = (req as any).authStatus;

  if (!authStatus?.authenticated) {
    return next(); // Not authenticated, let other middleware handle it
  }

  void (async () => {
    const validation = await validateLoginRoles(authStatus);
    if (!validation.valid) {
      const userId = authStatus.user?.id;
      logger.warn("[casbin] User session revoked", { userId, reason: validation.reason });
      (req as any).authStatus.authenticated = false;
      return res.status(401).json({ error: "Unauthorized", message: validation.reason });
    }
    next();
  })();
}

/**
 * Get the enforcer instance
 */
export async function getEnforcer(): Promise<Enforcer> {
  return getCasbinEnforcer();
}

/**
 * Check permission (async version using DB-backed Casbin)
 */
export async function checkPermission(
  userId: string,
  resource: string,
  action: string
): Promise<boolean> {
  try {
    const enforcer = await getCasbinEnforcer();
    const sub = `user:${userId}`;
    return await enforcer.enforce(sub, "global", resource, action);
  } catch (err) {
    logger.error("[casbin] Error in checkPermission", { error: err, userId, resource, action });
    return false;
  }
}

/**
 * Export the sync function for use in JWT refresh
 */
export { syncDiscordRolesForUser };
