// auth/passport-bluesky.ts
import expressPkg from "express";
const { Router } = expressPkg;
import { JoseKey } from "@atproto/jwk-jose";
import pkg from "@atproto/oauth-client-node";
import { randomBytes, createHash } from "crypto";
import jwt from "jsonwebtoken";
import pinoLogger from "../logger/pino.ts";
import type { AuthUser, UnauthenticatedUser } from "./auth_types.d.ts";
import type { Request, Response } from "express"; // type-only import (ESM-safe)

const log = pinoLogger.child({ component: "bluesky-auth" });
// Helper to get required environment variables
function safeEnv(key: string): string {
  const val = process.env[key];
  if (!val?.trim()) {
    log.warn({ key }, "Missing required env var");
    return "";
  }
  return val.trim();
}
const BLUESKY_JWT_SECRET = safeEnv("BLUESKY_JWT_SECRET");
export const BLUESKY_ENABLED = Boolean(
  process.env.BLUESKY_ENABLED === "true" &&
  safeEnv("BLUESKY_CLIENT_METADATA_URL") &&
  safeEnv("CLIENT_URI") &&
  safeEnv("BLUESKY_CALLBACK_URL") &&
  safeEnv("BLUESKY_JWKS_URL") &&
  safeEnv("PRIVATE_KEY_1") &&
  safeEnv("BLUESKY_JWT_SECRET")
);

// --- Client key (no top-level await)
let clientKeyPromise: ReturnType<typeof JoseKey.fromImportable> | null = null;
function getClientKey() {
  if (!clientKeyPromise) {
    clientKeyPromise = JoseKey.fromImportable(
      JSON.parse(safeEnv("PRIVATE_KEY_1"))
    );
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
      client_id: safeEnv("BLUESKY_CLIENT_METADATA_URL"),
      client_name: process.env.CLIENT_NAME ?? "BlueSky Stateless App",
      client_uri: safeEnv("CLIENT_URI"),
      redirect_uris: [safeEnv("BLUESKY_CALLBACK_URL")],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: (process.env.TOKEN_METHOD as any) || "private_key_jwt",
      token_endpoint_auth_signing_alg: "ES256",
      scope: "https://atproto.com",
      jwks_uri: safeEnv("BLUESKY_JWKS_URL"),
      dpop_bound_access_tokens: true,
    },
    keyset: [clientKey],
    // Stateless stores: implement as no-ops; avoid importing CJS-only types
    stateStore: {
      async set(_key: string, _value: unknown) {/* no-op */},
      async get(_key: string) { return undefined; },
      async del(_key: string) {/* no-op */},
    },
    sessionStore: {
      async set(_key: string, _value: unknown) {/* no-op */},
      async get(_key: string) { return undefined; },
      async del(_key: string) {/* no-op */},
    },
  });
}

// Cookie helpers
function encrypt(value: string): string {
  return Buffer.from(value).toString("base64");
}
function decrypt(value: string): string {
  return Buffer.from(value, "base64").toString("utf8");
}

export async function validateBlueskyJwt(
  token: string
): Promise<AuthUser | UnauthenticatedUser> {
  try {
    const client = await getOAuthClient();
    const session = await client.restore(token);
    return {
      provider: "bluesky",
      authenticated: true,
      reason: "authenticated",
      username: session.sub,
      id: session.did,
      avatar: undefined,
      expiresAt: Date.now() + 3600 * 1000,
      params: [],
    };
  } catch (err: any) {
    log.error({ err }, "Bluesky validation failed");
    return {
      provider: null,
      authenticated: false,
      reason: "token_expired",
      username: undefined,
      expiresAt: null,
    };
  }
}

const router = Router();

// --- LOGIN ---
router.post("/login", async (req: Request, res: Response) => {
  if (!BLUESKY_ENABLED) {
    return res.status(403).json({ error: "Bluesky OAuth is disabled" });
  }

  try {
    const client = await getOAuthClient();

    // Expect a Bluesky handle or full host—for example "alice.bsky.social"
    const handle = (req.body?.handle || req.query.handle) as string | undefined;
    if (!handle?.trim()) {
      return res
        .status(400)
        .json({ error: "Missing 'handle' (e.g. alice.bsky.social)" });
    }

    const state = randomBytes(16).toString("hex");
    const redirectUri = (req.query.redirect_uri as string) || safeEnv("BLUESKY_CALLBACK_URL");

    // Store encrypted state & callback redirect in secure HTTP-only cookies
    res.cookie("bluesky_state", encrypt(state), { httpOnly: true, sameSite: "lax", secure: true });
    res.cookie(`bluesky_cb_${state}`, encrypt(redirectUri), { httpOnly: true, sameSite: "lax", secure: true });

    // Ensure redirectUri matches the expected type
    const validRedirectUri =
      /^https:\/\/.+/.test(redirectUri) ||
      /^http:\/\/127\.0\.0\.1(:\d+)?(\/.*)?$/.test(redirectUri)
        ? redirectUri
        : safeEnv("BLUESKY_CALLBACK_URL");

    const authUrl = await client.authorize(handle, {
      state,
      redirect_uri: validRedirectUri as
        | `http://[::1]${string}`
        | "http://127.0.0.1"
        | `http://127.0.0.1:${string}`
        | `http://127.0.0.1/${string}`
        | `http://127.0.0.1?${string}`
        | `http://127.0.0.1#${string}`
        | `https://${string}`
        | `${string}.${string}:/${string}`
        | undefined,
      scope: "atproto",
      prompt: "consent",
    });

    return res.redirect(authUrl.toString());
  } catch (e: any) {
    log.error({ err: e, handle: req.body?.handle }, "Error during Bluesky OAuth authorization");
    return res.status(500).json({ error: "Internal OAuth error" });
  }
});

const JWT_EXPIRES_IN = "1h"; // Set JWT expiration to 1 hour

function signBlueskyJwt(did: string, sub?: string) {
  return jwt.sign(
    {
      id: did,
      provider: "bluesky",
      username: sub ?? did,
      avatar: null,
      expiresAt: Date.now() + 3600 * 1000,
      authenticated: true,
      reason: "authenticated",
      params: [],
    },
    BLUESKY_JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// --- CALLBACK ---
router.get("/callback", async (req, res) => {
  const { state, code } = req.query;
  if (typeof state !== "string" || typeof code !== "string") {
    return res.status(400).json({ error: "Missing state or code" });
  }
  if (decrypt(req.cookies["bluesky_state"]) !== state) {
    return res.status(400).json({ error: "Invalid state" });
  }
  const redirectUri =
    req.cookies[`bluesky_cb_${state}`] ?
      decrypt(req.cookies[`bluesky_cb_${state}`]) :
      safeEnv("BLUESKY_CALLBACK_URL");

  const client = await getOAuthClient();
  const { session } = await client.callback(new URLSearchParams({ code, redirect_uri: redirectUri }));

  const token = signBlueskyJwt(session.did, (session as any).sub);
  res.clearCookie("bluesky_state");
  res.clearCookie(`bluesky_cb_${state}`);
  res.redirect(`${redirectUri}?token=${encodeURIComponent(token)}&provider=bluesky`);
});

// --- ME ---
router.get("/me", async (req: Request, res: Response) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });

  const user = await validateBlueskyJwt(token);
  if (!user.authenticated) return res.status(401).json({ error: "Invalid or expired token" });

  res.json({ user });
});

router.use((_req, res) => res.status(404).json({ error: "Not Found" }));

export default router;
