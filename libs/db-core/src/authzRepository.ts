import { sql } from "kysely";
import { getDb, type DatabaseSchema } from "./dbClient.ts";

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((v) => v.trim()).filter(Boolean);
  return [];
}

function normalizePermissionString(permission: string): string {
  const raw = String(permission || "").trim();
  if (!raw) return "";

  // Back-compat: action-first strings.
  if (raw === "read:admin") return "admin:read";
  if (raw === "write:admin") return "admin:write";

  // Back-compat: older resource name "facts".
  if (raw.startsWith("facts:")) return `fact:${raw.slice("facts:".length)}`;

  return raw;
}

function parsePermission(permission: string): { resource: string; action: string } | null {
  const normalized = normalizePermissionString(permission);
  if (normalized === "superuser") return { resource: "superuser", action: "allow" };
  const idx = normalized.lastIndexOf(":");
  if (idx <= 0 || idx === normalized.length - 1) return null;
  return { resource: normalized.slice(0, idx), action: normalized.slice(idx + 1) };
}

function toPermissionString(resource: string, action: string): string {
  if (resource === "superuser" && action === "allow") return "superuser";
  if (resource === "fact" && action === "superuser") return "fact:superuser";
  return `${resource}:${action}`;
}

function toCasbinPolicyValues(policy: { subject: string; resource: string; action: string }) {
  return {
    ptype: "p",
    v0: policy.subject,
    v1: "global",
    v2: policy.resource,
    v3: policy.action,
    v4: null,
    v5: null,
  } as const;
}

export type KnownDiscordUser = {
  userId: string;
  username: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

export async function upsertKnownDiscordUser(userIdInput: unknown, usernameInput: unknown): Promise<void> {
  const userId = String(userIdInput || "").trim();
  if (!userId) return;
  const username = usernameInput == null ? null : String(usernameInput).trim() || null;

  const db = getDb();
  const now = new Date().toISOString();

  await db
    .insertInto("known_discord_user")
    .values({
      discord_user_id: userId,
      discord_username: username,
      first_seen_at: now,
      last_seen_at: now,
    })
    .onConflict((oc) =>
      oc.column("discord_user_id").doUpdateSet({
        discord_username: username,
        last_seen_at: now,
      }),
    )
    .execute();
}

export async function listKnownDiscordUsers(limit = 200): Promise<KnownDiscordUser[]> {
  const db = getDb();
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(1000, Math.floor(limit))) : 200;

  const rows = await db
    .selectFrom("known_discord_user")
    .select((eb) => [
      eb.ref("discord_user_id").as("userId"),
      eb.ref("discord_username").as("username"),
      eb.ref("first_seen_at").as("firstSeenAt"),
      eb.ref("last_seen_at").as("lastSeenAt"),
    ])
    .orderBy("last_seen_at", "desc")
    .limit(safeLimit)
    .execute();

  return rows as KnownDiscordUser[];
}

export type LoginConstraints = {
  whitelistUsers: string[];
  requiredRolesByGuild: Record<string, string[]>;
};

export async function getLoginConstraints(): Promise<LoginConstraints> {
  const db = getDb();

  const [whitelistRows, guildRows] = await Promise.all([
    db.selectFrom("login_whitelist").select(["discord_user_id"]).execute(),
    db.selectFrom("guild_login_requirement")
      .select(["guild_id", "required_role_ids_json"])
      .execute(),
  ]);

  const requiredRolesByGuild: Record<string, string[]> = {};
  for (const row of guildRows) {
    const guildId = String(row.guild_id || "").trim();
    if (!guildId) continue;
    try {
      const parsed = row.required_role_ids_json ? JSON.parse(String(row.required_role_ids_json)) : [];
      requiredRolesByGuild[guildId] = normalizeStringArray(parsed);
    } catch {
      requiredRolesByGuild[guildId] = [];
    }
  }

  return {
    whitelistUsers: whitelistRows.map((r) => String(r.discord_user_id)),
    requiredRolesByGuild,
  };
}

export async function addWhitelistUser(userIdInput: unknown): Promise<void> {
  const userId = String(userIdInput || "").trim();
  if (!userId) return;
  const db = getDb();
  await db
    .insertInto("login_whitelist")
    .values({ discord_user_id: userId, created_at: new Date().toISOString() })
    .onConflict((oc) => oc.column("discord_user_id").doNothing())
    .execute();
}

export async function removeWhitelistUser(userIdInput: unknown): Promise<void> {
  const userId = String(userIdInput || "").trim();
  if (!userId) return;
  const db = getDb();
  await db.deleteFrom("login_whitelist").where("discord_user_id", "=", userId).execute();
}

export async function listWhitelistUsers(): Promise<string[]> {
  const db = getDb();
  const rows = await db.selectFrom("login_whitelist").select(["discord_user_id"]).execute();
  return rows.map((r) => String(r.discord_user_id));
}

