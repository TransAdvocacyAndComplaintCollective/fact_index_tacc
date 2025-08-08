// src/auth/auth_types.d.ts

import type { Request } from "express";
import type { Profile } from "passport-discord";

/* ------------------------------------------------------------------
 *  Supported authentication providers
 * ------------------------------------------------------------------ */
export type ProviderType =
  | "dev"
  | "google"
  | "discord"
  | "bluesky"
  | "facebook"
  | "admin"
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
  |"token_invalid"
  |"token_error"
  | "missing_role"
  |"unknown_provider"
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
  endDate?: string;  // ISO-8601
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
  id: string;
  username: string;
  authenticated: true;
  reason: "authenticated";
  params: Permission[];
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
  provider: "discord";
  accessToken: string;
  expiresAt: number;
}

export interface BlueskyAuthUser extends AuthenticatedCommon {
  provider: "bluesky";
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

export interface AdminAuthUser extends AuthenticatedCommon {
  id: any;
  provider: "admin";
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


/* ------------------------------------------------------------------
 *  Express global augmentation
 * ------------------------------------------------------------------ */
declare global {
  namespace Express {
    export interface Request {
      isAuthenticated: () => this is AuthenticatedRequest;
      authUser?: AuthUser;
    }
    export interface AuthenticatedRequest extends Request {
      authUser: AuthUser;
    }
  }
}
