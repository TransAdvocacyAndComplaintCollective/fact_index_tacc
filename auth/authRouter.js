// auth/authRouter.js
import express from 'express';

import discordRouter, { validateAndRefreshDiscordSession, DISCORD_ENABLED } from './passport-discord.js';
import googleRouter, { validateAndRefreshGoogleSession, GOOGLE_ENABLED } from './passport-google.js';
import blueskyRouter, { validateAndRefreshBlueskySession, BLUESKY_ENABLED } from './passport-bluesky.js';
import facebookRouter, { validateAndRefreshFacebookSession, FACEBOOK_ENABLED } from './passport-facebook.js';
import adminRouter, { validateAndRefreshAdminSession, ADMIN_ENABLED, canLoginAdmin } from './passport-admin.js';
import devRouter, { validateAndRefreshDevSession, DEV_ENABLED, canLoginDev } from './passport-dev.js';

const router = express.Router();

const DEV_LOGIN_MODE = DEV_ENABLED;

// --- LOGGING UTILS ---
function log(level, ...args) {
  const ts = new Date().toISOString();
  (console[level] || console.log)(`[${ts}] [authRouter]`, ...args);
}

log('info', 'authRouter.js loaded, mounting subrouters...');

// --- DEBUG: Show a stub route for Discord if none registered ---
if (!discordRouter.stack.length) {
  log('info', 'discordRouter was empty, adding default GET /');
  discordRouter.get('/', (_req, res) => {
    log('info', 'GET /discord/ received (default route)');
    res.send('Discord auth root');
  });
}

// --- ROUTE: List which auth providers are enabled ---
router.get('/list_auth', (req, res) => {
  log('info', 'GET /list_auth');
  res.json({
    dev: canLoginDev(req),
    google: GOOGLE_ENABLED,
    discord: DISCORD_ENABLED,
    bluesky: BLUESKY_ENABLED,
    facebook: FACEBOOK_ENABLED,
    admin: canLoginAdmin(req),
  });
});

// --- Mount all provider subrouters (logged) ---
router.use('/dev', (req, res, next) => { log('info', '[MOUNT] /dev', req.method, req.url); next(); }, devRouter);
router.use('/google', (req, res, next) => { log('info', '[MOUNT] /google', req.method, req.url); next(); }, googleRouter);
router.use('/discord', (req, res, next) => { log('info', '[MOUNT] /discord', req.method, req.url); next(); }, discordRouter);
router.use('/bluesky', (req, res, next) => { log('info', '[MOUNT] /bluesky', req.method, req.url); next(); }, blueskyRouter);
router.use('/facebook', (req, res, next) => { log('info', '[MOUNT] /facebook', req.method, req.url); next(); }, facebookRouter);
router.use('/admin', (req, res, next) => { log('info', '[MOUNT] /admin', req.method, req.url); next(); }, adminRouter);

// --- Centralized session validation & token refresh ---
async function validateAndRefreshSession(req, res, next) {
  log('info', `[validateAndRefreshSession] ${req.method} ${req.url} sessionID=${req.sessionID}`);

  req.authStatus = { authenticated: false };

  if (!req.isAuthenticated?.() || !req.user) {
    log('warn', '[validateAndRefreshSession] Not logged in or missing req.user');
    req.authStatus.reason = 'not_logged_in';
    return next();
  }

  try {
    log('info', `[validateAndRefreshSession] provider=${req.user.provider} user.id=${req.user.id}`);
    switch (req.user.provider) {
      case 'dev':
        if (!DEV_LOGIN_MODE) {
          log('warn', '[validateAndRefreshSession] DEV login attempted while DEV_LOGIN_MODE=false. Logging out.');
          req.logout();
          req.session.destroy(() => {});
          req.authStatus.reason = 'dev_disabled';
        } else {
          await validateAndRefreshDevSession(req, res, () => {});
          log('info', '[validateAndRefreshSession] Dev session validated/refreshed');
        }
        break;
      case 'google':
        await validateAndRefreshGoogleSession(req, res, () => {});
        log('info', '[validateAndRefreshSession] Google session validated/refreshed');
        break;
      case 'discord':
        await validateAndRefreshDiscordSession(req, res, () => {});
        log('info', '[validateAndRefreshSession] Discord session validated/refreshed');
        break;
      case 'bluesky':
        await validateAndRefreshBlueskySession(req, res, () => {});
        log('info', '[validateAndRefreshSession] Bluesky session validated/refreshed');
        break;
      case 'facebook':
        await validateAndRefreshFacebookSession(req, res, () => {});
        log('info', '[validateAndRefreshSession] Facebook session validated/refreshed');
        break;
      case 'admin':
        await validateAndRefreshAdminSession(req, res, () => {});
        log('info', '[validateAndRefreshSession] Admin session validated/refreshed');
        break;
      default:
        log('warn', `[validateAndRefreshSession] Unknown provider: ${req.user.provider}. Forcing logout.`);
        req.logout();
        req.session.destroy(() => {});
        req.authStatus.reason = 'unknown_provider';
    }
  } catch (err) {
    log('error', '[validateAndRefreshSession] Session handler error:', err);
    req.authStatus = { authenticated: false, reason: 'session_error' };
  }

  next();
}

// --- /status: Returns user info (provider, expiresAt, etc.) ---
router.get('/status', validateAndRefreshSession, (req, res) => {
log('info', 'GET /status', { authenticated: req.authStatus.authenticated, user: req.authStatus.user });  if (!req.authStatus.authenticated) {
    log('warn', 'GET /status -> 401', req.authStatus.reason);
    return res.status(401).json({ authenticated: false, reason: req.authStatus.reason });
  }
  const user = req.authStatus.user || null;
  const expiresAt = req.sessionData?.expiresAt || null;
  log('info', 'GET /status -> 200', { user: user?.email, provider: user?.provider, expiresAt });
  res.json({ authenticated: true, user, expiresAt });
});

// --- /logout: Ends session, clears cookie, logs out ---
router.get('/logout', (req, res, next) => {
  log('info', 'GET /logout called by user:', req.user?.email, 'provider:', req.user?.provider);
  req.logout(err => {
    if (err) {
      log('error', 'Logout error:', err);
      return next(err);
    }
    req.session.destroy(err => {
      if (err) {
        log('error', 'Session destroy error:', err);
        return next(err);
      }
      log('info', 'User logged out and session destroyed.');
      res.clearCookie('session_id').redirect('/');
    });
  });
});

// --- UTILITY: Print all registered routes at startup ---
function printRoutes(stack, prefix = '') {
  stack.forEach(layer => {
    if (layer.route && layer.route.path) {
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      paths.forEach(path => log('info', '[ROUTE]', prefix + path));
    } else if (layer.name === 'router' && layer.handle.stack) {
      const pathRegex = layer.regexp?.toString() ?? '';
      const cleanedPrefix = pathRegex
        .replace(/^\/\^\\/, '')
        .replace(/\\\/\?\(\?=\\\/\|\$\)\/i?$/, '')
        .replace(/\\\//g, '/')
        .replace(/\$$/, '');
      printRoutes(layer.handle.stack, prefix + cleanedPrefix);
    }
  });
}

log('info', 'Registered routes:');
printRoutes(router.stack);

// --- Fallback logger for all unknown routes ---
router.use((req, res, next) => {
  log('warn', `Unhandled route: ${req.method} ${req.url} (provider: ${req.user?.provider || '-'})`);
  next();
});

export default router;
