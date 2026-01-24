import passport from "passport";
import { Strategy as DiscordStrategy } from "@oauth-everything/passport-discord";
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Done = (err: Error | null, user?: AuthUser | false, info?: unknown) => void;

interface DiscordGuild {
  id: string;
}
interface DiscordProfile {
  id: string;
  username?: string;
  avatar?: string | null;
  discriminator?: string;
  guilds?: DiscordGuild[];
}

interface AuthUser {
  id: string;
  username: string;
  avatar?: string | null;
  discriminator?: string | null;
  guild?: string | null;
  hasRole?: boolean;
  devBypass?: boolean;
}

interface AuthStatusUser {
  id: string;
  username?: string;
  avatar?: string | null;
  discriminator?: string | null;
  guild?: string | null;
  hasRole?: boolean;
}

interface AuthStatus {
  authenticated: boolean;
  reason?: string;
  user?: AuthStatusUser;
  devBypass?: boolean;
}

const {
  DISCORD_ROLE_ID,
  DISCORD_GUILD_ID,
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_CALLBACK_URL,
} = process.env as Record<string, string | undefined>;

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || "dev-jwt-secret-change-in-production";
const JWT_EXPIRATION = process.env.JWT_EXPIRY || "7d";

// ---------------------------------------------------------------------------
// Server-side token vault (IN-MEMORY)
// Replace with Redis/DB if you run multiple instances or need persistence.
// ---------------------------------------------------------------------------
type OAuthTokens = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
  scope?: string | null;
};

const tokenVault = new Map<string, OAuthTokens>();

function setTokens(userId: string, tokens: OAuthTokens) {
  tokenVault.set(userId, tokens);
}
function getTokens(userId: string): OAuthTokens | null {
  return tokenVault.get(userId) || null;
}
export function clearDiscordTokensForUser(userId: string) {
  tokenVault.delete(userId);
}

// Config file location for guild <-> role mapping
const __filename = fileURLToPath(import.meta.url);
const __dirname_local = path.dirname(__filename);
const CONFIG_DIR = path.resolve(__dirname_local, "..", "..", "config");
const CONFIG_PATH = path.join(CONFIG_DIR, "discord-auth.json");

// Ensure config dir exists
try {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
} catch {}

// Default config
const DEFAULT_CONFIG = {
  guilds: {
    // "123456789012345678": { "requiredRole": "1111222233334444", "name": "Project Guild" }
  },
};

let fileConfig: any = DEFAULT_CONFIG;
try {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), { encoding: "utf8" });
    log("info", `Created default discord-auth.json at ${CONFIG_PATH}`);
  } else {
    const raw = fs.readFileSync(CONFIG_PATH, { encoding: "utf8" });
    fileConfig = JSON.parse(raw || "{}");
    log("info", `Loaded discord-auth.json from ${CONFIG_PATH}`);
  }
} catch (err) {
  log("warn", `Could not load or create discord-auth.json (${CONFIG_PATH}); falling back to env vars`);
  fileConfig = DEFAULT_CONFIG;
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

// Helper to find matched guild and required role from config
function findMatchedGuild(profile: DiscordProfile) {
  const guilds = profile.guilds || [];
  const configured = Object.keys(fileConfig.guilds || {});
  for (const g of guilds) {
    if (configured.includes(g.id)) {
      return { guildId: g.id, requiredRole: fileConfig.guilds[g.id]?.requiredRole ?? null };
    }
  }

  // fallback to env var guild id if present
  if (DISCORD_GUILD_ID) {
    const envIds = DISCORD_GUILD_ID.split(",").map((s) => s.trim()).filter(Boolean);
    for (const g of guilds) {
      if (envIds.includes(g.id)) {
        return {
          guildId: g.id,
          requiredRole: fileConfig.guilds?.[g.id]?.requiredRole ?? (REQUIRED_ROLE_IDS[0] ?? null),
        };
      }
    }
  }

  return null;
}

function log(level: "info" | "warn" | "error", ...args: unknown[]) {
  const ts = new Date().toISOString();
  const fn = console[level] as unknown as (...a: unknown[]) => void;
  fn(`[${ts}] [discord passport]`, ...args);
}

// JWT token generation helper (NO discord OAuth tokens inside JWT)
export function generateJWT(user: AuthUser): string {
  const payload = {
    sub: user.id,
    username: user.username,
    avatar: user.avatar ?? null,
    discriminator: user.discriminator ?? null,
    guild: user.guild ?? null,
    hasRole: user.hasRole ?? false,
    devBypass: user.devBypass ?? false,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRATION });
}

