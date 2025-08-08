// auth/passport-facebook.ts
import express from 'express';
import passport from 'passport';
import pkg_facebook from 'passport-facebook';
const FacebookStrategy = pkg_facebook.Strategy;
import type { Request, Response, NextFunction } from 'express';
import type { FacebookAuthUser } from './auth_types.d.ts';
import pinoLogger from '../logger/pino.ts';
import jwt from 'jsonwebtoken';

const log = pinoLogger.child({ component: 'facebook-auth' });

function mustEnv(key: string): string {
  const v = process.env[key]?.trim();
  if (!v) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return v;
}

// Check if Facebook auth is fully configured
const required = ['FACEBOOK_APP_ID','FACEBOOK_APP_SECRET','FACEBOOK_CALLBACK_URL','FACEBOOK_JWT_SECRET'];
export const FACEBOOK_ENABLED = required.every(k => Boolean(process.env[k]?.trim()));

if (!FACEBOOK_ENABLED) {
  log.warn('Facebook auth disabled; missing:', required.filter(k => !process.env[k]));
}

let JWT_SECRET = '';
const JWT_EXPIRES_IN = '1h';

if (FACEBOOK_ENABLED) {
  JWT_SECRET = mustEnv('FACEBOOK_JWT_SECRET');
  passport.use(new FacebookStrategy(
    {
      clientID: mustEnv('FACEBOOK_APP_ID'),
      clientSecret: mustEnv('FACEBOOK_APP_SECRET'),
      callbackURL: mustEnv('FACEBOOK_CALLBACK_URL'),
      profileFields: ['id', 'displayName', 'photos', 'emails'],
      scope: ['email'],
    },
    async (accessToken: string, refreshToken: string | undefined, profile: any, done) => {
      log.info({ userId: profile.id }, 'Facebook OAuth callback');
      try {
        const user: FacebookAuthUser = {
          provider: 'facebook',
          id: profile.id,
          username: profile.displayName,
          avatar: profile.photos?.[0]?.value ?? null,
          accessToken,
          expiresAt: Date.now() + 3600 * 1000,
          authenticated: true,
          reason: 'authenticated',
          params: [],
        };
        done(null, user);
      } catch (err: any) {
        log.error({ err }, 'Facebook strategy error');
        done(err, false, { message: 'Facebook auth failed' });
      }
    }
  ));
}

function signUserJWT(user: FacebookAuthUser): string {
  return jwt.sign({
    id: user.id,
    provider: user.provider,
    username: user.username,
    avatar: user.avatar,
    expiresAt: user.expiresAt,
    authenticated: true,
    reason: 'authenticated',
    params: user.params,
  }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export async function validateFacebookJwt(token: string): Promise<FacebookAuthUser | null> {
  if (!FACEBOOK_ENABLED) return null;
  try {
    const user = jwt.verify(token, JWT_SECRET) as FacebookAuthUser;
    if (user.provider === 'facebook' && user.authenticated && user.id) {
      return user;
    }
  } catch (err: any) {
    log.warn('Invalid Facebook JWT', { error: err.message });
  }
  return null;
}

const router = express.Router();

router.get('/login', (req, res, next) => {
  if (!FACEBOOK_ENABLED) return res.status(503).send('Facebook login disabled');
  next();
}, passport.authenticate('facebook'));

router.get('/callback',
  passport.authenticate('facebook', { session: false, failureRedirect: '/' }),
  (req: Request, res: Response) => {
    const user = req.user as FacebookAuthUser;
    const token = signUserJWT(user);
    res.json({ token, user });
  }
);

router.get('/me', async (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  const user = await validateFacebookJwt(token);
  if (!user) return res.status(401).json({ error: 'Invalid or expired token' });
  res.json({ user });
});

export default router;
