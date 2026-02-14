/**
 * Admin API for managing user roles and whitelist
 * Requires authentication; only admins configured in discord-auth.json can modify
 */

import express from "express";
import type { Request, Response, NextFunction } from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import logger from "../../logger.ts";
import { validateJWTOnly } from "../../auth/passport-discord.ts";
import { casbinMiddleware } from "../../auth/casbin.ts";
import { generateJWT } from "../../auth/jwt.ts";
import type { AuthStatus } from "@factdb/types";

const router = express.Router();

// Require JWT authentication on all admin endpoints
router.use(validateJWTOnly);

// Admin config file path
const __filename = fileURLToPath(import.meta.url);
const __dirname_local = path.dirname(__filename);
const CONFIG_DIR = path.resolve(__dirname_local, "..", "..", "config");
const CONFIG_PATH = path.join(CONFIG_DIR, "discord-auth.json");
const ALLOWED_FEDERATION_ENTITY_TYPES = [
  "openid_relying_party",
  "openid_provider",
  "oauth_client",
  "oauth_authorization_server",
  "oauth_resource",
] as const;

type DiscordMappingEntry = {
  id: string;
  discordGuildId?: string;
  discordUserId?: string;
  discordRoleId?: string;
  targetType: "action" | "role";
  targetValue: string;
  createdAt: string;
};

type OpenIdMappingEntry = {
  id: string;
  idType: "trust_mark" | "trust_anchor_trust_mark_issuer" | "provider_domain" | "trust_domain" | "issuer_domain_user_id" | "anyone";
  domain?: string;
  numHops?: number;
  userId?: string;
  targetType: "action" | "role";
  targetValue: string;
  createdAt: string;
};

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (value == null) {
    return [];
  }
  return [String(value).trim()].filter(Boolean);
}

function normalizeDomainArray(value: unknown): string[] {
  return normalizeStringArray(value)
    .map((domain) => domain.toLowerCase())
    .filter((domain) => /^[a-z0-9.-]+$/.test(domain));
}

function normalizeEntityTypes(value: unknown): string[] {
  const requested = normalizeStringArray(value);
  const allowed = new Set(ALLOWED_FEDERATION_ENTITY_TYPES);
  return requested.filter((entityType) => allowed.has(entityType as (typeof ALLOWED_FEDERATION_ENTITY_TYPES)[number]));
}

function normalizeAuthorizationDetails(value: unknown): Record<string, unknown>[] {
  if (value == null || value === "") return [];

  let parsed: unknown = value;
  if (typeof value === "string") {
    parsed = JSON.parse(value);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("defaultAuthorizationDetails must be a JSON array");
  }
  if (parsed.length > 20) {
    throw new Error("defaultAuthorizationDetails has too many entries (max 20)");
  }

  return parsed.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Each authorization_details entry must be an object");
    }

    const type = String((entry as any).type || "").trim();
    if (!type) {
      throw new Error('Each authorization_details entry requires a non-empty "type"');
    }

    return {
      ...(entry as Record<string, unknown>),
      type,
    };
  });
}

function normalizeDiscordMappings(value: unknown): DiscordMappingEntry[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const entry = item as Record<string, unknown>;
      const targetType = String(entry.targetType || "").trim().toLowerCase();
      const targetValue = String(entry.targetValue || "").trim();
      if ((targetType !== "action" && targetType !== "role") || !targetValue) {
        return null;
      }

      return {
        id: String(entry.id || "").trim() || crypto.randomUUID(),
        discordGuildId: String(entry.discordGuildId || "").trim() || undefined,
        discordUserId: String(entry.discordUserId || "").trim() || undefined,
        discordRoleId: String(entry.discordRoleId || "").trim() || undefined,
        targetType: targetType as "action" | "role",
        targetValue,
        createdAt: String(entry.createdAt || "").trim() || new Date().toISOString(),
      };
    })
    .filter((item): item is DiscordMappingEntry => Boolean(item));
}

