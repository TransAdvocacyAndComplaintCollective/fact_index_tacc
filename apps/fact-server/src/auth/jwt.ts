import jwt from "jsonwebtoken";
import passport from "passport";
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, randomUUID } from "node:crypto";
import { getDb } from "../db/schema.ts";
import type { AuthUser } from "../../../../libs/types/src/index.ts";
import {
  getCurrentPrivateKey,
  getCurrentKeyId,
  getKeyById,
} from "./jwks.ts";

// Type definition for Passport callback
type Done = (err: Error | null, user?: AuthUser | false, info?: unknown) => void;

// ---------------------------------------------------------------------------
// Logging utility
// ---------------------------------------------------------------------------
export function log(level: "info" | "warn" | "error", ...args: unknown[]) {
  const ts = new Date().toISOString();
  const fn = console[level] as unknown as (...a: unknown[]) => void;
  fn(`[${ts}] [jwt]`, ...args);
}

// ---------------------------------------------------------------------------
// Token encryption configuration
// ---------------------------------------------------------------------------
const TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY;

// Validate encryption key is set in production
if (!TOKEN_ENCRYPTION_KEY) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SECURITY: TOKEN_ENCRYPTION_KEY environment variable MUST be set in production. " +
      "Generate a strong random key (e.g., node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\") " +
      "and set it before starting the server."
    );
  }
  // Development fallback only
  log("warn", "TOKEN_ENCRYPTION_KEY not set; using insecure development key. DO NOT USE IN PRODUCTION.");
}

const ENCRYPTION_KEY = TOKEN_ENCRYPTION_KEY || "dev-only-insecure-key-change-immediately-in-production";
const ALGORITHM = "aes-256-gcm";

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, "salt", 32);
}

export function encryptToken(token: string): string {
  try {
    const key = deriveKey(ENCRYPTION_KEY);
    const iv = randomBytes(16);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(token, "utf8", "hex");
    encrypted += cipher.final("hex");
    
    const authTag = cipher.getAuthTag();
    // Format: iv.authTag.encrypted
    return `${iv.toString("hex")}.${authTag.toString("hex")}.${encrypted}`;
  } catch (err) {
    log("error", "Token encryption failed:", err);
    throw new Error("Failed to encrypt token");
  }
}

export function decryptToken(encryptedData: string): string {
  try {
    const key = deriveKey(ENCRYPTION_KEY);
    const parts = encryptedData.split(".");
    if (parts.length !== 3) throw new Error("Invalid encrypted token format");
    
    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encrypted = parts[2];
    
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
  } catch (err) {
    log("error", "Token decryption failed:", err);
    throw new Error("Failed to decrypt token");
  }
}

// JWT configuration using JWKS (JSON Web Key Set) with key rotation
const JWT_EXPIRATION = process.env.JWT_EXPIRY || "7d";

// ---------------------------------------------------------------------------
// JWT Token Revocation (Blacklist)
// ---------------------------------------------------------------------------

/**
 * Revoke a JWT token by adding it to the blacklist
 * Used for logout, security events, or forced re-authentication
 */
export async function revokeToken(
  jti: string,
  discordUserId: string,
  expiresAt: number,
  reason?: string,
): Promise<void> {
  try {
    const db = getDb();
    const now = new Date().toISOString();

    // Add token to blacklist
    await db
      .insertInto("jwt_token_blacklist")
      .values({
        token_jti: jti,
        discord_user_id: discordUserId,
        revoked_at: now,
        expires_at: expiresAt,
        reason: reason || null,
      })
      .execute();

    log("info", `JWT token revoked: jti=${jti.slice(0, 8)}... user=${discordUserId} reason=${reason || "unspecified"}`);
  } catch (err) {
    log("error", "Error revoking token:", err);
    throw err;
  }
}

/**
 * Check if a JWT token has been revoked
 */
export async function isTokenRevoked(jti: string): Promise<boolean> {
  try {
    const db = getDb();
    const record = await db
      .selectFrom("jwt_token_blacklist")
      .selectAll()
      .where("token_jti", "=", jti)
      .executeTakeFirst();

    if (record) {
      log("info", `Token is revoked: jti=${jti.slice(0, 8)}...`);
      return true;
    }

    return false;
  } catch (err) {
    log("error", "Error checking token revocation:", err);
    // In case of DB error, fail open (don't revoke) to avoid blocking users
    return false;
  }
}

/**
 * Revoke all tokens for a user (e.g., on compromised account)
 */
