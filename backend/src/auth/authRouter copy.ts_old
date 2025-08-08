// src/auth/authRouter.ts
import pinologger from '../logger/pino.ts';

import googleRouter, { GOOGLE_ENABLED, validateAndRefreshGoogleSession } from './passport-google.ts';
import discordRouter, { DISCORD_ENABLED, validateAndRefreshDiscordSession } from './passport-discord.ts';
import blueskyRouter, { BLUESKY_ENABLED, validateAndRefreshBlueSky } from './passport-bluesky.ts';
import facebookRouter, { FACEBOOK_ENABLED, validateAndRefreshFacebookSession } from './passport-facebook.ts';
import adminRouter, { ADMIN_ENABLED, canLoginAdmin, validateAndRefreshAdminSession } from './passport-admin.ts';
import devRouter, { DEV_ENABLED, canLoginDev, validateAndRefreshDevSession } from './passport-dev.ts';
import express from 'express';
import pkg_express from 'express';
type Request = pkg_express.Request;
type Response = pkg_express.Response;
type NextFunction = pkg_express.NextFunction;
type Router = pkg_express.Router;

import type {
  UnauthenticatedUser,
  ProviderType,
  AuthUser,
} from "./auth_types.d.ts";

const pinolog = pinologger.child({ component: 'auth-router' });
pinolog.info('Loaded authRouter.ts');
pinolog.info('ENV:', Object.fromEntries(
  Object.entries(process.env).filter(
    ([k]) =>
      k.startsWith('DISCORD_') ||
      k.startsWith('DEV_') ||
      k.startsWith('GOOGLE_') ||
      k.startsWith('FACEBOOK_') ||
      k.startsWith('BLUESKY_')
  )
));

const router = express.Router();

// Provider routers
const providers: [string, boolean, Router][] = [
  ['dev', DEV_ENABLED, devRouter],
  ['google', GOOGLE_ENABLED, googleRouter],
  ['discord', DISCORD_ENABLED, discordRouter],
  ['bluesky', BLUESKY_ENABLED, blueskyRouter],
  ['facebook', FACEBOOK_ENABLED, facebookRouter],
  ['admin', ADMIN_ENABLED, adminRouter],
];

providers.forEach(([path, enabled, subrouter]) => {
  pinolog.info(`Provider: ${path} (enabled: ${enabled})`);
  if (enabled) {
    router.use(`/${path}`,
      (req: Request, res: Response, next: NextFunction) => {
        pinolog.info(`Provider route: /${path}`, {
          method: req.method,
          url: req.url,
          sessionID: req.sessionID,
        });
        // Print to console for quick debug
        console.log(`[AUTH DEBUG] Provider route hit: /${path}`, {
          method: req.method,
          url: req.url,
          sessionID: req.sessionID,
        });
        next();
      },
      subrouter
    );
    pinolog.info(`/${path} router mounted`);
    console.log(`[AUTH DEBUG] /${path} router mounted`);
  }
});

