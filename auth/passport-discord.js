import express from 'express';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import fetch from 'node-fetch';

const router = express.Router();

function getEnvTrimmed(key) {
  const val = process.env[key];
  return val ? val.trim() : '';
}

export const DISCORD_ENABLED = (() => {
  const required = [
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'DISCORD_CALLBACK_URL',
    'DISCORD_GUILD_ID',
  ];
  const missing = required.filter(k => !getEnvTrimmed(k));
  if (missing.length) {
    console.warn(`[passport-discord] Missing env vars: ${missing.join(', ')} — Discord auth disabled`);
    return false;
  }
  console.info('[passport-discord] All required env vars present — Discord auth enabled');
  return true;
})();

const REQUIRED_ROLE_IDS = (getEnvTrimmed('DISCORD_ROLE_ID') || '')
  .split(',')
  .map(r => r.trim())
  .filter(Boolean);

function log(level, ...args) {
  const ts = new Date().toISOString();
  (console[level] || console.log)(`[${ts}] [discord passport]`, ...args);
}

if (DISCORD_ENABLED) {
  passport.use(new DiscordStrategy({
    clientID: getEnvTrimmed('DISCORD_CLIENT_ID'),
    clientSecret: getEnvTrimmed('DISCORD_CLIENT_SECRET'),
    callbackURL: getEnvTrimmed('DISCORD_CALLBACK_URL'),
    scope: ['identify', 'guilds', 'guilds.members.read'],
    state: true,
  }, async (accessToken, refreshToken, profile, done) => {
    log('info', `Authenticating user ${profile.username} (${profile.id})`);

    try {
      // Check if user is in required guild
      const inGuild = profile.guilds?.some(g => g.id === getEnvTrimmed('DISCORD_GUILD_ID'));
      log('info', `User guild membership check: inGuild=${inGuild}`);

      if (!inGuild) {
        log('warn', 'User not in required guild');
        return done(null, false, { message: 'Not in required guild' });
      }

      // Check roles via Discord API
      let hasRole = true;
      if (REQUIRED_ROLE_IDS.length) {
        const res = await fetch(`https://discord.com/api/users/@me/guilds/${getEnvTrimmed('DISCORD_GUILD_ID')}/member`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          const errMsg = `Failed to fetch guild member: ${res.status} ${res.statusText}`;
          log('error', errMsg);
          throw new Error(errMsg);
        }
        const member = await res.json();

        if (!Array.isArray(member.roles)) {
          log('warn', 'Member roles is not an array:', member.roles);
          hasRole = false;
        } else {
          log('info', `Guild member roles: ${member.roles.join(', ')}`);
          hasRole = REQUIRED_ROLE_IDS.some(id => member.roles.includes(id));
        }

        if (!hasRole) {
          log('warn', 'User missing required role');
          return done(null, false, { message: 'Missing role' });
        }
      }

      log('info', `User ${profile.username} authenticated successfully with required roles`);

      // Attach guild and role info to user object
      done(null, {
        id: profile.id,
        username: profile.username,
        avatar: profile.avatar,
        guild: getEnvTrimmed('DISCORD_GUILD_ID'),
        hasRole,
        accessToken,
        refreshToken,
        expiresAt: Date.now() + 3600 * 1000,
        provider: 'discord',
        // Cache guilds and member roles for session validation to reduce API calls
        _cachedGuilds: profile.guilds,
        _cachedMemberRoles: hasRole ? REQUIRED_ROLE_IDS : [],
        _cacheTimestamp: Date.now(),
      });
    } catch (err) {
      log('error', 'Discord auth error:', err);
      done(null, false, { message: 'Discord auth error' });
    }
  }));
}

passport.serializeUser((user, done) => {
  log('info', `Serializing user ${user.username || user.id}`);
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  log('info', `Deserializing user ${obj.username || obj.id}`);
  done(null, obj);
});

