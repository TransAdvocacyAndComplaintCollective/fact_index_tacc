/**
 * Discord Role Sync Service
 * Syncs Discord guild membership and roles to local app roles
 * Works with the new identity-based user model
 */

import { getDb } from "@factdb/db-core";
import crypto from "crypto";

export interface DiscordGuild {
  id: string;
  name: string;
}

export interface DiscordGuildMember {
  guildId: string;
  roleIds: string[];
}

/**
 * Sync Discord guild membership for a user
 * Called after Discord OAuth login
 */
export async function syncDiscordMembership(
  userId: string,
  discordUserId: string,
  guilds: DiscordGuild[],
  rolesByGuild: Map<string, string[]>
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  // Get all configured guilds with role mappings
  const guildMappings = await db
    .selectFrom("discord_role_map")
    .selectAll()
    .execute();

  // Group by guild for faster lookup
  const mappingsByGuild = new Map<string, typeof guildMappings>();
  for (const mapping of guildMappings) {
    if (!mappingsByGuild.has(mapping.guildId)) {
      mappingsByGuild.set(mapping.guildId, []);
    }
    mappingsByGuild.get(mapping.guildId)!.push(mapping);
  }

  // Process each guild
  for (const guild of guilds) {
    const guildId = guild.id;
    const discordRoleIds = rolesByGuild.get(guildId) || [];

    // Upsert membership record
    await db
      .insertInto("discord_membership")
      .values({
        userId,
        discordUserId,
        guildId,
        rolesJson: JSON.stringify(discordRoleIds),
        syncedAt: now,
      })
      .onConflict((oc) =>
        oc.columns(["userId", "guildId"]).doUpdateSet({
          rolesJson: JSON.stringify(discordRoleIds),
          syncedAt: now,
        })
      )
      .execute();

    // Compute effective local roles from Discord role mappings
    const effectiveRoles = new Set<string>();

    const guildMappings = mappingsByGuild.get(guildId) || [];
    for (const mapping of guildMappings) {
      if (discordRoleIds.includes(mapping.discordRoleId)) {
        effectiveRoles.add(mapping.localRole);
      }
    }

    // Sync local roles to database
    // Step 1: Remove all existing roles for this user in this guild
    await db
      .deleteFrom("local_role_assignment")
      .where("userId", "=", userId)
      .where("domain", "=", guildId)
      .execute();

    // Step 2: Add new roles
    for (const role of effectiveRoles) {
      await db
        .insertInto("local_role_assignment")
        .values({
          id: crypto.randomUUID(),
          userId,
          role,
          domain: guildId,
          createdAt: now,
          createdBy: null,
        })
        .execute();
    }

    console.log(
      `[sync-discord] User ${userId} in guild ${guildId} now has roles: [${Array.from(effectiveRoles).join(", ")}]`
    );
  }
}

/**
 * Get effective roles for user in a guild (combines Discord + local roles)
 */
export async function getUserRolesInGuild(
  userId: string,
  guildId: string
): Promise<string[]> {
  const db = getDb();

  const assignments = await db
    .selectFrom("local_role_assignment")
    .select("role")
    .where("userId", "=", userId)
    .where("domain", "=", guildId)
    .execute();

  return assignments.map((a) => a.role);
}

/**
 * Get global roles for user (not guild-scoped)
 */
export async function getUserGlobalRoles(userId: string): Promise<string[]> {
  const db = getDb();

  const assignments = await db
    .selectFrom("local_role_assignment")
    .select("role")
    .where("userId", "=", userId)
    .where("domain", "is", null)
    .execute();

  return assignments.map((a) => a.role);
}

/**
 * Assign a local role to user
 */
export async function assignLocalRole(
  userId: string,
  role: string,
  domain: string | null = null
): Promise<void> {
  const db = getDb();

  await db
    .insertInto("local_role_assignment")
    .values({
      id: crypto.randomUUID(),
      userId,
      role,
      domain,
      createdAt: new Date().toISOString(),
      createdBy: null,
    })
    .onConflict((oc) =>
      oc.columns(["userId", "role", "domain"]).doNothing()
    )
    .execute();

  console.log(
    `[sync-discord] Assigned role ${role} to user ${userId}` +
      (domain ? ` in domain ${domain}` : " (global)")
  );
}

/**
 * Revoke a local role from user
 */
export async function revokeLocalRole(
  userId: string,
  role: string,
  domain: string | null = null
): Promise<void> {
  const db = getDb();

  await db
    .deleteFrom("local_role_assignment")
    .where("userId", "=", userId)
    .where("role", "=", role)
    .where((eb) =>
      domain ? eb("domain", "=", domain) : eb("domain", "is", null)
    )
    .execute();

  console.log(
    `[sync-discord] Revoked role ${role} from user ${userId}` +
      (domain ? ` in domain ${domain}` : " (global)")
  );
}

/**
 * Setup Discord role mapping for a guild
 * Called during admin configuration
 */
export async function createDiscordRoleMapping(
  guildId: string,
  discordRoleId: string,
  localRole: string
): Promise<void> {
  const db = getDb();

  await db
    .insertInto("discord_role_map")
    .values({
      id: crypto.randomUUID(),
      guildId,
      discordRoleId,
      localRole,
      domain: guildId, // Usually same as guild ID
      createdAt: new Date().toISOString(),
    })
    .onConflict((oc) =>
      oc.columns(["guildId", "discordRoleId"]).doUpdateSet({
        localRole,
      })
    )
    .execute();

  console.log(
    `[sync-discord] Mapped Discord role ${discordRoleId} to local role ${localRole} in guild ${guildId}`
  );
}

/**
 * Get all role mappings for a guild
 */
export async function getGuildRoleMappings(guildId: string): Promise<any[]> {
  const db = getDb();

  return db
    .selectFrom("discord_role_map")
    .selectAll()
    .where("guildId", "=", guildId)
    .execute();
}

/**
 * Check if membership sync is stale
 */
export async function isMembershipSyncStale(
  userId: string,
  guildId: string,
  maxAgeMs: number = 3600000 // 1 hour
): Promise<boolean> {
  const db = getDb();

  const membership = await db
    .selectFrom("discord_membership")
    .select("syncedAt")
    .where("userId", "=", userId)
    .where("guildId", "=", guildId)
    .executeTakeFirst();

  if (!membership) {
    return true; // Never synced
  }

  const syncTime = new Date(membership.syncedAt).getTime();
  const now = Date.now();

  return now - syncTime > maxAgeMs;
}
