export type GuildEntry = {
  requiredRole?: string[] | null;
};

export type RoleEntry = {
  permissions?: string[] | null;
};

export type AdminConfig = {
  guilds: Record<string, GuildEntry>;
  roles: Record<string, RoleEntry>;
  userPermissions?: Record<string, string[]>;
  knownUsers?: Array<{
    userId: string;
    username: string | null;
    firstSeenAt: string;
    lastSeenAt: string;
  }>;
  whitelistUsers: string[];
};
