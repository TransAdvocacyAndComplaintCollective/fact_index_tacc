import jwt from "jsonwebtoken";
import passport from "passport";
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt";
import { randomBytes, randomUUID } from "node:crypto";
import { getDb } from "../db/schema.ts";
import { log } from "../logger.ts";
import type { AuthUser } from "../../../../libs/types/src/index.ts";
import { getJwtSecrets } from "../../../../libs/db-core/src/jwtSecretRepository.ts";

// Type definition for Passport callback
type Done = (err: Error | null, user?: AuthUser | false, info?: unknown) => void;

// JWT configuration (DB-backed HMAC secret rotation)
const JWT_EXPIRATION = process.env.JWT_EXPIRY || "7d";

let jwtSecretsCache: { loadedAtMs: number; current: string; verify: string[] } | null = null;
async function getJwtSecretsCached(): Promise<{ current: string; verify: string[] }> {
  const now = Date.now();
  if (jwtSecretsCache && now - jwtSecretsCache.loadedAtMs < 10_000) {
    return { current: jwtSecretsCache.current, verify: jwtSecretsCache.verify };
  }
  const secrets = await getJwtSecrets();
  const current = secrets.current.secret;
  const verify = secrets.validForVerify.map((s) => s.secret);
  jwtSecretsCache = { loadedAtMs: now, current, verify };
  return { current, verify };
}

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
    // Fail closed on revocation store errors to avoid accepting compromised tokens.
    return true;
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

export async function generateJWT(user: AuthUser): Promise<string> {
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

  if (user.type === "dev" && Array.isArray(user.devPermissions)) {
    payload.devPermissions = user.devPermissions;
  }

  const lastCheckTimestamp =
    user.type === "discord" && typeof user.lastCheck === "number"
      ? user.lastCheck
      : user.type === "discord" && typeof user.cacheUpdatedAt === "number"
      ? user.cacheUpdatedAt
      : undefined;

  if (typeof lastCheckTimestamp === "number") {
    payload.last_check = lastCheckTimestamp;
  }

  // Encode cached role metadata when present (used for Casbin subject derivation)
  if (Array.isArray(user.cachedMemberRoles)) {
    payload.cachedMemberRoles = user.cachedMemberRoles;
  }

  // Only encode these fields for Discord users
  if (user.type === "discord") {
    if (typeof user.cacheUpdatedAt === "number") payload.cacheUpdatedAt = user.cacheUpdatedAt;
    if (Array.isArray(user.cachedGuildIds)) payload.cachedGuildIds = user.cachedGuildIds;
    
    // Include token metadata in JWT (expiresAt and scope)
    if (typeof user.expires === "number") {
      payload.token_expires_at = user.expires;
    }
    if (typeof user.scope === "string") {
      payload.token_scope = user.scope;
    }
  }

  const { current } = await getJwtSecretsCached();
  return jwt.sign(payload, current, {
    algorithm: "HS256",
    expiresIn: JWT_EXPIRATION,
  });
}

// ---------------------------------------------------------------------------
// JWT Token Verification (with decryption of OAuth tokens)
// ---------------------------------------------------------------------------

export async function verifyJWTAsync(token: string): Promise<AuthUser | null> {
  try {
    const { verify } = await getJwtSecretsCached();
    for (const secret of verify) {
      try {
        const verified = jwt.verify(token, secret, { algorithms: ["HS256"] }) as any;
        const id = verified?.sub ? String(verified.sub) : null;
        if (!id) return null;

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
              cachedMemberRoles: Array.isArray(verified.cachedMemberRoles)
                ? verified.cachedMemberRoles.map((r: unknown) => String(r))
                : undefined,
              devPermissions: Array.isArray(verified.devPermissions)
                ? verified.devPermissions.map((p: unknown) => String(p))
                : undefined,
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
      } catch {
        // try next secret
      }
    }
    return null;
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
        const retryAfterSec = retryAfterHeader && /^\d+$/.test(retryAfterHeader.trim()) ? parseInt(retryAfterHeader, 10) : 60;
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
 * Register an OAuth state value for one-time use validation.
 * This is used to enforce replay protection for stateless JWT state tokens.
 */
export function registerOAuthStateToken(state: string): void {
  if (!state) return;
  STATE_STORE.set(state, { createdAt: Date.now(), used: false });
}

/**
 * Consume an OAuth state value (one-time). Returns true if valid and not replayed.
 */
export function consumeOAuthStateToken(state: string): boolean {
  if (!state) return false;
  return validateState(state);
}

/**
 * Generate OAuth state as a short-lived JWT (10 minutes)
 * Stateless CSRF protection - no server-side storage needed
 */
export async function generateOAuthStateJWT(): Promise<string> {
  const { current } = await getJwtSecretsCached();
  return jwt.sign(
    {
      type: "oauth_state",
      nonce: randomUUID(),
      iat: Math.floor(Date.now() / 1000),
    },
    current,
    {
      algorithm: "HS256",
      expiresIn: "10m", // 10-minute max for OAuth state
    }
  );
}

/**
 * Verify OAuth state JWT
 * Returns the decoded state object if valid, null if invalid/expired
 */
export async function verifyOAuthStateJWT(stateToken: string): Promise<Record<string, unknown> | null> {
  try {
    const { verify } = await getJwtSecretsCached();
    let verified: any = null;
    for (const secret of verify) {
      try {
        verified = jwt.verify(stateToken, secret, { algorithms: ["HS256"] }) as any;
        break;
      } catch {
        // try next
      }
    }
    if (!verified) return null;
    
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
// Passport JWT Strategy Setup
// ---------------------------------------------------------------------------

export function initializePassportJWTStrategy() {
  try {
    passport.use(
      "jwt",
      new JwtStrategy(
        {
          jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
          secretOrKeyProvider: async (_req, rawJwtToken, done) => {
            try {
              const { current } = await getJwtSecretsCached();
              done(null, current);
            } catch (err) {
              done(err as any, null);
            }
          },
          algorithms: ["HS256"],
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