function normalizeOpenIdMappings(value: unknown): OpenIdMappingEntry[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const entry = item as Record<string, unknown>;
      const idType = String(entry.idType || "").trim().toLowerCase();
      const targetType = String(entry.targetType || "").trim().toLowerCase();
      const domain = String(entry.domain || "").trim().toLowerCase();
      const targetValue = String(entry.targetValue || "").trim();
      const rawNumHops = Number(entry.numHops);
      const numHops = Number.isFinite(rawNumHops) ? Math.max(0, Math.floor(rawNumHops)) : undefined;
      const userId = String(entry.userId || "").trim() || undefined;

      const validIdType =
        idType === "trust_mark" ||
        idType === "trust_anchor_trust_mark_issuer" ||
        idType === "provider_domain" ||
        idType === "trust_domain" ||
        idType === "issuer_domain_user_id" ||
        idType === "anyone";
      const validTargetType = targetType === "action" || targetType === "role";
      if (!validIdType || !validTargetType || !targetValue) return null;
      if (idType !== "anyone" && !domain) return null;
      if (idType === "issuer_domain_user_id" && !userId) return null;

      return {
        id: String(entry.id || "").trim() || crypto.randomUUID(),
        idType: idType as OpenIdMappingEntry["idType"],
        domain: domain || undefined,
        numHops: idType === "trust_domain" || idType === "issuer_domain_user_id" ? numHops : undefined,
        userId,
        targetType: targetType as OpenIdMappingEntry["targetType"],
        targetValue,
        createdAt: String(entry.createdAt || "").trim() || new Date().toISOString(),
      };
    })
    .filter((item): item is OpenIdMappingEntry => Boolean(item));
}

/**
 * Load current config
 */
function loadConfig(): Record<string, any> {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      return { guilds: {}, roles: {}, userRoles: {}, whitelistUsers: [], adminUsers: [], discordMappings: [], openidMappings: [] };
    }
    const raw = fs.readFileSync(CONFIG_PATH, { encoding: "utf8" });
    const parsed = raw ? JSON.parse(raw) : {};
    const config: Record<string, any> = { ...parsed };
    config.guilds = parsed?.guilds && typeof parsed.guilds === "object" ? parsed.guilds : {};
    config.roles =
      parsed?.roles && typeof parsed.roles === "object"
        ? Object.fromEntries(
            Object.entries(parsed.roles as Record<string, any>).map(([roleId, roleValue]) => {
              const role = roleValue && typeof roleValue === "object" ? roleValue : {};
              return [
                roleId,
                {
                  ...role,
                  name: String((role as any).name || "").trim() || undefined,
                  type: String((role as any).type || "").trim() || undefined,
                  description: String((role as any).description || "").trim() || undefined,
                  permissions: normalizeStringArray((role as any).permissions),
                },
              ];
            })
          )
        : {};
    config.userRoles =
      parsed?.userRoles && typeof parsed.userRoles === "object" && !Array.isArray(parsed.userRoles)
        ? parsed.userRoles
        : {};
    config.whitelistUsers = normalizeStringArray(parsed?.whitelistUsers);
    config.adminUsers = normalizeStringArray(parsed?.adminUsers);
    config.discordMappings = normalizeDiscordMappings(parsed?.discordMappings);
    config.openidMappings = normalizeOpenIdMappings(parsed?.openidMappings);
    config.federationPolicy =
      parsed?.federationPolicy && typeof parsed.federationPolicy === "object"
        ? {
            namingConstraints: normalizeDomainArray(parsed.federationPolicy.namingConstraints),
            allowSubdomains: Boolean(parsed.federationPolicy.allowSubdomains ?? true),
            allowedEntityTypes: normalizeEntityTypes(parsed.federationPolicy.allowedEntityTypes),
            maxPathLength: Number.isInteger(parsed.federationPolicy.maxPathLength)
              ? parsed.federationPolicy.maxPathLength
              : 2,
            trustAnchorEntityId: String(parsed.federationPolicy.trustAnchorEntityId || "").trim() || undefined,
            defaultAuthorizationDetails: (() => {
              try {
                return normalizeAuthorizationDetails(parsed.federationPolicy.defaultAuthorizationDetails);
              } catch {
                return [];
              }
            })(),
          }
        : {
            namingConstraints: [],
            allowSubdomains: true,
            allowedEntityTypes: ["openid_relying_party", "oauth_client"],
            maxPathLength: 2,
            trustAnchorEntityId: undefined,
            defaultAuthorizationDetails: [],
          };
    config.trustMarkPolicy =
      parsed?.trustMarkPolicy && typeof parsed.trustMarkPolicy === "object"
        ? {
            requiredTrustMarks: normalizeStringArray(parsed.trustMarkPolicy.requiredTrustMarks),
            claimChecks: Array.isArray(parsed.trustMarkPolicy.claimChecks)
              ? parsed.trustMarkPolicy.claimChecks
                  .map((entry: any) => ({
                    claim: String(entry?.claim || "").trim(),
                    operator: String(entry?.operator || "equals").trim(),
                    value: String(entry?.value ?? "").trim(),
                  }))
                  .filter((entry: any) => entry.claim)
              : [],
          }
        : {
            requiredTrustMarks: [],
            claimChecks: [],
          };

    return config;
  } catch (err) {
    logger.error(`[admin] Failed to load config:`, err);
    return {
      guilds: {},
      roles: {},
      userRoles: {},
      whitelistUsers: [],
      adminUsers: [],
      discordMappings: [],
      openidMappings: [],
      federationPolicy: {
        namingConstraints: [],
        allowSubdomains: true,
        allowedEntityTypes: ["openid_relying_party", "oauth_client"],
        maxPathLength: 2,
        trustAnchorEntityId: undefined,
        defaultAuthorizationDetails: [],
      },
      trustMarkPolicy: {
        requiredTrustMarks: [],
        claimChecks: [],
      },
    };
  }
}

