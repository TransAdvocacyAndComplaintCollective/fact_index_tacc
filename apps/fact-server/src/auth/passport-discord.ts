import passport from "passport";
import { Strategy as DiscordStrategy } from "@oauth-everything/passport-discord";
import type { Request, Response, NextFunction } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import logger, { log } from "../logger.ts";
import type { AuthStatus, AuthStatusUser, AuthUser } from "../../../../libs/types/src/index.ts";
import { safeJsonParse } from "../utils/parsing.ts";
import {
  isTokenRevoked,
  generateJWT,
  verifyJWTAsync,
  refreshAccessToken,
  initializePassportJWTStrategy,
  initializePassportSerialization,
} from "./jwt.ts";
import { syncDiscordRolesForUser } from "./casbin.ts";
import { upsertKnownDiscordUser } from "./knownUsers.ts";
import { getLoginConstraints } from "../../../../libs/db-core/src/authzRepository.ts";
import { setRolePermissions } from "../../../../libs/db-core/src/authzRepository.ts";
import { getEnforcer } from "./casbin.ts";

// Type definitions for Discord OAuth profile
interface DiscordGuild {
  id: string;
  name?: string;
  icon?: string;
  [key: string]: unknown;
}

interface DiscordProfile {
  id: string;
  username?: string;
  avatar?: string;
  discriminator?: string;
  email?: string;
  verified?: boolean;
  guilds?: DiscordGuild[];
  [key: string]: unknown;
}

type Done = (err: Error | null, user?: AuthUser | false, info?: unknown) => void;
type AuthRequest = Request & { user?: AuthUser; authStatus?: AuthStatus; rotatedToken?: string };

const {
  DISCORD_ROLE_ID,
  DISCORD_GUILD_ID,
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_CALLBACK_URL,
} = process.env as Record<string, string | undefined>;

const DISCORD_API_BASE_URL = String(process.env.DISCORD_API_BASE_URL || "https://discord.com/api")
  .trim()
  .replace(/\/+$/, "");

function discordApiUrl(pathname: string): string {
  if (!pathname.startsWith("/")) return `${DISCORD_API_BASE_URL}/${pathname}`;
  return `${DISCORD_API_BASE_URL}${pathname}`;
}