// JWT token validation helper
export function verifyJWT(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const id = decoded?.sub ? String(decoded.sub) : null;
    if (!id) return null;

    return {
      id,
      username: decoded.username ? String(decoded.username) : "",
      avatar: decoded.avatar ?? null,
      discriminator: decoded.discriminator ?? null,
      guild: decoded.guild ?? null,
      hasRole: Boolean(decoded.hasRole),
      devBypass: Boolean(decoded.devBypass),
    };
  } catch (err) {
    log("warn", "JWT verification failed:", err);
    return null;
  }
}

// Truthy env parsing for DEV_LOGIN_MODE
function envFlag(name: string): boolean {
  const v = process.env[name];
  if (!v) return false;
  return ["true", "1", "yes", "y", "on"].includes(String(v).trim().toLowerCase());
}

const DEV_LOGIN_MODE = envFlag("DEV_LOGIN_MODE");

// ---------------------------------------------------------------------------
// Discord token refresh (server-side, uses vault refreshToken)
// ---------------------------------------------------------------------------
export async function refreshAccessToken(user: AuthUser) {
  if (user.devBypass) {
    log("info", `[DevBypass] No refresh needed for ${user.username} (${user.id})`);
    return { devBypass: true };
  }

  const t = getTokens(user.id);
  if (!t?.refreshToken) throw new Error("No refresh token available (server-side)");

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID || "",
    client_secret: DISCORD_CLIENT_SECRET || "",
    grant_type: "refresh_token",
    refresh_token: t.refreshToken || "",
    redirect_uri: DISCORD_CALLBACK_URL || "",
    scope: "identify guilds guilds.members.read",
  });

  const res = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`Failed to refresh token (status ${res.status}): ${msg}`);
  }

  const json: any = await res.json();
  const accessToken = String(json.access_token || "");
  const refreshToken = json.refresh_token ? String(json.refresh_token) : t.refreshToken;
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : null;

  if (!accessToken) throw new Error("Refresh succeeded but access_token missing");

  setTokens(user.id, {
    accessToken,
    refreshToken,
    expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : null,
    scope: json.scope ? String(json.scope) : null,
  });

  log("info", `Token refreshed for ${user.username} (${user.id})`);
  return { accessToken, refreshToken, expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : null };
}

