import passport from 'passport';
import { Strategy as DiscordStrategy } from '@oauth-everything/passport-discord';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Done = (err: Error | null, user?: AuthUser | false, info?: unknown) => void;

interface DiscordGuild { id: string }
interface DiscordProfile {
  id: string;
  username?: string;
  avatar?: string | null;
  guilds?: DiscordGuild[];
}

interface AuthUser {
  id: string;
  username: string;
  avatar?: string | null;
  guild?: string | null;
  hasRole?: boolean;
  accessToken?: string;
  refreshToken?: string;
  expires?: number;
  devBypass?: boolean;
}

interface AuthStatusUser {
  id: string;
  username?: string;
  avatar?: string | null;
  guild?: string | null;
  hasRole?: boolean;
}

interface AuthStatus {
  authenticated: boolean;
  reason?: string;
  user?: AuthStatusUser;
  devBypass?: boolean;
}

const {
  DISCORD_ROLE_ID,
  DISCORD_GUILD_ID,
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_CALLBACK_URL,
} = process.env as Record<string,string|undefined>;

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production';
const JWT_EXPIRATION = process.env.JWT_EXPIRY || '7d'; // 7 days by default

// Config file location for guild <-> role mapping
const __filename = fileURLToPath(import.meta.url);
const __dirname_local = path.dirname(__filename);
const CONFIG_DIR = path.resolve(__dirname_local, '..', '..', 'config');
const CONFIG_PATH = path.join(CONFIG_DIR, 'discord-auth.json');

// Ensure config dir exists
try { fs.mkdirSync(CONFIG_DIR, { recursive: true }); } catch {}

// Default config when none exists. Users can edit this file.
const DEFAULT_CONFIG = {
  guilds: {
    // "123456789012345678": { "requiredRole": "1111222233334444", "name": "Project Guild" }
  },
};

let fileConfig: any = DEFAULT_CONFIG;
try {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), { encoding: 'utf8' });
    log('info', `Created default discord-auth.json at ${CONFIG_PATH}`);
  } else {
    const raw = fs.readFileSync(CONFIG_PATH, { encoding: 'utf8' });
    fileConfig = JSON.parse(raw || '{}');
    log('info', `Loaded discord-auth.json from ${CONFIG_PATH}`);
  }
} catch (err) {
  log('warn', `Could not load or create discord-auth.json (${CONFIG_PATH}); falling back to env vars`);
  fileConfig = DEFAULT_CONFIG;
}

// Merge env-provided guild/role hints with file config (env takes precedence for quick changes)
const ENV_GUILD_IDS = (DISCORD_GUILD_ID || '').split(',').map(s => s.trim()).filter(Boolean);
if (ENV_GUILD_IDS.length) {
  fileConfig.guilds = fileConfig.guilds || {};
  ENV_GUILD_IDS.forEach((g) => {
    if (!fileConfig.guilds[g]) fileConfig.guilds[g] = { requiredRole: null };
  });
}

const REQUIRED_ROLE_IDS = (DISCORD_ROLE_ID || '')
  .split(',')
  .map(r => r.trim())
  .filter(Boolean);

// Helper to find matched guild and required role
function findMatchedGuild(profile: DiscordProfile) {
  const guilds = profile.guilds || [];
  const configured = Object.keys(fileConfig.guilds || {});
  for (const g of guilds) {
    if (configured.includes(g.id)) return { guildId: g.id, requiredRole: fileConfig.guilds[g.id]?.requiredRole ?? null };
  }
  // fallback to single env var guild id if present
  if (DISCORD_GUILD_ID) {
    const envIds = DISCORD_GUILD_ID.split(',').map(s=>s.trim()).filter(Boolean);
    for (const g of guilds) {
      if (envIds.includes(g.id)) return { guildId: g.id, requiredRole: fileConfig.guilds?.[g.id]?.requiredRole ?? (REQUIRED_ROLE_IDS[0] ?? null) };
    }
  }
  return null;
}

function log(level: 'info'|'warn'|'error', ...args: unknown[]) {
  const ts = new Date().toISOString();
  const fn = console[level] as unknown as (...a: unknown[]) => void;
  fn(`[${ts}] [discord passport]`, ...args);
}

