// auth/passport-facebook.ts
import express from "express";
import passport from "passport";
import pkg_facebook from "passport-facebook";
const FacebookStrategy = pkg_facebook.Strategy;
import type { Request, Response } from "express";
import type { FacebookAuthUser } from "../auth_types.js";
import pinoLogger from "../../logger/pino.js";
import { issueJWT } from "../tokenUtils.js";
import { getPermissions } from "../../db/user/access.js";
import { AppDataSource } from "../../db/db.js";
import { LoginFact } from "../../db/user/types.js";
import { IdentifierType, Provider } from "../../db/user/model.js";

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
          const loginFacts: LoginFact[] = [
            {
              provider: Provider.FACEBOOK,
              type: IdentifierType.USER_ID,
              value: profile.id,
            }
          ];
          if (profile.phone) {
            loginFacts.push({
              provider: Provider.FACEBOOK,
              type: IdentifierType.PHONE_E164,
              value: profile.phone
            });
          }
          if (profile.email) {
            loginFacts.push({
              provider: Provider.FACEBOOK,
              type: IdentifierType.EMAIL,
              value: profile.email[0].value,
            });
          }

          const params = await getPermissions(AppDataSource, loginFacts);

          const user: FacebookAuthUser = {
            provider: "facebook",
            id: profile.id,
            username: profile.displayName ?? null,
            avatar: profile.photos?.[0]?.value ?? null,
            accessToken,
            expiresAt: 0, // 2h default expiry
            authenticated: true,
            reason: "authenticated",
            params,
            loginFacts,
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
