// auth/passport-google.js

import express from "express";
import type { Response, NextFunction, Request } from "express";

// Extend Express Request type to include authUser
declare module "express" {
  interface Request {
    authUser?: import("./auth_types.d.ts").AuthUser | import("./auth_types.d.ts").UnauthenticatedUser;
  }
}
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { OAuth2Client } from "google-auth-library";
import { createAvatar } from "@dicebear/core";
import { lorelei } from "@dicebear/collection";
import process from "process";
import { Buffer } from "buffer";
import pinoLogger from "../logger/pino.ts";
import type {
  GoogleAuthUser,
  UnauthenticatedUser,
  AuthUser,
} from "./auth_types.d.ts";

const router = express.Router();

pinoLogger.info("Loading passport-google.js...");

export const GOOGLE_ENABLED = (() => {
  const required = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_CALLBACK_URL",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    pinoLogger.warn("Missing env vars:", missing);
    return false;
  }
  pinoLogger.info("Google OAuth enabled");
  return true;
})();

async function refreshGoogleAccessToken(user: GoogleAuthUser) {
  try {
    const client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    client.setCredentials({
      access_token: user.accessToken,
    });
    const res = await client.getAccessToken();
    const token = typeof res === "string" ? res : res?.token;
    if (!token) throw new Error("Token missing");
    pinoLogger.info("Access token refreshed");
    return { accessToken: token, expiresAt: Date.now() + 3600 * 1000 };
  } catch (err) {
    const errorMsg =
      typeof err === "object" && err !== null && "message" in err
        ? (err as { message?: string }).message
        : String(err);
    pinoLogger.error("Token refresh error", errorMsg);
    throw err;
  }
}

function getFallbackAvatar(seed: string) {
  const svg = createAvatar(lorelei, { seed: seed || "anon" }).toString();
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

if (GOOGLE_ENABLED) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        callbackURL: process.env.GOOGLE_CALLBACK_URL as string,
      },
      async (
        accessToken: string,
        refreshToken: string | undefined,
        profile: any,
        params: any,
        done: (error: any, user?: any) => void
      ) => {
        pinoLogger.info("GoogleStrategy invoked");
        try {
          const id = params.id || profile.id;
          const avatar =
            params.photos?.[0]?.value ||
            profile.photos?.[0]?.value ||
            getFallbackAvatar(id);

          const user: GoogleAuthUser = {
            id,
            provider: "google",
            accessToken,
            expiresAt: Date.now() + 3600 * 1000,
            authenticated: true,
            reason: "authenticated",
            username: profile.displayName,
            avatar,
            params: [],
          };

          pinoLogger.info("User authenticated (no PII logged)");
          done(null, user);
        } catch (err) {
          const errorMsg =
            typeof err === "object" && err !== null && "message" in err
              ? (err as { message?: string }).message
              : String(err);
          pinoLogger.error("Google strategy failure", errorMsg);
          done(err);
        }
      }
    )
  );
}

passport.serializeUser((user: any, done) => {
  pinoLogger.info("serializeUser, provider:", user.provider);
  done(null, {
    id: user.id,
    provider: user.provider,
    avatar: user.avatar,
    expiresAt: user.expiresAt,
    accessToken: "accessToken" in user ? user.accessToken : undefined,
    username: "username" in user ? user.username : undefined,
  });
});

passport.deserializeUser((obj: any, done) => {
  pinoLogger.info("deserializeUser, provider:", obj.provider);
  done(null, {
    ...obj,
    authenticated: true,
    reason: "authenticated",
    params: [],
  });
});

async function validateAndRefreshGoogleSession(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authStatus_: UnauthenticatedUser = {
    authenticated: false,
    provider: null,
    reason: "not_authenticated",
    username: undefined,
    expiresAt: null,
  };
  req.authUser = req.authUser || authStatus_;

  const typedReq = req as Request & {
    isAuthenticated?: () => boolean;
    user?: any;
  };

  if (
    !GOOGLE_ENABLED ||
    !typedReq.isAuthenticated?.() ||
    typedReq.user?.provider !== "google"
  ) {
    req.authUser = authStatus_;
    return next();
  }

  const user = typedReq.user;
  if (user.expiresAt < Date.now()) {
    try {
      const update = await refreshGoogleAccessToken(user);
      Object.assign(user, update);
      pinoLogger.info("Session token refreshed");
    } catch {
      req.authUser = authStatus_;
      return next();
    }
  }

  req.authUser = {
    id: user.id,
    provider: "google",
    accessToken: user.accessToken,
    expiresAt: user.expiresAt,
    authenticated: true,
    reason: "authenticated",
    username: user.username,
    avatar: user.avatar ?? null,
    params: [],
  };

  next();
}

if (GOOGLE_ENABLED) {
  router.get(
    "/login",
    passport.authenticate("google", {
      scope: ["profile", "email"],
      accessType: "offline",
      prompt: "consent",
    })
  );

  router.get(
    "/callback",
    passport.authenticate("google", { failureRedirect: "/", session: true }),
    (req, res) => res.redirect("/profile")
  );
} else {
  router.get(["/login", "/callback"], (req, res) =>
    res.status(503).send("Google login disabled")
  );
}

router.get("/me", validateAndRefreshGoogleSession, (req, res) => {
  if (!req.authUser?.authenticated) {
    return res
      .status(401)
      .json({ error: req.authUser?.reason || "not_authenticated" });
  }

  const user = req.authUser;
  res.json({
    id: "id" in user ? user.id : null,
    avatar: "avatar" in user ? user.avatar ?? null : null,
    expiresAt: "expiresAt" in user ? user.expiresAt : null,
  });
});

router.use((req, res) => res.status(404).send("Not Found"));

pinoLogger.info("passport-google router ready");

export { validateAndRefreshGoogleSession };
export default router;
