import express, { Request, Response } from "express";
import { randomBytes, createHash } from "crypto";
import { JoseKey } from "@atproto/jwk-jose";
import pkg from "@atproto/oauth-client-node";
import pinoLogger from "../../logger/pino.js";
import type { BlueskyAuthUser } from "../auth_types.js";
import { RequestIssueJWT } from "../tokenUtils.js";
import { addLoginFacts, encryptLoginFacts } from "../loginfacts.js";
import { ProviderType, IdentifierType, LoginFact } from "../../db/user/types.js";

// === NEW: plug into your RBAC model ===

const router = express.Router();
const log = pinoLogger.child({ component: "bluesky-auth" });

// ----- Env helpers -----
function mustEnv(key: string): string {
  const val = process.env[key]?.trim();
  if (!val) {
    log.warn({ key }, "Missing required env var");
    throw new Error(`Missing env var: ${key}`);
  }
  return val;
}

export const BLUESKY_ENABLED = Boolean(
  process.env.BLUESKY_ENABLED === "true" &&
    process.env.BLUESKY_CLIENT_METADATA_URL &&
    process.env.CLIENT_URI &&
    process.env.BLUESKY_CALLBACK_URL &&
    process.env.BLUESKY_JWKS_URL &&
    process.env.PRIVATE_KEY_1 &&
    process.env.BLUESKY_JWT_SECRET
);

// ----- Client key (no top-level await) -----
let clientKeyPromise: ReturnType<typeof JoseKey.fromImportable> | null = null;
function getClientKey() {
  if (!clientKeyPromise) {
    clientKeyPromise = JoseKey.fromImportable(JSON.parse(mustEnv("PRIVATE_KEY_1")));
  }
  return clientKeyPromise;
}

async function getOAuthClient() {
  const clientKey = await getClientKey();
  return new pkg.OAuthClient({
    responseMode: "query",
    runtimeImplementation: {
      createKey: () => clientKey,
      getRandomValues: (len: number) => randomBytes(len),
      digest: (data: Uint8Array, alg) => {
        const name = typeof alg === "object" ? alg.name : String(alg);
        const algo = name.replace("SHA-", "sha").toLowerCase();
        return Uint8Array.from(createHash(algo).update(data).digest());
      },
    },
    clientMetadata: {
      client_id: mustEnv("BLUESKY_CLIENT_METADATA_URL"),
      client_name: process.env.CLIENT_NAME ?? "BlueSky Stateless App",
      client_uri: mustEnv("CLIENT_URI"),
      redirect_uris: [mustEnv("BLUESKY_CALLBACK_URL")],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: (process.env.TOKEN_METHOD as any) || "private_key_jwt",
      token_endpoint_auth_signing_alg: "ES256",
      scope: "https://atproto.com",
      jwks_uri: mustEnv("BLUESKY_JWKS_URL"),
      dpop_bound_access_tokens: true,
    },
    keyset: [clientKey],
    // Stateless stores: implement as no-ops
    stateStore: { async set() {}, async get() { return undefined; }, async del() {} },
    sessionStore: { async set() {}, async get() { return undefined; }, async del() {} },
  });
}

// ----- Cookie helpers -----
function b64e(value: string): string { return Buffer.from(value).toString("base64"); }
function b64d(value: string): string { return Buffer.from(value, "base64").toString("utf8"); }

// Build LoginFacts for our RBAC/ABAC layer from Bluesky claims
function buildBlueskyFacts(opts: { did: string; handle?: string | null }): LoginFact[] {
  const facts: LoginFact[] = [];
  

  // DID is stable → treat as USER_ID
  facts.push({ provider: ProviderType.BLUESKY, type: IdentifierType.USER_ID, value: opts.did });
  // Handle is mutable but useful for matching
  if (opts.handle) {
    facts.push({ provider: ProviderType.BLUESKY, type: IdentifierType.USERNAME, value: opts.handle });
  }
  // Domai
  return facts;
}

// ----- Login (GET & POST) -----
async function startLogin(req: Request, res: Response) {
  if (!BLUESKY_ENABLED) return res.status(403).json({ error: "Bluesky OAuth is disabled" });

  try {
    const client = await getOAuthClient();
    const handle = (req.method === "POST" ? req.body?.handle : req.query.handle) as string | undefined;
    if (!handle?.trim()) return res.status(400).json({ error: "Missing 'handle' (e.g. alice.bsky.social)" });

    const state = randomBytes(16).toString("hex");
    const requestedRedirect = (req.query.redirect_uri as string) || mustEnv("BLUESKY_CALLBACK_URL");

    // Validate redirect URI (allow https or localhost-only http)
    const validRedirect =
      /^https:\/\/.+/.test(requestedRedirect) || /^http:\/\/127\.0\.0\.1(:\d+)?(\/.*)?$/.test(requestedRedirect)
        ? requestedRedirect
        : mustEnv("BLUESKY_CALLBACK_URL");

    // Persist state + callback (encoded) in secure cookies
    const secure = process.env.NODE_ENV === "production";
    res.cookie("bluesky_state", b64e(state), { httpOnly: true, sameSite: "lax", secure });
    res.cookie(`bluesky_cb_${state}`, b64e(validRedirect), { httpOnly: true, sameSite: "lax", secure });

    const authUrl = await client.authorize(handle, {
      state,
      redirect_uri: validRedirect as any,
      scope: "atproto",
      prompt: "consent",
    });

    return res.redirect(authUrl.toString());
  } catch (err: any) {
    log.error({ err, handle: req.body?.handle ?? req.query?.handle }, "Error during Bluesky OAuth authorization");
    return res.status(500).json({ error: "Internal OAuth error" });
  }
}

