/**
 * Dev Bypass Authentication Strategy
 * Provides a development-only authentication method when Discord OAuth credentials are unavailable
 */

import passport from "passport";
import { Strategy as DiscordStrategy } from "@oauth-everything/passport-discord";
import type { AuthUser } from "../../../../libs/types/src/index.ts";
import { log } from "./jwt.ts";

interface DiscordProfile {
  id: string;
  username?: string;
  avatar?: string;
  discriminator?: string;
  email?: string;
  verified?: boolean;
  [key: string]: unknown;
}

type Done = (err: Error | null, user?: AuthUser | false, info?: unknown) => void;

/**
 * Parse environment variable as boolean flag
 */
function envFlag(name: string): boolean {
  const v = process.env[name];
  if (!v) return false;
  return ["true", "1", "yes", "y", "on"].includes(String(v).trim().toLowerCase());
}

const DEV_LOGIN_MODE = envFlag("DEV_LOGIN_MODE");
const DEV_ADMIN_ID = process.env.DEV_ADMIN_ID || "";
const DEV_IS_ADMIN = envFlag("DEV_IS_ADMIN");

/**
 * Check if a user ID should be an admin in dev mode
 */
function isDevAdmin(userId: string): boolean {
  // If DEV_IS_ADMIN is true, all dev users are admins
  if (DEV_IS_ADMIN) return true;
  // Otherwise, only the specific DEV_ADMIN_ID user is admin
  if (!DEV_ADMIN_ID) return false;
  return userId === DEV_ADMIN_ID;
}

function buildDevUser(profile: DiscordProfile | null): AuthUser {
  const userId = profile?.id || "dev";
  const isAdmin = isDevAdmin(userId);
  return {
    type: "dev",
    id: userId,
    username: profile?.username || "dev-user",
    avatar: profile?.avatar ?? null,
    discriminator: profile?.discriminator ?? "0000",
    devBypass: true,
    hasRole: true,
    isAdmin,
  };
}

/**
 * Initialize dev bypass strategy for development without Discord OAuth credentials
 */
export function initializeDevStrategy(): void {
  if (!DEV_LOGIN_MODE) {
    return;
  }

  try {
    passport.use(
      "dev-bypass",
      new DiscordStrategy(
        {
          clientID: "dev",
          clientSecret: "dev",
          callbackURL: "/auth/discord/callback",
          scope: ["identify"],
        },
        (_accessToken: string, _refreshToken: string, profile: any, done: Done) => {
          const p = profile as DiscordProfile | null;
          const user = buildDevUser(p);
          return done(null, user);
        },
      ),
    );
    log("info", "Dev bypass strategy registered successfully");
  } catch (err) {
    log("error", "Failed to initialize dev bypass strategy:", err);
  }
}

/**
 * Check if dev login mode is active
 */
export function isDevModeActive(): boolean {
  return DEV_LOGIN_MODE;
}

/**
 * Initialize dev mode with missing Discord OAuth credentials warning
 */
export function initializeDevModeIfNeeded(): void {
  if (DEV_LOGIN_MODE) {
    log("warn", "Discord env vars missing/incomplete; DEV_LOGIN_MODE active; registering dev bypass strategy");
    initializeDevStrategy();
  }
}

// Auto-initialize dev mode on module load if DEV_LOGIN_MODE is set
if (DEV_LOGIN_MODE) {
  log("info", "DEV_LOGIN_MODE enabled; initializing dev bypass strategy");
  initializeDevStrategy();
}