// JWT token generation helper
export function generateJWT(user: AuthUser): string {
  const payload = {
    sub: user.id,
    username: user.username,
    avatar: user.avatar ?? null,
    guild: user.guild ?? null,
    hasRole: user.hasRole ?? false,
    accessToken: user.accessToken ?? null,
    refreshToken: user.refreshToken ?? null,
    devBypass: user.devBypass ?? false,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRATION });
}

// JWT token validation helper
export function verifyJWT(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    return {
      id: decoded.sub,
      username: decoded.username,
      avatar: decoded.avatar,
      guild: decoded.guild,
      hasRole: decoded.hasRole,
      accessToken: decoded.accessToken,
      refreshToken: decoded.refreshToken,
      devBypass: decoded.devBypass,
    };
  } catch (err) {
    log('warn', 'JWT verification failed:', err);
    return null;
  }
}

// Truthy env parsing for DEV_LOGIN_MODE (accepts true/1/yes/on)
function envFlag(name: string): boolean {
  const v = process.env[name];
  if (!v) return false;
  return ['true', '1', 'yes', 'y', 'on'].includes(String(v).trim().toLowerCase());
}

const DEV_LOGIN_MODE = envFlag('DEV_LOGIN_MODE');

if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !DISCORD_CALLBACK_URL) {
  if (DEV_LOGIN_MODE) {
    log('warn', 'Discord env vars missing or incomplete, running in DEV_LOGIN_MODE; registering dev bypass strategy');
    passport.use('discord-dev-bypass', new DiscordStrategy({
      clientID: 'dev',
      clientSecret: 'dev',
      callbackURL: '/auth/discord/callback',
      scope: ['identify'],
    }, (accessToken: string, refreshToken: string, profile: DiscordProfile, done: Done) => {
      const user: AuthUser = (profile && { id: profile.id, username: profile.username, avatar: profile.avatar }) || { id: 'dev', username: 'dev-user', avatar: null };
      user.devBypass = true;
      return done(null, user);
    }));
  } else {
    log('error', 'Missing Discord OAuth env vars. Skipping Discord strategy registration. Set DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, and DISCORD_CALLBACK_URL to enable.');
  }
} else {
  try {
    passport.use(new DiscordStrategy({
      clientID: DISCORD_CLIENT_ID,
      clientSecret: DISCORD_CLIENT_SECRET,
      callbackURL: DISCORD_CALLBACK_URL,
      scope: ['identify', 'guilds', 'guilds.members.read'],
    }, async (accessToken: string, refreshToken: string, profile: DiscordProfile, done: Done) => {
      log('info', `Discord login attempt for profile: ${profile.id} ${profile.username ?? ''}`);
        try {
          // Some Discord OAuth responses may not populate `profile.guilds` reliably.
          // As a fallback, fetch the guild list directly using the access token
          // so we can still detect membership of configured guilds.
          if ((!profile.guilds || (Array.isArray(profile.guilds) && profile.guilds.length === 0)) && accessToken) {
            try {
              const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${accessToken}` } });
              if (guildsRes.ok) {
                const guildsJson = await guildsRes.json();
                if (Array.isArray(guildsJson)) {
                  profile.guilds = guildsJson.map((g: any) => ({ id: String(g.id) }));
                  log('info', `Fetched ${profile.guilds.length} guilds via API for profile ${profile.id}`);
                }
              } else {
                log('warn', `Fallback guild fetch failed for profile ${profile.id}; status=${guildsRes.status}`);
              }
            } catch (fetchErr) {
              log('warn', `Error fetching guilds for profile ${profile.id}:`, fetchErr);
            }
          }

          const matched = findMatchedGuild(profile);
        if (!matched) {
          log('warn', `No configured guild matched for profile ${profile.id}; profileGuilds=${JSON.stringify((profile.guilds||[]).map(g=>g.id))}`);
          return done(null, false, { message: 'Not in required guild', code: 'missing_guild' });
        }

        const { guildId, requiredRole } = matched;
        const redactedGuild = `${String(guildId).slice(0,4)}…${String(guildId).slice(-4)}`;
        const redactedRole = requiredRole ? `${String(requiredRole).slice(0,4)}…${String(requiredRole).slice(-4)}` : null;
        log('info', `Matched guild ${redactedGuild} for user ${profile.id}; requiredRole=${redactedRole}`);

        let hasRole = true;
        // If a role is required for this guild, fetch the member roles using the access token.
        if (requiredRole || REQUIRED_ROLE_IDS.length) {
          const requiredRolesFromConfig = requiredRole ? (Array.isArray(requiredRole) ? requiredRole : [requiredRole]) : [];
          const envRoles = REQUIRED_ROLE_IDS;
          const rolesToCheck = requiredRolesFromConfig.length ? requiredRolesFromConfig : (envRoles.length ? envRoles : []);
          const memberRes = await fetch(
            `https://discord.com/api/users/@me/guilds/${guildId}/member`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (!memberRes.ok) {
            log('warn', `Unable to fetch member info for guild ${redactedGuild}; status=${memberRes.status}`);
            return done(null, false, { message: 'Cannot fetch guild member', code: 'member_fetch_failed' });
          }
          const member: { roles?: string[] } = await memberRes.json();
          const roles = Array.isArray(member.roles) ? member.roles : [];
          if (rolesToCheck.length) {
            hasRole = roles.some(r => rolesToCheck.includes(r));
          } else {
            hasRole = roles.length > 0;
          }
          if (!hasRole) return done(null, false, { message: 'Missing required role', code: 'missing_role' });
        }

        return done(null, {
          id: profile.id,
          username: profile.username,
          avatar: profile.avatar,
          guild: guildId,
          hasRole,
          accessToken,
          refreshToken,
          expires: Date.now() + 3600 * 1000,
        });
      } catch (err) {
        log('error', 'Discord strategy error:', err);
        return done(null, false, { message: 'Discord auth error', code: 'discord_error' });
      }
    }));
  } catch (err) {
    log('error', 'Failed to initialize Discord strategy:', err);
    if (DEV_LOGIN_MODE) log('info', 'Running in dev mode, using dev bypass strategy');
    else log('warn', 'Continuing without Discord strategy registered.');
  }
}

