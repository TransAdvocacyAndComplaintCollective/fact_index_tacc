// auth/passport-google.ts
import express from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { createAvatar } from "@dicebear/core";
import { lorelei } from "@dicebear/collection";
import { Buffer } from "buffer";
import process from "process";
import pinoLogger from "../../logger/pino.js";
import type { GoogleAuthUser } from "../auth_types.js";
import { issueJWT } from "../tokenUtils.js";
import { getPermissions } from "../../db/user/access.js";
import { AppDataSource } from "../../db/db.js";
import { LoginFact } from "../../db/user/types.js";
import { IdentifierType, Provider } from "../../db/user/model.js";

// --- Logger & Router ---
const log = pinoLogger.child({ component: "google-auth" });
const router = express.Router();

// --- Env Check ---
const requiredEnv = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_CALLBACK_URL",
  "GOOGLE_JWT_SECRET",
];
export const GOOGLE_ENABLED = requiredEnv.every((k) =>
  Boolean(process.env[k]?.trim())
);

if (!GOOGLE_ENABLED) {
  log.warn(
    { missing: requiredEnv.filter((k) => !process.env[k]) },
    "Google auth disabled"
  );
} else {
  log.info("Google OAuth enabled");
}

// --- Helpers ---
function getFallbackAvatar(seed: string) {
  const svg = createAvatar(lorelei, { seed: seed || "anon" }).toString();
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
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
      async (accessToken, refreshToken, profile, done) => {
        log.info({ googleId: profile.id }, "Google OAuth callback");
        try {
          const id = profile.id;
          const username =
            profile.displayName ||
            profile.name?.givenName ||
            profile.emails?.[0]?.value?.split("@")[0] ||
            "GoogleUser";
        const pj: any = (profile as any)._json || {};
        const primaryEmail: string | undefined =
          profile.emails?.[0]?.value;
        const emailVerified: boolean = Boolean(pj.email_verified);
        const avatar = profile.photos?.[0]?.value || getFallbackAvatar(id);

          const loginFacts: LoginFact[] = [
            {
              provider: Provider.GOOGLE,
              type: IdentifierType.USER_ID,
              value: id,
            },
            {
              provider: Provider.GOOGLE,
              type: IdentifierType.USERNAME,
              value: username,
            }
          ];
          if(primaryEmail && emailVerified) {
            loginFacts.push({
              provider: Provider.GOOGLE,
              type: IdentifierType.EMAIL,
              value: primaryEmail,
            });
          }

          const params = await getPermissions(AppDataSource, loginFacts);

          const user: GoogleAuthUser = {
            provider: "google",
            id,
            username,
            avatar,
            accessToken,
            expiresAt:0, // default 1h expiry
            authenticated: true,
            reason: "authenticated",
            params,
            loginFacts,
          };

          done(null, user);
        } catch (err: any) {
          log.error({ err, googleId: profile?.id }, "Google strategy error");
          done(err, false, { message: "Google auth failed" });
        }
      }
    )
  );
}

// --- Validation ---
export async function validateGoogle(
  user: GoogleAuthUser
): Promise<GoogleAuthUser | null> {
  if (!GOOGLE_ENABLED) return null;
  try {
    if (user && user.provider === "google" && user.authenticated && user.id) {
      return user; // Already validated
    }
  } catch (err: any) {
    log.warn({ error: err.message }, "Invalid Google JWT");
  }
  return null;
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
      const token = issueJWT(user);
      res.json({ token, user });
    }
  );
} else {
  router.get(["/login", "/callback"], (req, res) =>
    res.status(503).send("Google login disabled")
  );
}

export default router;