// ---------------------------------------------------------------------------
// Passport Discord strategy
// ---------------------------------------------------------------------------
if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !DISCORD_CALLBACK_URL) {
  if (DEV_LOGIN_MODE) {
    log("warn", "Discord env vars missing/incomplete; DEV_LOGIN_MODE active; registering dev bypass strategy");
    passport.use(
      "discord-dev-bypass",
      new DiscordStrategy(
        {
          clientID: "dev",
          clientSecret: "dev",
          callbackURL: "/auth/discord/callback",
          scope: ["identify"],
        },
          (_accessToken: string, _refreshToken: string, profile: DiscordProfile, done: Done) => {
          const user: AuthUser =
            (profile && {
              id: profile.id,
              username: profile.username || "dev-user",
              avatar: profile.avatar,
              discriminator: profile.discriminator ?? "0000",
            }) || {
              id: "dev",
              username: "dev-user",
              avatar: null,
              discriminator: "0000",
            };
          user.devBypass = true;
          return done(null, user);
        },
      ),
    );
  } else {
    log("error", "Missing Discord OAuth env vars. Set DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_CALLBACK_URL");
  }
} else {
  try {
    passport.use(
      "discord",
      new DiscordStrategy(
        {
          clientID: DISCORD_CLIENT_ID,
          clientSecret: DISCORD_CLIENT_SECRET,
          callbackURL: DISCORD_CALLBACK_URL,
          scope: ["identify", "guilds", "guilds.members.read"],
        },
        async (accessToken: string, refreshToken: string, profile: DiscordProfile, done: Done) => {
          log("info", `Discord login attempt for profile: ${profile.id} ${profile.username ?? ""}`);

          try {
            // Some OAuth libraries don't always populate guilds reliably — fetch guilds if missing.
            if ((!profile.guilds || profile.guilds.length === 0) && accessToken) {
              try {
                const guildsRes = await fetch("https://discord.com/api/users/@me/guilds", {
                  headers: { Authorization: `Bearer ${accessToken}` },
                });
                if (guildsRes.ok) {
                  const guildsJson = await guildsRes.json();
                  if (Array.isArray(guildsJson)) {
                    profile.guilds = guildsJson.map((g: any) => ({ id: String(g.id) }));
                    log("info", `Fetched ${profile.guilds.length} guilds via API for profile ${profile.id}`);
                  }
                } else {
                  log("warn", `Fallback guild fetch failed for profile ${profile.id}; status=${guildsRes.status}`);
                }
              } catch (fetchErr) {
                log("warn", `Error fetching guilds for profile ${profile.id}:`, fetchErr);
              }
            }

            const matched = findMatchedGuild(profile);
            if (!matched) {
              log(
                "warn",
                `No configured guild matched for profile ${profile.id}; profileGuilds=${JSON.stringify(
                  (profile.guilds || []).map((g) => g.id),
                )}`,
              );
              return done(null, false, { message: "Not in required guild", code: "missing_guild" });
            }

            const { guildId, requiredRole } = matched;

            let hasRole = true;

            // If a role is required, fetch member roles using OAuth endpoint:
            // GET /users/@me/guilds/{guild.id}/member (needs guilds.members.read)
            const requiredRolesFromConfig = requiredRole
              ? Array.isArray(requiredRole)
                ? requiredRole
                : [requiredRole]
              : [];

            const rolesToCheck = requiredRolesFromConfig.length ? requiredRolesFromConfig : REQUIRED_ROLE_IDS;

            if (rolesToCheck.length) {
              const memberRes = await fetch(`https://discord.com/api/users/@me/guilds/${guildId}/member`, {
                headers: { Authorization: `Bearer ${accessToken}` },
              });

              if (!memberRes.ok) {
                log("warn", `Unable to fetch member info for guild ${guildId}; status=${memberRes.status}`);
                return done(null, false, { message: "Cannot fetch guild member", code: "member_fetch_failed" });
              }

              const member: { roles?: string[] } = await memberRes.json();
              const roles = Array.isArray(member.roles) ? member.roles : [];
              hasRole = roles.some((r) => rolesToCheck.includes(r));

              if (!hasRole) return done(null, false, { message: "Missing required role", code: "missing_role" });
            }

            // Store Discord OAuth tokens server-side (NOT inside JWT)
            setTokens(profile.id, {
              accessToken,
              refreshToken,
              expiresAt: null,
              scope: "identify guilds guilds.members.read",
            });

            return done(null, {
              id: profile.id,
              username: profile.username || "",
              avatar: profile.avatar,
              discriminator: profile.discriminator ?? null,
              guild: guildId,
              hasRole,
              devBypass: false,
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
}

// ---------------------------------------------------------------------------
// passport-jwt strategy (optional; you aren't using it directly, but safe to keep)
// ---------------------------------------------------------------------------
try {
  passport.use(
    "jwt",
    new JwtStrategy(
      {
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: JWT_SECRET,
      },
      async (payload: any, done: Done) => {
        try {
          const user: AuthUser = {
            id: String(payload.sub),
            username: payload.username ? String(payload.username) : "",
            avatar: payload.avatar ?? null,
            discriminator: payload.discriminator ?? null,
            guild: payload.guild ?? null,
            hasRole: Boolean(payload.hasRole),
            devBypass: Boolean(payload.devBypass),
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

// serialize/deserialize kept for compatibility (no-op in stateless flow)
passport.serializeUser((user: any, done: Done) => done(null, user));
passport.deserializeUser((obj: any, done: Done) => done(null, obj));

// ---------------------------------------------------------------------------
// Auth middleware: validate JWT + validate guild/role (auto-refresh OAuth tokens)
// ---------------------------------------------------------------------------
async function discordFetchJson(
  userId: string,
  url: string,
  opts?: { retryOn401?: boolean; retryOn429?: boolean; retryDelayMs?: number },
): Promise<{ ok: boolean; status: number; json?: any }> {
  const retryOn401 = opts?.retryOn401 ?? true;
  const retryOn429 = opts?.retryOn429 ?? true;
  const retryDelayMs = opts?.retryDelayMs;

  const t = getTokens(userId);
  if (!t?.accessToken) return { ok: false, status: 401 };

  const doFetch = async (accessToken: string) => {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
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

  const first = await doFetch(t.accessToken);
  if (first.ok) return first;

  if (retryOn429 && first.status === 429) {
    const waitMs = Math.min(Math.max(first.retryAfterMs ?? retryDelayMs ?? 1000, 250), 5000);
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    return await doFetch(t.accessToken);
  }

  if (retryOn401 && first.status === 401) {
    // try refresh then retry once
    try {
      await refreshAccessToken({ id: userId, username: userId });
      const nt = getTokens(userId);
      if (!nt?.accessToken) return first;
      return await doFetch(nt.accessToken);
    } catch {
      return first;
    }
  }

  return first;
}

export async function validateAndRefreshSession(
  req: Request & { user?: AuthUser; authStatus?: AuthStatus; rotatedToken?: string },
  _res: Response,
  next: NextFunction,
) {
  req.authStatus = { authenticated: false } as AuthStatus;

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      req.authStatus = { authenticated: false, reason: "no_token" };
      return next();
    }

    const token = authHeader.slice(7);
    const decoded = verifyJWT(token);

    if (!decoded) {
      req.authStatus = { authenticated: false, reason: "invalid_token" };
      return next();
    }

    req.user = decoded;

    // Dev bypass: trust the JWT
    if (decoded.devBypass) {
      req.authStatus = {
        authenticated: true,
        user: {
          id: decoded.id,
          username: decoded.username,
          avatar: decoded.avatar,
          discriminator: decoded.discriminator ?? null,
          guild: decoded.guild ?? null,
          hasRole: true,
        },
        devBypass: true,
      };
      return next();
    }

    // Need server-side Discord OAuth tokens to validate guild/role
    const tokens = getTokens(decoded.id);
    if (!tokens?.accessToken) {
      req.authStatus = { authenticated: false, reason: "no_oauth_tokens" };
      return next();
    }

    // 1) Fetch guild list (/users/@me/guilds)
    const guildsRes = await discordFetchJson(decoded.id, "https://discord.com/api/users/@me/guilds");
    if (!guildsRes.ok) {
      req.authStatus = { authenticated: false, reason: "guild_fetch_failed" };
      return next();
    }

    const guilds: DiscordGuild[] = Array.isArray(guildsRes.json) ? guildsRes.json : [];
    const configuredGuildIds = Object.keys(fileConfig.guilds || {});

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
      req.authStatus = { authenticated: false, reason: "not_in_guild" };
      return next();
    }

    // 2) Check role (optional) via /users/@me/guilds/{guild.id}/member
    const requiredRoleOrRoles = fileConfig.guilds?.[matchedGuildId]?.requiredRole ?? null;
    const requiredRolesFromConfig = requiredRoleOrRoles
      ? Array.isArray(requiredRoleOrRoles)
        ? requiredRoleOrRoles
        : [requiredRoleOrRoles]
      : [];

    const rolesToCheck = requiredRolesFromConfig.length ? requiredRolesFromConfig : REQUIRED_ROLE_IDS;

    let hasRole = true;

    if (rolesToCheck.length) {
      const memberRes = await discordFetchJson(
        decoded.id,
        `https://discord.com/api/users/@me/guilds/${matchedGuildId}/member`,
      );

      if (!memberRes.ok) {
        req.authStatus = { authenticated: false, reason: "member_fetch_failed" };
        return next();
      }

      const member: { roles?: string[] } = memberRes.json || {};
      const roles = Array.isArray(member.roles) ? member.roles : [];
      hasRole = roles.some((r) => rolesToCheck.includes(r));

      if (!hasRole) {
        req.authStatus = { authenticated: false, reason: "missing_role" };
        return next();
      }
    }

    // Success: build status
    const computedGuild = matchedGuildId;
    const computedHasRole = hasRole;

    req.authStatus = {
      authenticated: true,
      user: {
        id: decoded.id,
        username: decoded.username,
        avatar: decoded.avatar,
        discriminator: decoded.discriminator ?? null,
        guild: computedGuild,
        hasRole: computedHasRole,
      },
    };

    // Rotate JWT if claims changed (keeps your JWT-based APIs consistent)
    const claimsChanged = (decoded.guild ?? null) !== computedGuild || Boolean(decoded.hasRole) !== computedHasRole;

    if (claimsChanged) {
      req.rotatedToken = generateJWT({
        ...decoded,
        guild: computedGuild,
        hasRole: computedHasRole,
      });
    }

    return next();
  } catch (err: unknown) {
    log("error", "[JWT Validation] Unexpected error:", err);
    req.authStatus = { authenticated: false, reason: "unexpected_error" };
    return next();
  }
}
