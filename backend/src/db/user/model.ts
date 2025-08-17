// src/entities/model.ts

/** Max clearance used for dev/testing */
export const MAX_DEV_CLEARANCE = Number.MAX_SAFE_INTEGER;

export enum Provider {
  PUBLIC = "PUBLIC",
  DEV = "DEV",
  GOOGLE = "GOOGLE",
  GOOGLE_WORKSPACE = "GOOGLE_WORKSPACE",
  GOOGLE_GROUPS = "GOOGLE_GROUPS",
  FACEBOOK = "FACEBOOK",
  DISCORD = "DISCORD",
  BLUESKY = "BLUESKY",
  EMAIL = "EMAIL",
  PHONE = "PHONE",
  IP = "IP",
  OTHER = "OTHER",
}

export enum IdentifierType {
  USER_ID = "USER_ID",
  USERNAME = "USERNAME",
  USERNAME_PATTERN = "USERNAME_PATTERN",
  GROUP_ID = "GROUP_ID",
  ROLE_ID = "DISCORD_ROLE_ID",
  GUILD_ID = "DISCORD_GUILD_ID",
  DOMAIN = "DOMAIN",
  EMAIL_DOMAIN = "EMAIL_DOMAIN",
  EMAIL_SUBDOMAIN = "EMAIL_SUBDOMAIN",
  EMAIL = "EMAIL",
  PHONE_E164 = "PHONE_E164",
}

export type Eft = "allow" | "deny";

export type MatchKind =
  | "ProjectMatch"
  | "keyMatch"
  | "keyMatch2"
  | "keyMatch3"
  | "keyMatch4"
  | "keyMatch5"
  | "globMatch"
  | "regexMatch";

export enum MATCH {
  HASH = "HASH",
  plaintext = "plaintext",
  domain = "domain",
  subdomain = "subdomain",
  prefix = "prefix",
  suffix = "suffix",
}

/** Label-Based Access Control operators */
export type LBACOp =
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "gt"
  | "gte"
  | "lt"
  | "lte";

/**
 * Standard HTTP methods — plus allow custom/extension verbs via `string & {}`.
 * (Keeps strong typing for known methods while not blocking custom ones.)
 */
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "HEAD"
  | "OPTIONS"
  | "TRACE"
  | (string & {});

export type LoginFact = {
  provider?:
    | Provider.GOOGLE
    | Provider.DISCORD
    | Provider.BLUESKY
    | Provider.FACEBOOK;
  type?: IdentifierType;
  value?: string;
  must: boolean; // replaced SHOULD union with plain boolean
  match?: MATCH;
};

export interface Subject {
  id: string;
  provider?: Provider;
  clearance: number;
  loginFacts?: LoginFact[];
}

export interface ProjectObject {
  project: string;
  subProject?: string;
  task?: string;
  subTask?: string;
}

interface BasePolicy {
  priority: number;

  /** Subject identifier constraints */
  id_type?: IdentifierType;
  id_value?: string;

  /** Clearance requirement with operator */
  min_clearance: number;
  lbac_op: LBACOp;

  /** Optional time window (inclusive start, inclusive end) */
  start_ts?: Date;
  end_ts?: Date;

  /** Effect: allow or deny */
  eft: Eft;
}
export interface HttpPolicy extends BasePolicy {
  match: Exclude<MatchKind, "ProjectMatch">; // e.g., keyMatch/globMatch/regexMatch
  method: HttpMethod;
  path: string;
  matching: MatchKind;
  /** Optional duplicated method field to interop with legacy schemas */
  HTTP_METHOD?: string;
}

/**
 * Policy for project-scoped objects.
 */
export interface ProjectPolicy extends BasePolicy {
  match: "ProjectMatch";
  obj_project: string;
  obj_subProject?: string;
  obj_task?: string;
  obj_subTask?: string;
}
 