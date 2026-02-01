/**
 * Chip Filter State
 * Represents the state of a filter chip in the UI
 */
export type ChipState = "include" | "exclude" | "neutral";

/** Map of filter names to their chip states */
export type ChipMap = Record<string, ChipState>;

/** Single selectable tag option (for dropdowns, chip groups, etc.) */
export interface TagOption {
  id: string;
  name: string;
}

/**
 * ============ FACT TYPES ============
 * Represents facts in the database
 */

/** Filter criteria for querying facts */
export interface FactFilters {
  subjects: ChipMap;
  audiences: ChipMap;
  dateFrom: string;
  dateTo: string;
  yearFrom: string;
  yearTo: string;
  keyword: string;
}

/** Fact data structure from API response (may have optional fields) */
export interface FactRecord {
  id?: number | string;
  title?: string;
  fact_text?: string;
  source?: string | null;
  type?: string | null;
  context?: string | null;
  user?: string;
  timestamp?: string;
  date?: string;
  subject?: string;
  sourceUrl?: string;
  subjects?: string[];
  audiences?: string[];
}

/** Complete Fact entity (all fields required after fetch/validation) */
export interface Fact extends FactRecord {
  id: number;
  timestamp: string;
  fact_text: string;
  source: string | null;
  type: string | null;
  context: string | null;
  user_id: number | null;
  suppressed: boolean;
  year: number | null;
  subjects: string[];
  audiences: string[];
}

/** Input for creating/updating a fact */
export interface NewFactInput
  extends Partial<
    Pick<
      Fact,
      | "source"
      | "type"
      | "context"
      | "year"
      | "user_id"
      | "suppressed"
      | "subjects"
      | "audiences"
    >
  > {
  fact_text: string;
}

/** Query parameters for the facts API endpoint */
export interface FactApiParams {
  dateFrom: string;
  dateTo: string;
  yearFrom: string;
  yearTo: string;
  keyword: string;
  subjectsInclude?: string[];
  subjectsExclude?: string[];
  audiencesInclude?: string[];
  audiencesExclude?: string[];
  limit?: number;
  offset?: number;
}

/** Single page of fact results with pagination metadata */
export interface FactPage {
  items: FactRecord[];
  offset: number;
}

/** Type for accessing filter keys */
export type FilterKey = "subjects" | "audiences";

/**
 * ============ AUTHENTICATION TYPES ============
 * OAuth and session management (Discord-based)
 */

/** User profile from authentication provider (Discord) */
export interface UserProfile {
  id: string;
  username?: string | null;
  avatar?: string | null;
  discriminator?: string | null;
  isAdmin?: boolean;
}

/** Reason codes for authentication failures or states */
export type AuthReason =
  | "no_token"
  | "invalid_token"
  | "token_expired"
  | "not_logged_in"
  | "invalid_credentials"
  | "bad_payload"
  | "bad_json"
  | "discord_error"
  | "unexpected_error"
  | "network_error"
  | "jwt_invalid"
  | "jwt_expired"
  | "no_oauth_tokens"
  | "guild_fetch_failed"
  | "not_in_guild"
  | "member_fetch_failed"
  | "missing_role"
  | "missing_guild"
  | "auth_failed"
  | "unknown"
  | "server_error"
  | "invalid_code"
  | "token_error"
  | null;

/** Shared base properties for authenticated users */
export interface AuthUserBase {
  id: string;
  username: string;
  avatar?: string | null;
  discriminator?: string | null;
}

/** Internal Discord-authenticated user details */
export interface AuthUserDiscord extends AuthUserBase {
  type: "discord";
  guild?: string | null;
  hasRole?: boolean;
  isAdmin?: boolean;
  devBypass?: boolean;
  magicLink?: false;
  cacheUpdatedAt?: number;
  lastCheck?: number;
  cachedGuildIds?: string[];
  cachedMemberRoles?: string[];
  accessToken?: string | null;
  refreshToken?: string | null;
  expires?: number | null;
  scope?: string | null;
  encryptedTokens?: string;
  jti?: string;
}

/** Token issued through the admin magic-link workflow */
export interface AuthUserMagic extends AuthUserBase {
  type: "magic";
  magicLink: true;
  hasRole?: boolean;
  isAdmin?: boolean;
  devBypass?: false;
  guild?: string | null;
}

/** Dev bypass authentication user (development only) */
export interface AuthUserDev extends AuthUserBase {
  type: "dev";
  devBypass: true;
  hasRole?: boolean;
  isAdmin?: boolean;
  guild?: string | null;
  magicLink?: false;
}

/** Full authenticated user details (internal) */
export type AuthUser = AuthUserDiscord | AuthUserMagic | AuthUserDev;

/** User info returned by /auth/status endpoint */
export interface AuthStatusUser extends UserProfile {
  guild?: string | null;
  hasRole?: boolean;
}

/** Authentication status response */
export interface AuthStatus {
  authenticated: boolean;
  reason?: AuthReason | string | null;
  user?: AuthStatusUser | null;
  devBypass?: boolean;
}

/** Credentials for login attempt */
export type LoginPayload = Record<string, unknown>;
