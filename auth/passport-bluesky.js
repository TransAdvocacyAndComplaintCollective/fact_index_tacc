// ./auth/passport-bluesky.js
import express from 'express';
import passport from 'passport';
import { Strategy as CustomStrategy } from 'passport-custom';
import { NodeOAuthClient } from '@atproto/oauth-client-node';
import { JoseKey } from '@atproto/jwk-jose';

const REQUIRED_ENVS = [
  'Bluesky_OAUTH_CLIENT_METADATA_URL',
  'Bluesky_OAUTH_JWKS_URL',
  'Bluesky_OAUTH_PRIVATE_KEY',
  'Bluesky_OAUTH_KEY_PAIR_ID',
  'Bluesky_OAUTH_CALLBACK_URL',
];
const MISSING = REQUIRED_ENVS.filter((k) => !process.env[k]);
export const BLUESKY_ENABLED = MISSING.length === 0;

if (!BLUESKY_ENABLED) {
  console.warn(
    `[passport-bluesky] Missing environment variables: ${MISSING.join(
      ', '
    )}. Bluesky auth is disabled.`
  );
}

let getClient;
if (BLUESKY_ENABLED) {
  const stateStore = new Map();
  const sessionStore = new Map();

  getClient = async () => {
    const key = await JoseKey.fromImportable(
      process.env.Bluesky_OAUTH_PRIVATE_KEY,
      {
        alg: 'ES256',
        kid: process.env.Bluesky_OAUTH_KEY_PAIR_ID,
      }
    );

    return new NodeOAuthClient({
      clientMetadata: {
        client_id: process.env.Bluesky_OAUTH_CLIENT_METADATA_URL,
        client_name: 'My App',
        redirect_uris: [process.env.Bluesky_OAUTH_CALLBACK_URL],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'private_key_jwt',
        dpop_bound_access_tokens: true,
        jwks_uri: process.env.Bluesky_OAUTH_JWKS_URL,
      },
      keyset: [key],
      stateStore: {
        async get(k) {
          return stateStore.get(k);
        },
        async set(k, v) {
          stateStore.set(k, v);
        },
        async del(k) {
          stateStore.delete(k);
        },
      },
      sessionStore: {
        async get(s) {
          return sessionStore.get(s);
        },
        async set(s, sess) {
          sessionStore.set(s, sess);
        },
        async del(s) {
          sessionStore.delete(s);
        },
      },
    });
  };
}

if (BLUESKY_ENABLED) {
  passport.use(
    'bluesky',
    new CustomStrategy(async (req, done) => {
      try {
        const client = await getClient();

        if (!req.query.code) {
          const state = Math.random().toString(36).slice(2);
          const { url } = await client.authorize(req.query.handle, {
            redirect_uri: process.env.Bluesky_OAUTH_CALLBACK_URL,
            state,
          });
          return done(null, false, { redirect: url });
        }

        const { session } = await client.callback(
          { code: req.query.code, state: req.query.state },
          { redirect_uri: process.env.Bluesky_OAUTH_CALLBACK_URL }
        );

        return done(null, {
          id: session.did,
          handle: session.handle,
          provider: 'bluesky',
          accessToken: session.accessJwt,
          refreshToken: session.refreshJwt,
          expiresAt: session.expiresAt,
        });
      } catch (err) {
        return done(err);
      }
    })
  );
}

// Serialize basic user info
passport.serializeUser((user, done) =>
  done(null, { id: user.id, handle: user.handle, provider: user.provider })
);
passport.deserializeUser((obj, done) => done(null, obj));

export async function validateAndRefreshBlueskySession(req, res, next) {
  req.authStatus = { authenticated: false };

  if (!BLUESKY_ENABLED) return next();
  if (!req.isAuthenticated?.() || req.user.provider !== 'bluesky') return next();

  const client = await getClient();
  const session = await client.sessionStore.get(req.user.id);
  if (!session) return next();

  if (Date.now() > session.expiresAt - 60 * 1000) {
    await client.refresh(session);
  }

  req.sessionData = session;
  req.authStatus = {
    authenticated: true,
    user: { id: session.did, handle: session.handle },
  };
  next();
}

const router = express.Router();

if (BLUESKY_ENABLED) {
  router.get('/login', (req, res, next) => {
    passport.authenticate('bluesky', (err, _, info) => {
      if (err) return next(err);
      if (info?.redirect) return res.redirect(info.redirect);
      res.status(500).send('Failed to initiate Bluesky login');
    })(req, res, next);
  });

  router.get(
    '/callback',
    passport.authenticate('bluesky', { failureRedirect: '/', session: true }),
    (req, res) => res.redirect('/profile')
  );
} else {
  router.get('/login', (req, res) =>
    res.status(503).send('Bluesky auth is currently disabled.')
  );
  router.get('/callback', (req, res) =>
    res.status(503).send('Bluesky auth is currently disabled.')
  );
}

router.get('/me', validateAndRefreshBlueskySession, (req, res) => {
  if (!req.authStatus.authenticated) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({
    id: req.authStatus.user.id,
    handle: req.authStatus.user.handle,
    expiresAt: req.sessionData.expiresAt,
  });
});

export default router;
