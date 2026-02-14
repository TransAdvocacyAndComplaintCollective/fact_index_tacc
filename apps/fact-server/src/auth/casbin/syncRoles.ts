/**
 * Synchronize Discord roles and local roles to Casbin grouping policies.
 * 
 * This module implements the key synchronization logic from the architecture:
 * 1. Sync Discord guild membership and roles into discord_guild_member
 * 2. Compute effective local roles (from user_local_role + discord_role_map)
 * 3. Write Casbin grouping policies for each user+guild combination
 */

import { getCasbinEnforcer } from "./enforcer.ts";
import { getDb } from "@factdb/db-core";
import type { Enforcer } from "casbin";
import type { DatabaseSchema } from "@factdb/db-core";

interface SyncRolesOptions {
  /** Sync Discord roles from API (requires valid OAuth token) */
  syncDiscordRoles?: boolean;
  /** Force re-sync even if recently synced */
  forceSync?: boolean;
}

/**
 * Sync all effective roles for a user across all guilds them are members of.
 * Updates Casbin grouping policies with: g, user:userId, role:roleKey, guildId
 */
export async function syncDiscordRolesForUser(
  userId: string,
  discordGuilds: Array<{ id: string; name?: string }> = [],
  discordRolesByGuild: Map<string, string[]> = new Map(),
  isAdmin: boolean = false,
  options: SyncRolesOptions = {}
): Promise<void> {
  try {
    const e: Enforcer = await getCasbinEnforcer();
    const db = getDb();

    console.log(`[casbin:sync] Starting role sync for user ${userId}`);

    // For each guild the user is a member of, compute and apply roles
    for (const guild of discordGuilds) {
      const guildId = guild.id;
      const discordRoleIds = discordRolesByGuild.get(guildId) || [];

      // Compute effective local roles for this user+guild
      const effectiveRoles = await computeEffectiveRoles(
        db,
        userId,
        guildId,
        discordRoleIds,
        isAdmin
      );

      // Update Casbin grouping policies for this domain (guild)
      await updateCasbinGroupingPolicies(e, userId, guildId, effectiveRoles);

      console.log(
        `[casbin:sync] User ${userId} in guild ${guildId} roles: [${Array.from(effectiveRoles).join(", ")}]`
      );
    }

    // Also sync global roles (not tied to any specific guild)
    if (isAdmin) {
      // Admin role is global
      const globalRoles = new Set<string>(["role:app:admin"]);
      console.log(
        `[casbin:sync] User ${userId} global roles: [${Array.from(globalRoles).join(", ")}]`
      );
    }

    await e.buildRoleLinks();
    console.log(`[casbin:sync] Role sync completed for user ${userId}`);
  } catch (err) {
    console.error("[casbin:sync] Failed to sync Discord roles:", err);
    // Don't throw - allow the request to continue even if sync fails
  }
}

/**
 * Compute effective local roles for a user in a specific guild.
 * 
 * Step 1: Get local roles assigned directly via user_local_role (guild-scoped or global)
 * Step 2: Get Discord role IDs user has in this guild
 * Step 3: Map Discord roles to local roles via discord_role_map
 * Step 4: Return combined set of role keys
 */
async function computeEffectiveRoles(
  db: any,
  userId: string,
  guildId: string,
  discordRoleIds: string[],
  isAdmin: boolean
): Promise<Set<string>> {
  const effectiveRoles = new Set<string>();

  try {
    // Step 1: Get local roles assigned directly to this user in this guild (or globally)
    const localRoleAssignments = await db
      .selectFrom("user_local_role")
      .select(["role_key"])
      .where("discord_user_id", "=", userId)
      .where((eb) =>
        eb.or([
          eb("guild_id", "=", guildId),  // Guild-scoped
          eb("guild_id", "is", null),    // Global
        ])
      )
      .execute();

    for (const assignment of localRoleAssignments) {
      effectiveRoles.add(`role:${assignment.role_key}`);
    }

    // Step 2 & 3: Map Discord roles to local roles via discord_role_map
    if (discordRoleIds.length > 0) {
      const roleMapping = await db
        .selectFrom("discord_role_map")
        .select(["role_key"])
        .where("guild_id", "=", guildId)
        .where("discord_role_id", "in", discordRoleIds)
        .execute();

      for (const mapping of roleMapping) {
        effectiveRoles.add(`role:${mapping.role_key}`);
      }
    }

    // Step 4: Add admin role if applicable (global)
    if (isAdmin) {
      effectiveRoles.add("role:app:admin");
    }

    // Every authenticated user gets a base role
    effectiveRoles.add("user");

    return effectiveRoles;
  } catch (err) {
    console.error(
      `[casbin:sync] Error computing effective roles for ${userId} in guild ${guildId}:`,
      err
    );
    return new Set(["user"]);  // Fallback to base user role
  }
}