/**
 * Save config to disk
 */
function saveConfig(config: Record<string, any>): boolean {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { encoding: "utf8" });
    logger.info(`[admin] Config saved to ${CONFIG_PATH}`);
    return true;
  } catch (err) {
    logger.error(`[admin] Failed to save config:`, err);
    return false;
  }
}

/**
 * GET /auth/admin/user-roles - List all user role assignments
 */
router.get("/user-roles", casbinMiddleware("admin:users", "read"), (req: Request, res: Response) => {
  const config = loadConfig();
  return res.json({
    userRoles: config.userRoles || {},
    whitelistUsers: config.whitelistUsers || [],
    adminUsers: config.adminUsers || [],
    guilds: config.guilds || {},
    roles: config.roles || {},
  });
});

/**
 * POST /auth/admin/user-roles - Assign roles to a user
 * Body: { userId: string, roles: string[] }
 */
router.post("/user-roles", casbinMiddleware("admin:users", "write"), (req: Request, res: Response) => {
  const { userId, roles } = req.body as { userId?: string; roles?: string[] };

  if (!userId || !Array.isArray(roles)) {
    return res.status(400).json({ error: "Invalid request", message: "userId and roles array required" });
  }

  const normalizedRoles = roles.map((r) => String(r).trim()).filter(Boolean);
  if (!normalizedRoles.length) {
    return res.status(400).json({ error: "Invalid request", message: "roles cannot be empty" });
  }

  const config = loadConfig();
  if (!config.userRoles || typeof config.userRoles !== "object" || Array.isArray(config.userRoles)) {
    config.userRoles = {};
  }
  (config.userRoles as Record<string, string[]>)[userId] = normalizedRoles;

  if (saveConfig(config)) {
    logger.info(`[admin] Assigned roles to user ${userId}: ${normalizedRoles.join(", ")}`);
    return res.json({ success: true, userId, roles: normalizedRoles });
  }

  return res.status(500).json({ error: "Failed to save config" });
});

/**
 * DELETE /auth/admin/user-roles/:userId - Remove a user's role assignments
 */
router.delete("/user-roles/:userId", casbinMiddleware("admin:users", "write"), (req: Request, res: Response) => {
  const userId = (req.params as any).userId as string;

  const config = loadConfig();
  const userRoles = config.userRoles as any;
  if (userRoles && typeof userRoles === "object" && !Array.isArray(userRoles)) {
    delete userRoles[userId];
  }

  if (saveConfig(config)) {
    logger.info(`[admin] Removed role assignments for user ${userId}`);
    return res.json({ success: true, userId });
  }

  return res.status(500).json({ error: "Failed to save config" });
});

/**
 * POST /auth/admin/whitelist - Add a user to whitelist (auth outside guild)
 * Body: { userId: string }
 */
router.post("/whitelist", casbinMiddleware("admin:whitelist", "write"), (req: Request, res: Response) => {
  const { userId } = req.body as { userId?: string };

  if (!userId) {
    return res.status(400).json({ error: "Invalid request", message: "userId required" });
  }

  const config = loadConfig();
  config.whitelistUsers = Array.isArray(config.whitelistUsers) ? config.whitelistUsers : [];

  if (!config.whitelistUsers.includes(userId)) {
    config.whitelistUsers.push(userId);
  }

  if (saveConfig(config)) {
    logger.info(`[admin] Added user ${userId} to whitelist`);
    return res.json({ success: true, userId, whitelistUsers: config.whitelistUsers });
  }

  return res.status(500).json({ error: "Failed to save config" });
});

/**
 * DELETE /auth/admin/whitelist/:userId - Remove a user from whitelist
 */