async function refreshAccessToken(user) {
  log('info', `Refreshing access token for user ${user.username}`);
  const params = new URLSearchParams({
    client_id: getEnvTrimmed('DISCORD_CLIENT_ID'),
    client_secret: getEnvTrimmed('DISCORD_CLIENT_SECRET'),
    grant_type: 'refresh_token',
    refresh_token: user.refreshToken,
    redirect_uri: getEnvTrimmed('DISCORD_CALLBACK_URL'),
    scope: 'identify guilds guilds.members.read',
  });
  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  if (!res.ok) {
    const errMsg = `Failed to refresh token: ${res.status} ${res.statusText}`;
    log('error', errMsg);
    throw new Error(errMsg);
  }

  const json = await res.json();

  log('info', `Token refreshed successfully for user ${user.username}`);

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
    provider: 'discord',
  };
}

// Cache validity duration for guild/roles info in ms (e.g., 5 minutes)
const CACHE_VALIDITY_MS = 5 * 60 * 1000;

async function validateAndRefreshDiscordSession(req, res, next) {
  req.authStatus = { authenticated: false };
  log('info', 'Starting Discord session validation');

  if (!DISCORD_ENABLED) {
    req.authStatus.reason = 'discord_disabled';
    log('warn', 'Discord auth disabled');
    return next();
  }

  if (!req.isAuthenticated?.() || req.user?.provider !== 'discord') {
    req.authStatus.reason = 'not_logged_in';
    log('warn', 'User not logged in or wrong provider');
    return next();
  }

  const user = req.user;
  log('info', `Validating session for user ${user.username}`);

  if (user.expiresAt < Date.now()) {
    log('info', `Access token expired for user ${user.username}, refreshing`);
    try {
      Object.assign(user, await refreshAccessToken(user));
      log('info', `Token refreshed for user ${user.username}`);
    } catch (err) {
      log('error', 'Token refresh failed', err);
      req.authStatus.reason = 'token_expired';
      return next();
    }
  }

  // Use cached guild and roles if cache is fresh enough
  const now = Date.now();
  if (user._cacheTimestamp && (now - user._cacheTimestamp) < CACHE_VALIDITY_MS) {
    log('info', `Using cached guild/roles info for user ${user.username}`);
    req.authStatus = {
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        guild: user.guild,
        hasRole: user.hasRole,
        expiresAt: user.expiresAt,
        provider: user.provider,
      },
    };
    return next();
  }

  // Otherwise fetch fresh guilds and roles
  try {
    const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });

    if (!guildsRes.ok) {
      if (guildsRes.status === 429) {
        log('warn', 'Rate limited fetching user guilds; falling back to cached info');
        // fallback to cached info if available
        if (user._cacheTimestamp) {
          req.authStatus = {
            authenticated: true,
            user: {
              id: user.id,
              username: user.username,
              avatar: user.avatar,
              guild: user.guild,
              hasRole: user.hasRole,
              expiresAt: user.expiresAt,
              provider: user.provider,
            },
          };
          return next();
        }
      }
      const errMsg = `Failed to fetch user guilds: ${guildsRes.status} ${guildsRes.statusText}`;
      log('error', errMsg);
      throw new Error(errMsg);
    }

    const guilds = await guildsRes.json();
    const inGuild = guilds.some(g => g.id === getEnvTrimmed('DISCORD_GUILD_ID'));
    log('info', `User guild membership during session validation: inGuild=${inGuild}`);

    if (!inGuild) {
      req.authStatus.reason = 'not_in_guild';
      log('warn', 'User no longer in required guild');
      return next();
    }

    if (REQUIRED_ROLE_IDS.length) {
      log('info', `Validating user roles: ${REQUIRED_ROLE_IDS.join(', ')}`);

      const memberRes = await fetch(`https://discord.com/api/users/@me/guilds/${getEnvTrimmed('DISCORD_GUILD_ID')}/member`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });

      if (!memberRes.ok) {
        if (memberRes.status === 429) {
          log('warn', 'Rate limited fetching guild member roles; falling back to cached roles');
          if (user._cachedMemberRoles) {
            user.hasRole = REQUIRED_ROLE_IDS.some(r => user._cachedMemberRoles.includes(r));
            req.authStatus = {
              authenticated: true,
              user: {
                id: user.id,
                username: user.username,
                avatar: user.avatar,
                guild: user.guild,
                hasRole: user.hasRole,
                expiresAt: user.expiresAt,
                provider: user.provider,
              },
            };
            return next();
          }
        }
        const errMsg = `Failed to fetch guild member during validation: ${memberRes.status} ${memberRes.statusText}`;
        log('error', errMsg);
        throw new Error(errMsg);
      }

      const member = await memberRes.json();

      if (!Array.isArray(member.roles)) {
        log('warn', 'Member roles is not an array:', member.roles);
        req.authStatus.reason = 'missing_role';
        return next();
      }

      log('info', `User roles during validation: ${member.roles.join(', ')}`);

      if (!REQUIRED_ROLE_IDS.some(r => member.roles.includes(r))) {
        req.authStatus.reason = 'missing_role';
        log('warn', 'User missing required role during session validation');
        return next();
      }

      user.hasRole = true;
      user._cachedMemberRoles = member.roles;
      user._cacheTimestamp = now;
    }

    // Update cache timestamp and cached guilds
    user._cachedGuilds = guilds;
    user._cacheTimestamp = now;
  } catch (err) {
    log('error', 'Session validation failed:', err);
    req.authStatus.reason = 'validation_failed';
    return next();
  }

  req.authStatus = {
    authenticated: true,
    user: {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      guild: user.guild,
      hasRole: user.hasRole,
      expiresAt: user.expiresAt,
      provider: user.provider,
    },
  };
  log('info', `Session validated successfully for user ${user.username}`);
  next();
}

