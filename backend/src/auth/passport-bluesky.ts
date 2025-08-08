import express from "express";
import session from "express-session";

import pkg_express from 'express';
type Request = pkg_express.Request;
type Response = pkg_express.Response;
type NextFunction = pkg_express.NextFunction;

import pkg_oauth, { OAuthClient } from '@atproto/oauth-client-node';
type DigestAlgorithm = pkg_oauth.DigestAlgorithm;
type Key = pkg_oauth.Key;
import { JoseKey } from "@atproto/jwk-jose";
import pinoLogger from "../logger/pino.ts"; // reuse your logger
import type { AuthUser, BlueskyAuthUser } from "./auth_types";
// Awaitable type for compatibility
type Awaitable<T> = T | Promise<T>;

// Extend express-session to include bsky property
declare module "express-session" {
  interface SessionData {
    bsky?: any;
  }
}

const log = pinoLogger.child({ component: "bluesky-auth" });
const blueskyRouter = express.Router();
export default blueskyRouter;

const STATE_STORE = new Map<string, any>();
const SESSION_STORE = new Map<string, any>();

async function getOAuthClient() {
  const keyset = [
    // parse your private JWK(s) from env
    await JoseKey.fromImportable(JSON.parse(process.env.PRIVATE_KEY_1!)),
  ];
  return new OAuthClient({
    responseMode: "query",
    runtimeImplementation: {
      createKey: function (algs: string[]): Key | PromiseLike<Key> {
        throw new Error("Function not implemented.");
      },
      getRandomValues: function (length: number): Awaitable<Uint8Array> {
        throw new Error("Function not implemented.");
      },
      digest: function (data: Uint8Array, alg: DigestAlgorithm): Awaitable<Uint8Array> {
        throw new Error("Function not implemented.");
      }
    },
    clientMetadata: {
      client_id: process.env.BLUESKY_CLIENT_METADATA_URL!,
      client_name: process.env.CLIENT_NAME || "BlueSkyApp",
      client_uri: process.env.CLIENT_URI!,
      redirect_uris: [process.env.BLUESKY_CALLBACK_URL!],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method:
        (process.env.TOKEN_METHOD as
          | "none"
          | "client_secret_basic"
          | "client_secret_jwt"
          | "client_secret_post"
          | "private_key_jwt"
          | "self_signed_tls_client_auth"
          | "tls_client_auth"
          | undefined) || "private_key_jwt",
      token_endpoint_auth_signing_alg: "ES256",
      scope: "atproto",
      jwks_uri: process.env.BLUESKY_JWKS_URL!,
      dpop_bound_access_tokens: true,
    },
    keyset,
    stateStore: {
      set: async (k, v) => {
        STATE_STORE.set(k, v);
      },
      get: async (k) => STATE_STORE.get(k),
      del: async (k) => {
        STATE_STORE.delete(k);
      },
    },
    sessionStore: {
      set: async (sub, s) => {
        SESSION_STORE.set(sub, s);
      },
      get: async (sub) => SESSION_STORE.get(sub),
      del: async (sub) => {
        SESSION_STORE.delete(sub);
      },
    },
  });
}

// 1. initiate OAuth
blueskyRouter.get("/login", async (req, res) => {
  const { handle } = req.query as any;
  if (!handle) {
    log.error("Missing handle");
    return res.status(400).send("Missing ?handle=alice.bsky.social");
  }
  const client = await getOAuthClient();
  const url = await client.authorize(handle, { state: req.sessionID });
  res.redirect(url.toString());
});

// 2. callback
blueskyRouter.get("/callback", async (req, res) => {
  const client = await getOAuthClient();
  const params = new URLSearchParams(
    Object.entries(req.query).map(([k, v]) => [
      k,
      Array.isArray(v)
        ? String(v[0])
        : typeof v === "object" && v !== null
          ? JSON.stringify(v)
          : String(v),
    ])
  );
  const result = await client.callback(params);
  if (!result.session) {
    log.error({ query: req.query }, "Callback error: no session");
    return res.status(400).send("OAuth failed");
  }
  log.info("Bluesky user authenticated", { did: result.session.did });
  res.redirect("/");
});

// 3. validate & auto‑refresh
async function validateAndRefreshBlueSky(
  req: Request,
  res: Response,
  next: NextFunction
) {
  req.authUser = {
    provider: null,
    authenticated: false,
    reason: "unauthenticated",
    username: undefined,
    expiresAt: null,
  };
  return next();

  // // Get a client instance
  // const client = await getOAuthClient();

  // try {
  //   // Restore session via DID (sub) from store
  //   const restored = await client.restore(sess.sub);
  //   req.session.bsky = restored; // updated session if refresh happened
  //   req.authUser = {
  //     provider: "bluesky",
  //     authenticated: true,
  //     reason: "authenticated",
  //     handle: restored.handle,
  //     session: restored,
  //   };
  // } catch (err) {
  //   log.error({ err: err.message }, "Session restore/refresh failed");
  //   delete req.session.bsky;
  //   req.authUser = {
  //     provider: null,
  //     authenticated: false,
  //     reason: "token_expired",
  //     username: undefined,
  //     expiresAt: null,
  //   };
  // }

  // next();
}

// usage: in your main app setup
blueskyRouter.use(
  session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
  })
);
blueskyRouter.use(validateAndRefreshBlueSky);

// Enable Bluesky based on environment variable
const BLUESKY_ENABLED = !!process.env.BLUESKY_ENABLED;

export { validateAndRefreshBlueSky, BLUESKY_ENABLED };
// export router
