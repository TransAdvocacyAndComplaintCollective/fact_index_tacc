// backend/src/auth/passportAdminRouter.ts
import express from "express";
import pkg_express from 'express';
type Request = pkg_express.Request;
type Response = pkg_express.Response;
type NextFunction = pkg_express.NextFunction;

import passport from "passport";
import { Strategy as CustomStrategy } from "passport-custom";
import { ipPrivate, isProxy } from "../utils/ipUtils.ts";
import { createRequire } from "module";
import fs from "fs/promises";
import mime from "mime-types";
import pinologger from "../logger/pino.ts";
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

interface CustomResponse extends Response {
  authStatus?: UnauthenticatedUser | AdminAuthUser;
}

function ensureLocal(req: Request, res: Response, next: NextFunction) {
  if (!ipPrivate(req) || isProxy(req)) {
    pinolog.warn("Admin access denied: remote or proxy request.");
    return res.status(403).json({ error: "Access denied" });
  }
  next();
}

if (ADMIN_ENABLED) {
  passport.use(
    "admin",
    new CustomStrategy(async (req, done) => {
      const { username, password } = req.body || {};
      if (!username || !password) {
        pinolog.warn("Admin auth failed: missing credentials.");
        return done(null, false);
      }
      pam.authenticate(username, password, (err: any) => {
        if (err) {
          pinolog.warn("Admin PAM auth failed.");
          return done(null, false);
        }
        pinolog.info("Admin auth successful.");
        const profileImage = "/auth/admin/avatar";
        return done(null, { id: username, provider: "admin", profileImage });
      });
    })
  );

  passport.serializeUser((user, done) => {
    pinolog.debug("Serializing admin session.");
    done(null, user);
  });
  passport.deserializeUser((obj: any, done) => {
    pinolog.debug("Deserializing admin session.");
    done(null, obj as AdminAuthUser);
  });

  router.get("/avatar", ensureLocal, async (req, res) => {
    if (!req.user || !(req.user as AdminAuthUser).id) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (req.user && (req.user as AdminAuthUser).provider == "admin") {
      const username = (req.user as AdminAuthUser).id.replace(/[^\w.-]/g, "");
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
    else {
      return res.status(404).send("Avatar not found.");
    }
  });

  router.post(
    "/login",
    ensureLocal,
    (req, res, next) => {
      pinolog.info("Admin login attempt received.");
      next();
    },
    (req, res, next) => {
      passport.authenticate("admin", (err: any, user: any, info: any) => {
        if (err) {
          pinolog.error("Admin login error", err);
          return res.status(500).json({ error: "Internal error" });
        }
        if (!user) {
          return res
            .status(403)
            .json({ error: info?.message || "Access denied" });
        }
        req.logIn(user, (err2: any) => {
          if (err2) {
            pinolog.error("Session login error", err2);
            return res.status(500).json({ error: "Session error" });
          }
          return res.json({ success: true, profileImage: user.profileImage });
        });
      })(req, res, next);
    }
  );

  router.get("/logout", ensureLocal, (req: Request, res: Response, next: NextFunction) => {
    req.logOut?.((err?: Error) => {
      if (err) {
        pinolog.error("Logout error", err);
        return next(err);
      }
      req.session?.destroy((err2) => {
        if (err2) {
          pinolog.error("Error destroying session", err2);
          return next(err2);
        }
        pinolog.info("Admin logged out.");
        res.json({ success: true });
      });
    });
  });
} else {
  router.post("/login", (req, res) => {
    pinolog.warn("Admin login attempted while disabled.");
    res.status(503).json({ error: "Admin login unavailable" });
  });
}

// Session validation middleware
export function validateAndRefreshAdminSession(
  req: Request & { authStatus?: UnauthenticatedUser | AdminAuthUser },
  res: Response,
  next: NextFunction
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

  if (
    !req.isAuthenticated?.() ||
    !req.user ||
    (req.user as AdminAuthUser).provider !== "admin"
  ) {
    UnauthenticatedUser_authStatus.reason = "not_logged_in";
    req.authStatus = UnauthenticatedUser_authStatus;
    return next();
  }

  if (!ipPrivate(req) || isProxy(req)) {
    req.logOut?.(() => {
      req.session?.destroy(() => {});
      UnauthenticatedUser_authStatus.reason = "remote_access";
      req.authStatus = UnauthenticatedUser_authStatus;
      pinolog.warn("Admin session invalidated due to remote/proxy request.");
      return next();
    });
    return;
  }

  // Authenticated
  const authStatusAdminAuthUser: AdminAuthUser = {
    id: undefined,
    provider: "admin",
    expiresAt: 0,
    username: "",
    authenticated: true,
    reason: "authenticated",
    params: []
  };
  req.authStatus = authStatusAdminAuthUser;
  return next();
}

export function canLoginAdmin(req: Request) {
  return ADMIN_ENABLED && ipPrivate(req) && !isProxy(req);
}

export default router;