async function validateAndRefreshSession(req: Request, res: Response, next: NextFunction) {
  pinolog.info('validateAndRefreshSession ENTRY', { sessionID: req.sessionID, url: req.originalUrl, user: req.user });
  console.log('[AUTH DEBUG] validateAndRefreshSession ENTRY', { sessionID: req.sessionID, url: req.originalUrl, user: req.user });

  // Not authenticated (no session or not logged in)
  if (
    typeof req.isAuthenticated !== 'function' ||
    !req.isAuthenticated() ||
    !req.user ||
    typeof req.user !== 'object' ||
    !('provider' in req.user)
  ) {
    pinolog.warn('Not authenticated', { sessionID: req.sessionID, user: req.user, url: req.originalUrl });
    console.log('[AUTH DEBUG] Not authenticated', { sessionID: req.sessionID, user: req.user, url: req.originalUrl });
    const authStatus: UnauthenticatedUser = {
      authenticated: false,
      reason: 'not_logged_in',
      provider: null,
      username: undefined,
      expiresAt: null,
    };
    (req as any).authStatus = authStatus;
    pinolog.info('validateAndRefreshSession EXIT (unauthenticated)', { authStatus });
    console.log('[AUTH DEBUG] validateAndRefreshSession EXIT (unauthenticated)', { authStatus });
    return next();
  }

  // Valid user object exists
  try {
    const provider = (req.user as { provider?: ProviderType }).provider ?? null;
    pinolog.info('Validating provider', { provider, sessionID: req.sessionID, user: req.user });
    console.log('[AUTH DEBUG] Validating provider', { provider, sessionID: req.sessionID, user: req.user });
    // Will mutate req.user in-place if successful
    switch (provider) {
      case 'dev':
        console.log('[AUTH DEBUG] Calling validateAndRefreshDevSession');
        await validateAndRefreshDevSession(req, res, () => {});
        break;
      case 'google':
        console.log('[AUTH DEBUG] Calling validateAndRefreshGoogleSession');
        await validateAndRefreshGoogleSession(req, res, () => {});
        break;
      case 'discord':
        console.log('[AUTH DEBUG] Calling validateAndRefreshDiscordSession');
        await validateAndRefreshDiscordSession(req, res, () => {});
        break;
      case 'bluesky':
        console.log('[AUTH DEBUG] Calling validateAndRefreshBlueSky');
        await validateAndRefreshBlueSky(req, res, () => {});
        break;
      case 'facebook':
        console.log('[AUTH DEBUG] Calling validateAndRefreshFacebookSession');
        await validateAndRefreshFacebookSession(req, res, () => {});
        break;
      case 'admin':
        console.log('[AUTH DEBUG] Calling validateAndRefreshAdminSession');
        await validateAndRefreshAdminSession(req, res, () => {});
        break;
      default:
        // Unknown or missing provider, treat as unauthenticated
        pinolog.warn('Unknown provider in session', { provider, user: req.user });
        console.log('[AUTH DEBUG] Unknown provider in session', { provider, user: req.user });
        const unauthStatus: UnauthenticatedUser = {
          authenticated: false,
          reason: 'not_logged_in',
          provider: null,
          username: undefined,
          expiresAt: null,
          previousProvider: provider,
        };
        (req as any).authStatus = unauthStatus;
        pinolog.info('validateAndRefreshSession EXIT (unknown provider)', { authStatus: unauthStatus });
        console.log('[AUTH DEBUG] validateAndRefreshSession EXIT (unknown provider)', { authStatus: unauthStatus });
        return next();
    }
    // If successful, req.user is an AuthUser (authenticated)
    (req as any).authStatus = req.user as AuthUser;
    pinolog.info('Session validation done', {
      sessionID: req.sessionID,
      provider,
      authenticated: (req as any).authStatus?.authenticated,
      user: req.user,
    });
    console.log('[AUTH DEBUG] Session validation done', {
      sessionID: req.sessionID,
      provider,
      authenticated: (req as any).authStatus?.authenticated,
      user: req.user,
    });
  } catch (err: any) {
    // On error, forcibly log out and clear session
    pinolog.error('Session validation error', {
      sessionID: req.sessionID,
      error: err && err.message,
      user: req.user,
    });
    console.log('[AUTH DEBUG] Session validation error', {
      sessionID: req.sessionID,
      error: err && err.message,
      user: req.user,
    });
    const unauthStatus: UnauthenticatedUser = {
      authenticated: false,
      reason: 'refresh_failed',
      provider: null,
      username: undefined,
      expiresAt: null,
    };
    (req as any).authStatus = unauthStatus;
    if (typeof req.logout === 'function') req.logout(() => {});
    if (req.session && typeof req.session.destroy === 'function') req.session.destroy(() => {});
    pinolog.info('validateAndRefreshSession EXIT (error)', { authStatus: unauthStatus });
    console.log('[AUTH DEBUG] validateAndRefreshSession EXIT (error)', { authStatus: unauthStatus });
  }

  next();
}

router.get('/list_auth', (req: Request, res: Response) => {
  pinolog.info('GET /list_auth ENTRY', { sessionID: req.sessionID, ip: req.ip, user: req.user });
  console.log('[AUTH DEBUG] GET /list_auth ENTRY', { sessionID: req.sessionID, ip: req.ip, user: req.user });

  const list = {
    dev: canLoginDev(req),
    google: GOOGLE_ENABLED,
    discord: DISCORD_ENABLED,
    bluesky: BLUESKY_ENABLED,
    facebook: FACEBOOK_ENABLED,
    admin: canLoginAdmin(req),
  };

  pinolog.info('Available login providers:', list);
  console.log('[AUTH DEBUG] Available login providers:', list);
  pinolog.info('GET /list_auth EXIT', { sessionID: req.sessionID, list });
  console.log('[AUTH DEBUG] GET /list_auth EXIT', { sessionID: req.sessionID, list });
  res.json(list);
});


