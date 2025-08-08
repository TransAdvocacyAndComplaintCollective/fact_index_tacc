// src/auth/authRouter.stateless.ts
import express from 'express';
import pinologger from '../logger/pino.ts';
import googleRouter, { GOOGLE_ENABLED, validateGoogleJwt } from './passport-google.ts';
import discordRouter, { DISCORD_ENABLED, validateDiscordJwt } from './passport-discord.ts';
import blueskyRouter, { BLUESKY_ENABLED, validateBlueskyJwt } from './passport-bluesky.ts';
import facebookRouter, { FACEBOOK_ENABLED, validateFacebookJwt } from './passport-facebook.ts';
import adminRouter, { ADMIN_ENABLED, canLoginAdmin } from './passport-admin.ts';
import devRouter, { DEV_ENABLED, canLoginDev, validateDevJwt } from './passport-dev.ts';
import type { Request, Response, NextFunction, Router } from 'express';
import type { UnauthenticatedUser, ProviderType, AuthUser } from './auth_types.d.ts';
import dotenv from 'dotenv';

dotenv.config();

const logger = pinologger.child({ component: 'auth-router-stateless' });
logger.info('Initializing auth-router stateless');

const router = express.Router();

const providers: Array<[ProviderType, boolean, Router]> = [
  ['dev', DEV_ENABLED, devRouter],
  ['google', GOOGLE_ENABLED, googleRouter],
  ['discord', DISCORD_ENABLED, discordRouter],
  ['bluesky', BLUESKY_ENABLED, blueskyRouter],
  ['facebook', FACEBOOK_ENABLED, facebookRouter],
  ['admin', ADMIN_ENABLED, adminRouter],
];

providers.forEach(([name, enabled, subrouter]) => {
  logger.info({ provider: name, enabled }, 'Provider configuration');
  if (enabled) {
    router.use(`/${name}`,
      (req: Request, _res: Response, next: NextFunction) => {
        logger.debug({ provider: name, method: req.method, url: req.originalUrl }, 'Entering provider route');
        next();
      },
      subrouter
    );
    logger.info({ provider: name }, 'Mounted router');
  }
});

// --- Safe logger wrapper ---
function safeLog(
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error',
  data: any,
  msg: string
) {
  try {
    let payload = data;
    // Normalize errors
    if (data instanceof Error) {
      payload = { message: data.message, stack: data.stack };
    } else if (data?.err instanceof Error) {
      payload = { ...data, err: { message: data.err.message, stack: data.err.stack } };
    }
    (logger as any)[level](payload, msg);
  } catch (logErr) {
    console.error(`Logger failed while logging "${msg}"`, logErr, data);
  }
}

export async function validateAndRefreshStateless(req: Request, _res: Response, next: NextFunction) {
  safeLog('trace', { url: req.originalUrl, headers: req.headers }, 'validateAndRefreshStateless ENTRY');

  const authHeader = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  const bearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  const token = bearer
    || req.cookies?.auth_token
    || (typeof req.query.auth_token === 'string' ? req.query.auth_token : null);

  if (!token) {
    safeLog('warn', {}, 'validateAndRefreshStateless - No token found');
    (req as any).authStatus = {
      authenticated: false,
      reason: 'no_token',
      provider: null,
      username: undefined,
      expiresAt: null,
    };
    return next();
  }

  let provider: ProviderType | undefined;
  if (typeof req.query.provider === 'string') {
    provider = req.query.provider as ProviderType;
  } else if (typeof req.headers['x-provider'] === 'string') {
    provider = req.headers['x-provider'] as ProviderType;
  }

  safeLog('debug', { provider, tokenPresent: true }, 'Token provided, validating provider');
  let user: AuthUser | null = null;

  try {
    switch (provider) {
      case 'dev':
        user = await validateDevJwt(token);
        break;
      case 'google':
        user = await validateGoogleJwt(token);
        break;
      case 'discord':
        user = await validateDiscordJwt(token);
        break;
      case 'bluesky':
        user = await validateBlueskyJwt(token);
        break;
      case 'facebook':
        user = await validateFacebookJwt(token);
        break;
      case 'admin':
        user = await validateAdminJwtStateless(token);
        break;
      default:
        safeLog('warn', { provider }, 'Unknown or missing provider');
        (req as any).authStatus = {
          authenticated: false,
          reason: 'unknown_provider',
          provider: null,
          username: undefined,
          expiresAt: null,
        };
        return next();
    }

    if (user?.authenticated) {
      safeLog('info', { provider, userId: user.id, username: user.username }, 'Token validated successfully');
      (req as any).authStatus = user;
    } else {
      safeLog('warn', { provider }, 'Token invalid');
      (req as any).authStatus = {
        authenticated: false,
        reason: 'token_invalid',
        provider,
        username: user?.username,
        expiresAt: null,
      };
    }
  } catch (error: any) {
    safeLog('error', { provider, err: error }, 'Error during token validation');
    (req as any).authStatus = {
      authenticated: false,
      reason: 'token_error',
      provider,
      username: undefined,
      expiresAt: null,
    };
  }

  return next();
}

router.get('/list_auth', (req: Request, res: Response) => {
  const status = {
    dev: canLoginDev(req),
    google: GOOGLE_ENABLED,
    discord: DISCORD_ENABLED,
    bluesky: BLUESKY_ENABLED,
    facebook: FACEBOOK_ENABLED,
    admin: canLoginAdmin(req),
  };
  safeLog('info', { ip: req.ip, status }, 'GET /list_auth responded');
  res.json(status);
});

router.get('/status', validateAndRefreshStateless, (req, res) => {
  const status = (req as any).authStatus as AuthUser | UnauthenticatedUser;

  const payload = status?.authenticated
    ? {
        authenticated: true,
        user: {
          id: status.id,
          username: status.username,
          avatar: status.avatar ?? null,
          provider: status.provider ?? null,
          expiresAt: status.expiresAt ?? null,
        },
        reason: null,
      }
    : {
        authenticated: false,
        user: null,
        reason: status?.reason ?? 'unauthenticated',
      };

  res.set('Cache-Control', 'no-store');
  return res.status(200).json(payload);
});


router.get('/logout', (req: Request, res: Response) => {
  safeLog('info', { ip: req.ip }, 'GET /logout triggered');
  res.clearCookie('auth_token');
  res.json({ logout: 'ok', hint: 'Client should clear its access token' });
});

router.use((req: Request, res: Response) => {
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

// Temporary placeholder until implemented
function validateAdminJwtStateless(_token: string): AuthUser {
  return {
    authenticated: false,
    reason: 'token_invalid',
    provider: null,
    username: undefined,
    expiresAt: null,
  };
}
