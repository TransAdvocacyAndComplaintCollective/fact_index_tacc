/**
 * Admin API for managing user roles and whitelist
 * Requires authentication; only admins configured in discord-auth.json can modify
 */

import express from "express";
import type { Request, Response, NextFunction } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import logger from "../../logger.ts";
import { validateJWTOnly } from "../../auth/passport-discord.ts";
import { generateJWT } from "../../auth/jwt.ts";

// Import AuthStatus type shape locally to avoid circular dependency
interface AuthStatus {
  authenticated: boolean;
  user?: { id: string; username?: string };
  reason?: string;
}

const router = express.Router();

// Require JWT authentication on all admin endpoints
router.use(validateJWTOnly);

// Admin config file path
const __filename = fileURLToPath(import.meta.url);
const __dirname_local = path.dirname(__filename);
const CONFIG_DIR = path.resolve(__dirname_local, "..", "..", "config");
const CONFIG_PATH = path.join(CONFIG_DIR, "discord-auth.json");

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

/**
 * Middleware: Check if authenticated user is an admin
 */
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authStatus = (req as Request & { authStatus?: AuthStatus }).authStatus;
  const userId = authStatus?.user?.id;

  if (!authStatus?.authenticated || !userId) {
    logger.warn(`[admin] Rejecting unauthenticated access`);
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (authStatus.devBypass) {
    return next();
  }

  if (authStatus.user?.isAdmin) {
    return next();
  }

  const config = loadConfig();
  const adminUsers = Array.isArray(config.adminUsers) ? config.adminUsers : [];
  if (!adminUsers.includes(userId)) {
    logger.warn(`[admin] Rejecting non-admin user ${userId}`);
    return res.status(403).json({ error: "Forbidden", message: "Admin access required" });
  }

  next();
}

// Apply admin guard after JWT validation so every admin route stays admin-only
router.use(requireAdmin);

/**
 * Load current config
 */
function loadConfig(): Record<string, any> {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      return { guilds: {}, roles: {}, userRoles: {}, whitelistUsers: [], adminUsers: [] };
    }
    const raw = fs.readFileSync(CONFIG_PATH, { encoding: "utf8" });
    const parsed = raw ? JSON.parse(raw) : {};
    const config: Record<string, any> = { ...parsed };
    config.guilds = parsed?.guilds && typeof parsed.guilds === "object" ? parsed.guilds : {};
    config.roles = parsed?.roles && typeof parsed.roles === "object" ? parsed.roles : {};
    config.userRoles =
      parsed?.userRoles && typeof parsed.userRoles === "object" && !Array.isArray(parsed.userRoles)
        ? parsed.userRoles
        : {};
    config.whitelistUsers = normalizeStringArray(parsed?.whitelistUsers);
    config.adminUsers = normalizeStringArray(parsed?.adminUsers);

    return config;
  } catch (err) {
    logger.error(`[admin] Failed to load config:`, err);
    return { guilds: {}, roles: {}, userRoles: {}, whitelistUsers: [], adminUsers: [] };
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
router.get("/user-roles", requireAdmin, (req: Request, res: Response) => {
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
router.post("/user-roles", requireAdmin, (req: Request, res: Response) => {
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
router.delete("/user-roles/:userId", requireAdmin, (req: Request, res: Response) => {
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
router.post("/whitelist", requireAdmin, (req: Request, res: Response) => {
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
router.delete("/whitelist/:userId", requireAdmin, (req: Request, res: Response) => {
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
router.post("/admin-users", requireAdmin, (req: Request, res: Response) => {
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
router.delete("/admin-users/:userId", requireAdmin, (req: Request, res: Response) => {
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
router.post("/guilds", requireAdmin, (req: Request, res: Response) => {
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
 * DELETE /auth/admin/guilds/:guildId - Remove a guild config
 */
router.delete("/guilds/:guildId", requireAdmin, (req: Request, res: Response) => {
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
 * Body: { roleId: string, name?: string, type?: string, description?: string }
 */
router.post("/roles", requireAdmin, (req: Request, res: Response) => {
  const { roleId, name, type, description } = req.body as {
    roleId?: string;
    name?: string;
    type?: string;
    description?: string;
  };

  if (!roleId) {
    return res.status(400).json({ error: "Invalid request", message: "roleId required" });
  }

  const config = loadConfig();
  config.roles = config.roles && typeof config.roles === "object" ? config.roles : {};

  (config.roles as Record<string, any>)[roleId] = {
    ...(config.roles as Record<string, any>)[roleId],
    name: name ? String(name).trim() : (config.roles as Record<string, any>)[roleId]?.name,
    type: type ? String(type).trim() : (config.roles as Record<string, any>)[roleId]?.type,
    description: description
      ? String(description).trim()
      : (config.roles as Record<string, any>)[roleId]?.description,
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
router.delete("/roles/:roleId", requireAdmin, (req: Request, res: Response) => {
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
router.get("/config", requireAdmin, (req: Request, res: Response) => {
  const config = loadConfig();
  return res.json(config);
});

/**
 * POST /auth/admin/magiclink - Admin can request a magic link
 * Body: { username?: string } (optional)
 * Returns: { success: true, token, link }
 */
router.post("/magiclink", requireAdmin, async (req: Request, res: Response) => {
  try {
    // Allow optional username to be provided
    const { username } = req.body as { username?: string };
    const displayName = username && typeof username === "string" ? username.trim() : `user-${Date.now()}`;

    // Generate a magic link with the specified username
    const minimalUser = {
      id: displayName,
      username: displayName,
      avatar: null,
      discriminator: null,
      guild: null,
      hasRole: true,
      isAdmin: false,
      magicLink: true,
      devBypass: false,
    } as any;

    const token = generateJWT(minimalUser);
    const link = `${req.protocol || "https"}://${req.get("host") || "localhost"}/auth/magiclink/callback?token=${encodeURIComponent(
      token,
    )}`;

    logger.info(`[admin.magiclink] Issued magic link for username=${displayName}`);
    return res.json({ success: true, token, link, username: displayName });
  } catch (err: unknown) {
    logger.error("[admin.magiclink] Error issuing magic link", { error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ error: "internal_error" });
  }
});

export default router;