// Auth status endpoint: show the current session's auth status
router.get('/status', validateAndRefreshSession, (req: Request, res: Response) => {
  const status = (req as any).authStatus as AuthUser | UnauthenticatedUser;
  if (!status || !status.authenticated) {
    pinolog.info('GET /status unauthenticated', {
      sessionID: req.sessionID,
      provider: status?.provider,
      reason: status?.reason,
    });
    console.log('[AUTH DEBUG] GET /status unauthenticated', {
      sessionID: req.sessionID,
      provider: status?.provider,
      reason: status?.reason,
    });
    return res.status(401).json({ authenticated: false, reason: status?.reason || 'unknown' });
  }
  pinolog.info('GET /status authenticated', { sessionID: req.sessionID, provider: status.provider });
  console.log('[AUTH DEBUG] GET /status authenticated', { sessionID: req.sessionID, provider: status.provider });
  res.json({
    authenticated: true,
    provider: status.provider,
    expiresAt: status.expiresAt,
    id: status.id,
    username: status.username,
    avatar: status.avatar,
    params: status.params,
  });
});

// Logout and destroy session/cookie
router.get('/logout', (req: Request, res: Response, next: NextFunction) => {
  pinolog.info('GET /logout', { sessionID: req.sessionID, provider: (req.user as any)?.provider });
  console.log('[AUTH DEBUG] GET /logout', { sessionID: req.sessionID, provider: (req.user as any)?.provider });
  function finish() {
    res.clearCookie('session_id');
    res.redirect('/');
  }
  if (typeof req.logout === 'function') {
    req.logout((err?: Error) => {
      if (err) {
        pinolog.error('Logout error', { sessionID: req.sessionID, error: err.message });
        console.log('[AUTH DEBUG] Logout error', { sessionID: req.sessionID, error: err.message });
        return next(err);
      }
      if (req.session && typeof req.session.destroy === 'function') {
        req.session.destroy((err?: Error) => {
          if (err) {
            pinolog.error('Session destroy error', { sessionID: req.sessionID, error: err.message });
            console.log('[AUTH DEBUG] Session destroy error', { sessionID: req.sessionID, error: err.message });
            return next(err);
          }
          finish();
        });
      } else {
        finish();
      }
    });
  } else if (req.session && typeof req.session.destroy === 'function') {
    req.session.destroy((err?: Error) => {
      if (err) {
        pinolog.error('Session destroy error', { sessionID: req.sessionID, error: err.message });
        console.log('[AUTH DEBUG] Session destroy error', { sessionID: req.sessionID, error: err.message });
        return next(err);
      }
      finish();
    });
  } else {
    finish();
  }
});

// Helper: Print all routes for debugging
function printRoutes(stack: any[], prefix = '') {
  stack.forEach(layer => {
    if (layer.route && layer.route.path) {
      layer.route.stack.forEach((rh: any) => {
        pinolog.info('route', { path: prefix + layer.route.path, method: rh.method });
        console.log('[AUTH DEBUG] Registered route', { path: prefix + layer.route.path, method: rh.method });
      });
    } else if (layer.name === 'router' && layer.handle.stack) {
      printRoutes(layer.handle.stack, prefix);
    }
  });
}

// Not found handler for unmatched /auth routes
router.use((req: Request, res: Response) => {
  pinolog.info('No matching route', { method: req.method, url: req.originalUrl, sessionID: req.sessionID });
  console.log('[AUTH DEBUG] No matching route', { method: req.method, url: req.originalUrl, sessionID: req.sessionID });
  const status: UnauthenticatedUser = {
    authenticated: false,
    reason: 'not_found',
    provider: null,
    username: undefined,
    expiresAt: null,
  };
  (req as any).authStatus = status;
  res.status(404).json({
    error: {
      message: 'Not found',
      reason: status.reason,
    },
  });
});

// Print routes at startup
pinolog.info('Registered routes:');
console.log('[AUTH DEBUG] Registered routes:');
printRoutes((router as any).stack);
pinolog.info('[authRouter] printRoutes complete');
console.log('[AUTH DEBUG] printRoutes complete');

export default router;
