// src/auth/passport-dev.ts
import express from 'express';
import jwt from 'jsonwebtoken';
import pinoLogger from '../logger/pino.ts';
import type { DevAuthUser } from './auth_types.d.ts';
import { ipPrivate, isProxy } from '../utils/ipUtils.ts';

const log = pinoLogger.child({ component: 'dev-auth' });

export const DEV_ENABLED =
  process.env.DEV_ENABLED === 'true' ||
  (!('DEV_ENABLED' in process.env) && process.env.NODE_ENV !== 'production');


const JWT_SECRET = process.env.DEV_JWT_SECRET || 'dev-secret';
const JWT_EXPIRES_IN = '8h';

export function canLoginDev(req: express.Request): boolean {
  const ipResult = ipPrivate(req);
  const isLocal = Boolean(ipResult || ipResult === null);
  log.trace('canLoginDev check', { DEV_ENABLED, isLocal, isProxy: isProxy(req) });
  return DEV_ENABLED && isLocal && !isProxy(req);
}

function issueDevJWT(user: DevAuthUser): string {
  log.debug('Issuing JWT for dev user', { userId: user.id });
  return jwt.sign({ ...user }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export async function validateDevJwt(token: string): Promise<DevAuthUser | null> {
  log.debug('validateDevJwt entry', { tokenValidLength: Boolean(token && token.length) });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as DevAuthUser;
    log.debug('Decoded JWT:', { provider: decoded.provider, authenticated: decoded.authenticated });
    if (decoded.provider === 'dev' && decoded.authenticated) return decoded;
    log.warn('Decoded JWT did not pass checks', { decoded });
  } catch (err: any) {
    log.warn('Invalid dev JWT', { error: err.message });
  }
  return null;
}

const router = express.Router();

router.get('/login', (req, res) => {
  log.info('Dev GET /login requested', { ip: req.ip, method: req.method });
  if (!canLoginDev(req)) {
    log.warn('Dev login attempted but disabled', { ip: req.ip });
    return res.status(403).send('Dev login disabled');
  }
  res.send('Use POST /auth/dev/login to retrieve a dev-access token');
});

router.post('/login', async (req: express.Request, res: express.Response) => {
  log.info('Dev POST /login attempt', { ip: req.ip, method: req.method });

  if (!canLoginDev(req)) {
    log.error('Dev login rejected', { ip: req.ip });
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const user: DevAuthUser = {
      id: 'DEV_ID',
      username: process.env.DEV_USERNAME || 'DevUser',
      avatar: process.env.DEV_AVATAR || null,
      provider: 'dev',
      accessToken: '',
      expiresAt: Math.floor(Date.now() / 1000) + 8 * 3600, // 8 hours
      authenticated: true,
      reason: 'authenticated',
      params: [],
    };

    log.info('Dev user authenticated, issuing token', { userId: user.id });

    const token = issueDevJWT(user);
    res.json({ success: true, token, user });
  } catch (err: any) {
    log.error('Dev login error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', async (req, res) => {
  log.info('Dev GET /me requested', { ip: req.ip, headers: { authorization: Boolean(req.headers.authorization) } });
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    log.warn('Missing token on /me endpoint');
    return res.status(401).json({ error: 'Missing token' });
  }

  const user = await validateDevJwt(token);
  if (!user) {
    log.warn('Token validation failed on /me', { provider: 'dev' });
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  log.info('User authenticated via dev-token', { userId: user.id });
  res.json({ user });
});

export default router;
