// auth/passport-google.ts

import express from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { OAuth2Client } from "google-auth-library";
import { createAvatar } from "@dicebear/core";
import { lorelei } from "@dicebear/collection";
import process from "process";
import { Buffer } from "buffer";
import pinoLogger from "../logger/pino.ts";
import jwt from "jsonwebtoken";
import type {
  GoogleAuthUser,
  UnauthenticatedUser,
} from "./auth_types.d.ts";

// --- Express and logger setup ---
const router = express.Router();
pinoLogger.info("Loading passport-google.ts...");

// --- Env check ---
export const GOOGLE_ENABLED = (() => {
  const required = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_CALLBACK_URL",
    "GOOGLE_JWT_SECRET"
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    pinoLogger.warn("Missing env vars:", missing);
    return false;
  }
  pinoLogger.info("Google OAuth enabled");
  return true;
})();

const JWT_SECRET = process.env.GOOGLE_JWT_SECRET as string;
const JWT_EXPIRES_IN = "1h";

// --- Helpers ---
function getFallbackAvatar(seed: string) {
  const svg = createAvatar(lorelei, { seed: seed || "anon" }).toString();
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// --- JWT Sign & Validate ---
function signGoogleJwt(user: GoogleAuthUser) {
  // Only include minimal safe data!
  return jwt.sign(
    {
      id: user.id,
      provider: user.provider,
      username: user.username,
      avatar: user.avatar,
      expiresAt: user.expiresAt,
      authenticated: true,
      reason: user.reason,
      params: user.params || [],
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Required for multi-provider stateless system!
export async function validateGoogleJwt(token: string): Promise<GoogleAuthUser | null> {
  try {
    const user = jwt.verify(token, JWT_SECRET) as GoogleAuthUser;
    if (
      user &&
      user.provider === "google" &&
      user.authenticated &&
      user.id
    ) {
      return user;
    }
    return null;
  } catch (err) {
    pinoLogger.warn("Invalid google JWT", { error: (err as Error)?.message });
    return null;
  }
}

// --- Passport Strategy ---
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

// --- Routes ---

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
    passport.authenticate("google", { failureRedirect: "/", session: false }),
    (req, res) => {
      const user = req.user as GoogleAuthUser;
      const token = signGoogleJwt(user);
      // For SPA: send as JSON
      res.json({ token, user });
      // Or, for web: set as cookie and redirect if needed
      // res.cookie('auth', token, { httpOnly: true, maxAge: 3600 * 1000 });
      // res.redirect(process.env.FRONTEND_URL || '/');
    }
  );
} else {
  router.get(["/login", "/callback"], (req, res) =>
    res.status(503).send("Google login disabled")
  );
}

// --- JWT-protected /me ---
router.get("/me", async (req, res) => {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing token" });
  }
  const user = await validateGoogleJwt(token);
  if (!user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  res.json({ user });
});

router.use((req, res) => res.status(404).send("Not Found"));

pinoLogger.info("passport-google router ready");

export default router;