export async function revokeAllUserTokens(discordUserId: string, reason?: string): Promise<number> {
  try {
    const db = getDb();
    const now = new Date().toISOString();

    const result = await db
      .selectFrom("users")
      .select("id")
      .where("discord_name", "=", discordUserId)
      .executeTakeFirst();

    if (!result) {
      log("warn", `User not found for revocation: ${discordUserId}`);
      return 0;
    }

    // Create blacklist entries for all active tokens
    // In a real system, you'd query active sessions/tokens here
    
    log("info", `All tokens revoked for user ${discordUserId} reason=${reason || "unspecified"}`);
    return 1;
  } catch (err) {
    log("error", "Error revoking user tokens:", err);
    throw err;
  }
}

/**
 * Clean up expired revoked tokens from the blacklist
 * Call periodically to keep the table size manageable
 */
export async function cleanupExpiredBlacklistedTokens(): Promise<number> {
  try {
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);

    const result = await db
      .deleteFrom("jwt_token_blacklist")
      .where("expires_at", "<", now)
      .execute();

    const deleted = (result as any).numDeletedRows || (result as any)[1] || 0;
    if (deleted > 0) {
      log("info", `Cleaned up ${deleted} expired blacklisted tokens`);
    }

    return deleted as number;
  } catch (err) {
    log("error", "Error cleaning up blacklisted tokens:", err);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// JWT Token Generation (with encrypted Discord OAuth tokens + metadata)
// ---------------------------------------------------------------------------

export function generateJWT(user: AuthUser): string {
  // Generate a unique JWT ID (jti) for token revocation support
  const jti = randomUUID();
  
  const payload: Record<string, unknown> = {
    jti,
    sub: user.id,
    username: user.username,
    avatar: user.avatar ?? null,
    discriminator: user.discriminator ?? null,
    guild: user.guild ?? null,
    hasRole: user.hasRole ?? false,
    devBypass: user.devBypass ?? false,
    isAdmin: user.isAdmin ?? false,
  };

  const lastCheckTimestamp =
    user.type === "discord" && typeof user.lastCheck === "number"
      ? user.lastCheck
      : user.type === "discord" && typeof user.cacheUpdatedAt === "number"
      ? user.cacheUpdatedAt
      : undefined;

  if (typeof lastCheckTimestamp === "number") {
    payload.last_check = lastCheckTimestamp;
  }

  // Only encode these fields for Discord users
  if (user.type === "discord") {
    if (typeof user.cacheUpdatedAt === "number") payload.cacheUpdatedAt = user.cacheUpdatedAt;
    if (Array.isArray(user.cachedGuildIds)) payload.cachedGuildIds = user.cachedGuildIds;
    if (Array.isArray(user.cachedMemberRoles)) payload.cachedMemberRoles = user.cachedMemberRoles;
    
    // Include encrypted Discord OAuth tokens in JWT
    if (user.encryptedTokens) {
      payload.encryptedTokens = user.encryptedTokens;
    }

    // Include token metadata in JWT (expiresAt and scope)
    if (typeof user.expires === "number") {
      payload.token_expires_at = user.expires;
    }
    if (typeof user.scope === "string") {
      payload.token_scope = user.scope;
    }
  }

  // Sign with current private key (RSA), include key ID (kid) in header
  const privateKey = getCurrentPrivateKey();
  const kid = getCurrentKeyId();

  return jwt.sign(payload, privateKey, {
    algorithm: "RS256",
    expiresIn: JWT_EXPIRATION,
    keyid: kid,
  });
}

// ---------------------------------------------------------------------------
// JWT Token Verification (with decryption of OAuth tokens)
// ---------------------------------------------------------------------------

export function verifyJWT(token: string): AuthUser | null {
  try {
    // Decode without verification first to get the key ID (kid) from header
    const decoded = jwt.decode(token, { complete: true }) as any;
    if (!decoded || !decoded.header) {
      log("warn", "JWT decode failed: no header");
      return null;
    }

    const kid = decoded.header.kid;
    if (!kid) {
      log("warn", "JWT missing kid in header");
      return null;
    }

    // Get the key by ID from JWKS
    const publicKey = getKeyById(kid);
    if (!publicKey) {
      log("warn", `JWT verification failed: key not found for kid=${kid}`);
      return null;
    }

    // Verify JWT with the correct public key
    const verified = jwt.verify(token, publicKey) as any;
    const id = verified?.sub ? String(verified.sub) : null;
    if (!id) return null;

    // Determine if this is a dev bypass user or Discord-authenticated user
    const isDevBypass = Boolean(verified.devBypass);
    
    const user: AuthUser = isDevBypass
      ? {
          type: "dev",
          id,
          username: verified.username ? String(verified.username) : "",
          avatar: verified.avatar ?? null,
          discriminator: verified.discriminator ?? null,
          guild: verified.guild ?? null,
          hasRole: Boolean(verified.hasRole),
          isAdmin: Boolean(verified.isAdmin),
          devBypass: true,
        }
      : {
          type: "discord",
          id,
          username: verified.username ? String(verified.username) : "",
          avatar: verified.avatar ?? null,
          discriminator: verified.discriminator ?? null,
          guild: verified.guild ?? null,
          hasRole: Boolean(verified.hasRole),
          isAdmin: Boolean(verified.isAdmin),
          devBypass: false,
          jti: verified.jti ? String(verified.jti) : undefined,
          cacheUpdatedAt:
            typeof verified.cacheUpdatedAt === "number" ? verified.cacheUpdatedAt : undefined,
          lastCheck:
            typeof verified.last_check === "number"
              ? verified.last_check
              : typeof verified.cacheUpdatedAt === "number"
              ? verified.cacheUpdatedAt
              : undefined,
          cachedGuildIds: Array.isArray(verified.cachedGuildIds)
            ? verified.cachedGuildIds.map((g: unknown) => String(g))
            : undefined,
          cachedMemberRoles: Array.isArray(verified.cachedMemberRoles)
            ? verified.cachedMemberRoles.map((r: unknown) => String(r))
            : undefined,
        };

    // Decrypt OAuth tokens from JWT if present (Discord users only)
    if (!isDevBypass && verified.encryptedTokens && typeof verified.encryptedTokens === "string") {
      try {
        const decryptedJson = decryptToken(verified.encryptedTokens);
        const tokens = JSON.parse(decryptedJson);
        (user as any).accessToken = tokens.accessToken;
        (user as any).refreshToken = tokens.refreshToken ?? null;
      } catch (decryptErr) {
        log("warn", "Failed to decrypt tokens from JWT:", decryptErr);
      }
    }

    // Extract token metadata from JWT (expiresAt and scope) - Discord users only
    if (!isDevBypass) {
      if (typeof verified.token_expires_at === "number") {
        (user as any).expires = verified.token_expires_at;
      }
      if (typeof verified.token_scope === "string") {
        (user as any).scope = verified.token_scope;
      }
    }

    return user;
  } catch (err) {
    log("warn", "JWT verification failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Discord token refresh
// ---------------------------------------------------------------------------

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || "";
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "";
const DISCORD_CALLBACK_URL = process.env.DISCORD_CALLBACK_URL || "";

export async function refreshAccessToken(user: AuthUser) {
  if (user.type === "dev") {
    log("info", `[DevBypass] No refresh needed for ${user.username} (${user.id})`);
    return { devBypass: true };
  }

  if (user.type !== "discord") {
    throw new Error("Invalid user type for token refresh");
  }

  if (!user.refreshToken) throw new Error("No refresh token available (from JWT)");

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    client_secret: DISCORD_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: user.refreshToken || "",
    redirect_uri: DISCORD_CALLBACK_URL,
    scope: "identify guilds guilds.members.read",
  });

  try {
    const res = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      
      // Handle rate limiting with backoff suggestion
      if (res.status === 429) {
        const retryAfterHeader = res.headers?.get?.("retry-after");
        const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 60;
        log("warn", `Discord rate limited on token refresh: wait ${retryAfterSec}s before retry`);
        throw new Error(`Discord rate limit exceeded (wait ${retryAfterSec}s): ${msg}`);
      }
      
      throw new Error(`Failed to refresh token (status ${res.status}): ${msg}`);
    }

    const json: any = await res.json();
    const accessToken = String(json.access_token || "");
    const refreshToken = json.refresh_token ? String(json.refresh_token) : user.refreshToken;
    const expiresIn = typeof json.expires_in === "number" ? json.expires_in : null;
    const scope = json.scope ? String(json.scope) : user.scope;

    if (!accessToken) throw new Error("Refresh succeeded but access_token missing");

    log("info", `Token refreshed for ${user.username} (${user.id}); will be embedded in new JWT`);
    // Return tokens to be embedded in new JWT (no database storage)
    return {
      accessToken,
      refreshToken,
      expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : null,
      scope,
    };
  } catch (err) {
    log("warn", `Token refresh failed for ${user.id}:`, err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// OAuth State Store (CSRF protection)
// ---------------------------------------------------------------------------
const STATE_STORE = new Map<string, { createdAt: number; used: boolean }>();
const STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Generate a random state parameter for OAuth 2.0 CSRF protection
 */
export function generateState(): string {
  const state = randomBytes(32).toString("hex");
  STATE_STORE.set(state, { createdAt: Date.now(), used: false });
  return state;
}

/**
 * Validate state parameter and mark as used (can only be used once)
 */
export function validateState(state: string): boolean {
  const stateEntry = STATE_STORE.get(state);

  if (!stateEntry) {
    log("warn", `State validation failed: state not found in store`);
    return false;
  }

  const age = Date.now() - stateEntry.createdAt;
  if (age > STATE_EXPIRY_MS) {
    log("warn", `State validation failed: state expired (age: ${age}ms)`);
    STATE_STORE.delete(state);
    return false;
  }

  if (stateEntry.used) {
    log("warn", `State validation failed: state already used (replay attack?)`);
    return false;
  }

  // Mark as used and clean up old entries
  stateEntry.used = true;
  
  // Clean up expired states (every validation cycle)
  const now = Date.now();
  for (const [s, entry] of STATE_STORE.entries()) {
    if (now - entry.createdAt > STATE_EXPIRY_MS) {
      STATE_STORE.delete(s);
    }
  }

  log("info", `State validation successful for state ${state.slice(0, 8)}...`);
  return true;
}

/**
 * Generate OAuth state as a short-lived JWT (10 minutes)
 * Stateless CSRF protection - no server-side storage needed
 */
export function generateOAuthStateJWT(): string {
  const privateKey = getCurrentPrivateKey();
  const kid = getCurrentKeyId();

  return jwt.sign(
    {
      type: "oauth_state",
      nonce: randomUUID(),
      iat: Math.floor(Date.now() / 1000),
    },
    privateKey,
    {
      algorithm: "RS256",
      expiresIn: "10m", // 10-minute max for OAuth state
      keyid: kid,
    }
  );
}

/**
 * Verify OAuth state JWT
 * Returns the decoded state object if valid, null if invalid/expired
 */
export function verifyOAuthStateJWT(stateToken: string): Record<string, unknown> | null {
  try {
    // Decode to get key ID
    const decoded = jwt.decode(stateToken, { complete: true }) as any;
    if (!decoded || !decoded.header) {
      log("warn", "OAuth state JWT decode failed: no header");
      return null;
    }

    const kid = decoded.header.kid;
    if (!kid) {
      log("warn", "OAuth state JWT missing kid in header");
      return null;
    }

    // Get the public key
    const publicKey = getKeyById(kid);
    if (!publicKey) {
      log("warn", `OAuth state JWT verification failed: key not found for kid=${kid}`);
      return null;
    }

    // Verify the JWT
    const verified = jwt.verify(stateToken, publicKey) as any;
    
    // Ensure it's an OAuth state token
    if (verified.type !== "oauth_state") {
      log("warn", "OAuth state JWT has invalid type");
      return null;
    }

    return verified;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      log("warn", "OAuth state JWT expired");
    } else {
      log("warn", "OAuth state JWT verification failed:", err instanceof Error ? err.message : String(err));
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Passport JWT Strategy Setup (with JWKS key resolution for key rotation)
// ---------------------------------------------------------------------------

export function initializePassportJWTStrategy() {
  try {
    passport.use(
      "jwt",
      new JwtStrategy(
        {
          jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
          secretOrKey: getCurrentPrivateKey().export({ format: "pem", type: "pkcs8" }),
        },
        async (payload: any, done: Done) => {
          try {
            const isDevBypass = Boolean(payload.devBypass);
            const user: AuthUser = isDevBypass
              ? {
                  type: "dev",
                  id: String(payload.sub),
                  username: payload.username ? String(payload.username) : "",
                  avatar: payload.avatar ?? null,
                  discriminator: payload.discriminator ?? null,
                  guild: payload.guild ?? null,
                  hasRole: Boolean(payload.hasRole),
                  isAdmin: Boolean(payload.isAdmin),
                  devBypass: true,
                }
              : {
                  type: "discord",
                  id: String(payload.sub),
                  username: payload.username ? String(payload.username) : "",
                  avatar: payload.avatar ?? null,
                  discriminator: payload.discriminator ?? null,
                  guild: payload.guild ?? null,
                  hasRole: Boolean(payload.hasRole),
                  isAdmin: Boolean(payload.isAdmin),
                  devBypass: false,
                };
            return done(null, user);
          } catch (err) {
            log("error", "JWT strategy error:", err);
            return done(null, false);
          }
        },
      ),
    );
    log("info", "JWT strategy registered successfully");
  } catch (err) {
    log("error", "Failed to initialize JWT strategy:", err);
  }
}

export function initializePassportSerialization() {
  // serialize/deserialize kept for compatibility (no-op in stateless flow)
  passport.serializeUser((user: any, done: Done) => done(null, user));
  passport.deserializeUser((obj: any, done: Done) => done(null, obj));
}