router.delete("/whitelist/:userId", casbinMiddleware("admin:whitelist", "write"), (req: Request, res: Response) => {
  const userId = (req.params as any).userId as string;

  const config = loadConfig();
  config.whitelistUsers = Array.isArray(config.whitelistUsers) ? config.whitelistUsers : [];
  config.whitelistUsers = config.whitelistUsers.filter((id: any) => id !== userId);

  if (saveConfig(config)) {
    logger.info(`[admin] Removed user ${userId} from whitelist`);
    return res.json({ success: true, userId, whitelistUsers: config.whitelistUsers });
  }

  return res.status(500).json({ error: "Failed to save config" });
});

/**
 * POST /auth/admin/admin-users - Add a user to admin list
 * Body: { userId: string }
 */
router.post("/admin-users", casbinMiddleware("admin:users", "write"), (req: Request, res: Response) => {
  const { userId } = req.body as { userId?: string };
  if (!userId) {
    return res.status(400).json({ error: "Invalid request", message: "userId required" });
  }

  const config = loadConfig();
  config.adminUsers = Array.isArray(config.adminUsers) ? config.adminUsers : [];

  if (!config.adminUsers.includes(userId)) {
    config.adminUsers.push(userId);
  }

  if (saveConfig(config)) {
    logger.info(`[admin] Added admin user ${userId}`);
    return res.json({ success: true, userId, adminUsers: config.adminUsers });
  }

  return res.status(500).json({ error: "Failed to save config" });
});

/**
 * DELETE /auth/admin/admin-users/:userId - Remove a user from admin list
 */
router.delete("/admin-users/:userId", casbinMiddleware("admin:users", "write"), (req: Request, res: Response) => {
  const userId = (req.params as any).userId as string;

  const config = loadConfig();
  config.adminUsers = Array.isArray(config.adminUsers) ? config.adminUsers : [];
  config.adminUsers = config.adminUsers.filter((id: string) => id !== userId);

  if (saveConfig(config)) {
    logger.info(`[admin] Removed admin user ${userId}`);
    return res.json({ success: true, userId, adminUsers: config.adminUsers });
  }

  return res.status(500).json({ error: "Failed to save config" });
});

/**
 * POST /auth/admin/guilds - Add or update a guild config
 * Body: { guildId: string, requiredRole?: string|string[], name?: string }
 */
router.post("/guilds", casbinMiddleware("admin:guilds", "write"), (req: Request, res: Response) => {
  const { guildId, requiredRole, name } = req.body as {
    guildId?: string;
    requiredRole?: string | string[];
    name?: string;
  };

  if (!guildId) {
    return res.status(400).json({ error: "Invalid request", message: "guildId required" });
  }

  const config = loadConfig();
  config.guilds = config.guilds && typeof config.guilds === "object" ? config.guilds : {};

  const normalizedRoles = normalizeStringArray(requiredRole);
  (config.guilds as Record<string, any>)[guildId] = {
    ...(config.guilds as Record<string, any>)[guildId],
    requiredRole: normalizedRoles.length ? normalizedRoles : null,
    name: name ? String(name).trim() : (config.guilds as Record<string, any>)[guildId]?.name,
  };

  if (saveConfig(config)) {
    logger.info(`[admin] Upserted guild ${guildId} (roles=${normalizedRoles.join(", ") || "none"})`);
    return res.json({ success: true, guildId, guild: (config.guilds as Record<string, any>)[guildId] });
  }

  return res.status(500).json({ error: "Failed to save config" });
});

/**
 * POST /auth/admin/discord-mappings - Add or update a Discord mapping entry
 * Body: {
 *   id?: string,
 *   discordGuildId?: string,
 *   discordUserId?: string,
 *   discordRoleId?: string,
 *   targetType: "action" | "role",
 *   targetValue: string
 * }
 */
