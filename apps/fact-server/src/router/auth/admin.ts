/**
 * Admin API for managing permissions + login whitelist.
 *
 * Permissions are stored as Casbin policies in `casbin_rule`:
 * - Role-based: subject `role:discord:{roleId}`
 * - User-based: subject `user:{discordUserId}`
 *
 * Known users are stored in `known_discord_user` and can be created even if the
 * user has never logged in.
 */

import express from "express";
import type { Request, Response } from "express";
import { validateJWTOnly } from "../../auth/passport-discord.ts";
import { casbinMiddleware, getEnforcer } from "../../auth/casbin.ts";
import { isDevModeActive } from "../../auth/passport-dev.ts";
import logger from "../../logger.ts";
import {
  addWhitelistUser,
  getAdminConfigSnapshot,
  getLoginConstraints,
  listKnownDiscordUsers,
  listWhitelistUsers,
  removeUserPermissions,
  removeWhitelistUser,
  setGuildLoginRequirement,
  setRolePermissions,
  setUserPermissions,
  upsertKnownDiscordUser,
} from "../../../../../libs/db-core/src/authzRepository.ts";

const router = express.Router();

router.use(validateJWTOnly);

async function reloadCasbinPolicy(): Promise<void> {
  try {
    const enforcer = await getEnforcer();
    await enforcer.loadPolicy();
  } catch (err) {
    logger.warn("[admin] Failed to reload casbin policy", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

router.post("/self-permissions", async (req: Request, res: Response) => {
  const authStatus = (req as any).authStatus;
  if (!authStatus?.authenticated || !authStatus?.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!isDevModeActive()) {
    return res.status(404).json({ error: "not_found" });
  }
  if (!authStatus?.user?.devBypass) {
    return res.status(403).json({ error: "Forbidden", message: "Only available in dev bypass sessions" });
  }
  const { permissions } = req.body as { permissions?: string[] };
  if (!Array.isArray(permissions)) {
    return res.status(400).json({ error: "Invalid request", message: "permissions array required" });
  }
  const nextPermissions = await setUserPermissions(String(authStatus.user.id), permissions);
  await reloadCasbinPolicy();
  return res.json({ success: true, userId: String(authStatus.user.id), permissions: nextPermissions });
});

/**
 * GET /auth/admin/config - Admin console snapshot
 */
router.get("/config", casbinMiddleware("admin", "read"), async (_req: Request, res: Response) => {
  try {
    const [{ rolePermissions, userPermissions }, knownUsers, whitelistUsers, loginConstraints] = await Promise.all([
      getAdminConfigSnapshot(),
      listKnownDiscordUsers(500).catch(() => []),
      listWhitelistUsers().catch(() => []),
      getLoginConstraints().catch(() => ({ whitelistUsers: [], requiredRolesByGuild: {} })),
    ]);

    const roles = Object.fromEntries(
      Object.entries(rolePermissions).map(([roleId, permissions]) => [roleId, { permissions }]),
    );

    return res.json({
      guilds: Object.fromEntries(
        Object.entries(loginConstraints.requiredRolesByGuild).map(([guildId, requiredRole]) => [
          guildId,
          { requiredRole },
        ]),
      ),
      roles,
      userPermissions,
      whitelistUsers: whitelistUsers.sort((a, b) => a.localeCompare(b)),
      knownUsers,
    });
  } catch (err) {
    logger.error("[admin] Failed to load config snapshot", { error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ error: "Failed to load admin config" });
  }
});

/**
 * POST /auth/admin/roles - Set permissions for a Discord role ID
 * Body: { roleId: string, permissions: string[] }
 */
router.post("/roles", casbinMiddleware("admin", "write"), async (req: Request, res: Response) => {
  const { roleId, permissions } = req.body as { roleId?: string; permissions?: string[] };
  const normalizedRoleId = String(roleId || "").trim();
  if (!normalizedRoleId || !Array.isArray(permissions)) {
    return res.status(400).json({ error: "Invalid request", message: "roleId and permissions array required" });
  }
  if (permissions.length === 0) {
    return res.status(400).json({
      error: "Invalid request",
      message: "permissions must be a non-empty array",
    });
  }

  const nextPermissions = await setRolePermissions(normalizedRoleId, permissions);
  await reloadCasbinPolicy();
  return res.json({ success: true, roleId: normalizedRoleId, permissions: nextPermissions });
});

/**
 * POST /auth/admin/user-permissions - Set permissions for a Discord user ID
 * Body: { userId: string, permissions: string[] }
 */
router.post("/user-permissions", casbinMiddleware("admin", "write"), async (req: Request, res: Response) => {
  const { userId, permissions } = req.body as { userId?: string; permissions?: string[] };
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId || !Array.isArray(permissions)) {
    return res.status(400).json({ error: "Invalid request", message: "userId and permissions array required" });
  }
  if (permissions.length === 0) {
    return res.status(400).json({
      error: "Invalid request",
      message: "permissions must be a non-empty array (use DELETE to remove user permissions)",
    });
  }

  const nextPermissions = await setUserPermissions(normalizedUserId, permissions);
  await reloadCasbinPolicy();
  return res.json({ success: true, userId: normalizedUserId, permissions: nextPermissions });
});

/**
 * DELETE /auth/admin/user-permissions/:userId - Remove all direct permissions for a user
 */
router.delete("/user-permissions/:userId", casbinMiddleware("admin", "write"), async (req: Request, res: Response) => {
  const userId = String((req.params as any).userId || "").trim();
  if (!userId) return res.status(400).json({ error: "Invalid request", message: "userId required" });
  await removeUserPermissions(userId);
  await reloadCasbinPolicy();
  return res.json({ success: true, userId });
});

/**
 * POST /auth/admin/known-users - Upsert a known user (works even if they never logged in)
 * Body: { userId: string, username?: string|null }
 */
router.post("/known-users", casbinMiddleware("admin", "write"), async (req: Request, res: Response) => {
  const { userId, username } = req.body as { userId?: string; username?: string | null };
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return res.status(400).json({ error: "Invalid request", message: "userId required" });
  await upsertKnownDiscordUser(normalizedUserId, username ?? null);
  return res.json({ success: true, userId: normalizedUserId });
});

/**
 * POST /auth/admin/whitelist - Add a user to login whitelist
 * Body: { userId: string }
 */
router.post("/whitelist", casbinMiddleware("admin", "write"), async (req: Request, res: Response) => {
  const { userId } = req.body as { userId?: string };
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return res.status(400).json({ error: "Invalid request", message: "userId required" });
  await addWhitelistUser(normalizedUserId);
  const whitelistUsers = await listWhitelistUsers().catch(() => []);
  return res.json({ success: true, userId: normalizedUserId, whitelistUsers });
});

/**
 * DELETE /auth/admin/whitelist/:userId - Remove a user from login whitelist
 */
router.delete("/whitelist/:userId", casbinMiddleware("admin", "write"), async (req: Request, res: Response) => {
  const userId = String((req.params as any).userId || "").trim();
  if (!userId) return res.status(400).json({ error: "Invalid request", message: "userId required" });
  await removeWhitelistUser(userId);
  const whitelistUsers = await listWhitelistUsers().catch(() => []);
  return res.json({ success: true, userId, whitelistUsers });
});

/**
 * POST /auth/admin/guilds - Upsert required login roles for a guild
 * Body: { guildId: string, requiredRole?: string|string[] }
 */
router.post("/guilds", casbinMiddleware("admin", "write"), async (req: Request, res: Response) => {
  const { guildId, requiredRole } = req.body as { guildId?: string; requiredRole?: string | string[] };
  const normalizedGuildId = String(guildId || "").trim();
  if (!normalizedGuildId) return res.status(400).json({ error: "Invalid request", message: "guildId required" });
  await setGuildLoginRequirement(normalizedGuildId, requiredRole ?? []);
  return res.json({ success: true, guildId: normalizedGuildId });
});

export default router;