export async function setGuildLoginRequirement(guildIdInput: unknown, requiredRoleIdsInput: unknown): Promise<void> {
  const guildId = String(guildIdInput || "").trim();
  if (!guildId) return;
  const requiredRoleIds = normalizeStringArray(requiredRoleIdsInput);
  const payload = requiredRoleIds.length ? JSON.stringify(requiredRoleIds) : null;
  const now = new Date().toISOString();
  const db = getDb();
  await db
    .insertInto("guild_login_requirement")
    .values({ guild_id: guildId, required_role_ids_json: payload, updated_at: now })
    .onConflict((oc) =>
      oc.column("guild_id").doUpdateSet({
        required_role_ids_json: payload,
        updated_at: now,
      }),
    )
    .execute();
}

export type SubjectPermissionSnapshot = {
  rolePermissions: Record<string, string[]>;
  userPermissions: Record<string, string[]>;
};

async function listPermissionsBySubjectPrefix(prefix: string): Promise<Record<string, string[]>> {
  const db = getDb();
  const rows = await db
    .selectFrom("casbin_rule")
    .select(["v0", "v2", "v3"])
    .where("ptype", "=", "p")
    .where("v1", "=", "global")
    .where("v0", "like", `${prefix}%`)
    .execute();

  const out: Record<string, string[]> = {};
  for (const row of rows) {
    const subject = String(row.v0 || "");
    const resource = String(row.v2 || "").trim();
    const action = String(row.v3 || "").trim();
    if (!subject || !resource || !action) continue;
    out[subject] ??= [];
    out[subject]!.push(toPermissionString(resource, action));
  }

  for (const key of Object.keys(out)) out[key] = Array.from(new Set(out[key])).sort();
  return out;
}

export async function getAdminConfigSnapshot(): Promise<SubjectPermissionSnapshot> {
  const [roleSubjects, userSubjects] = await Promise.all([
    listPermissionsBySubjectPrefix("role:discord:"),
    listPermissionsBySubjectPrefix("user:"),
  ]);

  const rolePermissions: Record<string, string[]> = {};
  for (const [subject, perms] of Object.entries(roleSubjects)) {
    const roleId = subject.slice("role:discord:".length);
    if (!roleId) continue;
    rolePermissions[roleId] = perms;
  }

  const userPermissions: Record<string, string[]> = {};
  for (const [subject, perms] of Object.entries(userSubjects)) {
    if (subject === "user") continue;
    const userId = subject.slice("user:".length);
    if (!userId) continue;
    userPermissions[userId] = perms;
  }

  return { rolePermissions, userPermissions };
}

async function replaceSubjectPermissions(subject: string, permissionsInput: unknown): Promise<string[]> {
  const subjectKey = String(subject || "").trim();
  if (!subjectKey) return [];
  const permissions = normalizeStringArray(permissionsInput);
  const parsedPermissions = permissions
    .map((p) => normalizePermissionString(String(p)))
    .map(parsePermission)
    .filter(Boolean) as Array<{ resource: string; action: string }>;

  const db = getDb();

  await db
    .deleteFrom("casbin_rule")
    .where("ptype", "=", "p")
    .where("v0", "=", subjectKey)
    .where("v1", "=", "global")
    .execute();

  if (parsedPermissions.length) {
    const inserts = parsedPermissions.map((p) =>
      toCasbinPolicyValues({ subject: subjectKey, resource: p.resource, action: p.action }),
    );
    await db.insertInto("casbin_rule").values(inserts as any).execute();
  }

  return parsedPermissions.map((p) => `${p.resource}:${p.action}`).sort();
}

export async function setRolePermissions(roleIdInput: unknown, permissionsInput: unknown): Promise<string[]> {
  const roleId = String(roleIdInput || "").trim();
  if (!roleId) return [];
  return replaceSubjectPermissions(`role:discord:${roleId}`, permissionsInput);
}

export async function setUserPermissions(userIdInput: unknown, permissionsInput: unknown): Promise<string[]> {
  const userId = String(userIdInput || "").trim();
  if (!userId) return [];
  return replaceSubjectPermissions(`user:${userId}`, permissionsInput);
}

export async function removeUserPermissions(userIdInput: unknown): Promise<void> {
  const userId = String(userIdInput || "").trim();
  if (!userId) return;
  const db = getDb();
  await db
    .deleteFrom("casbin_rule")
    .where("ptype", "=", "p")
    .where("v0", "=", `user:${userId}`)
    .where("v1", "=", "global")
    .execute();
}

export async function getPermissionsForSubjects(subjects: string[]): Promise<string[]> {
  const normalized = Array.from(new Set(subjects.map((s) => String(s).trim()).filter(Boolean)));
  if (!normalized.length) return [];

  const db = getDb();
  const rows = await db
    .selectFrom("casbin_rule")
    .select(["v2", "v3"])
    .where("ptype", "=", "p")
    .where("v1", "=", "global")
    .where("v0", "in", normalized)
    .execute();

  const perms = new Set<string>();
  for (const row of rows) {
    const resource = String(row.v2 || "").trim();
    const action = String(row.v3 || "").trim();
    if (!resource || !action) continue;
    perms.add(normalizePermissionString(toPermissionString(resource, action)));
  }
  return Array.from(perms).sort();
}

// Base policies are intentionally not seeded in code.
// All permissions are managed via the admin API and stored in the database.
