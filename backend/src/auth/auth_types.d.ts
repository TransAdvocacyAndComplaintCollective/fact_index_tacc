// src/auth/auth_types.d.ts
import type { Request } from "express";
import type { Profile } from "passport-discord";
import type { ParamsCheck, LoginFact } from "../../db/user/types.ts";
/* ------------------------------------------------------------------
 *  Supported authentication providers
 * ------------------------------------------------------------------ */
export type ProviderType =
  | "dev"
  | "google"
  | "discord"
  | "bluesky"
  | "facebook"
  | null;

/* ------------------------------------------------------------------
 *  Reasons for unauthenticated states
 * ------------------------------------------------------------------ */
export type UnauthenticatedAuthReason =
  | "unknown"
  | "invalid"
  | "not_authenticated"
  | "refresh_failed"
  | "not_logged_in"
  | "unauthenticated"
  | "token_expired"
  | "disabled"
  | "left_guild"
  | "token_invalid"
  | "token_error"
  | "missing_role"
  | "unknown_provider"
  | "remote_access"
  | "not_found"
  | "validation_failed"
  | "invalid_user_type";

/* ------------------------------------------------------------------
 *  System-level permission model
 * ------------------------------------------------------------------ */
export interface Permission {
  name: string;
  value: string;
  description: string;
  startDate: string; // ISO-8601
  endDate?: string; // ISO-8601
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

/* ------------------------------------------------------------------
 *  Common base for all users
 * ------------------------------------------------------------------ */
export type BaseUserFields = {
  // Extendable placeholder for future shared fields
  provider: ProviderType;
  expiresAt: number; // Unix timestamp
};

/* ------------------------------------------------------------------
 *  Common fields for **authenticated** users
 * ------------------------------------------------------------------ */
type AuthenticatedCommon = BaseUserFields & {
  loginFacts: LoginFact[];
  id: string;
  username: string;
  authenticated: true;
  reason: "authenticated";
  params: ParamsCheck[];
  avatar?: string | null; // Always use `avatar` or null if absent
};

/* ------------------------------------------------------------------
 *  Provider-specific authenticated user types
 * ------------------------------------------------------------------ */
export interface GoogleAuthUser extends AuthenticatedCommon {
  provider: "google";
  accessToken: string;
  expiresAt: number;
}

export interface DiscordAuthUser extends AuthenticatedCommon {
  guildIds: string[];
  roleIds: string[];
  provider: "discord";
  accessToken: string;
  expiresAt: number;
}

export interface BlueskyAuthUser extends AuthenticatedCommon {
  provider: "bluesky";
  cbCookie: string | null;
  cookieState: string | null;
}

export interface FacebookAuthUser extends AuthenticatedCommon {
  provider: "facebook";
  accessToken: string;
  expiresAt: number;
}

export interface DevAuthUser extends AuthenticatedCommon {
  provider: "dev";
  accessToken: string;
  id: "DEV_ID";
  expiresAt: number;
}

/* ------------------------------------------------------------------
 *  Unauthenticated user type
 * ------------------------------------------------------------------ */
export interface UnauthenticatedUser extends BaseUserFields {
  provider: null;
  authenticated: false;
  reason: UnauthenticatedAuthReason;
  id?: null;
  username: undefined;
  avatar?: null;
  previousProvider?: ProviderType;
  expiresAt: null; // Unix timestamp
}

/* ------------------------------------------------------------------
 *  AuthUser union — all possible session shapes
 * ------------------------------------------------------------------ */
export type AuthUser =
  | GoogleAuthUser
  | DiscordAuthUser
  | BlueskyAuthUser
  | FacebookAuthUser
  | DevAuthUser
  | AdminAuthUser
  | UnauthenticatedUser;

/**
 * Result returned by validateJwt
 */
export type RotateReason = "legacy_key" | "expiring_soon";
export type JwtValidationResult = {
  user: AuthUser | null;
  rotateRecommended: boolean;
  rotateReason?: RotateReason;
  tokenKid?: string;
  activeKid?: string;
  exp?: number;
  iat?: number;
};
export type MaybeRefreshResult = {
  token: string; // original or new
  rotated: boolean;
  reasons: (RotateReason | "claims_changed")[];
  oldKid?: string;
  newKid?: string;
};

/* ------------------------------------------------------------------
 *  Express global augmentation
 * ------------------------------------------------------------------ */
declare global {
  namespace Express {
    export type RequestAuth = Request & {
      authUser?: AuthUser;
    };
  }
}
export type RequestAuth = Request & { authUser?: AuthUser };