// Register JWT strategy for validating tokens on each request (stateless auth)
try {
  passport.use('jwt', new JwtStrategy({
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: JWT_SECRET,
  }, async (payload: any, done: Done) => {
    try {
      const user: AuthUser = {
        id: payload.sub,
        username: payload.username,
        avatar: payload.avatar,
        guild: payload.guild,
        hasRole: payload.hasRole,
        accessToken: payload.accessToken,
        refreshToken: payload.refreshToken,
        devBypass: payload.devBypass,
      };
      log('info', `JWT strategy validated user: ${user.username} (${user.id})`);
      return done(null, user);
    } catch (err) {
      log('error', 'JWT strategy error:', err);
      return done(null, false);
    }
  }));
  log('info', 'JWT strategy registered successfully');
} catch (err) {
  log('error', 'Failed to initialize JWT strategy:', err);
}

// Note: With stateless JWT auth, serialize/deserialize are not typically used.
// They are kept here for compatibility but are essentially no-ops.
passport.serializeUser((user: any, done: Done) => {
  // Not used in JWT auth flow
  done(null, user);
});

passport.deserializeUser((obj: any, done: Done) => {
  // Not used in JWT auth flow
  done(null, obj);
});

export async function refreshAccessToken(user: AuthUser) {
  if (user.devBypass) {
    log('info', `[DevBypass] Returning fake refreshed token for ${user.username} (${user.id})`);
    return { accessToken: 'fake-access-token', refreshToken: 'fake-refresh-token', expires: Date.now() + 3600 * 1000, devBypass: true };
  }
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID || '',
    client_secret: DISCORD_CLIENT_SECRET || '',
    grant_type: 'refresh_token',
    refresh_token: user.refreshToken || '',
    redirect_uri: DISCORD_CALLBACK_URL || '',
    scope: 'identify guilds guilds.members.read',
  });
  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params,
  });
  if (!res.ok) throw new Error('Failed to refresh token');
  const json = await res.json();
  log('info', `Token refreshed for ${user.username} (${user.id}); expires in ${json.expires_in}s`);
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expires: Date.now() + json.expires_in * 1000 };
}

