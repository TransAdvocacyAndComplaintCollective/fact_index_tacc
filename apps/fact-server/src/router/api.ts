import express from "express";
import type { Request, Response, NextFunction, Router } from "express";
import facts from "./fact/facts.ts";
import { validateJWTOnly, validateAndRefreshSession } from "../auth/passport-discord.ts";
import type { AuthStatus } from "../../../../libs/types/src/index.ts";
import logger from "../logger.ts";

/**
 * API Router - Authentication Strategy
 * 
 * MIDDLEWARE USAGE:
 * - validateJWTOnly (default globally): Fast, no Discord API calls. Only validates JWT token.
 *   Use for most endpoints - reduces Discord API spam.
 * 
 * - validateAndRefreshSession (use per-route): Calls Discord API to re-check guild/role.
 *   Use ONLY on endpoints that need the most current Discord guild/role status.
 * 
 * EXAMPLE - to validate current Discord status on a specific endpoint:
 *   router.get('/sensitive', validateAndRefreshSession, handler)
 */

const router: Router = express.Router();

// Default validation on all API routes: lightweight JWT validation (no Discord API calls).
// This prevents Discord API spam while still requiring authentication.
router.use(validateJWTOnly);

router.use((req: Request, res: Response, next: NextFunction) => {
  const authStatus = (req as Request & { authStatus?: AuthStatus }).authStatus;
  const tokenHeader = req.headers.authorization;
  logger.debug(
    `[auth] /api/facts middleware ${req.method} ${req.originalUrl} token=${tokenHeader ? "present" : "missing"} auth=${authStatus?.authenticated ? "ok" : "fail"} reason=${authStatus?.reason ?? "n/a"} user=${authStatus?.user?.id ?? "n/a"}`,
  );

  const isAuthed = Boolean(authStatus?.authenticated);
  if (isAuthed) return next();

  // Allow public GET access to facts data.
  const routePath = req.baseUrl + req.path;
  const isPublicFactsRead =
    req.method === "GET" &&
    (routePath === "/api/facts/facts" ||
      routePath.startsWith("/api/facts/facts/") ||
      routePath === "/api/facts/subjects" ||
      routePath === "/api/facts/subjects/all" ||
      routePath === "/api/facts/audiences/all" ||
      routePath === "/api/facts/audiences");
  if (isPublicFactsRead) return next();

  logger.warn(
    `[auth] /api/facts rejecting ${req.method} ${req.originalUrl} reason=${authStatus?.reason ?? "unauthenticated"}`,
  );
  return res.status(401).json({ error: "Unauthorized", reason: authStatus?.reason ?? "unauthenticated" });
});

router.use("/facts", facts as any);

export default router;
