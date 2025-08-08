// src/auth/devStrategy.ts
import express from 'express';
import passport from 'passport';
import { Strategy as CustomStrategy } from 'passport-custom';
import pinoLogger from '../logger/pino.ts';
import type { DevAuthUser } from './auth_types.d.ts';
import { ipPrivate, isProxy } from '../utils/ipUtils.ts';

import pkg_express from 'express';
type Request = pkg_express.Request;
type Response = pkg_express.Response;
type NextFunction = pkg_express.NextFunction;
type Router = pkg_express.Router;

const router = express.Router();
export const DEV_ENABLED = true;
// export const DEV_ENABLED =
  // process.env.DEV_LOGIN_MODE === 'true' || process.env.DEV_LOGIN_MODE === 'TRUE';

const baseLog = pinoLogger.child({ component: 'dev-passport', provider: 'dev' });
baseLog.info('Module loaded', { devEnabled: DEV_ENABLED });
console.log('[DEV DEBUG] Module loaded', { devEnabled: DEV_ENABLED });

if (DEV_ENABLED) {
  passport.use(
    'dev',
    new CustomStrategy((req, done) => {
      const log = baseLog.child({ requestId: (req as any).id }); // assuming req.id from uuid middleware
      log.debug('Dev login attempt starting', {
        ip: req.ip,
        headers: { 'user-agent': req.get('User-Agent') },
      });
      console.log('[DEV DEBUG] Dev login attempt starting', {
        ip: req.ip,
        headers: { 'user-agent': req.get('User-Agent') },
      });
      try {
        // Construct user matching DevAuthUser type
        const user: DevAuthUser = {
          id: 'DEV_ID',
          username: process.env.DEV_USERNAME || 'DevUser',
          avatar: process.env.DEV_AVATAR || null,
          provider: 'dev',
          accessToken: 'fake-access-token',
          expiresAt: Date.now() + 3600 * 1000,
          authenticated: true,
          reason: 'authenticated',
          params: []
        };

        log.info('Dev login successful', {
          userId: user.id,
          username: user.username,
        });
        console.log('[DEV DEBUG] Dev login successful', { userId: user.id, username: user.username });
        return done(null, user);
      } catch (err) {
        log.error({ err }, 'Unexpected error during dev login');
        console.log('[DEV DEBUG] Unexpected error during dev login', err);
        return done(err);
      }
    }),
  );
  baseLog.info('Dev login strategy registered');
  console.log('[DEV DEBUG] Dev login strategy registered');
} else {
  baseLog.warn('Dev login mode disabled — strategy not registered');
  console.log('[DEV DEBUG] Dev login mode disabled — strategy not registered');
}

/**
 * Refresh the dev token (dummy implementation)
 */
export async function refreshDevToken(user: DevAuthUser): Promise<Pick<DevAuthUser, 'accessToken' | 'expiresAt'>> {
  const log = baseLog.child({ userId: user.id, action: 'refreshToken' });
  log.info('Refreshing dev token');
  console.log('[DEV DEBUG] Refreshing dev token', { userId: user.id });
  try {
    // Just return new fake tokens and expiry
    return {
      accessToken: 'fake-access-token',
      expiresAt: Date.now() + 3600 * 1000,
    };
  } catch (err) {
    log.error({ err }, 'Failed to refresh dev token');
    console.log('[DEV DEBUG] Failed to refresh dev token', err);
    throw err;
  }
}

/**
 * Middleware to validate and refresh the dev user session token if expired
 */