if (DISCORD_ENABLED) {
  log('info', 'Setting up Discord authentication routes');

  router.get('/login', (req, res, next) => {
    log('info', 'GET /login route accessed, starting Discord auth');
    next();
  }, passport.authenticate('discord'));

  router.get(
    '/callback',
    (req, res, next) => {
      log('info', 'GET /callback route accessed');
      next();
    },
    (req, res, next) => {
      passport.authenticate('discord', (err, user, info) => {
        if (err) {
          log('error', 'Error during Discord authentication:', err);
          return res.status(500).send('Authentication error occurred.');
        }
        if (!user) {
          log('warn', 'Discord authentication failed:', info);
          const message = info?.message || 'Authentication failed';
          return res.status(401).send(`Login failed: ${message}`);
        }
        req.logIn(user, loginErr => {
          if (loginErr) {
            log('error', 'Login error after Discord authentication:', loginErr);
            return res.status(500).send('Login error occurred.');
          }
          log('info', `User ${user.username} logged in via Discord callback`);
          return res.redirect('/'); // post-login redirect
        });
      })(req, res, next);
    }
  );
} else {
  log('warn', 'Discord auth disabled - setting fallback routes');

  router.get('/login', (req, res) => {
    log('warn', 'Attempt to access /login while Discord login disabled');
    res.status(503).send('Discord login disabled.');
  });

  router.get('/callback', (req, res) => {
    log('warn', 'Attempt to access /callback while Discord login disabled');
    res.status(503).send('Discord login disabled.');
  });
}

router.get('/me', validateAndRefreshDiscordSession, (req, res) => {
  if (!req.authStatus.authenticated) {
    log('warn', `Unauthorized /me access: reason=${req.authStatus.reason}`);
    return res.status(401).json({ error: req.authStatus.reason });
  }
  log('info', `Returning authenticated user info for ${req.authStatus.user.username}`);
  res.json(req.authStatus.user);
});

// 404 handler
router.use((req, res) => {
  log('warn', `Unhandled route accessed: ${req.originalUrl}`);
  res.status(404).send('Not Found');
});

export default router;
export { validateAndRefreshDiscordSession };
