import express from 'express';
import cookieParser from 'cookie-parser';
import pinoLogger from '../../logger/pino.js';
import type { DevAuthUser } from '../auth_types.js';
import { ipPrivate, isProxy } from '../../utils/ipUtils.js';
import { issueJWT } from '../tokenUtils.js';

const log = pinoLogger.child({ component: 'dev-auth' });

export const DEV_ENABLED =
  process.env.DEV_ENABLED === 'true' ||
  (!('DEV_ENABLED' in process.env) && process.env.NODE_ENV !== 'production');

export function canLoginDev(req: express.Request): boolean {
  const ipResult = ipPrivate(req);
  const isLocal = Boolean(ipResult || ipResult === null);
  log.trace({ DEV_ENABLED, isLocal, isProxy: isProxy(req) }, 'canLoginDev check');
  return DEV_ENABLED && isLocal && !isProxy(req);
}



const router = express.Router();
router.use(cookieParser());

function makeDevUser(): DevAuthUser {
  return {
    id: 'DEV_ID',
    username: process.env.DEV_USERNAME || 'DevUser',
    avatar: process.env.DEV_AVATAR || null,
    provider: 'dev',
    accessToken: '',
    expiresAt: 0,
    authenticated: true,
    reason: 'authenticated',
    params: [],
    loginFacts: [],
  };
}

function sendDevLoginResponse(res: express.Response, user: DevAuthUser) {
  const token = issueJWT(user, "");

  // Set token in HTTP-only cookie
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 3600 * 1000,
  });

  res.json({ success: true, token, user });
}

router.get('/login', (req, res) => {
  log.info({ ip: req.ip, method: req.method }, 'Dev GET /login attempt');

  if (!canLoginDev(req)) {
    log.error({ ip: req.ip }, 'Dev login rejected');
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const user = makeDevUser();
    log.info({ userId: user.id }, 'Dev user authenticated, issuing token');
    sendDevLoginResponse(res, user);
  } catch (err: any) {
    log.error({ error: err.message }, 'Dev login error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', (req, res) => {
  log.info({ ip: req.ip, method: req.method }, 'Dev POST /login attempt');

  if (!canLoginDev(req)) {
    log.error({ ip: req.ip }, 'Dev login rejected');
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const user = makeDevUser();
    log.info({ userId: user.id }, 'Dev user authenticated, issuing token');
    sendDevLoginResponse(res, user);
  } catch (err: any) {
    log.error({ error: err.message }, 'Dev login error');
    res.status(500).json({ error: 'Internal server error' });
  }
});


export default router;