router.post("/discord-mappings", casbinMiddleware("admin:roles", "write"), (req: Request, res: Response) => {
  const {
    id,
    discordGuildId,
    discordUserId,
    discordRoleId,
    targetType,
    targetValue,
  } = req.body as {
    id?: string;
    discordGuildId?: string;
    discordUserId?: string;
    discordRoleId?: string;
    targetType?: string;
    targetValue?: string;
  };

  const normalizedGuildId = String(discordGuildId || "").trim();
  const normalizedUserId = String(discordUserId || "").trim();
  const normalizedRoleId = String(discordRoleId || "").trim();
  const normalizedTargetType = String(targetType || "").trim().toLowerCase();
  const normalizedTargetValue = String(targetValue || "").trim();
  const normalizedId = String(id || "").trim();

  if (!normalizedGuildId && !normalizedUserId && !normalizedRoleId) {
    return res.status(400).json({
      error: "Invalid request",
      message: "At least one of discordGuildId, discordUserId, or discordRoleId is required",
    });
  }
  if (normalizedTargetType !== "action" && normalizedTargetType !== "role") {
    return res.status(400).json({ error: "Invalid request", message: "targetType must be 'action' or 'role'" });
  }
  if (!normalizedTargetValue) {
    return res.status(400).json({ error: "Invalid request", message: "targetValue is required" });
  }

  const config = loadConfig();
  const mappings = normalizeDiscordMappings(config.discordMappings);
  const scopeKey = [
    normalizedGuildId || "-",
    normalizedUserId || "-",
    normalizedRoleId || "-",
    normalizedTargetType,
  ].join("|");

  const existingIndexByScope = mappings.findIndex((entry) => {
    const entryScopeKey = [
      entry.discordGuildId || "-",
      entry.discordUserId || "-",
      entry.discordRoleId || "-",
      entry.targetType,
    ].join("|");
    return entryScopeKey === scopeKey;
  });
  const existingIndexById = normalizedId ? mappings.findIndex((entry) => entry.id === normalizedId) : -1;
  const existingIndex = existingIndexById >= 0 ? existingIndexById : existingIndexByScope;

  const record: DiscordMappingEntry = {
    id: normalizedId || (existingIndex >= 0 ? mappings[existingIndex].id : crypto.randomUUID()),
    discordGuildId: normalizedGuildId || undefined,
    discordUserId: normalizedUserId || undefined,
    discordRoleId: normalizedRoleId || undefined,
    targetType: normalizedTargetType as "action" | "role",
    targetValue: normalizedTargetValue,
    createdAt: existingIndex >= 0 ? mappings[existingIndex].createdAt : new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    mappings[existingIndex] = record;
  } else {
    mappings.push(record);
  }

  config.discordMappings = mappings;
  if (saveConfig(config)) {
    logger.info(`[admin] Upserted discord mapping ${record.id} (${record.targetType}:${record.targetValue})`);
    return res.json({ success: true, mapping: record, discordMappings: mappings });
  }

  return res.status(500).json({ error: "Failed to save config" });
});

/**
 * DELETE /auth/admin/discord-mappings/:id - Remove a Discord mapping
 */
router.delete("/discord-mappings/:id", casbinMiddleware("admin:roles", "write"), (req: Request, res: Response) => {
  const id = String((req.params as any).id || "").trim();
  if (!id) {
    return res.status(400).json({ error: "Invalid request", message: "id required" });
  }

  const config = loadConfig();
  const mappings = normalizeDiscordMappings(config.discordMappings);
  const nextMappings = mappings.filter((entry) => entry.id !== id);
  config.discordMappings = nextMappings;

  if (saveConfig(config)) {
    logger.info(`[admin] Removed discord mapping ${id}`);
    return res.json({ success: true, id, discordMappings: nextMappings });
  }

  return res.status(500).json({ error: "Failed to save config" });
});

/**
 * POST /auth/admin/openid-mappings - Add or update an OpenID mapping entry
 * Body: {
 *   id?: string,
 *   idType: "trust_mark" | "trust_anchor_trust_mark_issuer" | "provider_domain" | "trust_domain" | "issuer_domain_user_id" | "anyone",
 *   domain?: string,
 *   numHops?: number,
 *   userId?: string,
 *   targetType: "action" | "role",
 *   targetValue: string
 * }
 */
