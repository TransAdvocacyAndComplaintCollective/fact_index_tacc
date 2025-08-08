// auth/passport-discord.ts
import express from 'express';
import passport from 'passport';
import pkg from 'passport-discord';
const { Strategy: DiscordStrategy } = pkg;
import type { Request, Response } from 'express';
import type { Profile } from 'passport-discord';
import pinoLogger from '../logger/pino.ts';
import jwt from 'jsonwebtoken';
import type { DiscordAuthUser } from './auth_types.d.ts';

const router = express.Router();
const log = pinoLogger.child({ component: 'discord-auth' });

function mustEnv(key: string): string {
  const v = process.env[key]?.trim();
  if (!v) {
    log.error({ key }, `Missing required env var: ${key}`);
    throw new Error(`Environment variable ${key} is required`);
  }
  return v;
}

// Ensure all required env vars are present
export const DISCORD_ENABLED = [
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_CALLBACK_URL',
  'DISCORD_GUILD_ID',
  'DISCORD_JWT_SECRET'
].every(k => Boolean(process.env[k]));

// Define required role IDs (empty array by default, or set from env)
export const REQUIRED_ROLE_IDS: string[] = process.env.DISCORD_REQUIRED_ROLE_IDS
  ? process.env.DISCORD_REQUIRED_ROLE_IDS.split(',').map(s => s.trim()).filter(Boolean)
  : [];

let JWT_SECRET: string;
if (DISCORD_ENABLED) {
  JWT_SECRET = process.env.DISCORD_JWT_SECRET!.trim();
} else {
  JWT_SECRET = '';
  log.warn('Discord provider disabled due to missing env vars');
}
const JWT_EXPIRES_IN = '1h';

// Configure Passport strategy if enabled
if (DISCORD_ENABLED) {
  passport.use(new DiscordStrategy({
    clientID: mustEnv('DISCORD_CLIENT_ID'),
    clientSecret: mustEnv('DISCORD_CLIENT_SECRET'),
    callbackURL: mustEnv('DISCORD_CALLBACK_URL'),
    scope: ['identify', 'guilds', 'guilds.members.read'],
    state: true,
  }, async (accessToken, refreshToken, profile: Profile, done) => {
    log.info({ userId: profile.id }, 'Discord callback received');
    try {
      const memberInGuild = profile.guilds?.some(g => g.id === mustEnv('DISCORD_GUILD_ID'));
      if (!memberInGuild) return done(null, false, { message: 'Missing guild access' });

      let hasRole = true;
      if (REQUIRED_ROLE_IDS.length) {
        const resp = await fetch(
          `https://discord.com/api/users/@me/guilds/${mustEnv('DISCORD_GUILD_ID')}/member`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!resp.ok) throw new Error(`Discord member fetch failed: ${resp.status}`);
        const member = await resp.json() as { roles?: string[] };
        hasRole = REQUIRED_ROLE_IDS.some(id => member.roles?.includes(id));
        if (!hasRole) return done(null, false, { message: 'Missing required role' });
      }

      const user: DiscordAuthUser = {
        id: profile.id,
        provider: 'discord',
        username: profile.username,
        avatar: profile.avatar ?? null,
        accessToken,
        expiresAt: Date.now() + 3600 * 1000,
        authenticated: true,
        reason: 'authenticated',
        params: [],
      };

      done(null, user);
    } catch (err: any) {
      log.error({ err }, 'Discord verify error');
      done(err, false, { message: 'Discord auth failure' });
    }
  }));
}

// JWT issuance
function signUserJWT(user: DiscordAuthUser): string {
  return jwt.sign({ ...user }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Stateless validator
export async function validateDiscordJwt(token: string): Promise<DiscordAuthUser | null> {
  try {
    const user = jwt.verify(token, JWT_SECRET) as DiscordAuthUser;
    if (user.provider === 'discord' && user.authenticated && user.id) {
      return user;
    }
  } catch (err: any) {
    log.warn('Invalid Discord JWT', { error: err.message });
  }
  return null;
}

// Routes:
router.get('/login', passport.authenticate('discord'));

router.get('/callback',
  passport.authenticate('discord', { session: false, failureRedirect: '/login' }),
  (req: Request, res: Response) => {
    const user = req.user as DiscordAuthUser;
    const token = signUserJWT(user);
    res.json({ token, user });
  }
);

router.get('/me', async (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing bearer token' });

  const user = await validateDiscordJwt(auth.slice(7));
  if (!user) return res.status(401).json({ error: 'Invalid or expired token' });

  res.json({ user });
});

export default router;
