// auth/passport-facebook.ts
import express from "express";
import passport from "passport";
import pkg_facebook from "passport-facebook";
const FacebookStrategy = pkg_facebook.Strategy;
import type { Request, Response } from "express";
import type { FacebookAuthUser } from "../auth_types.js";
import pinoLogger from "../../logger/pino.js";
import { issueJWT } from "../tokenUtils.js";
import { AppDataSource } from "../../db/db.js";
import { IdentifierType, LoginFact, ProviderType } from "../../db/user/types.js";
import { addLoginFacts, encryptLoginFacts } from "../loginfacts.js";

const log = pinoLogger.child({ component: "facebook-auth" });

function mustEnv(key: string): string {
  const v = process.env[key]?.trim();
  if (!v) throw new Error(`Missing required environment variable: ${key}`);
  return v;
}

const requiredEnv = [
  "FACEBOOK_APP_ID",
  "FACEBOOK_APP_SECRET",
  "FACEBOOK_CALLBACK_URL",
  "FACEBOOK_JWT_SECRET",
];

export const FACEBOOK_ENABLED = requiredEnv.every((k) =>
  Boolean(process.env[k]?.trim())
);

if (!FACEBOOK_ENABLED) {
  log.warn(
    { missing: requiredEnv.filter((k) => !process.env[k]) },
    "Facebook auth disabled"
  );
}

if (FACEBOOK_ENABLED) {
  passport.use(
    new FacebookStrategy(
      {
        clientID: mustEnv("FACEBOOK_APP_ID"),
        clientSecret: mustEnv("FACEBOOK_APP_SECRET"),
        callbackURL: mustEnv("FACEBOOK_CALLBACK_URL"),
        profileFields: ["id", "displayName", "photos", "emails"],
        scope: ["email","phone"],
      },
      async (accessToken: string, _refreshToken: string | undefined, profile: any, done) => {
        log.info({ facebookId: profile.id }, "Facebook OAuth callback");

        try {
          let loginFacts: LoginFact[] = [];
          const provider = ProviderType.FACEBOOK;
          addLoginFacts(loginFacts, provider, IdentifierType.USER_ID, profile.id);
          addLoginFacts(loginFacts, provider, IdentifierType.PHONE_E164, profile.phone);
          addLoginFacts(loginFacts, provider, IdentifierType.EMAIL, profile.email[0].value);
          

          const user: FacebookAuthUser = {
            provider: "facebook",
            id: profile.id,
            username: profile.displayName ?? null,
            avatar: profile.photos?.[0]?.value ?? null,
            accessToken,
            expiresAt: 0,
            authenticated: true,
            reason: "authenticated",
                        loginFacts: encryptLoginFacts(loginFacts),
          };

          done(null, user);
        } catch (err: any) {
          log.error({ err, facebookId: profile?.id }, "Facebook strategy error");
          done(err, false, { message: "Facebook auth failed" });
        }
      }
    )
  );
}

export async function validateFacebook(
  user: FacebookAuthUser
): Promise<FacebookAuthUser | null> {
  if (!FACEBOOK_ENABLED) return null;

  try {
    if (user && user.provider === "facebook" && user.authenticated && user.id) {
      return user;
    }
  } catch (err: any) {
    log.warn({ error: err.message }, "Invalid Facebook JWT");
  }
  return null;
}

const router = express.Router();

router.get(
  "/login",
  (req, res, next) => {
    if (!FACEBOOK_ENABLED) return res.status(503).send("Facebook login disabled");
    next();
  },
  passport.authenticate("facebook")
);

router.get(
  "/callback",
  passport.authenticate("facebook", { session: false, failureRedirect: "/" }),
  (req: Request, res: Response) => {
    const user = req.user as FacebookAuthUser;
    const token = issueJWT(user);
    res.json({ token, user });
  }
);

export default router;
