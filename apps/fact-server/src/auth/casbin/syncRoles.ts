/**
 * Synchronize Discord roles to Casbin grouping policies.
 * 
 * This module implements the key synchronization logic from the architecture:
 * 1. Sync Discord guild membership and roles into discord_guild_member
 * 2. Write Casbin grouping policies for each user+guild combination
 */

import { getCasbinEnforcer } from "./enforcer.ts";
import { getDb } from "../../../../../libs/db-core/src/dbClient.ts";
import type { Enforcer } from "casbin";

/**
 * Sync all effective roles for a user across all guilds them are members of.
 * Updates Casbin grouping policies with: g, user:userId, role:discord:{roleId}, guildId
 */
export async function syncDiscordRolesForUser(
  userId: string,
  discordGuilds: Array<{ id: string; name?: string }> = [],
  discordRolesByGuild: Map<string, string[]> = new Map(),
  _isAdmin: boolean = false
): Promise<void> {
  try {
    const e = await getCasbinEnforcer();

    console.log(`[casbin:sync] Starting role sync for user ${userId}`);

    // For each guild the user is a member of, compute and apply roles
    for (const guild of discordGuilds) {
      const guildId = guild.id;
      const discordRoleIds = discordRolesByGuild.get(guildId) || [];

      const effectiveRoles = computeEffectiveRoles(discordRoleIds);

      // Update Casbin grouping policies for this domain (guild)
      await updateCasbinGroupingPolicies(e, userId, guildId, effectiveRoles);

      console.log(
        `[casbin:sync] User ${userId} in guild ${guildId} roles: [${Array.from(effectiveRoles).join(", ")}]`
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
 * Compute effective roles for a user in a specific guild.
 * Every Discord role becomes a Casbin role subject: role:discord:{discordRoleId}
 */
function computeEffectiveRoles(discordRoleIds: string[]): Set<string> {
  const effectiveRoles = new Set<string>();

  for (const roleId of discordRoleIds.map((r) => String(r).trim()).filter(Boolean)) {
    effectiveRoles.add(`role:discord:${roleId}`);
  }

  effectiveRoles.add("user");
  return effectiveRoles;
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