/**
 * Update Casbin grouping policies for a user in a specific guild domain.
 * 
 * Removes all existing policies for this (user, guild) pair and adds the new ones.
 * Format: g, user:userId, role:roleKey, guildId
 */
async function updateCasbinGroupingPolicies(
  e: Enforcer,
  userId: string,
  guildId: string,
  roleKeys: Set<string>
): Promise<void> {
  try {
    const sub = `user:${userId}`;

    // Remove all existing grouping policies for this user+guild combination
    // g, user:userId, p.role, guildId  =>  find all where v0 matches and v2 matches guildId
    const existingPolicies = await e.getFilteredGroupingPolicy(0, sub);
    for (const policy of existingPolicies) {
      // policy = [sub, role, domain]
      if (policy[2] === guildId) {
        await e.removeGroupingPolicy(...policy);
      }
    }

    // Add new policies for each role
    const toAdd = Array.from(roleKeys).map((role) => [sub, role, guildId]);
    if (toAdd.length > 0) {
      await e.addGroupingPolicies(toAdd);
    }

    console.debug(
      `[casbin:sync] Updated grouping policies for ${sub} in domain ${guildId}: [${Array.from(roleKeys).join(", ")}]`
    );
  } catch (err) {
    console.error(
      `[casbin:sync] Error updating Casbin policies for ${userId} in guild ${guildId}:`,
      err
    );
  }
}

/**
 * Store Discord guild membership and roles in discord_guild_member table.
 * Called during Passport OAuth callback to persist guild data.
 */
export async function storeDiscordGuildMembership(
  userId: string,
  guilds: Array<{ id: string; name?: string }>,
  rolesByGuild: Map<string, string[]>
): Promise<void> {
  try {
    const db = getDb();

    for (const guild of guilds) {
      const guildId = guild.id;
      const roles = rolesByGuild.get(guildId) || [];
      const rolesJson = JSON.stringify(roles);

      // Upsert: update if exists, insert if not
      await db
        .insertInto("discord_guild_member")
        .values({
          discord_user_id: userId,
          guild_id: guildId,
          roles_json: rolesJson,
          last_synced_at: new Date().toISOString(),
        })
        .onConflict((oc) =>
          oc
            .columns(["discord_user_id", "guild_id"])
            .doUpdateSet({
              roles_json: rolesJson,
              last_synced_at: new Date().toISOString(),
            })
        )
        .execute();
    }

    console.log(
      `[casbin:sync] Stored Discord guild membership for user ${userId}`
    );
  } catch (err) {
    console.error("[casbin:sync] Error storing guild membership:", err);
    // Don't throw - this is informational
  }
}

/**
 * Check if role sync is stale (old last_synced_at for a guild).
 * Returns true if we should re-sync.
 */
export async function isSyncStale(
  userId: string,
  guildId: string,
  maxAgeMs: number = 3600000  // 1 hour default
): Promise<boolean> {
  try {
    const db = getDb();

    const record = await db
      .selectFrom("discord_guild_member")
      .select(["last_synced_at"])
      .where("discord_user_id", "=", userId)
      .where("guild_id", "=", guildId)
      .executeTakeFirst();

    if (!record) {
      return true;  // Never synced
    }

    const lastSyncTime = new Date(record.last_synced_at).getTime();
    const now = Date.now();
    return now - lastSyncTime > maxAgeMs;
  } catch (err) {
    console.error("[casbin:sync] Error checking sync staleness:", err);
    return true;  // Assume stale on error
  }
}
