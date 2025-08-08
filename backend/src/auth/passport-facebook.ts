// src/auth/passport-facebook.ts
import expres from 'express';
import passport from 'passport';
import express from "express";
import pkg_express from 'express';

type Request = pkg_express.Request;
type Response = pkg_express.Response;
type NextFunction = pkg_express.NextFunction;
import pkg_facebook from 'passport-facebook';
const FacebookStrategy = pkg_facebook.Strategy;

// Removed: const Profile  = pkg_facebook.FbProfile;
import refresh from 'passport-oauth2-refresh';
import fetch from 'node-fetch';
import pinoLogger from '../logger/pino.ts';
import type { FacebookAuthUser } from './auth_types.d.ts';

const log = pinoLogger.child({ component: 'facebook-passport' });

export const FACEBOOK_ENABLED = (() => {
  const required = ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET', 'FACEBOOK_CALLBACK_URL'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    log.warn({ missing }, 'Facebook auth disabled due to missing env vars');
    return false;
  }
  log.info('Facebook auth enabled');
  return true;
})();

const REQUIRED_GROUP_IDS = (process.env.FACEBOOK_GROUPS_CHECK || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

async function fetchGroups(token: string): Promise<{ id: string; name: string }[]> {
  const url = `https://graph.facebook.com/v19.0/me/groups?fields=id,name&limit=200&access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      log.warn({ status: res.status }, 'Failed to fetch Facebook groups');
      return [];
    }
    const json = (await res.json()) as { data?: Array<{ id: string; name: string }> };
    return json.data ?? [];
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'Error fetching Facebook groups');
    return [];
  }
}

if (FACEBOOK_ENABLED) {
  const strategy = new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID!,
      clientSecret: process.env.FACEBOOK_APP_SECRET!,
      callbackURL: process.env.FACEBOOK_CALLBACK_URL!,
      profileFields: ['id', 'displayName', 'emails', 'photos'],
      scope: ['email', 'groups_access_member_info'],
      enableProof: true,
    },
    async (
      accessToken: string,
      refreshToken: string | undefined,
      profile: pkg_facebook.Profile,
      done: (err: any, user?: FacebookAuthUser) => void
    ) => {
      try {
        const groups = await fetchGroups(accessToken);
        const user: FacebookAuthUser = {
          provider: 'facebook',
          accessToken: accessToken,
          expiresAt: 0,
          id: profile.id,
          username: profile.displayName,
          authenticated: true,
          reason: 'authenticated',
          params: [],
          avatar: profile.photos?.[0]?.value ?? null,
        };
        done(null, user);
      } catch (err) {
        log.error({ err: err instanceof Error ? err.message : String(err) }, 'Facebook verify failure');
        done(err);
      }
    }
  );

  passport.use('facebook', strategy);
  refresh.use('facebook', strategy);
}

passport.serializeUser((user: any, done) => {
  log.info({ id: user.id }, 'serializeUser');
  done(null, {
    id: user.id,
    provider: user.provider,
    accessToken: user.accessToken,
    expiresAt: user.expiresAt,
    avatar: user.avatar,
    groups: user.groups,
  });
});

passport.deserializeUser((obj: any, done) => {
  log.info({ provider: obj.provider }, 'deserializeUser');
  const fbUser: FacebookAuthUser = {
    provider: 'facebook',
    accessToken: obj.accessToken,
    expiresAt: 0,
    id: obj.id,
    username: obj.username ?? '',
    authenticated: true,
    reason: 'authenticated',
    avatar: obj.avatar ?? null,
    params: []
  };
  done(null, fbUser);
});


export async function validateAndRefreshFacebookSession(
  req: Request & Express.AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {

  next();
}

const router = express.Router();
if (FACEBOOK_ENABLED) {
  router.get('/login', passport.authenticate('facebook'));
  router.get(
    '/callback',
    passport.authenticate('facebook', { failureRedirect: '/' }),
    (_req, res) => res.redirect('/')
  );
} else {
  router.get('/login', (_req, res) => res.status(503).send('Facebook login disabled'));
  router.get('/callback', (_req, res) => res.status(503).send('Facebook login disabled'));
}

router.use((_req, res) => res.status(404).send('Not Found'));

export default router;
