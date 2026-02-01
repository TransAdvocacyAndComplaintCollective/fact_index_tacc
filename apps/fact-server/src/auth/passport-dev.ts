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
          const p = profile as DiscordProfile;
          const user: AuthUser =
            (p && {
              id: p.id,
              username: p.username || "dev-user",
              avatar: p.avatar,
              discriminator: p.discriminator ?? "0000",
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
