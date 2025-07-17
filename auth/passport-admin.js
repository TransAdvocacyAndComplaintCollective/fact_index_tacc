import express from 'express';
import passport from 'passport';
import { Strategy as CustomStrategy } from 'passport-custom';
import { ipPrivate, isProxy } from '../utils/ipUtils.js';

import { createRequire } from 'module';
import fs from 'fs/promises';
import path from 'path';
import mime from 'mime-types';

const requireCJS = createRequire(import.meta.url);
const router = express.Router();

// Correct way: Check env var and PAM support both to enable admin login
let pam;
let ADMIN_ENABLED = false;

// First check environment variable (case insensitive)
const envAdminEnabled = (process.env.ADMIN_ENABLED || '').toLowerCase() === 'true';

try {
  pam = requireCJS('authenticate-pam');
  if (pam && envAdminEnabled) {
    ADMIN_ENABLED = true;
    console.info('[passport-admin] PAM support enabled and ADMIN_ENABLED=true.');
  } else {
    console.warn('[passport-admin] PAM loaded but ADMIN_ENABLED env var is false, disabling admin login.');
  }
} catch (err) {
  console.warn('[passport-admin] PAM not available — admin login disabled:', err.message);
}

function ensureLocalAccess(req, res, next) {
  const clientIp = req.ip || req.connection?.remoteAddress;
  if (!ipPrivate(req) || isProxy(req)) {
    console.warn(`[passport-admin] Remote access denied for admin login from IP: ${clientIp}`);
    return res.status(403).json({ error: 'Remote access denied' });
  }
  next();
}

async function getUserProfileImage(username) {
  const sanitizedUsername = username.replace(/[^\w.-]/g, '');
  console.debug(`[getUserProfileImage] Sanitized username: ${sanitizedUsername}`);

  const homeDir = path.join('/home', sanitizedUsername);
  const candidates = [
    path.join(homeDir, '.face'),
    path.join(homeDir, '.face.icon'),
    path.join('/var/lib/AccountsService/icons', sanitizedUsername),
  ];

  console.debug(`[getUserProfileImage] Avatar candidate paths: ${candidates.join(', ')}`);

  for (const imgPath of candidates) {
    try {
      const data = await fs.readFile(imgPath);
      const mimeType = mime.lookup(imgPath) || 'application/octet-stream';
      const base64 = data.toString('base64');
      console.debug(`[getUserProfileImage] Found avatar at ${imgPath}`);
      return `data:${mimeType};base64,${base64}`;
    } catch (err) {
      console.debug(`[getUserProfileImage] Failed to read avatar file at ${imgPath}: ${err.message}`);
    }
  }

  console.debug('[getUserProfileImage] No avatar found');
  return null;
}

if (ADMIN_ENABLED) {
  // Use debug module if available, else fallback to console.debug
  let debug;
  try {
    debug = require('debug')('passport-admin');
  } catch {
    debug = { info: console.info, warn: console.warn, error: console.error };
  }

  router.get('/avatar', async (req, res) => {
    debug.info('Received request for avatar');

    if (!req.user || !req.user.username) {
      debug.warn('[passport-admin] Unauthorized avatar request: no user or username');
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Sanitize username (basic)
    const username = req.user.username.replace(/[^\w.-]/g, '');
    debug.info(`[passport-admin] Sanitized username: ${username}`);

    const homeDir = path.join('/home', username);
    const candidates = [
      path.join(homeDir, '.face'),
      path.join(homeDir, '.face.icon'),
      path.join('/var/lib/AccountsService/icons', username),
    ];

    let avatarFile = null;
    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        avatarFile = candidate;
        debug.info(`[passport-admin] Found avatar file: ${candidate}`);
        break;
      } catch {
        debug.info(`[passport-admin] Avatar file not found or inaccessible: ${candidate}`);
      }
    }

    if (!avatarFile) {
      debug.warn(`[passport-admin] No avatar found for user ${username}`);
      return res.status(404).send("No avatar found.");
    }

    const contentType = mime.lookup(avatarFile) || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    res.sendFile(avatarFile, err => {
      if (err) {
        debug.error(`[passport-admin] Failed to send avatar image for user ${username}:`, err);
        if (!res.headersSent) {
          res.status(500).send("Failed to send avatar image.");
        }
      } else {
        debug.info(`[passport-admin] Successfully sent avatar image for user ${username}`);
      }
    });
  });

  passport.use(
    'admin',
    new CustomStrategy(async (req, done) => {
      const { username, password } = req.body || {};
      const clientIp = req.ip || req.connection?.remoteAddress;

      if (!username || !password) {
        debug.info(`[passport-admin] Admin login failed: missing credentials from IP: ${clientIp}`);
        return done(null, false, { message: 'Missing credentials' });
      }

      pam.authenticate(username, password, async (err) => {
        if (err) {
          debug.warn(`[passport-admin] Invalid admin login for user "${username}" from IP: ${clientIp}`);
          return done(null, false, { message: 'Invalid credentials' });
        }
        debug.info(`[passport-admin] Admin login successful for user "${username}" from IP: ${clientIp}`);

        const profileImage = "/auth/admin/avatar"; // await getUserProfileImage(username);
        return done(null, { id: username, username, provider: 'admin', profileImage });
      });
    })
  );
}

