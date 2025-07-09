// ./auth/passport-discord.js (ESM, Node v22+)
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import dotenv from 'dotenv';

const {
  DISCORD_ROLE_ID,
  DISCORD_GUILD_ID,
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_CALLBACK_URL,
} = process.env;

const REQUIRED_ROLE_IDS = (DISCORD_ROLE_ID || '')
  .split(',')
  .map(r => r.trim())
  .filter(Boolean);

// --- Logging helper ---
function log(level, ...args) {
  const ts = new Date().toISOString();
  console[level](`[${ts}] [discord passport]`, ...args);
}

// --- Passport Discord Strategy ---
try {
  passport.use(
    new DiscordStrategy(
      {
        clientID: DISCORD_CLIENT_ID,
        clientSecret: DISCORD_CLIENT_SECRET,
        callbackURL: DISCORD_CALLBACK_URL,
        scope: ['identify', 'guilds', 'guilds.members.read'],
      },
      async (accessToken, refreshToken, profile, done) => {
        log('info', `Discord login attempt for profile:`, profile);

        try {
          const guild = profile.guilds.find(g => g.id === DISCORD_GUILD_ID);
          if (!guild) {
            log('warn', `User ${profile.username} (${profile.id}) not in required guild ${DISCORD_GUILD_ID}`);
            return done(null, false, { message: 'Not in required guild' });
          }

          let hasRole = true;
          if (REQUIRED_ROLE_IDS.length) {
            log('info', `Checking roles for user ${profile.username} (${profile.id})`);
            const memberRes = await fetch(
              `https://discord.com/api/users/@me/guilds/${DISCORD_GUILD_ID}/member`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (!memberRes.ok) {
              log('error', `Cannot fetch member info for ${profile.username} (${profile.id}) [${memberRes.status}]:`, await memberRes.text());
              return done(null, false, { message: 'Cannot fetch guild member' });
            }
            const member = await memberRes.json();
            hasRole = Array.isArray(member.roles) &&
              REQUIRED_ROLE_IDS.some(role => member.roles.includes(role));
            if (!hasRole) {
              log('warn', `User ${profile.username} (${profile.id}) missing required role(s): [${REQUIRED_ROLE_IDS.join(', ')}]`);
              return done(null, false, { message: 'Missing required role' });
            }
          }

          log('info', `Successful login: ${profile.username} (${profile.id}) in guild ${DISCORD_GUILD_ID}, hasRole: ${hasRole}`);
          return done(null, {
            id: profile.id,
            username: profile.username,
            avatar: profile.avatar,
            guild: DISCORD_GUILD_ID,
            hasRole,
            accessToken,
            refreshToken,
            expires: Date.now() + 3600 * 1000, // 1 hour expiry
          });
        } catch (err) {
          log('error', 'Discord strategy error:', err);
          return done(null, false, { message: 'Discord auth error' });
        }
      }
    )
  );
} catch (err) {
  log('error', 'Failed to initialize Discord strategy:', err);
  const DEV_LOGIN_MODE = process.env.DEV_LOGIN_MODE === 'TRUE';
  if (DEV_LOGIN_MODE) {
    log('info', 'Running in dev mode, using dev bypass strategy');
  }
  else {
    throw new Error('Failed to initialize Discord strategy');
  }
}
// --- Passport session handling ---
passport.serializeUser((user, done) => {
  log('info', `serializeUser: ${user.username} (${user.id})`);
  done(null, {
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    guild: user.guild,
    hasRole: user.hasRole,
    accessToken: user.accessToken,
    refreshToken: user.refreshToken,
    expires: user.expires,
    devBypass: !!user.devBypass,
  });
});

passport.deserializeUser((obj, done) => {
  log('info', `deserializeUser:`, JSON.stringify(obj, null, 2));
  if (obj?.username && obj?.id) {
    log('info', `deserializeUser: ${obj.username} (${obj.id})`);
  }
  done(null, obj);
});

// --- Token refresh utility ---
export async function refreshAccessToken(user) {
  if (user.devBypass) {
    log('info', `[DevBypass] Returning fake refreshed token for ${user.username} (${user.id})`);
    return {
      accessToken: 'fake-access-token',
      refreshToken: 'fake-refresh-token',
      expires: Date.now() + 3600 * 1000,
      devBypass: true,
    };
  }

  log('info', `Refreshing access token for ${user.username} (${user.id})`);
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    client_secret: DISCORD_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: user.refreshToken,
    redirect_uri: DISCORD_CALLBACK_URL,
    scope: 'identify guilds guilds.members.read',
  });

  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  if (!res.ok) {
    log('error', 'Failed to refresh token:', res.status, await res.text());
    throw new Error('Failed to refresh token');
  }
  const json = await res.json();
  log('info', `Token refreshed for ${user.username} (${user.id}); expires in ${json.expires_in}s`);
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expires: Date.now() + json.expires_in * 1000,
  };
}

