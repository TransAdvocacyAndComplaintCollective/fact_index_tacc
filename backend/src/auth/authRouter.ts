// ./auth/
import express from 'express';
import pinologger from '../logger/pino.js';
import googleRouter, { GOOGLE_ENABLED } from './provider/passport-google.js';
import discordRouter, { DISCORD_ENABLED } from './provider/passport-discord.js';
import blueskyRouter, { BLUESKY_ENABLED } from './provider/passport-bluesky.js';
import facebookRouter, { FACEBOOK_ENABLED } from './provider/passport-facebook.js';
import devRouter, { DEV_ENABLED, canLoginDev } from './provider/passport-dev.js';
import type { Response, NextFunction, Router } from 'express';
import { ProviderType, AuthUser, RequestAuth } from './auth_types.d.js';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { getIssueJWT, refreshJwtIfNeeded, validateJwt } from './tokenUtils.js';

dotenv.config();

const logger = pinologger.child({ component: 'auth-router-stateless' });
logger.info('Initializing auth-router stateless');

const router = express.Router();

// Ensure cookie parsing is available for this router
router.use(cookieParser());

const providers: Array<[ProviderType, boolean, Router]> = [
  ['dev', DEV_ENABLED, devRouter],
  ['google', GOOGLE_ENABLED, googleRouter],
  ['discord', DISCORD_ENABLED, discordRouter],
  ['bluesky', BLUESKY_ENABLED, blueskyRouter],
  ['facebook', FACEBOOK_ENABLED, facebookRouter],
];

providers.forEach(([name, enabled, subrouter]) => {
  logger.info({ provider: name, enabled }, 'Provider configuration');
  if (enabled) {
    router.use(`/${name}`,
      (req: RequestAuth, _res: Response, next: NextFunction) => {
        logger.debug({ provider: name, method: req.method, url: req.originalUrl }, 'Entering provider route');
        next();
      },
      subrouter
    );
    logger.info({ provider: name }, 'Mounted router');
  }
});

function safeLog(
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error',
  data: any,
  msg: string
) {
  try {
    let payload = data;
    if (data instanceof Error) {
      payload = { message: data.message, stack: data.stack };
    } else if (data?.err instanceof Error) {
      payload = { ...data, err: { message: data.err.message, stack: data.err.stack } };
    }
    (logger as any)[level](payload, msg);
  } catch (logErr) {
    logger.error({ logErr, data }, `Logger failed while logging "${msg}"`);
  }
}

export async function validateAndRefreshStateless(req: RequestAuth, res: Response, next: NextFunction) {
  try {
    const token = await getIssueJWT(req);
    if (!token) {
      req.authUser = { provider: null, authenticated: false, reason: 'not_logged_in', expiresAt: null } as any;
      return next();
    }

    const refreshed = await refreshJwtIfNeeded(token);
    const validation = await validateJwt(refreshed.token);

    if (!validation.user) {
      req.authUser = { provider: null, authenticated: false, reason: 'invalid', expiresAt: null } as any;
      return next();
    }

    req.authUser = validation.user;

    if (refreshed.rotated) {
      res.cookie('auth_token', refreshed.token, { httpOnly: true, sameSite: 'lax' });
    }

    next();
  } catch (err) {
    safeLog('warn', err, 'Error during JWT validation/refresh');
    req.authUser = { provider: null, authenticated: false, reason: 'token_error', expiresAt: null } as any;
    next();
  }
}

router.get('/list_auth', (req: RequestAuth, res: Response) => {
  const status = {
    dev: canLoginDev(req),
    google: GOOGLE_ENABLED,
    discord: DISCORD_ENABLED,
    bluesky: BLUESKY_ENABLED,
    facebook: FACEBOOK_ENABLED
  };
  safeLog('info', { ip: req.ip, status }, 'GET /list_auth responded');
  res.json(status);
});

router.get('/status', validateAndRefreshStateless, (req: RequestAuth, res: Response) => {
  const status = req.authUser;
  let payload: { authenticated: boolean; user?: AuthUser | null; reason?: string | null };

  if (!status || status.provider === null) {
    payload = {
      authenticated: false,
      user: null,
      reason: status?.reason ?? 'unauthenticated',
    };
    res.set('Cache-Control', 'no-store');
    return res.status(200).json(payload);
  } else {
    payload = {
      authenticated: true,
      user: status,
      reason: status?.reason ?? null,
    };
  }
  return res.status(200).json(payload);
});

router.get('/logout', (req: RequestAuth, res: Response) => {
  safeLog('info', { ip: req.ip }, 'GET /logout triggered');
  res.clearCookie('auth_token');
  res.json({ logout: 'ok', hint: 'Client should clear its access token' });
});

router.use((req: RequestAuth, res: Response) => {
  safeLog('warn', { method: req.method, url: req.originalUrl }, 'No matching route');
  (req as any).authStatus = {
    authenticated: false,
    reason: 'not_found',
    provider: null,
    username: undefined,
    expiresAt: null,
  };
  res.status(404).json({
    error: {
      message: 'Not found',
      reason: 'not_found',
    },
  });
});

export default router;
