// auth/passport-admin.ts
import express from "express";
import { ipPrivate, isProxy } from "../utils/ipUtils.ts";
import { createRequire } from "module";
import fs from "fs/promises";
import mime from "mime-types";
import pinologger from "../logger/pino.ts";
import jwt from "jsonwebtoken";
import type { AdminAuthUser, UnauthenticatedUser } from "./auth_types.d.ts";

const pinolog = pinologger.child({ component: "admin-passport" });
const requireCJS = createRequire(import.meta.url);
const router = express.Router();

export let ADMIN_ENABLED = false;
const envAdmin = (process.env.ADMIN_ENABLED || "").toLowerCase() === "true";
let pam: any;
try {
  pam = requireCJS("authenticate-pam");
  if (pam && envAdmin) {
    ADMIN_ENABLED = true;
    pinolog.info("PAM support loaded and admin login enabled.");
  } else {
    pinolog.warn("PAM module loaded, but ADMIN_ENABLED=false (disabled).");
  }
} catch {
  pinolog.warn("PAM module unavailable, admin login disabled.");
}

// JWT config
const JWT_SECRET: jwt.Secret = process.env.ADMIN_JWT_SECRET || "super-secret-admin-key";
const JWT_EXPIRES_IN: string | number | undefined = process.env.ADMIN_JWT_EXPIRES || "15m";


function issueAdminJWT(user: AdminAuthUser) {
  const payload = {
    id: user.id,
    username: user.username,
    provider: "admin",
    authenticated: true,
    reason: "authenticated"
  };
  // return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Extract JWT from Authorization: Bearer ...
function extractBearerToken(req: express.Request) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    return auth.slice(7);
  }
  return null;
}

/**
 * Express middleware to validate an admin JWT and set req.user if valid.
 * Responds with 401 on error. Use as route or router middleware.
 */
export function validateAdminJwt(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = extractBearerToken(req);
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded as AdminAuthUser;
    next();
  } catch (err: any) {
    pinolog.warn("Invalid admin JWT", err);
    return res.status(401).json({ error: "Invalid token" });
  }
}

function ensureLocal(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!ipPrivate(req) || isProxy(req)) {
    pinolog.warn("Admin access denied: remote or proxy request.");
    return res.status(403).json({ error: "Access denied" });
  }
  next();
}

if (ADMIN_ENABLED) {

  // LOGIN endpoint: issue JWT
  router.post("/login", ensureLocal, async (req, res) => {
    pinolog.info("Admin login attempt received.");
    const { username, password } = req.body || {};
    if (!username || !password) {
      pinolog.warn("Admin auth failed: missing credentials.");
      return res.status(400).json({ error: "Missing credentials" });
    }
    pam.authenticate(username, password, (err: any) => {
      if (err) {
        pinolog.warn("Admin PAM auth failed.");
        return res.status(403).json({ error: "Access denied" });
      }
      pinolog.info("Admin auth successful.");
      const user: AdminAuthUser = {
        id: username,
        provider: "admin",
        authenticated: true,
        reason: "authenticated",
        expiresAt: Math.floor(Date.now() / 1000) + 60 * 15, // 15 min
        username,
        params: []
      };
      const token = issueAdminJWT(user);
      res.json({ success: true, token,  });
    });
  });

  // GET avatar: require valid token, must be local
  router.get("/avatar", ensureLocal, validateAdminJwt, async (req, res) => {
    const user = req.user as AdminAuthUser;
    if (!user || !user.id) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (user.provider === "admin") {
      const username = user.id.replace(/[^\w.-]/g, "");
      const candidates = [
        `/home/${username}/.face`,
        `/home/${username}/.face.icon`,
        `/var/lib/AccountsService/icons/${username}`,
      ];
      for (const file of candidates) {
        try {
          await fs.access(file);
          const ct = mime.lookup(file) || "application/octet-stream";
          res.setHeader("Content-Type", ct);
          res.setHeader("Cache-Control", "public, max-age=3600");
          return res.sendFile(file);
        } catch (err: any) {
          if (err.code !== "ENOENT") {
            pinolog.error(`Error accessing avatar file ${file}:`, err);
          }
        }
      }
      return res.status(404).send("Avatar not found.");
    }
    return res.status(404).send("Avatar not found.");
  });

  // "Logout" is stateless: clients just discard their JWT
  router.post("/logout", ensureLocal, validateAdminJwt, (req, res) => {
    pinolog.info("Admin logged out (stateless JWT, client must forget token).");
    res.json({ success: true, stateless: true });
  });

} else {
  router.post("/login", (req, res) => {
    pinolog.warn("Admin login attempted while disabled.");
    res.status(503).json({ error: "Admin login unavailable" });
  });
  router.get("/avatar", (req, res) => {
    res.status(503).json({ error: "Admin login unavailable" });
  });
  router.post("/logout", (req, res) => {
    res.status(503).json({ error: "Admin login unavailable" });
  });
}

// Stateless session validation middleware
export function validateAndRefreshAdminSession(
  req: express.Request & { authStatus?: UnauthenticatedUser | AdminAuthUser },
  res: express.Response,
  next: express.NextFunction
) {
  // Default: not authenticated
  const UnauthenticatedUser_authStatus: UnauthenticatedUser = {
    authenticated: false,
    provider: null,
    reason: "unknown",
    previousProvider: "admin",
    username: undefined,
    expiresAt: null
  };

  if (!ADMIN_ENABLED) {
    UnauthenticatedUser_authStatus.reason = "disabled";
    req.authStatus = UnauthenticatedUser_authStatus;
    return next();
  }

  // If no Bearer JWT: not authenticated
  const token = extractBearerToken(req);
  if (!token) {
    UnauthenticatedUser_authStatus.reason = "not_logged_in";
    req.authStatus = UnauthenticatedUser_authStatus;
    return next();
  }

  // Validate JWT
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AdminAuthUser;
    if (!decoded || decoded.provider !== "admin") {
      UnauthenticatedUser_authStatus.reason = "not_logged_in";
      req.authStatus = UnauthenticatedUser_authStatus;
      return next();
    }
    // Also check local access (optional)
    if (!ipPrivate(req) || isProxy(req)) {
      UnauthenticatedUser_authStatus.reason = "remote_access";
      req.authStatus = UnauthenticatedUser_authStatus;
      pinolog.warn("Admin session invalidated due to remote/proxy request.");
      return next();
    }
    req.authStatus = decoded;
    return next();
  } catch (err: any) {
    UnauthenticatedUser_authStatus.reason = "not_logged_in";
    req.authStatus = UnauthenticatedUser_authStatus;
    return next();
  }
}

export function canLoginAdmin(req: express.Request) {
  return ADMIN_ENABLED && ipPrivate(req) && !isProxy(req);
}

export default router;