router.post("/openid-mappings", casbinMiddleware("admin:roles", "write"), (req: Request, res: Response) => {
  const { id, idType, domain, numHops, userId, targetType, targetValue } = req.body as {
    id?: string;
    idType?: string;
    domain?: string;
    numHops?: unknown;
    userId?: string;
    targetType?: string;
    targetValue?: string;
  };

  const normalizedIdType = String(idType || "").trim().toLowerCase();
  const normalizedDomain = String(domain || "").trim().toLowerCase();
  const normalizedUserId = String(userId || "").trim();
  const normalizedTargetType = String(targetType || "").trim().toLowerCase();
  const normalizedTargetValue = String(targetValue || "").trim();
  const normalizedId = String(id || "").trim();
  const numericNumHops = Number(numHops);

  if (
    normalizedIdType !== "trust_mark" &&
    normalizedIdType !== "trust_anchor_trust_mark_issuer" &&
    normalizedIdType !== "provider_domain" &&
    normalizedIdType !== "trust_domain" &&
    normalizedIdType !== "issuer_domain_user_id" &&
    normalizedIdType !== "anyone"
  ) {
    return res.status(400).json({ error: "Invalid request", message: "Invalid idType" });
  }
  if (normalizedIdType !== "anyone" && !normalizedDomain) {
    return res.status(400).json({ error: "Invalid request", message: "domain is required" });
  }
  if (normalizedIdType === "issuer_domain_user_id" && !normalizedUserId) {
    return res.status(400).json({ error: "Invalid request", message: "userId is required for issuer_domain_user_id" });
  }
  if (
    (normalizedIdType === "trust_domain" || normalizedIdType === "issuer_domain_user_id") &&
    (!Number.isFinite(numericNumHops) || numericNumHops < 0)
  ) {
    return res.status(400).json({ error: "Invalid request", message: "numHops must be a non-negative number" });
  }
  if (normalizedTargetType !== "action" && normalizedTargetType !== "role") {
    return res.status(400).json({ error: "Invalid request", message: "targetType must be 'action' or 'role'" });
  }
  if (!normalizedTargetValue) {
    return res.status(400).json({ error: "Invalid request", message: "targetValue is required" });
  }

  const config = loadConfig();
  const mappings = normalizeOpenIdMappings(config.openidMappings);
  const scopeKey = [
    normalizedIdType,
    normalizedIdType === "anyone" ? "*" : normalizedDomain,
    normalizedIdType === "issuer_domain_user_id" ? normalizedUserId : "-",
    normalizedTargetType,
  ].join("|");

  const existingIndexByScope = mappings.findIndex((entry) => {
    const entryScopeKey = [
      entry.idType,
      entry.idType === "anyone" ? "*" : entry.domain || "",
      entry.idType === "issuer_domain_user_id" ? entry.userId || "" : "-",
      entry.targetType,
    ].join("|");
    return entryScopeKey === scopeKey;
  });
  const existingIndexById = normalizedId ? mappings.findIndex((entry) => entry.id === normalizedId) : -1;
  const existingIndex = existingIndexById >= 0 ? existingIndexById : existingIndexByScope;

  const record: OpenIdMappingEntry = {
    id: normalizedId || (existingIndex >= 0 ? mappings[existingIndex].id : crypto.randomUUID()),
    idType: normalizedIdType as OpenIdMappingEntry["idType"],
    domain: normalizedIdType === "anyone" ? undefined : normalizedDomain,
    numHops:
      normalizedIdType === "trust_domain" || normalizedIdType === "issuer_domain_user_id"
        ? Math.max(0, Math.floor(numericNumHops))
        : undefined,
    userId: normalizedIdType === "issuer_domain_user_id" ? normalizedUserId : undefined,
    targetType: normalizedTargetType as OpenIdMappingEntry["targetType"],
    targetValue: normalizedTargetValue,
    createdAt: existingIndex >= 0 ? mappings[existingIndex].createdAt : new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    mappings[existingIndex] = record;
  } else {
    mappings.push(record);
  }

  config.openidMappings = mappings;
  if (saveConfig(config)) {
    logger.info(`[admin] Upserted openid mapping ${record.id} (${record.idType} -> ${record.targetType}:${record.targetValue})`);
    return res.json({ success: true, mapping: record, openidMappings: mappings });
  }

  return res.status(500).json({ error: "Failed to save config" });
});

/**
 * DELETE /auth/admin/openid-mappings/:id - Remove an OpenID mapping
 */
router.delete("/openid-mappings/:id", casbinMiddleware("admin:roles", "write"), (req: Request, res: Response) => {
  const id = String((req.params as any).id || "").trim();
  if (!id) {
    return res.status(400).json({ error: "Invalid request", message: "id required" });
  }

  const config = loadConfig();
  const mappings = normalizeOpenIdMappings(config.openidMappings);
  const nextMappings = mappings.filter((entry) => entry.id !== id);
  config.openidMappings = nextMappings;

  if (saveConfig(config)) {
    logger.info(`[admin] Removed openid mapping ${id}`);
    return res.json({ success: true, id, openidMappings: nextMappings });
  }

  return res.status(500).json({ error: "Failed to save config" });
});

/**
 * DELETE /auth/admin/guilds/:guildId - Remove a guild config
 */
router.delete("/guilds/:guildId", casbinMiddleware("admin:guilds", "write"), (req: Request, res: Response) => {
  const guildId = (req.params as any).guildId as string;

  const config = loadConfig();
  config.guilds = config.guilds && typeof config.guilds === "object" ? config.guilds : {};
  delete (config.guilds as Record<string, any>)[guildId];

  if (saveConfig(config)) {
    logger.info(`[admin] Removed guild ${guildId}`);
    return res.json({ success: true, guildId, guilds: config.guilds });
  }

  return res.status(500).json({ error: "Failed to save config" });
});