export async function validateAndRefreshSession(
  req: Request & { user?: AuthUser; authStatus?: AuthStatus },
  res: Response,
  next: NextFunction,
) {
  req.authStatus = { authenticated: false } as AuthStatus;
  try {
    // Extract JWT from Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.authStatus = { authenticated: false, reason: 'no_token' };
      return next();
    }

    const token = authHeader.slice(7); // Remove "Bearer " prefix
    const user = verifyJWT(token);
    
    if (!user) {
      req.authStatus = { authenticated: false, reason: 'invalid_token' };
      return next();
    }

    req.user = user;
    log('info', `[JWT Validation] Token valid for user: ${user.username} (${user.id})`);

    // If token has Discord OAuth tokens, validate guild and role membership
    if (user.accessToken) {
      try {
        const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
          headers: { Authorization: `Bearer ${user.accessToken}` }
        });

        if (!guildsRes.ok) {
          log('warn', `[JWT Validation] Guild fetch failed for user ${user.id}; status=${guildsRes.status}`);
          req.authStatus = { authenticated: false, reason: 'guild_fetch_failed' };
          return next();
        }

        const guilds: DiscordGuild[] = await guildsRes.json();

        // Find a configured guild that the user belongs to
        const configuredGuildIds = Object.keys(fileConfig.guilds || {});
        let matchedGuildId: string | null = null;
        
        for (const g of (guilds || [])) {
          if (configuredGuildIds.includes(g.id)) {
            matchedGuildId = g.id;
            break;
          }
        }

        // Fallback to env-provided guild id
        if (!matchedGuildId && DISCORD_GUILD_ID) {
          const envIds = DISCORD_GUILD_ID.split(',').map(s => s.trim()).filter(Boolean);
          for (const g of (guilds || [])) {
            if (envIds.includes(g.id)) {
              matchedGuildId = g.id;
              break;
            }
          }
        }

        if (!matchedGuildId) {
          req.authStatus = { authenticated: false, reason: 'not_in_guild' };
          return next();
        }

        // Check role if required
        const requiredRoleOrRoles = fileConfig.guilds?.[matchedGuildId]?.requiredRole ?? null;
        const requiredRolesFromConfig = requiredRoleOrRoles 
          ? (Array.isArray(requiredRoleOrRoles) ? requiredRoleOrRoles : [requiredRoleOrRoles]) 
          : [];
        const rolesToCheck = requiredRolesFromConfig.length ? requiredRolesFromConfig : REQUIRED_ROLE_IDS;

        if (rolesToCheck.length) {
          const memberRes = await fetch(
            `https://discord.com/api/users/@me/guilds/${matchedGuildId}/member`,
            { headers: { Authorization: `Bearer ${user.accessToken}` } }
          );

          if (!memberRes.ok) {
            log('warn', `[JWT Validation] Member fetch failed for user ${user.id}; status=${memberRes.status}`);
            req.authStatus = { authenticated: false, reason: 'member_fetch_failed' };
            return next();
          }

          const member: { roles?: string[] } = await memberRes.json();
          const roles = Array.isArray(member.roles) ? member.roles : [];
          const hasRole = roles.some(r => rolesToCheck.includes(r));

          if (!hasRole) {
            req.authStatus = { authenticated: false, reason: 'missing_role' };
            return next();
          }

          user.hasRole = hasRole;
        }

        user.guild = matchedGuildId;
      } catch (err) {
        log('error', '[JWT Validation] Error validating guild/role:', err);
        // Continue anyway - JWT is valid, just can't verify guild/role right now
      }
    }

    // If user has devBypass or refresh tokens, allow them through
    if (user.devBypass) {
      req.authStatus = { 
        authenticated: true, 
        user: { 
          id: user.id, 
          username: user.username, 
          avatar: user.avatar, 
          guild: user.guild, 
          hasRole: user.hasRole 
        }, 
        devBypass: true 
      };
      log('info', `[JWT Validation] Dev bypass user authenticated: ${user.username}`);
      return next();
    }

    req.authStatus = { 
      authenticated: true, 
      user: { 
        id: user.id, 
        username: user.username, 
        avatar: user.avatar, 
        guild: user.guild, 
        hasRole: user.hasRole 
      } 
    };
    log('info', `[JWT Validation] User authenticated: ${user.username} (${user.id})`);
    next();
  } catch (err: unknown) {
    log('error', '[JWT Validation] Unexpected error:', err);
    req.authStatus = { authenticated: false, reason: 'unexpected_error' };
    next();
  }
}
