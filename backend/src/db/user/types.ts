// ./db/user/types.ts
export const MAX_DEV_CLEARANCE = Number.MAX_SAFE_INTEGER;
export const MIN__DEV_CLEARANCE = Number.MIN_SAFE_INTEGER;

export enum IdentifierType {
  USER_ID = "USER_ID",
  USERNAME = "USERNAME",
  USERNAME_PATTERN = "USERNAME_PATTERN",
  GROUP_ID = "GROUP_ID",
  ROLE_ID = "Discord_ROLE_ID",
  GUILD_ID = "Discord_GUILD_ID",
  DOMAIN = "DOMAIN",
  EMAIL_DOMAIN = "EMAIL DOMAIN",
  EMAIL_SUBDOMAIN = "EMAIL SUBDOMAIN",
  EMAIL = "EMAIL",
  PHONE_E164 = "PHONE_E164",
  IP = "IP",
}

export enum ProviderType {
  PUBLIC = "public",
  DEV = "dev",
  GOOGLE = "google",
  DISCORD = "discord",
  BLUESKY = "bluesky",
  FACEBOOK = "facebook",
}

export type IdentifierTypeMap = {
  USER_ID: "USER_ID";
  USERNAME: "USERNAME";
  USERNAME_PATTERN: "USERNAME_PATTERN";
  GROUP_ID: "GROUP_ID";
  ROLE_ID: "Discord_ROLE_ID";
  GUILD_ID: "Discord_GUILD_ID";
  DOMAIN: "DOMAIN";
  EMAIL_DOMAIN: "EMAIL DOMAIN";
  EMAIL_SUBDOMAIN: "EMAIL SUBDOMAIN";
  EMAIL: "EMAIL";
  PHONE_E164: "PHONE_E164";
  IP: "IP";
};

export enum Decision {
  ALLOW = "ALLOW",
  DENY = "DENY",
}
export enum MATCH {
  HASH= "HASH",
  DOMAIN = "domain",
  SUBDOMAIN = "subdomain",
  PREFIX = "prefix",
  SUFFIX = "suffix",
  EXACT = "EXACT",
  INCLUDE = "INCLUDE",
  EXCLUDE = "EXCLUDE",
}
export enum LBACMachine {
  GREATER_THAN = ">",
  EQUAL = "==",
  LESS_THAN = "<",
  GREATER_THAN_OR_EQUAL = ">=",
  LESS_THAN_OR_EQUAL = "<=",
}

export type LoginFact = {
  provider?: ProviderType.GOOGLE | ProviderType.DISCORD | ProviderType.BLUESKY | ProviderType.FACEBOOK;
  type?: IdentifierTypeMap;
  value?: string;
  has: boolean;
  match?: MATCH;
  clearance: number;
} | {
  provider?: ProviderType.PUBLIC ;
  clearance: -1;
}| {
  provider?: ProviderType.DEV ;
  clearance: number;
};
export type Attribute = {
  name: string;
  value: string;
};
export type Attributes = Attribute[];
export type Group = {
  action: Action[];
  subject: Subject[];
  name: string;
  description: string;
  pseudoClearance?: number;
  priority: number;
  attributes: Attributes;
};

export type Subject = {
  loginFacts: LoginFact[];
  action: Action[];
  attributes: Attributes;
  obligations: Obligation[];
};


type Environment = { 
  name: string;
  value: string;
};

export enum ObligationMachType {
  // Numeric comparisons
  Bigger_Than = "Bigger_Than",
  Smaller_Than = "Smaller_Than",
  Equal = "Equal",
  Not_Equal = "Not_Equal",
  Greater_Than_Or_Equal = "Greater_Than_Or_Equal",
  Less_Than_Or_Equal = "Less_Than_Or_Equal",
  Between = "Between",

  // Existence
  Exists = "Exists",
  Not_Exists = "Not_Exists",

  // String-based checks
  Includes = "Includes",
  Excludes = "Excludes",
  Starts_With = "Starts_With",
  Ends_With = "Ends_With",
  Matches_Regex = "Matches_Regex",

  // Alternative labels (aliases or simplified naming)
  Big_Then = "Big_Then",          // Alias for Bigger_Than?
  Small_Then = "Small_Then",      // Alias for Smaller_Than?

  // Additional matching logic types
  Contains_Any = "Contains_Any",           // any of a list
  Contains_All = "Contains_All",           // all of a list
  Is_One_Of = "Is_One_Of",                 // value is in an enum/list
  Not_One_Of = "Not_One_Of",
  Is_Empty = "Is_Empty",                   // "" or []
  Is_Not_Empty = "Is_Not_Empty",
  Is_True = "Is_True",
  Is_False = "Is_False",
  Matches_Wildcard = "Matches_Wildcard",   // e.g. *.example.com
  Within_Distance = "Within_Distance",     // e.g. geolocation
}

export type Obligation = {
  obligationType: ObligationMachType;
  obligationMachType: ObligationMachType;
  name: string;
  value?: string;
  value_bottom?: string;
};

export type Action = {
  type: string;
  permission: Resource | ResourceModeHTTP | ResourceKeyHTTP;
  priority: number;
  decision: Decision;
  pseudoClearance?: number;
  LBACMachine: LBACMachine;
  start_time?: number;
  end_time?: number;
  attributes: Attributes;
};


export type Resource = {
  attributes: Attributes;
  project: string;
  subProject: string;
  task: string;
  subTask: string;
  constraint: number;
  obligation?: Obligation[];
};
export type ResourceModeHTTP= {
  project: string;
  method: string;
  url: string;
  pattern: string;
  machMode: "=="|"1" | "2" | "3" | "4" | "5" | "glob";
  attributes: Attributes;
  obligation?: Obligation[];
};

export type ResourceKeyHTTP= {
  project: string;
  method: string;
  path: string;
  key: string;
  machKey:"1"|"2"|"3";

  attributes: Attributes;
  obligation?: Obligation[];
};

// Model Storage and casbin