/**
 * POST /auth/admin/roles - Add or update a role config
 * Body: { roleId: string, name?: string, type?: string, description?: string, permissions?: string[] | string }
 */
router.post("/roles", casbinMiddleware("admin:roles", "write"), (req: Request, res: Response) => {
  const { roleId, name, type, description, permissions } = req.body as {
    roleId?: string;
    name?: string;
    type?: string;
    description?: string;
    permissions?: string[] | string;
  };

  if (!roleId) {
    return res.status(400).json({ error: "Invalid request", message: "roleId required" });
  }

  const config = loadConfig();
  config.roles = config.roles && typeof config.roles === "object" ? config.roles : {};
  const normalizedPermissions = normalizeStringArray(permissions);

  (config.roles as Record<string, any>)[roleId] = {
    ...(config.roles as Record<string, any>)[roleId],
    name: name ? String(name).trim() : (config.roles as Record<string, any>)[roleId]?.name,
    type: type ? String(type).trim() : (config.roles as Record<string, any>)[roleId]?.type,
    description: description
      ? String(description).trim()
      : (config.roles as Record<string, any>)[roleId]?.description,
    permissions:
      permissions !== undefined
        ? normalizedPermissions
        : normalizeStringArray((config.roles as Record<string, any>)[roleId]?.permissions),
  };

  if (saveConfig(config)) {
    logger.info(`[admin] Upserted role ${roleId}`);
    return res.json({ success: true, roleId, role: (config.roles as Record<string, any>)[roleId] });
  }

  return res.status(500).json({ error: "Failed to save config" });
});

/**
 * DELETE /auth/admin/roles/:roleId - Remove a role config
 */
router.delete("/roles/:roleId", casbinMiddleware("admin:roles", "write"), (req: Request, res: Response) => {
  const roleId = (req.params as any).roleId as string;

  const config = loadConfig();
  config.roles = config.roles && typeof config.roles === "object" ? config.roles : {};
  delete (config.roles as Record<string, any>)[roleId];

  if (saveConfig(config)) {
    logger.info(`[admin] Removed role ${roleId}`);
    return res.json({ success: true, roleId, roles: config.roles });
  }

  return res.status(500).json({ error: "Failed to save config" });
});

/**
 * GET /auth/admin/config - View current config (admin only)
 */
router.get("/config", casbinMiddleware("admin:config", "read"), (req: Request, res: Response) => {
  const config = loadConfig();
  return res.json(config);
});

/**
 * POST /auth/admin/federation/policy - Save trust anchor policy constraints
 * Body: {
 *   namingConstraints: string[],
 *   allowSubdomains?: boolean,
 *   allowedEntityTypes: string[],
 *   maxPathLength: number,
 *   trustAnchorEntityId?: string,
 *   defaultAuthorizationDetails?: Array<Record<string, unknown>> | string
 * }
 */
router.post("/federation/policy", casbinMiddleware("admin:config", "write"), (req: Request, res: Response) => {
  const {
    namingConstraints,
    allowSubdomains,
    allowedEntityTypes,
    maxPathLength,
    trustAnchorEntityId,
    defaultAuthorizationDetails,
  } = req.body as {
    namingConstraints?: unknown;
    allowSubdomains?: unknown;
    allowedEntityTypes?: unknown;
    maxPathLength?: unknown;
    trustAnchorEntityId?: unknown;
    defaultAuthorizationDetails?: unknown;
  };

  const normalizedNamingConstraints = normalizeDomainArray(namingConstraints);
  const normalizedEntityTypes = normalizeEntityTypes(allowedEntityTypes);
  const numericPathLength = Number(maxPathLength);

  if (!normalizedNamingConstraints.length) {
    return res.status(400).json({
      error: "Invalid request",
      message: "At least one valid naming constraint domain is required",
    });
  }

  if (!normalizedEntityTypes.length) {
    return res.status(400).json({
      error: "Invalid request",
      message: `allowedEntityTypes must include one of: ${ALLOWED_FEDERATION_ENTITY_TYPES.join(", ")}`,
    });
  }

  if (!Number.isInteger(numericPathLength) || numericPathLength < 0 || numericPathLength > 10) {
    return res.status(400).json({
      error: "Invalid request",
      message: "maxPathLength must be an integer between 0 and 10",
    });
  }

  let normalizedAuthorizationDetails: Record<string, unknown>[];
  try {
    normalizedAuthorizationDetails = normalizeAuthorizationDetails(defaultAuthorizationDetails);
  } catch (err) {
    return res.status(400).json({
      error: "Invalid request",
      message: err instanceof Error ? err.message : "Invalid defaultAuthorizationDetails",
    });
  }

  const config = loadConfig();
  config.federationPolicy = {
    namingConstraints: normalizedNamingConstraints,
    allowSubdomains: Boolean(allowSubdomains ?? true),
    allowedEntityTypes: normalizedEntityTypes,
    maxPathLength: numericPathLength,
    trustAnchorEntityId: String(trustAnchorEntityId || "").trim() || undefined,
    defaultAuthorizationDetails: normalizedAuthorizationDetails,
  };

  if (saveConfig(config)) {
    logger.info(`[admin] Updated federation policy`);
    return res.json({ success: true, federationPolicy: config.federationPolicy });
  }

  return res.status(500).json({ error: "Failed to save config" });
});