// Session serialization
passport.serializeUser((user, done) => {
  console.info(`[passport-admin] Serializing admin session for user: ${user.username}`);
  done(null, { id: user.id, username: user.username, provider: 'admin' });
});
passport.deserializeUser((obj, done) => {
  console.info(`[passport-admin] Deserializing admin session for user: ${obj.username}`);
  done(null, obj);
});

export function validateAndRefreshAdminSession(req, res, next) {
  const clientIp = req.ip || req.connection?.remoteAddress;
  req.authStatus = { authenticated: false };

  if (!ADMIN_ENABLED) {
    req.authStatus.reason = 'admin_disabled';
    console.warn('[passport-admin] validateAndRefreshAdminSession: Admin login disabled.');
    return next();
  }
  if (!req.isAuthenticated?.() || req.user.provider !== 'admin') {
    req.authStatus.reason = 'not_logged_in';
    console.info(`[passport-admin] validateAndRefreshAdminSession: Not logged in from IP: ${clientIp}`);
    return next();
  }
  if (!ipPrivate(req) || isProxy(req)) {
    req.logout?.();
    req.session?.destroy(() => { });
    req.authStatus.reason = 'remote_access_denied';
    console.warn(`[passport-admin] validateAndRefreshAdminSession: Session killed, remote access detected for user: ${req.user.username}, IP: ${clientIp}`);
    return next();
  }

  req.authStatus = {
    authenticated: true,
    provider: 'admin',
    user: {
      id: req.user.id, username: req.user.username,
      provider: 'admin',
      profileImage: req.user.profileImage || null,
    }
  };
  console.info(`[passport-admin] validateAndRefreshAdminSession: Session validated for user: ${req.user.username}, IP: ${clientIp}`);
  next();
}

// --- Routes ---
if (ADMIN_ENABLED) {
  router.post(
    '/login',
    ensureLocalAccess,
    (req, res, next) => {
      console.info(`[passport-admin] Admin login POST attempt for user "${req.body?.username || '[unknown]'}" from IP: ${req.ip || req.connection?.remoteAddress}`);
      next();
    },
    (req, res, next) => {
      passport.authenticate('admin', (err, user, info) => {
        if (err) {
          console.error('[passport-admin] Passport error:', err);
          return res.status(500).json({ error: 'Internal error' });
        }
        if (!user) {
          return res.status(403).json({ error: info?.message || 'Access denied' });
        }
        req.logIn(user, err => {
          if (err) {
            return res.status(500).json({ error: 'Session error' });
          }
          // Success! Send profile image if available
          const result = {
            success: true,
            user: {
              username: user.username,
              profileImage: user.profileImage || null,
            },
          };
          return res.json(result);
        });
      })(req, res, next);
    }
  );

  router.get('/logout', (req, res, next) => {
    const clientIp = req.ip || req.connection?.remoteAddress;
    if (req.user) {
      console.info(`[passport-admin] Logging out user: ${req.user.username}, IP: ${clientIp}`);
    } else {
      console.info(`[passport-admin] Logout called, no user, IP: ${clientIp}`);
    }
    req.logout?.();
    req.session?.destroy(err => {
      if (err) {
        console.error('[passport-admin] Error destroying session during logout:', err);
        return next(err);
      }
      res.json({ success: true });
    });
  });
} else {
  router.post('/login', (req, res) => {
    console.warn('[passport-admin] Login attempt while admin login unavailable.');
    res.status(503).json({ error: 'Admin login unavailable' });
  });
}

export function canLoginAdmin(req) {
  const clientIp = req.ip || req.connection?.remoteAddress;
  if (!clientIp) return false;

  // Check if the IP is a private IP
  return ipPrivate(req) && !isProxy(req) && ADMIN_ENABLED;
}

export default router;
export { ADMIN_ENABLED };