export async function validateAndRefreshDevSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const log = baseLog.child({ requestId: (req as any).id, sessionID: (req as any).sessionID });
  log.debug('validateAndRefreshDevSession invoked');
  console.log('[DEV DEBUG] validateAndRefreshDevSession invoked', { requestId: (req as any).id, sessionID: (req as any).sessionID });

  // Initialize authStatus on request (add to req via cast)
  (req as any).authStatus = { authenticated: false, provider: 'dev', reason: 'not_logged_in' };

  if (!DEV_ENABLED) {
    log.warn('Development login disabled');
    console.log('[DEV DEBUG] Development login disabled');
    return next();
  }

  if (!req.isAuthenticated?.() || !req.user || (req.user as any).provider !== 'dev') {
    (req as any).authStatus = {
      authenticated: false,
      provider: 'dev',
      reason: 'not_logged_in',
      user: {
        id: 'unknown',
        username: 'unknown',
        avatar: null,
        provider: 'dev',
        accessToken: '',
        expiresAt: 0,
      },
    };
    log.warn('User not logged in via dev provider');
    console.log('[DEV DEBUG] User not logged in via dev provider', { sessionID: (req as any).sessionID });
    return next();
  }

  const user = req.user as DevAuthUser;

  // Type guard for DevAuthUser
  function isDevAuthUser(u: any): u is DevAuthUser {
    return (
      u &&
      typeof u === 'object' &&
      typeof u.id === 'string' &&
      typeof u.username === 'string' &&
      u.provider === 'dev' &&
      typeof u.accessToken === 'string' &&
      typeof u.expiresAt === 'number'
    );
  }

  if (!isDevAuthUser(user)) {
    (req as any).authStatus = {
      authenticated: false,
      provider: 'dev',
      reason: 'invalid_user_type',
    };
    log.error('User object is not of type DevAuthUser');
    console.log('[DEV DEBUG] User object is not of type DevAuthUser', user);
    return next();
  }

  log.debug('Session found', {
    userId: user.id,
    username: user.username,
    expiresAt: user.expiresAt,
  });
  console.log('[DEV DEBUG] Session found', { userId: user.id, username: user.username, expiresAt: user.expiresAt });

  // Refresh token if expired
  if (user.expiresAt < Date.now()) {
    log.warn('Dev token expired, performing refresh');
    console.log('[DEV DEBUG] Dev token expired, performing refresh', { userId: user.id });
    try {
      const refreshed = await refreshDevToken(user);
      user.accessToken = refreshed.accessToken;
      user.expiresAt = refreshed.expiresAt;
      log.info('Dev token refreshed', { userId: user.id, newExpiry: user.expiresAt });
      console.log('[DEV DEBUG] Dev token refreshed', { userId: user.id, newExpiry: user.expiresAt });
    } catch (e) {
      (req as any).authStatus = {
        authenticated: false,
        provider: 'dev',
        reason: 'refresh_failed',
        user: {
          id: 'unknown',
          username: 'unknown',
          avatar: null,
          provider: 'dev',
          accessToken: '',
          expiresAt: 0,
        },
      };
      log.error('Token refresh failed');
      console.log('[DEV DEBUG] Token refresh failed', { error: e });
      return next();
    }
  }

  (req as any).authStatus = {
    authenticated: true,
    provider: 'dev',
    reason: 'authenticated',
    user: {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      provider: 'dev',
      accessToken: user.accessToken,
      expiresAt: user.expiresAt,
    },
  };

  log.info('Dev session validated', { userId: user.id, username: user.username });
  console.log('[DEV DEBUG] Dev session validated', { userId: user.id, username: user.username });
  return next();
}

/**
 * Express route for dev login
 */
if (DEV_ENABLED) {
  router.get(
    '/login',
    (req, res, next) => {
      const log = baseLog.child({ route: '/auth/dev/login', requestId: (req as any).id });
      log.debug('GET /auth/dev/login requested');
      console.log('[DEV DEBUG] GET /auth/dev/login requested', { requestId: (req as any).id });
      next();
    },
    passport.authenticate('dev'),
    (req, res) => {
      const log = baseLog.child({
        route: '/auth/dev/login',
        userId: req.user ? (req.user as DevAuthUser).id : undefined,
      });
      log.info('Redirecting after dev login');
      console.log('[DEV DEBUG] Redirecting after dev login', { userId: req.user ? (req.user as DevAuthUser).id : undefined });
      res.redirect('/');
    },
  );
} else {
  router.get('/login', (req, res) => {
    const log = baseLog.child({ route: '/auth/dev/login' });
    log.warn('Login route accessed but dev login is disabled');
    console.log('[DEV DEBUG] Login route accessed but dev login is disabled');
    res.status(503).send('Dev login disabled');
  });
}

/**
 * Function to check if the current request can login using dev strategy
 */
export function canLoginDev(req: Request): boolean {
  const log = baseLog.child({ route: 'canLoginDev', ip: req.ip });
  const allowed =
    DEV_ENABLED &&
    Boolean(ipPrivate(req)) &&
    !Boolean(isProxy(req));
  log.debug('canLoginDev check', {
    devEnabled: DEV_ENABLED,
    ipPrivate: Boolean(ipPrivate(req)),
    isProxy: Boolean(isProxy(req)),
    result: allowed,
  });
  console.log('[DEV DEBUG] canLoginDev check', {
    devEnabled: DEV_ENABLED,
    ipPrivate: Boolean(ipPrivate(req)),
    isProxy: Boolean(isProxy(req)),
    result: allowed,
  });
  return allowed;
}

export default router;
