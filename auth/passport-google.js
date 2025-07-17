// ./auth/passport-google.js
import express from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { OAuth2Client } from 'google-auth-library';
import { createAvatar } from '@dicebear/core';
import { lorelei } from '@dicebear/collection';

const router = express.Router();

function log(level, ...args) {
  const ts = new Date().toISOString();
  (console[level] || console.log)(`[${ts}] [google passport]`, ...args);
}

log('info', 'Loading passport-google.js...');

// Feature flag: Check all required env vars for Google auth
export const GOOGLE_ENABLED = (() => {
  log('info', 'Checking GOOGLE_ENABLED...');
  const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    log('warn', `[passport-google] Missing env vars: ${missing.join(', ')}, disabling Google auth`);
    return false;
  }
  log('info', 'All Google auth env vars present, enabling Google OAuth.');
  return true;
})();

// Function: Refresh a Google access token with refreshToken
async function refreshGoogleAccessToken(user) {
  log('info', 'Entering refreshGoogleAccessToken for user:', user?.email, 'id:', user?.id);
  if (!user.refreshToken) {
    log('error', 'No refresh token found for user', user?.email, user);
    throw new Error('No refresh token');
  }
  try {
    const client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    client.setCredentials({ refresh_token: user.refreshToken });
    const res = await client.getAccessToken();
    const token = typeof res === 'string' ? res : res?.token;
    if (!token) {
      log('error', 'Failed to refresh access token for user:', user.email);
      throw new Error('Failed to refresh access token');
    }
    log('info', 'Google access token refreshed for user:', user.email);
    return {
      accessToken: token,
      refreshToken: user.refreshToken,
      expiresAt: Date.now() + 3600 * 1000,
      provider: 'google',
      authenticated_method: 'google',
      username: user.username, // Changed from displayName
      avatar: user.avatar,
      email: user.email,
      id: user.id,
    };
  } catch (err) {
    log('error', 'Exception in refreshGoogleAccessToken for', user?.email, err);
    throw err;
  }
}

function getFallbackAvatar(username) {
  log('info', 'Generating fallback avatar for:', username);
  const avatar = createAvatar(lorelei, {
    seed: username || 'unknown',
  });
  const svg = avatar.toString();
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

// --- FIXED Google Strategy: Pull from params (not profile) ---
if (GOOGLE_ENABLED) {
  log('info', 'Registering GoogleStrategy...');
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
  }, async (accessToken, refreshToken, profile, params, done) => {
    // --- LOG RAW INPUTS ---
    log('info', '== RAW profile ==\n' + JSON.stringify(profile, null, 2));
    log('info', '== RAW params ==\n' + JSON.stringify(params, null, 2));
    log('info', 'accessToken:', accessToken ? '[present]' : '[missing]');
    log('info', 'refreshToken:', refreshToken ? '[present]' : '[missing]');

    try {
      // EXTRACT USER DATA FROM params
      // This handles your case where `params` contains id, emails, photos, etc.
      const id = params.id || params._json?.sub || params._json?.id || params._raw?.sub || profile.id;
      const username = params.displayName || params.name?.givenName || params._json?.name || profile.displayName || profile.name?.givenName;
      const email = (
        params.emails?.[0]?.value ||
        params._json?.email ||
        params._raw?.email ||
        profile.emails?.[0]?.value
      );
      let avatar =
        params.photos?.[0]?.value ||
        params._json?.picture ||
        params._raw?.picture ||
        profile.photos?.[0]?.value ||
        null;

      if (!avatar) {
        log('info', 'No Google avatar, generating fallback for:', username);
        avatar = getFallbackAvatar(username);
      }

      const expiresAt = Date.now() + ((params.expires_in || 3600) * 1000);

      const user = {
        id,
        username,      // changed from displayName
        avatar,
        email,
        provider: 'google',
        accessToken,
        refreshToken,
        expiresAt,
      };

      log('info', 'Google login successful:', {
        email, username, avatar: avatar ? '[has avatar]' : '[no avatar]', id
      });
      log('info', 'User object for session:', JSON.stringify(user, null, 2));
      done(null, user);

    } catch (err) {
      log('error', 'Google strategy error:', err);
      done(err, false);
    }
  }));
} else {
  log('info', 'GOOGLE_ENABLED=false, GoogleStrategy not registered.');
}

