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

/**
 * Validate if user has required login roles for their guild
 * Returns { valid: boolean, reason?: string }
 * If user loses required login roles, they're logged out
 */
export function validateLoginRoles(authStatus: any): { valid: boolean; reason?: string } {
  if (!authStatus?.authenticated) {
    return { valid: false, reason: "Not authenticated" };
  }

  const userId = authStatus.user?.id;
  const discordRoles = authStatus.user?.cachedMemberRoles || [];
  const devBypass = authStatus.user?.devBypass;
  const isAdmin = authStatus.user?.isAdmin;

  // Dev bypass and admins always allowed
  if (devBypass || isAdmin) {
    return { valid: true };
  }

  // Currently, all authenticated users are allowed
  // Future: Add configurable required login roles from Casbin policies
  return { valid: true };
}

/**
 * Determine casbin role(s) based on user authentication status
 * Returns array of roles a user has for casbin checks
 *
 * Assigns roles based on:
 * - Discord roles synced as `role:discord:{roleId}`
 * - Admin status as `role:app:admin`
 * - Base `user` role for all authenticated users
 * - `nobody` role for unauthenticated users
 */
export function determineUserRoles(authStatus: any): string[] {
  const roles: string[] = [];

  if (!authStatus?.authenticated) {
    roles.push("nobody");
    return roles;
  }

  const userId = authStatus.user?.id;
  const isAdmin = authStatus.user?.isAdmin;
  const discordRoles = authStatus.user?.cachedMemberRoles || [];

  // 1. Add Discord role groupings (synced by syncDiscordRolesForUser)
  // These are stored as grouping policies: g, user:userId, role:discord:roleId
  // We don't add them directly here; they're handled by grouping rules in Casbin
  roles.push(`user:${userId}`);

  // 2. Admin role indicator (for non-grouping checks)
  if (isAdmin) {
    roles.push("role:app:admin");
  }

  // 3. Base user role - all authenticated users get this
  roles.push("user");

  return roles;
}

/**
 * Initialize casbin enforcer with DB-backed policies.
 * This seeds default policies if they don't exist.
 */
export async function initializeCasbin() {
  try {
    const enforcer = await getCasbinEnforcer();

    // Seed default policies if none exist
    const existingPolicies = enforcer.getPolicy();
    if (!existingPolicies || existingPolicies.length === 0) {
      console.log("[casbin] Seeding default policies");

      // Define policies: (subject, object, action)
      // Nobody role - unauthenticated users with no permissions
      // (no policies defined for 'nobody' role)

      // Users can read public data and auth endpoints
      enforcer.addPolicy("user", "/api/auth/me", "GET");
      enforcer.addPolicy("user", "/api/auth/status", "GET");
      
      // Facts API - Public read access
      enforcer.addPolicy("user", "/api/facts", "GET");
      enforcer.addPolicy("user", "/api/facts/:id", "GET");
      enforcer.addPolicy("user", "/api/facts/audiences", "GET");
      enforcer.addPolicy("user", "/api/facts/subjects", "GET");

      // Facts API - Authenticated user can create facts
      enforcer.addPolicy("user", "/api/facts", "POST");
      
      // Facts API - Contributors can update facts
      enforcer.addPolicy("role:facts:contributor", "/api/facts/:id", "PUT");
      
      // Facts API - Only admins can delete facts
      enforcer.addPolicy("role:app:admin", "/api/facts/:id", "DELETE");

      // Admins can do anything (match all paths and methods)
      enforcer.addPolicy("role:app:admin", "/api/admin/*", "(GET)|(POST)|(PUT)|(PATCH)|(DELETE)");
      enforcer.addPolicy("role:app:admin", "/api/facts", "(GET)|(POST)|(PUT)|(PATCH)|(DELETE)");
      enforcer.addPolicy("role:app:admin", "/api/facts/:id", "(GET)|(POST)|(PUT)|(PATCH)|(DELETE)");

      // Save policies to database
      await enforcer.savePolicy();
      console.log("[casbin] Default policies saved");
    }

    console.log("[casbin] Authorization system initialized with DB-backed policies");
    return enforcer;
  } catch (err) {
    console.error("[casbin] Failed to initialize enforcer:", err);
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
      const devBypass = Boolean(authStatus?.devBypass || authStatus?.user?.devBypass);
      const devLoginMode = isDevModeActive();

      if (!authStatus?.authenticated || !userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Dev-login sessions should not be blocked by Casbin policy drift while testing.
      if (devBypass && devLoginMode) {
        console.info(
          `[casbin] Dev bypass active: allowing ${userId} ${action || req.method.toUpperCase()} ${resource || req.baseUrl + req.path}`
        );
        return next();
      }

      // First, validate user still has required login roles
      const loginValidation = validateLoginRoles(authStatus);
      if (!loginValidation.valid) {
        console.warn(
          `[casbin] User ${userId} session revoked: ${loginValidation.reason}`
        );
        return res
          .status(401)
          .json({ error: "Unauthorized", message: loginValidation.reason });
      }

      // Use provided resource/action or derive from request
      const obj = resource || req.baseUrl + req.path;
      const act = action || req.method.toUpperCase();

      // Determine all applicable subjects for this user
      const userSubjects = determineUserRoles(authStatus);
      console.info(
        `[casbin] User ${userId} authorization check for ${act} ${obj} with subjects: [${userSubjects.join(
          ", "
        )}]`
      );

      // Check if ANY of the user's roles has permission for this resource/action
      let allowed = false;
      for (const sub of userSubjects) {
        try {
          if (await enforcer.enforce(sub, obj, act)) {
            allowed = true;
            console.debug(
              `[casbin] ✓ Access allowed: ${userId} (${sub}) can ${act} ${obj}`
            );
            break;
          }
        } catch (enforceErr) {
          console.error("[casbin] Error calling enforce:", enforceErr, {
            sub,
            obj,
            act,
          });
          return res.status(500).json({ error: "Authorization check failed" });
        }
      }

      if (!allowed) {
        console.warn(
          `[casbin] ✗ Access denied: ${userId} (subjects=[${userSubjects.join(
            ", "
          )}]) cannot ${act} ${obj}`
        );
        return res
          .status(403)
          .json({ error: "Forbidden", message: "Insufficient permissions" });
      }

      next();
    } catch (err) {
      console.error("[casbin] Middleware error:", err);
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

  const validation = validateLoginRoles(authStatus);
  if (!validation.valid) {
    const userId = authStatus.user?.id;
    console.warn(
      `[casbin] User ${userId} session revoked: ${validation.reason}`
    );
    (req as any).authStatus.authenticated = false;
    return res
      .status(401)
      .json({ error: "Unauthorized", message: validation.reason });
  }

  next();
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
    return await enforcer.enforce(sub, resource, action);
  } catch (err) {
    console.error("[casbin] Error in checkPermission:", err);
    return false;
  }
}

/**
 * Export the sync function for use in JWT refresh
 */
export { syncDiscordRolesForUser };