router.post("/login", startLogin);
router.get("/login", startLogin);

// ----- Callback -----
router.get("/callback", async (req: Request, res: Response) => {
  const { state, code } = req.query;
  if (typeof state !== "string" || typeof code !== "string") {
    return res.status(400).json({ error: "Missing state or code" });
  }

  const cookieState = b64d(req.cookies["bluesky_state"] || "");
  if (!cookieState || cookieState !== state) {
    return res.status(400).json({ error: "Invalid or mismatched state" });
  }

  const cbCookie = req.cookies[`bluesky_cb_${state}`];
  const redirectUri = cbCookie ? b64d(cbCookie) : mustEnv("BLUESKY_CALLBACK_URL");

  try {
    const client = await getOAuthClient();
    const { session } = await client.callback(new URLSearchParams({ code, redirect_uri: redirectUri }));

    // Minimal user claims (do NOT store OAuth tokens in JWT)
    const did = session.did;
    const handle = (session as any).sub ?? session.did; // sub is usually the handle
    let facts: LoginFact[] = [];
    const provider = ProviderType.BLUESKY;
    addLoginFacts(facts, provider, IdentifierType.USERNAME, handle);
    addLoginFacts(facts, provider, IdentifierType.USER_ID, did);

    const user: BlueskyAuthUser = {
      id: did,
      provider: "bluesky",
      username: handle,
      avatar: null,
      expiresAt: 0, // 1h nominal; your RequestIssueJWT implementation controls expiry
      authenticated: true,
      reason: "authenticated",
      loginFacts: encryptLoginFacts(facts),
    };

    // Issue JWT cookie
    await RequestIssueJWT(res, user);

    // Clear transient cookies
    const secure = process.env.NODE_ENV === "production";
    res.clearCookie("bluesky_state", { httpOnly: true, sameSite: "lax", secure });
    res.clearCookie(`bluesky_cb_${state}`, { httpOnly: true, sameSite: "lax", secure });

    // Redirect home (or app-provided redirect inside the cookie)
    res.redirect(`/`);
  } catch (err: any) {
    log.error({ err }, "Bluesky callback failure");
    return res.status(500).json({ error: "Bluesky OAuth callback failed" });
  }
});

// ----- Provider validation (used during JWT rotation) -----
// Full implementation of validateBluesky
export async function validateBluesky(user: BlueskyAuthUser): Promise<BlueskyAuthUser | null> {
  // Basic shape/sanity checks
  if (!user || user.provider !== "bluesky" || !user.id) return null;
  if (user.authenticated !== true) return null;

  // We don't persist OAuth tokens in this stateless flow, so we can't introspect them.
  // Instead, do a lightweight, public check that the DID/handle still resolves via
  // Bluesky's public appview API. If it resolves, we optionally refresh username/avatar.
  const actor = encodeURIComponent(user.id);

  // Short timeout to avoid hanging request paths
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const resp = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${actor}`,
      { signal: controller.signal }
    );

    if (resp.status === 404) {
      // DID/handle no longer exists → treat as invalid
      return null;
    }
    if (!resp.ok) {
      // Transient failure; do not eject the user, just keep prior claims
      log.warn({ status: resp.status }, "Bluesky profile lookup failed; keeping existing claims");
      return user;
    }

    const data: {
      did?: string;
      handle?: string;
      displayName?: string;
      avatar?: string;
    } = await resp.json();

    // If the API returns a DID and it's different, be conservative and reject
    if (data.did && data.did !== user.id) {
      log.warn({ old: user.id, new: data.did }, "Bluesky DID mismatch during validation");
      return null;
    }

    // Refresh soft profile fields when available
    const refreshed: BlueskyAuthUser = {
      ...user,
      username: data.handle ?? user.username,
      avatar: ((data.avatar ?? null) || (user.avatar ?? null)),
    };

    return refreshed;
  } catch (err: any) {
    // Network/timeout/etc. → don't log the user out; keep existing claims
    log.warn({ err: String(err?.message || err) }, "Bluesky validation error; preserving existing user");
    return user;
  } finally {
    clearTimeout(timeout);
  }
}


// 404
router.use((_req, res) => res.status(404).json({ error: "Not Found" }));

export default router;
