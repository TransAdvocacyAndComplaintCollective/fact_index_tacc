// ./auth/devStrategy.js
import express from 'express';
import passport from 'passport';
import { Strategy as CustomStrategy } from 'passport-custom';
import { ipPrivate, isProxy } from '../utils/ipUtils.js';


// DEV_ENABLED should use logical OR (||), not bitwise |
export const DEV_ENABLED =
  process.env.DEV_LOGIN_MODE === 'true' ||
  process.env.DEV_LOGIN_MODE === 'TRUE';

const router = express.Router();

// Centralized logger
function log(level, ...args) {
  const ts = new Date().toISOString();
  const logger = console[level] || console.log;
  logger(`[${ts}] [dev passport]`, ...args);
}

// Register "dev" strategy only when enabled
if (DEV_ENABLED) {
  passport.use(
    'dev',
    new CustomStrategy((req, done) => {
      const clientIp = req.ip || req.connection?.remoteAddress;
      log('info', 'Dev login requested via override', `IP: ${clientIp}`);

      const user = {
        id: process.env.DEV_ID || 'dev-id',
        username: process.env.DEV_USERNAME || 'DevUser',
        avatar: process.env.DEV_AVATAR || null,
        guild: process.env.DISCORD_GUILD_ID || null,
        hasRole: true,
        accessToken: 'fake-access-token',
        refreshToken: 'fake-refresh-token',
        expiresAt: Date.now() + 3600 * 1000,
        provider: 'dev',
      };

      log('info', `Dev login successful for user: ${user.username}`);
      return done(null, user);
    })
  );
  log('info', 'Dev login mode enabled');
} else {
  log('warn', 'Dev login mode is disabled');
}

// Refresh fake token
export async function refreshDevToken(user) {
  log('info', `Refreshing fake dev token for ${user.username} (${user.id})`);
  return {
    accessToken: 'fake-access-token',
    refreshToken: 'fake-refresh-token',
    expiresAt: Date.now() + 3600 * 1000,
    provider: 'dev',
    authenticated_method: 'dev',
  };
}

// Validate and refresh session middleware
export async function validateAndRefreshDevSession(req, res, next) {
  const clientIp = req.ip || req.connection?.remoteAddress;
  req.authStatus = { authenticated: false };

  if (!DEV_ENABLED) {
    req.authStatus.reason = 'dev_disabled';
    log('warn', 'Dev session validation: dev_disabled');
    return next();
  }

  if (!req.isAuthenticated?.() || req.user.provider !== 'dev') {
    req.authStatus.reason = 'not_logged_in';
    log('warn', 'Dev session validation failed: not_logged_in', `IP: ${clientIp}`);
    return next();
  }

  const user = req.user;
  if (user.expiresAt && user.expiresAt < Date.now()) {
    log('warn', `Dev token expired for ${user.username}, refreshing...`);
    Object.assign(user, await refreshDevToken(user));
  }

  req.authStatus = {
    authenticated: true,
    provider: 'dev',
    user: {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      guild: user.guild,
      hasRole: user.hasRole,
      provider: 'dev',
    },
  };

  log('info', `Dev session validated for user: ${user.username}`, `IP: ${clientIp}`);
  return next();
}

// Routes
if (DEV_ENABLED) {
  // Development login route
  router.get('/login', passport.authenticate('dev'), (req, res) => {
    res.redirect('/');
  });
} else {
  // Disabled login route
  router.get('/login', (_req, res) => {
    console.warn('GET /auth/dev/login attempted while disabled');
    res.status(503).send('Dev login disabled');
  });
}
export function canLoginDev(req) {
  const clientIp = req.ip || req.connection?.remoteAddress;
  if (!clientIp) return false;

  // Check if the IP is a private IP
  return ipPrivate(req) && !isProxy(req) && DEV_ENABLED;
}

export default router;