/**
 * POST /auth/admin/federation/trust-superior - Save immediate trust superior
 * Body: { trustAnchorEntityId: string }
 */
router.post("/federation/trust-superior", casbinMiddleware("admin:config", "write"), (req: Request, res: Response) => {
  const { trustAnchorEntityId } = req.body as {
    trustAnchorEntityId?: unknown;
  };

  const normalizedTrustAnchorEntityId = String(trustAnchorEntityId || "").trim();

  if (normalizedTrustAnchorEntityId) {
    try {
      // Validate URL format for immediate superior entity ID
      new URL(normalizedTrustAnchorEntityId);
    } catch {
      return res.status(400).json({
        error: "Invalid request",
        message: "trustAnchorEntityId must be a valid URL",
      });
    }
  }

  const config = loadConfig();
  const existingPolicy =
    config.federationPolicy && typeof config.federationPolicy === "object"
      ? config.federationPolicy
      : {
          namingConstraints: [],
          allowSubdomains: true,
          allowedEntityTypes: ["openid_relying_party", "oauth_client"],
          maxPathLength: 2,
          defaultAuthorizationDetails: [],
        };

  config.federationPolicy = {
    ...existingPolicy,
    trustAnchorEntityId: normalizedTrustAnchorEntityId || undefined,
  };

  if (saveConfig(config)) {
    logger.info(`[admin] Updated federation trust superior`);
    return res.json({
      success: true,
      trustAnchorEntityId: config.federationPolicy.trustAnchorEntityId || null,
      federationPolicy: config.federationPolicy,
    });
  }

  return res.status(500).json({ error: "Failed to save config" });
});

/**
 * POST /auth/admin/federation/trust-marks - Save trust mark requirements/claim checks
 * Body: {
 *   requiredTrustMarks: string[],
 *   claimChecks: Array<{ claim: string; operator: "equals"|"includes"|"regex"|"exists"; value?: string }>
 * }
 */
router.post("/federation/trust-marks", casbinMiddleware("admin:config", "write"), (req: Request, res: Response) => {
  const { requiredTrustMarks, claimChecks } = req.body as {
    requiredTrustMarks?: unknown;
    claimChecks?: unknown;
  };

  const normalizedTrustMarks = normalizeStringArray(requiredTrustMarks);
  const normalizedClaimChecks = Array.isArray(claimChecks)
    ? claimChecks
        .map((entry: any) => ({
          claim: String(entry?.claim || "").trim(),
          operator: String(entry?.operator || "equals").trim(),
          value: String(entry?.value ?? "").trim(),
        }))
        .filter((entry: any) => entry.claim)
    : [];

  const validOperators = new Set(["equals", "includes", "regex", "exists"]);
  for (const check of normalizedClaimChecks) {
    if (!validOperators.has(check.operator)) {
      return res.status(400).json({
        error: "Invalid request",
        message: `Invalid claim check operator "${check.operator}"`,
      });
    }

    if (check.operator !== "exists" && !check.value) {
      return res.status(400).json({
        error: "Invalid request",
        message: `Claim "${check.claim}" requires a value for operator "${check.operator}"`,
      });
    }
  }

  const config = loadConfig();
  config.trustMarkPolicy = {
    requiredTrustMarks: normalizedTrustMarks,
    claimChecks: normalizedClaimChecks,
  };

  if (saveConfig(config)) {
    logger.info(`[admin] Updated trust mark policy`);
    return res.json({ success: true, trustMarkPolicy: config.trustMarkPolicy });
  }

  return res.status(500).json({ error: "Failed to save config" });
});

export default router;