// --- Session validation/refresh middleware ---
export async function validateAndRefreshSession(req, res, next) {
  log('info', '[Session Validation] Begin for session:', req.sessionID);
  req.authStatus = { authenticated: false };

  try {
    if (!req.isAuthenticated?.() || !req.user) {
      log('warn', '[Session Validation] No authenticated user');
      req.authStatus = { authenticated: false, reason: 'not_logged_in' };
      return next();
    }

    const user = req.user;

    // Dev bypass short-circuit
    if (user.devBypass) {
      log('info', `[Session Validation] Dev bypass active for user: ${user.username} (${user.id})`);
      req.authStatus = {
        authenticated: true,
        user: {
          id: user.id,
          username: user.username,
          avatar: user.avatar,
          guild: user.guild,
          hasRole: user.hasRole,
          devBypass: true,
        },
        devBypass: true,
      };
      return next();
    }

    // Refresh access token if expired
    if (user.expires && user.expires < Date.now()) {
      log('warn', `[Session Validation] Access token expired for ${user.username} (${user.id})`);
      try {
        const refreshed = await refreshAccessToken(user);
        Object.assign(req.user, refreshed);
      } catch (err) {
        log('error', `[Session Validation] Token refresh failed for ${user.username} (${user.id}):`, err);
        req.authStatus = { authenticated: false, reason: 'token_expired' };
        return next();
      }
    }

    // Check guild membership
    let inGuild = false;
    try {
      const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
        headers: { Authorization: `Bearer ${req.user.accessToken}` },
      });
      if (!guildsRes.ok) {
        log('warn', `[Session Validation] Could not fetch guilds for ${user.username} (${user.id})`);
        req.authStatus = { authenticated: false, reason: 'guild_fetch_failed' };
        return next();
      }
      const guilds = await guildsRes.json();
      inGuild = Array.isArray(guilds) && guilds.some(g => g.id === DISCORD_GUILD_ID);
    } catch (err) {
      log('error', `[Session Validation] Guild fetch error for ${user.username} (${user.id}):`, err);
      req.authStatus = { authenticated: false, reason: 'guild_fetch_failed' };
      return next();
    }
    if (!inGuild) {
      log('warn', `[Session Validation] User ${user.username} (${user.id}) not in guild ${DISCORD_GUILD_ID}`);
      req.authStatus = { authenticated: false, reason: 'not_in_guild' };
      return next();
    }

    // Check required role
    let hasRole = true;
    if (REQUIRED_ROLE_IDS.length) {
      try {
        const memberRes = await fetch(
          `https://discord.com/api/users/@me/guilds/${DISCORD_GUILD_ID}/member`,
          { headers: { Authorization: `Bearer ${req.user.accessToken}` } }
        );
        if (!memberRes.ok) {
          log('warn', `[Session Validation] Could not fetch guild member for ${user.username} (${user.id})`);
          req.authStatus = { authenticated: false, reason: 'member_fetch_failed' };
          return next();
        }
        const member = await memberRes.json();
        hasRole = Array.isArray(member.roles) &&
          REQUIRED_ROLE_IDS.some(role => member.roles.includes(role));
        if (!hasRole) {
          log('warn', `[Session Validation] User ${user.username} (${user.id}) missing required role(s): [${REQUIRED_ROLE_IDS.join(', ')}]`);
          req.authStatus = { authenticated: false, reason: 'missing_role' };
          return next();
        }
        req.user.hasRole = hasRole;
      } catch (err) {
        log('error', `[Session Validation] Role check error for ${user.username} (${user.id}):`, err);
        req.authStatus = { authenticated: false, reason: 'role_check_failed' };
        return next();
      }
    }

    req.authStatus = {
      authenticated: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        avatar: req.user.avatar,
        guild: req.user.guild,
        hasRole: req.user.hasRole,
      },
    };
    log('info', `[Session Validation] User authenticated: ${user.username} (${user.id})`);
    next();
  } catch (err) {
    log('error', '[Session Validation] Unexpected error:', err);
    req.authStatus = { authenticated: false, reason: 'unexpected_error' };
    next();
  }
}
