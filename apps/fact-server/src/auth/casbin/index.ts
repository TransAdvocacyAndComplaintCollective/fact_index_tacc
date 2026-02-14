/**
 * Casbin RBAC module exports
 * Central export point for all Casbin-related utilities
 */

export { getCasbinEnforcer } from "./enforcer.ts";
export { requireGuildPermission, requireCasbin } from "./middleware.ts";
export { 
  syncDiscordRolesForUser,
  storeDiscordGuildMembership,
  isSyncStale,
} from "./syncRoles.ts";
export { KyselyCasbinAdapter } from "./kyselyCasbinAdapter.ts";

// Role management
export {
  ROLES,
  getAllRoles,
  isSystemRole,
  isValidRole,
  getRoleDisplayName,
  addUserRole,
  removeUserRole,
  getUserRoles,
  getUsersWithRole,
  clearUserRoles,
  getRoleStats,
  type RolePermissions,
} from "./roles.ts";

// Group management
export {
  createGroup,
  addUserToGroup,
  removeUserFromGroup,
  getUserGroups,
  getGroupMembers,
  isUserInGroup,
  deleteGroup,
  getAllGroups,
  getGroupStats,
  type Group,
} from "./groups.ts";
