/**
 * Casbin-based authorization middleware with domain RBAC support
 * Enforces domain-scoped permissions using Casbin (e.g., per-guild authorization)
 */

import type { Request, Response, NextFunction } from "express";
import type { AuthStatus } from "../../../../../libs/types/src/index.ts";
import { getCasbinEnforcer } from "./enforcer.ts";
import { syncDiscordRolesForUser } from "./syncRoles.ts";

/**
 * Extract guild ID from request path pattern like:
 * /api/guilds/:guildId/...
 * /v1/guilds/:guildId/...
 */
function extractGuildIdFromPath(path: string): string | null {
  // Match patterns like /api/guilds/123456/...
  const match = path.match(/\/guilds\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

/**
 * Middleware for domain RBAC authorization.
 * Enforces via Casbin with domain = guildId.
 * 
 * Usage:
 *   app.delete('/api/guilds/:guildId/posts/:id', requireGuildPermission(), deletePostHandler);
 */
export function requireGuildPermission() {
  return async (
    req: Request & { authStatus?: AuthStatus },
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const authStatus = req.authStatus;
      const userId = authStatus?.user?.id;

      if (!authStatus?.authenticated || !userId) {
        return res.status(401).json({ error: "unauthenticated" });
      }

      // Extract guild from request path
      const guildId = extractGuildIdFromPath(req.path);
      if (!guildId) {
        return res.status(400).json({ error: "guild_id_missing" });
      }

      const enforcer = await getCasbinEnforcer();

      // Re-sync user roles if cache is stale (occurs async, doesn't block)
      // Ideally called less frequently in production
      syncDiscordRolesForUser(userId, [], new Map(), authStatus?.user?.isAdmin)
        .catch((err) => console.warn("[guild-middleware] Role sync failed:", err));

      const subject = `user:${userId}`;
      const obj = req.baseUrl + req.path;
      const act = req.method.toUpperCase();

      console.debug(
        `[guild-middleware] Enforcing domain RBAC: subject=${subject}, domain=${guildId}, obj=${obj}, act=${act}`
      );

      // Check permission with domain
      let allowed = false;
      try {
        allowed = await enforcer.enforce(subject, guildId, obj, act);
      } catch (err) {
        console.error("[guild-middleware] Enforce error:", err);
        return res.status(500).json({ error: "authorization_error" });
      }

      if (!allowed) {
        console.warn(
          `[guild-middleware] ✗ Access denied: ${userId} cannot ${act} ${obj} in guild ${guildId}`
        );
        return res.status(403).json({ error: "forbidden" });
      }

      console.debug(
        `[guild-middleware] ✓ Access allowed: ${userId} can ${act} ${obj} in guild ${guildId}`
      );
      next();
    } catch (err) {
      console.error("[guild-middleware] Unexpected error:", err);
      return res.status(500).json({ error: "authorization_error" });
    }
  };
}

/**
 * Legacy middleware for non-domain RBAC (routes without guild context).
 * Uses 3-arg enforce: (subject, object, action)
 * 
 * This allows mixed projects where some routes are guild-scoped and others aren't.
 */
export function requireCasbin() {
  return async (
    req: Request & { authStatus?: AuthStatus },
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const authStatus = req.authStatus;
      const userId = authStatus?.user?.id;

      if (!authStatus?.authenticated || !userId) {
        return res.status(401).json({ error: "unauthenticated" });
      }

      const enforcer = await getCasbinEnforcer();
      const subject = `user:${userId}`;
      const obj = req.baseUrl + req.path;
      const act = req.method.toUpperCase();

      console.debug(
        `[casbin-middleware] Checking ${act} ${obj} for subject ${subject}`
      );

      // Note: For domain RBAC model, we still need to provide a domain.
      // For global policies, you might use a fixed domain like "global" or "*"
      // OR maintain separate non-domain policies for legacy routes.
      // This example uses "global" as a catch-all domain.
      let allowed = false;
      try {
        allowed = await enforcer.enforce(subject, "global", obj, act);
      } catch (err) {
        console.error("[casbin-middleware] Enforce error:", err);
        return res.status(500).json({ error: "authorization_error" });
      }

      if (!allowed) {
        console.warn(
          `[casbin-middleware] ✗ ${userId} forbidden for ${act} ${obj}`
        );
        return res.status(403).json({ error: "forbidden" });
      }

      console.debug(`[casbin-middleware] ✓ ${subject} allowed`);
      next();
    } catch (err) {
      console.error("[casbin-middleware] Unexpected error:", err);
      return res.status(500).json({ error: "authorization_error" });
    }
  };
}