passport.serializeUser((user, done) => {
  log('info', 'Serializing user session:', user?.id, user?.email);
  log('info', '[serializeUser] Saving:', JSON.stringify(user, null, 2));
  done(null, { ...user });
});
passport.deserializeUser((obj, done) => {
  log('info', 'Deserializing user session:', obj?.id, obj?.email);
  log('info', '[deserializeUser] Restoring:', JSON.stringify(obj, null, 2));
  done(null, obj);
});

async function validateAndRefreshGoogleSession(req, res, next) {
  log('info', 'validateAndRefreshGoogleSession: called for path', req.originalUrl);
  req.authStatus = { authenticated: false };
  if (!GOOGLE_ENABLED) {
    log('warn', 'Google OAuth is disabled');
    req.authStatus.reason = 'google_disabled';
    return next();
  }
  if (!req.isAuthenticated?.() || req.user.provider !== 'google') {
    log('warn', 'Not logged in or not a Google user session');
    req.authStatus.reason = 'not_logged_in';
    return next();
  }
  const user = req.user;
  log('info', ':', user.email, user.id, 'expiresAt:', user.expiresAt, 'now:', Date.now());
  if (user.expiresAt < Date.now()) {
    log('info', 'Google access token expired, refreshing...');
    try {
      Object.assign(user, await refreshGoogleAccessToken(user));
      log('info', 'Access token refreshed for user:', user.email);
    } catch (err) {
      log('warn', 'Token refresh failed for user:', user.email, err);
      req.authStatus.reason = 'token_expired';
      return next();
    }
  }
  let avatar = user.avatar;
  if (!avatar) {
    log('info', 'No session avatar, generating fallback...');
    avatar = getFallbackAvatar(user.username);
  }
  req.authStatus = {
    authenticated: true,
    user: {
      id: user.id,
      username: user.username,         // changed from displayName
      avatar,
      email: user.email,
      provider: 'google',
      accessToken: user.accessToken,
      expiresAt: user.expiresAt,       // make sure expiresAt is included!
    },
  };
  log('info', 'User session validated and refreshed:', user.email, user.id);
  next();
}

if (GOOGLE_ENABLED) {
  router.get(
    '/login',
    (req, res, next) => {
      log('info', '/login GET: Initiating Google auth');
      next();
    },
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      accessType: 'offline',
      prompt: 'consent'
    })
  );
  router.get(
    '/callback',
    (req, res, next) => {
      log('info', '/callback GET: Google OAuth2 callback hit');
      next();
    },
    passport.authenticate('google', { failureRedirect: '/', session: true }),
    (req, res) => {
      log('info', '/callback: Login completed, redirecting to /profile for user', req?.user?.email);
      res.redirect('/profile');
    }
  );
} else {
  router.get('/login', (req, res) => {
    log('warn', '/login GET: Google login disabled');
    res.status(503).send('Google login disabled');
  });
  router.get('/callback', (req, res) => {
    log('warn', '/callback GET: Google login disabled');
    res.status(503).send('Google login disabled');
  });
}

router.get('/me', (req, res, next) => {
  log('info', '/me GET: Checking session/user status');
  next();
}, validateAndRefreshGoogleSession, (req, res) => {
  log('info', '/me: validateAndRefreshGoogleSession result:', req.authStatus);
  if (!req.authStatus.authenticated) {
    log('warn', '/me: Unauthenticated -', req.authStatus.reason);
    return res.status(401).json({ error: req.authStatus.reason });
  }
  log('info', '/me: Returning user info:', req.authStatus.user.email);
  res.json(req.authStatus.user);
});

router.use((req, res) => {
  log('warn', `Unhandled route accessed: ${req.originalUrl}`);
  res.status(404).send('Not Found');
});

log('info', 'passport-google.js loaded and router ready.');

export default router;
export { validateAndRefreshGoogleSession };
