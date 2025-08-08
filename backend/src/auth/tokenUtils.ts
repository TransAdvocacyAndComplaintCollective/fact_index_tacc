// auth/tokenUtils.ts
import { validateDevJwt } from './passport-dev';
import { validateGoogleJwt } from './passport-google'; // example

import { Request } from 'express';

export async function authenticateRequest(req: Request) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (req.cookies?.auth_token) {
    token = req.cookies.auth_token;
  }

  if (!token) return { authenticated: false, reason: 'missing_token' };

  const provider = req.headers['x-provider'];
  if (provider === 'dev') return await validateDevJwt(token);
  if (provider === 'google') return await validateGoogleJwt(token);
  return { authenticated: false, reason: 'unsupported_provider' };
}