async function probeGuildMembership(accessToken: string, guildId: string): Promise<{ ok: boolean; roles?: string[] }> {
  try {
    const res = await fetch(discordApiUrl(`/users/@me/guilds/${encodeURIComponent(guildId)}/member`), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return { ok: false };
    const json = await res.json().catch(() => null);
    const roles = Array.isArray((json as any)?.roles)
      ? (json as any).roles.map((r: unknown) => String(r).trim()).filter(Boolean)
      : undefined;
    return { ok: true, roles };
  } catch (err) {
    log("warn", `Discord member probe failed for guild=${guildId}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false };
  }
}

// Config file location for guild <-> role mapping
const __filename = fileURLToPath(import.meta.url);
const __dirname_local = path.dirname(__filename);
const DEFAULT_CONFIG_PATH = path.resolve(__dirname_local, "..", "..", "config", "discord-auth.json");
const CONFIG_PATH = String(process.env.DISCORD_AUTH_CONFIG_PATH || "").trim() || DEFAULT_CONFIG_PATH;
const CONFIG_DIR = path.dirname(CONFIG_PATH);

// Ensure config dir exists
try {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
} catch (err) {
  log("warn", `Unable to create config dir ${CONFIG_DIR}: ${err instanceof Error ? err.message : String(err)}`);
}

// Default config
const DEFAULT_CONFIG = {
  guilds: {
    // "123456789012345678": { "requiredRole": "1111222233334444", "name": "Project Guild" }
  },
  whitelistUsers: [],
};

const STATE_TTL_MS = 5 * 60_000;
class MemoryStateStore {
  private readonly _stateMap = new Map<string, number>();
  private readonly ttl: number;

  constructor(ttl = STATE_TTL_MS) {
    this.ttl = ttl;
  }

  store(_req: unknown, callback: (err: Error | null, state?: string) => void) {
    const state = crypto.randomBytes(16).toString("hex");
    const expiresAt = Date.now() + this.ttl;
    this._stateMap.set(state, expiresAt);
    setTimeout(() => this._stateMap.delete(state), this.ttl);
    callback(null, state);
  }

  verify(_req: unknown, state: string, callback: (err: Error | null, ok: boolean) => void) {
    const expiresAt = this._stateMap.get(state);
    if (!expiresAt) {
      callback(null, false);
      return;
    }
    this._stateMap.delete(state);
    callback(null, expiresAt >= Date.now());
  }
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  if (value == null) {
    return [];
  }
  return [String(value).trim()].filter(Boolean);
}

let fileConfig: any = DEFAULT_CONFIG;
try {
  if (!fs.existsSync(CONFIG_PATH)) {
    // Create config with restricted permissions (0o600 = owner read/write only)
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), { encoding: "utf8", mode: 0o600 });
    log("info", `Created default discord-auth.json at ${CONFIG_PATH}`);
  } else {
    // Verify file permissions are restricted
    const stats = fs.statSync(CONFIG_PATH);
    if ((stats.mode & 0o077) !== 0) {
      log("warn", `Config file has overly permissive permissions: ${(stats.mode & parseInt('777', 8)).toString(8)}. Should be 600.`);
      // Attempt to fix permissions
      try {
        fs.chmodSync(CONFIG_PATH, 0o600);
        log("info", "Fixed config file permissions to 0o600");
      } catch (chmodErr) {
        log("warn", `Could not fix config file permissions: ${chmodErr instanceof Error ? chmodErr.message : String(chmodErr)}`);
      }
    }
    const raw = fs.readFileSync(CONFIG_PATH, { encoding: "utf8" });
    fileConfig = safeJsonParse(raw, {}, false) || {};
    log("info", `Loaded discord-auth.json from ${CONFIG_PATH}`);
  }
} catch (err) {
  log("warn", `Could not load or create discord-auth.json (${CONFIG_PATH}); falling back to env vars`);
  fileConfig = DEFAULT_CONFIG;
}

function normalizePermissionList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((v) => v.trim()).filter(Boolean);
  return [];
}

function syncRolePermissionsFromConfig(config: any): Array<{ roleId: string; permissions: string[] }> {
  const roles = config?.roles;
  if (!roles || typeof roles !== "object") return [];

  const out: Array<{ roleId: string; permissions: string[] }> = [];
  for (const [key, entry] of Object.entries(roles)) {
    const roleId = String(key || "").trim();
    if (!/^\d+$/.test(roleId)) continue;
    const perms = normalizePermissionList((entry as any)?.permissions);
    if (!perms.length) continue;
    out.push({ roleId, permissions: perms });
  }
  return out;
}

// Normalize config: ensure `requiredRole` values are arrays of trimmed strings
try {
  if (fileConfig && fileConfig.guilds && typeof fileConfig.guilds === "object") {
    for (const [gid, cfg] of Object.entries(fileConfig.guilds)) {
      if (!cfg || typeof cfg !== "object") continue;
      const entry: any = cfg as any;
      const rr = entry.requiredRole;
      if (rr == null) {
        entry.requiredRole = null;
        continue;
      }

      if (Array.isArray(rr)) {
        entry.requiredRole = rr.map((r: any) => String(r).trim()).filter(Boolean);
      } else if (typeof rr === "string") {
        entry.requiredRole = rr
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        entry.requiredRole = [String(rr)];
      }
    }
    log("info", `Normalized discord-auth.json guild entries (${Object.keys(fileConfig.guilds).length} guilds)`);
  }
  if (fileConfig) {
    fileConfig.whitelistUsers = normalizeStringList(fileConfig.whitelistUsers);
  }
} catch (err) {
  log("warn", "Failed to normalize discord-auth.json entries:", err instanceof Error ? err.message : String(err));
}

// Dev helper: sync role permissions from config into Casbin DB policies.
// This allows configuring `superuser` (and other perms) for Discord roles via config file.
if (String(process.env.NODE_ENV || "").trim().toLowerCase() !== "production") {
  const pairs = syncRolePermissionsFromConfig(fileConfig);
  if (pairs.length) {
    void (async () => {
      try {
        for (const { roleId, permissions } of pairs) {
          await setRolePermissions(roleId, permissions);
        }
        const enforcer = await getEnforcer();
        await enforcer.loadPolicy();
        log("info", `[auth] Synced ${pairs.length} role permission sets from discord-auth.json`);
      } catch (err) {
        log("warn", "[auth] Failed to sync role permission sets from discord-auth.json", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }
}

// Merge env-provided guild hints with file config (env guild ids add entries)
const ENV_GUILD_IDS = (DISCORD_GUILD_ID || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (ENV_GUILD_IDS.length) {
  fileConfig.guilds = fileConfig.guilds || {};
  ENV_GUILD_IDS.forEach((g) => {
    if (!fileConfig.guilds[g]) fileConfig.guilds[g] = { requiredRole: null };
  });
}

const REQUIRED_ROLE_IDS = (DISCORD_ROLE_ID || "")
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean);

let loginConstraintsCache:
  | { loadedAtMs: number; value: { whitelistUsers: string[]; requiredRolesByGuild: Record<string, string[]> } }
  | null = null;

async function loadLoginConstraintsCached(): Promise<{
  whitelistUsers: string[];
  requiredRolesByGuild: Record<string, string[]>;
}> {
  const now = Date.now();
  if (loginConstraintsCache && now - loginConstraintsCache.loadedAtMs < 30_000) {
    return loginConstraintsCache.value;
  }
  const value = await getLoginConstraints().catch(() => ({ whitelistUsers: [], requiredRolesByGuild: {} }));
  loginConstraintsCache = { loadedAtMs: now, value };
  return value;
}

async function listConfiguredGuildIds(): Promise<string[]> {
  const { requiredRolesByGuild } = await loadLoginConstraintsCached();
  const dbConfigured = Object.keys(requiredRolesByGuild || {});
  const fileGuilds =
    fileConfig?.guilds && typeof fileConfig.guilds === "object" ? (fileConfig.guilds as Record<string, any>) : {};
  const fileConfigured = Object.keys(fileGuilds || {});
  const envConfigured = (DISCORD_GUILD_ID || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set([...dbConfigured, ...fileConfigured, ...envConfigured])).filter(Boolean);
}

// Helper to find matched guild and required role from DB config
async function findMatchedGuild(profile: DiscordProfile) {
  const guilds = profile.guilds || [];
  const { whitelistUsers, requiredRolesByGuild } = await loadLoginConstraintsCached();
  const dbConfigured = Object.keys(requiredRolesByGuild || {});
  const fileGuilds =
    fileConfig?.guilds && typeof fileConfig.guilds === "object" ? (fileConfig.guilds as Record<string, any>) : {};
  const fileConfigured = Object.keys(fileGuilds || {});

  // Prefer DB-driven guild requirements when present, otherwise fall back to config file.
  const configured = dbConfigured.length ? dbConfigured : fileConfigured;

  // If the user is explicitly whitelisted, allow auth outside the guild
  if (profile.id && whitelistUsers.includes(profile.id)) {
    return { guildId: null, requiredRole: null, mode: "whitelist" } as any;
  }

  for (const g of guilds) {
    if (configured.includes(g.id)) {
      const fromDb = requiredRolesByGuild?.[g.id] ?? null;
      const fromFile = fileGuilds?.[g.id]?.requiredRole ?? null;
      const requiredRole = fromDb ?? fromFile ?? null;
      return { guildId: g.id, requiredRole };
    }
  }

  // fallback to env var guild id if present
  if (DISCORD_GUILD_ID) {
    const envIds = DISCORD_GUILD_ID.split(",").map((s) => s.trim()).filter(Boolean);
    for (const g of guilds) {
      if (envIds.includes(g.id)) {
        return {
          guildId: g.id,
          requiredRole:
            requiredRolesByGuild?.[g.id] ??
            fileGuilds?.[g.id]?.requiredRole ??
            (REQUIRED_ROLE_IDS[0] ?? null),
        };
      }
    }
  }

  return null;
}



const CACHE_TTL_MS = 60_000;
const MUTATION_CACHE_TTL_MS = 30_000;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRateLimitBackoff(
  accessToken: string,
  url: string,
  opts?: { retryOn401?: boolean; retryOn429?: boolean; retryDelayMs?: number },
): Promise<{ ok: boolean; status: number; json?: any; retryAfterMs?: number }> {
  const initial = await discordFetchJson(accessToken, url, opts);
  if (initial.ok) return initial;
  if (initial.status === 429) {
    const waitMs = Math.min(Math.max(initial.retryAfterMs ?? opts?.retryDelayMs ?? 1000, 250), 5000);
    await wait(waitMs);
    const retry = await discordFetchJson(accessToken, url, { ...opts, retryOn429: false });
    return retry.ok
      ? retry
      : {
          ...retry,
          retryAfterMs: retry.retryAfterMs ?? waitMs,
        };
  }
  return initial;
}

// ---------------------------------------------------------------------------
// Initialize Discord OAuth strategy if credentials are provided
// ---------------------------------------------------------------------------
if (DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET && DISCORD_CALLBACK_URL) {
  try {
    passport.use(
      "discord",
      new DiscordStrategy(
        {
          clientID: DISCORD_CLIENT_ID,
          clientSecret: DISCORD_CLIENT_SECRET,
          callbackURL: DISCORD_CALLBACK_URL,
          scope: ["identify", "guilds", "guilds.members.read"],
          passReqToCallback: true,
        },
        async (req: any, accessToken: string, refreshToken: string, profile: any, done: Done) => {
          const p = profile as DiscordProfile;
          log("info", `Discord login attempt for profile: ${p.id} ${p.username ?? ""}`);

          try {
            // Whitelist should allow login even if the user is missing the required guild or role.
            // Do this before any Discord guild/member API calls so network/API issues don't block whitelisted users.
            const { whitelistUsers } = await loadLoginConstraintsCached();
            if (p.id && whitelistUsers.includes(p.id)) {
              try {
                await upsertKnownDiscordUser(p.id, p.username || null);
              } catch (err) {
                log("warn", "Failed to upsert known user (whitelist precheck)", {
                  userId: p.id,
                  error: err instanceof Error ? err.message : String(err),
                });
              }

              const cacheUpdatedAt = Date.now();
              const cacheGuildIds = (p.guilds || []).map((g) => g.id);
              return done(null, {
                type: "discord",
                id: p.id,
                username: p.username || "",
                avatar: p.avatar,
                discriminator: p.discriminator ?? null,
                guild: null,
                hasRole: true,
                isAdmin: false,
                devBypass: false,
                cachedGuildIds: cacheGuildIds,
                cachedMemberRoles: [],
                cacheUpdatedAt,
                lastCheck: cacheUpdatedAt,
                accessToken,
                refreshToken,
                expires: Date.now() + 10 * 60 * 60 * 1000,
                scope: "identify guilds guilds.members.read",
              });
            }

            // Some OAuth libraries don't always populate guilds reliably.
            // Prefer probing membership of the configured guild(s) via the member endpoint:
            // GET /users/@me/guilds/{guildId}/member (needs guilds.members.read)
            if ((!p.guilds || p.guilds.length === 0) && accessToken) {
              const configuredGuildIds = await listConfiguredGuildIds().catch(() => []);
              if (configuredGuildIds.length) {
                let matchedGuildId: string | null = null;
                for (const gid of configuredGuildIds) {
                  const probe = await probeGuildMembership(accessToken, gid);
                  if (probe.ok) {
                    matchedGuildId = gid;
                    break;
                  }
                }
                if (matchedGuildId) {
                  p.guilds = [{ id: matchedGuildId }];
                  log("info", `Probed guild membership OK for profile ${p.id} guild=${matchedGuildId}`);
                } else {
                  // If we can't probe membership, fall back to listing guilds (less reliable, more failure-prone).
                  try {
                    const guildsRes = await fetch(discordApiUrl("/users/@me/guilds"), {
                      headers: { Authorization: `Bearer ${accessToken}` },
                    });
                    if (guildsRes.ok) {
                      const guildsJson = await guildsRes.json();
                      if (Array.isArray(guildsJson)) {
                        p.guilds = guildsJson.map((g: any) => ({ id: String(g.id) }));
                        log("info", `Fetched ${p.guilds.length} guilds via API for profile ${p.id}`);
                      }
                    } else {
                      log("warn", `Fallback guild fetch failed for profile ${p.id}; status=${guildsRes.status}`);
                    }
                  } catch (fetchErr) {
                    log("warn", `Error fetching guilds for profile ${p.id}:`, fetchErr);
                    return done(null, false, { message: "Discord member lookup failed", code: "member_fetch_failed" });
                  }
                }
              }
            }

            const matched = await findMatchedGuild(p);
            if (!matched) {
              // Log user ID only, don't expose guild IDs in logs
              log(
                "warn",
                `No configured guild matched for profile ${p.id}`,
              );
              return done(null, false, { message: "Not in required guild", code: "missing_guild" });
            }

            const { guildId, requiredRole, mode } = matched as any;

            // If user is whitelisted, allow access regardless of guild membership
            if (mode === "whitelist") {
              const cacheUpdatedAt = Date.now();
              const cacheGuildIds = (p.guilds || []).map((g) => g.id);
              try {
                await upsertKnownDiscordUser(p.id, p.username || null);
              } catch (err) {
                log("warn", "Failed to upsert known user (whitelist login)", {
                  userId: p.id,
                  error: err instanceof Error ? err.message : String(err),
                });
              }
              return done(null, {
                type: "discord",
                id: p.id,
                username: p.username || "",
                avatar: p.avatar,
                discriminator: p.discriminator ?? null,
                guild: null,
                hasRole: true,
                isAdmin: false,
                devBypass: false,
                cachedGuildIds: cacheGuildIds,
                cachedMemberRoles: [],
                cacheUpdatedAt,
                lastCheck: cacheUpdatedAt,
                accessToken,
                refreshToken,
                expires: Date.now() + 10 * 60 * 60 * 1000,
                scope: "identify guilds guilds.members.read",
              });
            }

            let hasRole = true;
            let memberRoles: string[] = [];

            // If a role is required, fetch member roles using OAuth endpoint:
            // GET /users/@me/guilds/{guild.id}/member (needs guilds.members.read)
            const requiredRolesFromConfig = requiredRole
              ? Array.isArray(requiredRole)
                ? requiredRole
                : [requiredRole]
              : [];

            const rolesToCheck = requiredRolesFromConfig.length ? requiredRolesFromConfig : REQUIRED_ROLE_IDS;

            if (rolesToCheck.length) {
              const memberRes = await fetch(discordApiUrl(`/users/@me/guilds/${guildId}/member`), {
                headers: { Authorization: `Bearer ${accessToken}` },
              });

              if (!memberRes.ok) {
                log("warn", `Unable to fetch member info for guild ${guildId}; status=${memberRes.status}`);
                return done(null, false, { message: "Cannot fetch guild member", code: "member_fetch_failed" });
              }

              const member: { roles?: string[] } = await memberRes.json();
              const roles = Array.isArray(member.roles) ? member.roles : [];
              hasRole = roles.some((r) => rolesToCheck.includes(r));
              memberRoles = roles;

              if (!hasRole) return done(null, false, { message: "Missing required role", code: "missing_role" });
            }

          // Store Discord OAuth tokens server-side AND encrypt in JWT
          // NOTE: Moved to JWT - no database storage needed

          // Encrypt tokens for JWT inclusion
          let tokenExpiresAt: number | undefined;
          const tokenScope = "identify guilds guilds.members.read";
          
          // Discord tokens typically expire in ~10 hours (36000 seconds)
          // This is a default; ideally would come from Discord's OAuth response
          tokenExpiresAt = Date.now() + 10 * 60 * 60 * 1000;

          const cacheUpdatedAt = Date.now();
          const cacheGuildIds = (p.guilds || []).map((g) => g.id);
          try {
            await upsertKnownDiscordUser(p.id, p.username || null);
          } catch (err) {
            log("warn", "Failed to upsert known user (discord login)", {
              userId: p.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          return done(null, {
            type: "discord",
            id: p.id,
            username: p.username || "",
            avatar: p.avatar,
            discriminator: p.discriminator ?? null,
            guild: guildId,
            hasRole,
            isAdmin: false,
            devBypass: false,
            cachedGuildIds: cacheGuildIds,
            cachedMemberRoles: memberRoles,
            cacheUpdatedAt,
            lastCheck: cacheUpdatedAt,
            accessToken,
            refreshToken,
            expires: tokenExpiresAt,
            scope: tokenScope,
          });
          } catch (err) {
            log("error", "Discord strategy error:", err);
            return done(null, false, { message: "Discord auth error", code: "discord_error" });
          }
        },
      ),
    );

    log("info", "Discord strategy registered successfully");
  } catch (err) {
    log("error", "Failed to initialize Discord strategy:", err);
  }
} else {
  log("error", "Missing Discord OAuth env vars. Set DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_CALLBACK_URL");
}

// Initialize JWT strategy with JWKS key resolution
initializePassportJWTStrategy();
initializePassportSerialization();

// ---------------------------------------------------------------------------
// Auth middleware: validate JWT + validate guild/role (auto-refresh OAuth tokens)
// ---------------------------------------------------------------------------
async function discordFetchJson(
  accessToken: string,
  url: string,
  opts?: { retryOn401?: boolean; retryOn429?: boolean; retryDelayMs?: number },
): Promise<{ ok: boolean; status: number; json?: any; retryAfterMs?: number }> {
  const retryOn401 = opts?.retryOn401 ?? true;
  const retryOn429 = opts?.retryOn429 ?? true;
  const retryDelayMs = opts?.retryDelayMs;

  if (!accessToken) return { ok: false, status: 401 };

  const doFetch = async (token: string) => {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const retryAfterHeader = res.headers?.get?.("retry-after");
      const retryAfterSec = Number(retryAfterHeader);
      const retryAfterMs =
        Number.isFinite(retryAfterSec) && retryAfterSec >= 0 ? retryAfterSec * 1000 : undefined;
      return { ok: false, status: res.status, json, retryAfterMs };
    }

    return { ok: true, status: res.status, json };
  };

  const first = await doFetch(accessToken);
  if (first.ok) return first;

  if (retryOn429 && first.status === 429) {
    const waitMs = Math.min(Math.max(first.retryAfterMs ?? retryDelayMs ?? 1000, 250), 5000);
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    return await doFetch(accessToken);
  }

  if (retryOn401 && first.status === 401) {
    // Note: Token refresh should be handled by caller via JWT refresh flow
    // Returning 401 to signal caller to refresh JWT
    return first;
  }

  return first;
}

function extractRequestToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  if (req.cookies?.auth_token) {
    return req.cookies.auth_token;
  }
  return undefined;
}

function getCachedMemberRoles(user: AuthUser): string[] | undefined {
  return Array.isArray(user.cachedMemberRoles) ? user.cachedMemberRoles : undefined;
}

function computeIsAdminFromDecoded(user: AuthUser): boolean {
  if (user.devBypass) {
    // Dev bypass users should honor the admin bit minted into the dev token.
    return Boolean(user.isAdmin);
  }
  // For Discord-authenticated sessions, trust the JWT claim.
  // Admin privileges are derived from permissions (superuser/admin:*), not hard-coded user ID lists.
  return Boolean(user.isAdmin);
}

function buildAuthStatusUser(
  user: AuthUser,
  computedIsAdmin: boolean,
  overrides: Partial<AuthStatusUser> = {},
): AuthStatusUser {
  const out: AuthStatusUser = {
    id: user.id,
    username: user.username,
    avatar: user.avatar ?? null,
    discriminator: user.discriminator ?? null,
    guild: user.guild ?? null,
    hasRole: user.hasRole ?? false,
    isAdmin: computedIsAdmin,
    ...overrides,
  };
  const cachedMemberRoles = getCachedMemberRoles(user);
  if (Array.isArray(cachedMemberRoles)) {
    out.cachedMemberRoles = cachedMemberRoles;
  }
  return out;
}

function setAuthenticatedStatus(
  req: AuthRequest,
  user: AuthUser,
  computedIsAdmin: boolean,
  overrides: Partial<AuthStatusUser> = {},
  devBypass = false,
) {
  req.authStatus = {
    authenticated: true,
    user: buildAuthStatusUser(user, computedIsAdmin, overrides),
    ...(devBypass ? { devBypass: true } : {}),
  };
}

function getTokenLastCheck(user: AuthUser): number | null {
  if (user.type !== "discord") {
    return null;
  }
  if (typeof user.lastCheck === "number") {
    return user.lastCheck;
  }
  if (typeof user.cacheUpdatedAt === "number") {
    return user.cacheUpdatedAt;
  }
  return null;
}

function getTokenJti(user: AuthUser): string | undefined {
  return user.type === "discord" ? user.jti : undefined;
}

function getDiscordAccessToken(user: AuthUser): string | undefined {
  if (user.type !== "discord") {
    return undefined;
  }
  return user.accessToken ?? undefined;
}

function getDiscordRefreshToken(user: AuthUser): string | undefined {
  if (user.type !== "discord") return undefined;
  return user.refreshToken ?? undefined;
}

/**
 * JWT validation middleware with automatic Discord re-validation when stale.
 * 
 * Behavior:
 * - Fresh cache (< 10 min): Validates JWT only, returns cached guild/role
 * - Stale cache (> 10 min): Re-validates guild/role via Discord API
 * - If Discord API fails on stale cache: Falls back to cached values
 * 
 * Use on most endpoints for fast auth with periodic Discord re-validation.
 */
export async function validateJWTOnly(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) {
  req.authStatus = { authenticated: false } as AuthStatus;
  const logValidation = (reason: string, info?: Record<string, unknown>) => {
    logger.debug(`[auth] validateJWTOnly ${req.method} ${req.originalUrl} ${reason}`, info);
  };

  try {
    const token = extractRequestToken(req);

    if (!token) {
      req.authStatus = { authenticated: false, reason: "no_token" };
      logValidation("no_token");
      return next();
    }

    const decoded = await verifyJWTAsync(token);

    if (!decoded) {
      req.authStatus = { authenticated: false, reason: "invalid_token" };
      logValidation("invalid_token");
      return next();
    }

    // Check if token has been revoked
    const tokenJti = getTokenJti(decoded);
    if (tokenJti) {
      const isRevoked = await isTokenRevoked(tokenJti);
      if (isRevoked) {
        req.authStatus = { authenticated: false, reason: "token_revoked" };
        logValidation("token_revoked", { jti: tokenJti.slice(0, 8) });
        return next();
      }
    }

    req.user = decoded;
    const computedIsAdmin = computeIsAdminFromDecoded(decoded);

    // Discord sessions require OAuth tokens in HttpOnly cookies. If missing, treat the JWT as invalid.
    if (!decoded.devBypass && decoded.type === "discord") {
      const accessCookie = typeof req.cookies?.discord_access_token === "string" ? req.cookies.discord_access_token : "";
      const refreshCookie = typeof req.cookies?.discord_refresh_token === "string" ? req.cookies.discord_refresh_token : "";
      if (!accessCookie.trim() || !refreshCookie.trim()) {
        req.authStatus = { authenticated: false, reason: "missing_oauth_cookies" };
        logValidation("missing_oauth_cookies", { userId: decoded.id });
        return next();
      }
    }

    if (!decoded.hasRole && !(decoded as any).devBypass) {
      req.authStatus = { authenticated: false, reason: "missing_role" };
      logValidation("missing_role_token");
      return next();
    }

    // For dev bypass, trust the JWT completely
    if (decoded.devBypass) {
      setAuthenticatedStatus(req, decoded, computedIsAdmin, { hasRole: true }, true);
      await upsertKnownDiscordUser(decoded.id, decoded.username);
      return next();
    }

    // Check cache age for Discord guild/role data
    const now = Date.now();
    const lastCheck = getTokenLastCheck(decoded);
    const cacheAge = lastCheck !== null ? now - lastCheck : null;
    const cacheAgeMinutes = cacheAge !== null ? Math.round(cacheAge / 1000 / 60) : null;
    const STALE_CACHE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
    const isCacheStale = cacheAge !== null && cacheAge > STALE_CACHE_THRESHOLD_MS;

    if (isCacheStale && cacheAgeMinutes !== null) {
      logValidation("cache_stale_validating_discord", { 
        cacheAgeMinutes, 
        userId: decoded.id, 
        guild: decoded.guild
      });

    // Cache is stale - re-validate guild/role with Discord
      const accessTokenFromCookie = typeof req.cookies?.discord_access_token === "string" ? req.cookies.discord_access_token : undefined;
      const accessToken = accessTokenFromCookie || getDiscordAccessToken(decoded);
      if (accessToken) {
        try {
          // Fetch current guild list
          const guildsRes = await fetchWithRateLimitBackoff(
            accessToken,
              discordApiUrl("/users/@me/guilds"),
            { retryOn401: true, retryOn429: false }
          );

          if (!guildsRes.ok) {
            logValidation("cache_stale_guild_fetch_failed", {
              status: guildsRes.status,
              userId: decoded.id,
            });
            // If Discord rejects the access token, treat JWT session as invalid.
            if (guildsRes.status === 401) {
              req.authStatus = { authenticated: false, reason: "oauth_invalid" };
              logValidation("oauth_invalid", { userId: decoded.id });
              return next();
            }
            // Fall back to cached values for transient failures.
            setAuthenticatedStatus(req, decoded, computedIsAdmin);
            await upsertKnownDiscordUser(decoded.id, decoded.username);
            return next();
          }

          const guilds: DiscordGuild[] = Array.isArray(guildsRes.json) ? guildsRes.json : [];
          const { requiredRolesByGuild } = await loadLoginConstraintsCached();
          const configuredGuildIds =
            Object.keys(requiredRolesByGuild || {}).length > 0
              ? Object.keys(requiredRolesByGuild || {})
              : Object.keys(fileConfig.guilds || {});

          let matchedGuildId: string | null = null;
          for (const g of guilds) {
            if (configuredGuildIds.includes(g.id)) {
              matchedGuildId = g.id;
              break;
            }
          }

          // Fallback to env-provided guild ids
          if (!matchedGuildId && DISCORD_GUILD_ID) {
            const envIds = DISCORD_GUILD_ID.split(",").map((s) => s.trim()).filter(Boolean);
            for (const g of guilds) {
              if (envIds.includes(g.id)) {
                matchedGuildId = g.id;
                break;
              }
            }
          }

          if (!matchedGuildId) {
            // Allow whitelisted users to authenticate outside configured guilds
            const { whitelistUsers } = await loadLoginConstraintsCached();
            if (decoded.id && whitelistUsers.includes(decoded.id)) {
              setAuthenticatedStatus(req, decoded, computedIsAdmin, { guild: null, hasRole: true });
              await upsertKnownDiscordUser(decoded.id, decoded.username);
              logValidation("cache_stale_whitelist_allowed", { userId: decoded.id });
              return next();
            }

            req.authStatus = { authenticated: false, reason: "guild_membership_revoked" };
            logValidation("cache_stale_not_in_guild", { userId: decoded.id });
            return next();
          }

          // Check role if required
          let hasRole = true;
          const requiredRolesFromConfig = requiredRolesByGuild?.[matchedGuildId] ?? [];
          const rolesToCheck = requiredRolesFromConfig.length ? requiredRolesFromConfig : REQUIRED_ROLE_IDS;

          if (rolesToCheck.length) {
            const memberRes = await fetchWithRateLimitBackoff(
              accessToken,
              discordApiUrl(`/users/@me/guilds/${matchedGuildId}/member`),
              { retryOn401: true, retryOn429: false }
            );

            if (!memberRes.ok) {
              logValidation("cache_stale_member_fetch_failed", {
                status: memberRes.status,
                userId: decoded.id,
              });
              if (memberRes.status === 401) {
                req.authStatus = { authenticated: false, reason: "oauth_invalid" };
                logValidation("oauth_invalid", { userId: decoded.id });
                return next();
              }
              // Fall back to cached values
              setAuthenticatedStatus(req, decoded, computedIsAdmin);
              await upsertKnownDiscordUser(decoded.id, decoded.username);
              return next();
            }

            const member: { roles?: string[] } = memberRes.json || {};
            const roles = Array.isArray(member.roles) ? member.roles : [];
            hasRole = roles.some((r) => rolesToCheck.includes(r));

            if (!hasRole) {
              req.authStatus = { authenticated: false, reason: "role_revoked" };
              logValidation("cache_stale_role_revoked", { userId: decoded.id });
              return next();
            }
          }

          // Guild/role validated successfully
          setAuthenticatedStatus(req, decoded, computedIsAdmin, {
            guild: matchedGuildId,
            hasRole,
          });
          await upsertKnownDiscordUser(decoded.id, decoded.username);
          logValidation("cache_stale_revalidated", {
            userId: decoded.id,
            guild: matchedGuildId,
            hasRole,
            cacheAgeMinutes,
          });
          return next();
        } catch (err) {
          logValidation("cache_stale_validation_error", {
            error: err instanceof Error ? err.message : String(err),
            userId: decoded.id,
          });
          // Fall back to cached values on error
          setAuthenticatedStatus(req, decoded, computedIsAdmin);
          await upsertKnownDiscordUser(decoded.id, decoded.username);
          return next();
        }
      }
    } else if (cacheAgeMinutes !== null && cacheAgeMinutes > 0) {
      logValidation("cache_age", { 
        cacheAgeMinutes, 
        userId: decoded.id,
        fresh: !isCacheStale
      });
    }

    // JWT is valid, user is authenticated. Use cached values from JWT.
    setAuthenticatedStatus(req, decoded, computedIsAdmin);
    await upsertKnownDiscordUser(decoded.id, decoded.username);

    logValidation("authenticated_via_jwt", { 
      userId: decoded.id, 
      guild: decoded.guild, 
      hasRole: decoded.hasRole,
      cacheAgeMinutes
    });
    return next();
  } catch (err: unknown) {
    log("error", "[JWT Validation] Unexpected error:", err);
    logValidation("unexpected_error", { error: err instanceof Error ? err.message : String(err) });
    req.authStatus = { authenticated: false, reason: "unexpected_error" };
    return next();
  }
}

/**
 * Full session validation with Discord guild/role re-check (CALLS DISCORD API).
 * Use this ONLY on endpoints that absolutely need current Discord guild/role verification.
 * Most endpoints should use validateJWTOnly instead to avoid API spam.
 */
export async function validateAndRefreshSession(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) {
  req.authStatus = { authenticated: false } as AuthStatus;
  const logValidation = (reason: string, info?: Record<string, unknown>) => {
    logger.debug(`[auth] validateAndRefreshSession ${req.method} ${req.originalUrl} ${reason}`, info);
  };

  try {
    const token = extractRequestToken(req);

    if (!token) {
      req.authStatus = { authenticated: false, reason: "no_token" };
      logValidation("no_token");
      return next();
    }

    const decoded = await verifyJWTAsync(token);

    if (!decoded) {
      req.authStatus = { authenticated: false, reason: "invalid_token" };
      logValidation("invalid_token");
      return next();
    }

    // Check if token has been revoked
    const tokenJti = getTokenJti(decoded);
    if (tokenJti) {
      const isRevoked = await isTokenRevoked(tokenJti);
      if (isRevoked) {
        req.authStatus = { authenticated: false, reason: "token_revoked" };
        logValidation("token_revoked", { jti: tokenJti.slice(0, 8) });
        return next();
      }
    }

    req.user = decoded;
    const computedIsAdmin = computeIsAdminFromDecoded(decoded);

    // Dev bypass: trust the JWT
    if (decoded.devBypass) {
      setAuthenticatedStatus(req, decoded, computedIsAdmin, { hasRole: true }, true);
      await upsertKnownDiscordUser(decoded.id, decoded.username);
      return next();
    }

    // Tokens can come from HttpOnly cookies (preferred) or legacy JWT embedding.
    const accessTokenCookie = typeof req.cookies?.discord_access_token === "string" ? req.cookies.discord_access_token : undefined;
    const refreshTokenCookie = typeof req.cookies?.discord_refresh_token === "string" ? req.cookies.discord_refresh_token : undefined;

    let accessToken = accessTokenCookie || getDiscordAccessToken(decoded);
    const refreshToken = refreshTokenCookie || getDiscordRefreshToken(decoded);
    if (!accessToken || !refreshToken) {
      req.authStatus = { authenticated: false, reason: "no_oauth_tokens" };
      logValidation("no_oauth_tokens");
      return next();
    }

    const now = Date.now();
    const requestMethod = typeof req.method === "string" ? req.method.toUpperCase() : "";
    const isMutatingRequest = ["POST", "PUT", "PATCH", "DELETE"].includes(requestMethod);
    const cacheTtlMs = isMutatingRequest ? MUTATION_CACHE_TTL_MS : CACHE_TTL_MS;
    const lastCheck = getTokenLastCheck(decoded);
    const cacheAge = lastCheck !== null ? now - lastCheck : null;
    const cacheFresh =
      cacheAge !== null && cacheAge <= cacheTtlMs && Boolean(decoded.guild) && Boolean(decoded.hasRole);

    if (cacheFresh) {
      logValidation("cache_hit", { cacheAge });
      setAuthenticatedStatus(req, decoded, computedIsAdmin);
      await upsertKnownDiscordUser(decoded.id, decoded.username);
      return next();
    }

    // 1) Fetch guild list (/users/@me/guilds)
    let guildsRes = await fetchWithRateLimitBackoff(accessToken, discordApiUrl("/users/@me/guilds"), {
      retryOn401: true,
      retryOn429: false,
    });
    if (!guildsRes.ok && guildsRes.status === 401) {
      if (!refreshToken) {
        req.authStatus = { authenticated: false, reason: "oauth_invalid" };
        logValidation("oauth_invalid", { userId: decoded.id });
        return next();
      }
      try {
        const refreshed = await refreshAccessToken({
          ...(decoded as any),
          refreshToken,
        } as any);
        if ((refreshed as any)?.accessToken) {
          accessToken = String((refreshed as any).accessToken);
          (req as any).refreshedDiscordTokens = refreshed;
          guildsRes = await fetchWithRateLimitBackoff(accessToken, discordApiUrl("/users/@me/guilds"), {
            retryOn401: false,
            retryOn429: false,
          });
        }
      } catch (err) {
        logValidation("token_refresh_failed", { error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (!guildsRes.ok) {
      if (guildsRes.status === 401) {
        req.authStatus = { authenticated: false, reason: "oauth_invalid" };
        logValidation("oauth_invalid", { userId: decoded.id });
        return next();
      }
      req.authStatus = { authenticated: false, reason: "guild_fetch_failed" };
      logValidation("guild_fetch_failed", {
        status: guildsRes.status,
        retryAfterMs: guildsRes.retryAfterMs,
      });
      return next();
    }

    const guilds: DiscordGuild[] = Array.isArray(guildsRes.json) ? guildsRes.json : [];
    const { requiredRolesByGuild } = await loadLoginConstraintsCached();
    const configuredGuildIds =
      Object.keys(requiredRolesByGuild || {}).length > 0
        ? Object.keys(requiredRolesByGuild || {})
        : Object.keys(fileConfig.guilds || {});

    let matchedGuildId: string | null = null;

    for (const g of guilds) {
      if (configuredGuildIds.includes(g.id)) {
        matchedGuildId = g.id;
        break;
      }
    }

    // Fallback to env-provided guild ids
    if (!matchedGuildId && DISCORD_GUILD_ID) {
      const envIds = DISCORD_GUILD_ID.split(",").map((s) => s.trim()).filter(Boolean);
      for (const g of guilds) {
        if (envIds.includes(g.id)) {
          matchedGuildId = g.id;
          break;
        }
      }
    }

    if (!matchedGuildId) {
      // Allow whitelisted users to pass even if not currently in guild
      const { whitelistUsers } = await loadLoginConstraintsCached();
      if (decoded.id && whitelistUsers.includes(decoded.id)) {
        setAuthenticatedStatus(req, decoded, computedIsAdmin, { guild: null, hasRole: true });
        await upsertKnownDiscordUser(decoded.id, decoded.username);
        logValidation("whitelist_allowed", { userId: decoded.id });
        return next();
      }

      req.authStatus = { authenticated: false, reason: "not_in_guild" };
      logValidation("not_in_guild");
      return next();
    }

    // 2) Check role (optional) via /users/@me/guilds/{guild.id}/member
    const requiredRolesFromConfig = requiredRolesByGuild?.[matchedGuildId] ?? [];

    const rolesToCheck = requiredRolesFromConfig.length ? requiredRolesFromConfig : REQUIRED_ROLE_IDS;

    let hasRole = true;
    let memberRoles: string[] = [];

    if (rolesToCheck.length) {
      const memberRes = await fetchWithRateLimitBackoff(accessToken, discordApiUrl(`/users/@me/guilds/${matchedGuildId}/member`), {
        retryOn401: true,
        retryOn429: false,
      });

      if (!memberRes.ok) {
        req.authStatus = { authenticated: false, reason: "member_fetch_failed" };
        logValidation("member_fetch_failed", {
          status: memberRes.status,
          retryAfterMs: memberRes.retryAfterMs,
        });
        return next();
      }

      const member: { roles?: string[] } = memberRes.json || {};
      const roles = Array.isArray(member.roles) ? member.roles : [];
      hasRole = roles.some((r) => rolesToCheck.includes(r));
      memberRoles = roles;

      if (!hasRole) {
        req.authStatus = { authenticated: false, reason: "missing_role" };
        logValidation("missing_role");
        return next();
      }
    }

    // Success: build status
    const computedGuild = matchedGuildId;
    const computedHasRole = hasRole;

    setAuthenticatedStatus(req, decoded, computedIsAdmin, {
      guild: computedGuild,
      hasRole: computedHasRole,
      cachedMemberRoles: memberRoles,
    });
    await upsertKnownDiscordUser(decoded.id, decoded.username);

    // Rotate JWT if claims changed (keeps your JWT-based APIs consistent)
    const cacheUpdatedAt = Date.now();
    const cachedGuildIds = guilds.map((g) => g.id);
    const cachedMemberRoles = memberRoles;
    const previousCachedGuildIds = decoded.type === "discord" ? decoded.cachedGuildIds : undefined;
    const previousCachedMemberRoles = decoded.type === "discord" ? decoded.cachedMemberRoles : undefined;
    const claimsChanged =
      (decoded.guild ?? null) !== computedGuild ||
      Boolean(decoded.hasRole) !== computedHasRole ||
      Boolean(decoded.isAdmin) !== computedIsAdmin ||
      JSON.stringify(previousCachedGuildIds ?? []) !== JSON.stringify(cachedGuildIds) ||
      JSON.stringify(previousCachedMemberRoles ?? []) !== JSON.stringify(cachedMemberRoles);

    // Sync Discord roles to Casbin policies (groups them for authorization checks)
    try {
      const rolesByGuild = new Map<string, string[]>();
      rolesByGuild.set(matchedGuildId, memberRoles);
      await syncDiscordRolesForUser(
        decoded.id,
        [{ id: matchedGuildId }],
        rolesByGuild,
        computedIsAdmin
      );
    } catch (syncErr) {
      log("warn", "[JWT Validation] Failed to sync Discord roles to Casbin:", syncErr);
      // Continue anyway - sync failure shouldn't block the request
    }

    const shouldRotate =
      claimsChanged ||
      lastCheck === null ||
      (cacheAge !== null && cacheAge > cacheTtlMs);

    if (shouldRotate) {
      req.rotatedToken = await generateJWT({
        ...(decoded as any),
        guild: computedGuild,
        hasRole: computedHasRole,
        isAdmin: computedIsAdmin,
        cacheUpdatedAt,
        lastCheck: cacheUpdatedAt,
        cachedGuildIds,
        cachedMemberRoles,
      });
    }

    logValidation("authenticated", {
      userId: decoded.id,
      guild: computedGuild,
      hasRole: computedHasRole,
      cacheUpdatedAt,
    });
    return next();
  } catch (err: unknown) {
    log("error", "[JWT Validation] Unexpected error:", err);
    logValidation("unexpected_error", { error: err instanceof Error ? err.message : String(err) });
    req.authStatus = { authenticated: false, reason: "unexpected_error" };
    return next();
  }
}

// JWKS has been removed (JWTs are HS256 with DB-backed secret rotation).
