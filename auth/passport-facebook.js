// ./auth/passport-facebook.js
import express from 'express';
import passport from 'passport';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import refresh from 'passport-oauth2-refresh';
import fetch from 'node-fetch';

const router = express.Router();

export const FACEBOOK_ENABLED = (() => {
  const required = ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET', 'FACEBOOK_CALLBACK_URL'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.warn(
      `[passport-facebook] Missing env vars: ${missing.join(', ')}, disabling Facebook auth`
    );
    return false;
  }
  return true;
})();

const REQUIRED_GROUP_IDS = (process.env.FACEBOOK_GROUPS_CHECK || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function log(level, ...args) {
  const ts = new Date().toISOString();
  (console[level] || console.log)(`[${ts}] [facebook passport]`, ...args);
}

async function fetchFacebookGroups(accessToken) {
  const endpoint = 'https://graph.facebook.com/v19.0/me/groups?fields=id,name&limit=200';
  const res = await fetch(`${endpoint}&access_token=${encodeURIComponent(accessToken)}`);
  if (!res.ok) {
    log('warn', 'Failed to fetch Facebook groups:', await res.text());
    return [];
  }
  const data = await res.json();
  return data.data || [];
}

if (FACEBOOK_ENABLED) {
  passport.use(
    'facebook',
    new FacebookStrategy(
      {
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL: process.env.FACEBOOK_CALLBACK_URL,
        profileFields: ['id', 'displayName', 'photos', 'email'],
        scope: ['email', 'groups_access_member_info'],
        enableProof: true,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const groups = await fetchFacebookGroups(accessToken);
          const user = {
            id: profile.id,
            displayName: profile.displayName,
            avatar: profile.photos?.[0]?.value || null,
            email: profile.emails?.[0]?.value || null,
            accessToken,
            refreshToken,
            expiresAt: Date.now() + 60 * 60 * 1000,
            provider: 'facebook',
            authenticated_method: 'facebook',
            groups,
          };
          return done(null, user);
        } catch (err) {
          log('error', 'Facebook auth error:', err);
          return done(err, false);
        }
      }
    )
  );

  refresh.use('facebook', passport._strategy('facebook'));
}

passport.serializeUser((user, done) => {
  done(null, {
    id: user.id,
    displayName: user.displayName,
    avatar: user.avatar,
    email: user.email,
    provider: user.provider,
    groups: user.groups || [],
    accessToken: user.accessToken,
    refreshToken: user.refreshToken,
    expiresAt: user.expiresAt,
  });
});

passport.deserializeUser((obj, done) => done(null, obj));

async function refreshFacebookToken(user) {
  if (!user.refreshToken) throw new Error('No refresh token available');
  return await new Promise((resolve, reject) => {
    refresh.requestNewAccessToken('facebook', user.refreshToken, (err, newToken, newRefresh) => {
      if (err) {
        log('error', 'Facebook token refresh error:', err);
        return reject(err);
      }
      resolve({
        accessToken: newToken,
        refreshToken: newRefresh || user.refreshToken,
        expiresAt: Date.now() + 60 * 60 * 1000,
      });
    });
  });
}

async function validateAndRefreshFacebookSession(req, res, next) {
  req.authStatus = { authenticated: false };

  if (!FACEBOOK_ENABLED) {
    req.authStatus.reason = 'facebook_disabled';
    return next();
  }

  if (!req.isAuthenticated?.() || req.user.provider !== 'facebook') {
    req.authStatus.reason = 'not_logged_in';
    return next();
  }

  const user = req.user;
  if (user.expiresAt < Date.now() && user.refreshToken) {
    try {
      Object.assign(user, await refreshFacebookToken(user));
      log('info', 'Facebook token refreshed');
    } catch {
      req.authStatus.reason = 'token_refresh_failed';
      return next();
    }
  }

  try {
    user.groups = await fetchFacebookGroups(user.accessToken);
  } catch {
    user.groups = [];
  }

  const groupAccess = REQUIRED_GROUP_IDS.length
    ? REQUIRED_GROUP_IDS.every(id => user.groups.map(g => g.id).includes(id))
    : null;

  req.authStatus = {
    authenticated: true,
    user: {
      id: user.id,
      displayName: user.displayName,
      avatar: user.avatar,
      email: user.email,
      provider: 'facebook',
      groups: user.groups,
      groupAccess,
      expiresAt: user.expiresAt,
      provider: user.provider,
    },
  };

  next();
}

if (FACEBOOK_ENABLED) {
  router.get('/login', passport.authenticate('facebook'));
  router.get(
    '/callback',
    passport.authenticate('facebook', { failureRedirect: '/' }),
    (req, res) => res.redirect('/')
  );
} else {
  router.get('/login', (req, res) => res.status(503).send('Facebook login disabled'));
  router.get('/callback', (req, res) => res.status(503).send('Facebook login disabled'));
}

router.get('/me', validateAndRefreshFacebookSession, (req, res) => {
  if (!req.authStatus.authenticated) {
    return res.status(401).json({ error: req.authStatus.reason });
  }
  res.json(req.authStatus.user);
});

export default router;
export { validateAndRefreshFacebookSession, refreshFacebookToken };
