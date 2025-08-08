import express from 'express';
import passport from 'passport';
import pkg from 'passport-discord';                      // ← default import
const { Strategy: DiscordStrategy } = pkg;  

import pkg_expreess from 'express';
type NextFunction = pkg_expreess.NextFunction;
type Request= pkg_expreess.Request;
type Response= pkg_expreess.Response;
             // ← destructure only Strategy
import type { Profile } from 'passport-discord';         // ← import Profile type
import pinoLogger from '../logger/pino.ts';
import type { DiscordAuthUser } from './auth_types.d.ts';

const router = express.Router();
const log = pinoLogger.child({ component: 'discord-auth' });

const CACHE_VALIDITY_MS = 5 * 60 * 1000; // 5 minutes

function getEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    log.error({ key }, `Missing required env var: ${key}`);
    throw new Error(`Environment variable ${key} is required`);
  }
  return value;
}

export const DISCORD_ENABLED = [
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_CALLBACK_URL',
  'DISCORD_GUILD_ID',
].every(k => !!process.env[k]);

const REQUIRED_ROLE_IDS = (process.env.DISCORD_ROLE_ID || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const audit = (level: 'info' | 'warn' | 'error', msg: string, meta: object = {}) => {
  log[level]({ ...meta }, msg);
};

passport.serializeUser((user: any, done) => {
  audit('info', 'serializeUser', { userId: user?.id });
  done(null, user ? { id: user.id, provider: user.provider, expiresAt: user.expiresAt } : undefined);
});

passport.deserializeUser((obj: any, done) => {
  audit('info', 'deserializeUser', { userId: obj?.id });
  done(null, obj);
});

if (DISCORD_ENABLED) {
  passport.use(
    new DiscordStrategy(
      {
        clientID: getEnv('DISCORD_CLIENT_ID'),
        clientSecret: getEnv('DISCORD_CLIENT_SECRET'),
        callbackURL: getEnv('DISCORD_CALLBACK_URL'),
        scope: ['identify', 'guilds', 'guilds.members.read'],
        state: true,
      },
      async (accessToken, refreshToken, profile: Profile, done) => {
        audit('info', 'Discord OAuth callback', { userId: profile.id });
        try {
          const inGuild = profile.guilds?.some(
            g => g.id === getEnv('DISCORD_GUILD_ID')
          );
          if (!inGuild) {
            return done(null, false, { message: 'User not in required guild' });
          }

          let hasRole = true;
          let memberRoles: string[] = [];
          if (REQUIRED_ROLE_IDS.length) {
            const memberResp = await fetch(
              `https://discord.com/api/users/@me/guilds/${getEnv('DISCORD_GUILD_ID')}/member`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (!memberResp.ok) {
              throw new Error(`Member fetch failed: ${memberResp.status}`);
            }
            const member = (await memberResp.json()) as { roles?: string[] };
            memberRoles = Array.isArray(member.roles) ? member.roles : [];
            hasRole = REQUIRED_ROLE_IDS.some(r => memberRoles.includes(r));
            if (!hasRole) {
              return done(null, false, { message: 'Missing required role' });
            }
          }

          const now = Date.now();
          const user: DiscordAuthUser = {
            id: profile.id,
            provider: 'discord',
            username: profile.username || 'unknown',
            avatar: profile.avatar || null,
            accessToken,
            expiresAt: now + 60 * 60 * 1000,
            authenticated: true,
            reason: 'authenticated',
            params: [],
          };

          audit('info', 'Discord user authenticated', { userId: user.id, hasRole });
          return done(null, user);
        } catch (err: any) {
          audit('error', 'Discord strategy error', { err: err?.message || err });
          return done(err, false, { message: 'Discord auth error' });
        }
      }
    )
  );
}

async function refreshAccessToken(user: DiscordAuthUser): Promise<Partial<DiscordAuthUser>> {
  const params = new URLSearchParams({
    client_id: getEnv('DISCORD_CLIENT_ID'),
    client_secret: getEnv('DISCORD_CLIENT_SECRET'),
    grant_type: 'refresh_token',
    redirect_uri: getEnv('DISCORD_CALLBACK_URL'),
    scope: 'identify guilds guilds.members.read',
  });

  const resp = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  if (!resp.ok) {
    throw new Error(`Token refresh failed: ${resp.status}`);
  }
  const json = await resp.json();

  audit('info', 'Access token refreshed', { userId: user.id });
  return {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
}

export async function validateAndRefreshDiscordSession(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!DISCORD_ENABLED) {
    req.authUser = {
      provider: null,
      authenticated: false,
      reason: 'disabled',
      expiresAt: null,
      username: undefined,
    };
    return next();
  }

  if (!req.isAuthenticated?.() || req.authUser?.provider !== 'discord') {
    req.authUser = {
      provider: null,
      authenticated: false,
      reason: 'unauthenticated',
      expiresAt: null,
      username: undefined,
    };
    return next();
  }

  const user = req.authUser as DiscordAuthUser;

  if (Date.now() >= user.expiresAt) {
    try {
      Object.assign(user, await refreshAccessToken(user));
    } catch {
      req.authUser = {
        provider: null,
        authenticated: false,
        reason: 'token_expired',
        expiresAt: null,
        username: undefined,
      };
      return next();
    }
  }

  const now = Date.now();

  try {
    const guildsResp = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    if (!guildsResp.ok) throw new Error(`Guilds fetch failed: ${guildsResp.status}`);
    const guilds = await guildsResp.json();

    const inGuild = Array.isArray(guilds) &&
      guilds.some(g => g.id === getEnv('DISCORD_GUILD_ID'));
    if (!inGuild) {
      req.authUser = {
        provider: null,
        authenticated: false,
        reason: 'left_guild',
        expiresAt: null,
        username: undefined,
      };
      return next();
    }

    if (REQUIRED_ROLE_IDS.length) {
      const memberResp = await fetch(
        `https://discord.com/api/users/@me/guilds/${getEnv('DISCORD_GUILD_ID')}/member`,
        { headers: { Authorization: `Bearer ${user.accessToken}` } }
      );
      if (!memberResp.ok) {
        req.authUser = {
          provider: null,
          authenticated: false,
          reason: 'missing_role',
          expiresAt: null,
          username: undefined,
        };
        return next();
      } else {
        const member = await memberResp.json();
        const hasRole = Array.isArray(member.roles) &&
          REQUIRED_ROLE_IDS.some(r => member.roles.includes(r));
        if (!hasRole) {
          req.authUser = {
            provider: null,
            authenticated: false,
            reason: 'missing_role',
            expiresAt: null,
            username: undefined,
          };
          return next();
        }
      }
    }

    audit('info', 'Discord session validated', { userId: user.id });
  } catch (err: any) {
    audit('error', 'Session validation error', { err: err?.message || err });
    req.authUser = {
      provider: null,
      authenticated: false,
      reason: 'validation_failed',
      expiresAt: null,
      username: undefined,
    };
  }

  next();
}

export { router as discordRouter };
export default router;
