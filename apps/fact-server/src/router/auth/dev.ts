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

const router = express.Router();

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

/**
 * Dev login endpoint - creates a fake JWT token for local development
 * Only available when DEV_LOGIN_MODE=true
 */
router.get("/dev", (req: Request, res: Response) => {
  if (!isDevModeActive()) {
    logger.warn(`[auth] ${ctx(req, res)} Dev login attempted but DEV_LOGIN_MODE is not active`);
    return res.status(404).json({ error: "not_found" });
  }

  logger.debug(`[auth] ${ctx(req, res)} Dev login: generating fake JWT token`);

  const userParam =
    typeof req.query.user === "string" && req.query.user.trim()
      ? req.query.user.trim()
      : "dev-user";

  const now = Date.now();
  const fakeUser = {
    id: `dev-${userParam}`,
    username: userParam,
    avatar: null,
    guild: null,
    hasRole: true,
    devBypass: true,
    cacheUpdatedAt: now,
    lastCheck: now,
  };

  const token = generateJWT(fakeUser);
  logger.info(`[auth] ${ctx(req, res)} Dev login JWT generated for user=${fakeUser.username}`);
  return res.redirect(`/?token=${encodeURIComponent(token)}`);
});

export default router;
