export type GuildEntry = {
  name?: string | null;
  requiredRole?: string[] | null;
};

export type RoleEntry = {
  name?: string | null;
  type?: string | null;
  description?: string | null;
  permissions?: string[] | null;
};

export type FederationPolicyConfig = {
  namingConstraints: string[];
  allowSubdomains: boolean;
  allowedEntityTypes: string[];
  maxPathLength: number;
  trustAnchorEntityId?: string;
  defaultAuthorizationDetails?: Array<Record<string, unknown>>;
};

export type TrustMarkClaimCheck = {
  claim: string;
  operator: "equals" | "includes" | "regex" | "exists";
  value?: string;
};

export type TrustMarkPolicyConfig = {
  requiredTrustMarks: string[];
  claimChecks: TrustMarkClaimCheck[];
};

export type DiscordMappingEntry = {
  id: string;
  discordGuildId?: string;
  discordUserId?: string;
  discordRoleId?: string;
  targetType: "action" | "role";
  targetValue: string;
  createdAt: string;
};

export type OpenIdMappingEntry = {
  id: string;
  idType: "trust_mark" | "trust_anchor_trust_mark_issuer" | "provider_domain" | "trust_domain" | "issuer_domain_user_id" | "anyone";
  domain?: string;
  numHops?: number;
  userId?: string;
  targetType: "action" | "role";
  targetValue: string;
  createdAt: string;
};

export type AdminConfig = {
  guilds: Record<string, GuildEntry>;
  roles: Record<string, RoleEntry>;
  userRoles: Record<string, string[]>;
  whitelistUsers: string[];
  adminUsers: string[];
  discordMappings?: DiscordMappingEntry[];
  openidMappings?: OpenIdMappingEntry[];
  federationPolicy?: FederationPolicyConfig;
  trustMarkPolicy?: TrustMarkPolicyConfig;
};
