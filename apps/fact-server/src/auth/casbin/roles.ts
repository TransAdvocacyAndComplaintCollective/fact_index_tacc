/**
 * Role management for Casbin RBAC
 * Defines and manages application roles and their permissions
 */

import type { Enforcer } from "casbin";
import { getCasbinEnforcer } from "./enforcer.ts";

/**
 * Predefined role definitions
 */
export const ROLES = {
  // Base roles
  NOBODY: "nobody",
  USER: "user",
  
  // App-level roles
  ADMIN: "role:app:admin",
  
  // Feature-specific roles
  FACTS_CONTRIBUTOR: "role:facts:contributor",
  
  // Discord integration
  DISCORD_MEMBER: "role:discord:member",
} as const;

/**
 * Role permissions mapping
 * maps role names to their allowed actions
 */
export interface RolePermissions {
  role: string;
  permissions: Array<{
    resource: string;
    actions: string[];
  }>;
}

/**
 * Get all defined roles
 */
export function getAllRoles(): string[] {
  return Object.values(ROLES);
}

/**
 * Check if a role is a system role (built-in)
 */
export function isSystemRole(role: string): boolean {
  return Object.values(ROLES).includes(role as any);
}

/**
 * Check if a role exists or is valid
 */
export function isValidRole(role: string): boolean {
  return typeof role === "string" && role.length > 0;
}

/**
 * Get role display name
 */
export function getRoleDisplayName(role: string): string {
  const displayNames: Record<string, string> = {
    [ROLES.NOBODY]: "No Access",
    [ROLES.USER]: "User",
    [ROLES.ADMIN]: "Administrator",
    [ROLES.FACTS_CONTRIBUTOR]: "Facts Contributor",
    [ROLES.DISCORD_MEMBER]: "Discord Member",
  };
  return displayNames[role] || role;
}

/**
 * Add a role to a user for a specific domain (guild)
 * Format: g, user:userId, role:roleKey, domain
 */
export async function addUserRole(
  userId: string,
  role: string,
  domain: string = "global"
): Promise<void> {
  const enforcer = await getCasbinEnforcer();
  const subject = `user:${userId}`;
  
  // Check if already assigned
  const exists = await enforcer.hasGroupingPolicy(subject, role, domain);
  if (!exists) {
    await enforcer.addGroupingPolicy(subject, role, domain);
    console.log(`[roles] Added role ${role} to user ${userId} in domain ${domain}`);
  }
}

/**
 * Remove a role from a user for a specific domain
 */
export async function removeUserRole(
  userId: string,
  role: string,
  domain: string = "global"
): Promise<void> {
  const enforcer = await getCasbinEnforcer();
  const subject = `user:${userId}`;
  
  await enforcer.removeGroupingPolicy(subject, role, domain);
  console.log(`[roles] Removed role ${role} from user ${userId} in domain ${domain}`);
}

/**
 * Get all roles assigned to a user in a domain
 */
export async function getUserRoles(
  userId: string,
  domain: string = "global"
): Promise<string[]> {
  const enforcer = await getCasbinEnforcer();
  const subject = `user:${userId}`;
  
  const policies = await enforcer.getFilteredGroupingPolicy(0, subject);
  return policies
    .filter((policy) => policy[2] === domain)
    .map((policy) => policy[1]);
}

/**
 * Get all users with a specific role in a domain
 */
export async function getUsersWithRole(
  role: string,
  domain: string = "global"
): Promise<string[]> {
  const enforcer = await getCasbinEnforcer();
  
  const policies = await enforcer.getFilteredGroupingPolicy(1, role);
  return policies
    .filter((policy) => policy[2] === domain)
    .map((policy) => {
      const match = policy[0].match(/^user:(.+)$/);
      return match ? match[1] : null;
    })
    .filter((userId): userId is string => userId !== null);
}

/**
 * Clear all roles for a user in a specific domain
 */
export async function clearUserRoles(
  userId: string,
  domain: string
): Promise<void> {
  const enforcer = await getCasbinEnforcer();
  const subject = `user:${userId}`;
  
  const policies = await enforcer.getFilteredGroupingPolicy(0, subject);
  for (const policy of policies) {
    if (policy[2] === domain) {
      await enforcer.removeGroupingPolicy(...policy);
    }
  }
  
  console.log(`[roles] Cleared all roles for user ${userId} in domain ${domain}`);
}

/**
 * Get role statistics
 */
export async function getRoleStats(): Promise<{
  totalRoles: number;
  totalAssignments: number;
  roleBreakdown: Record<string, number>;
}> {
  const enforcer = await getCasbinEnforcer();
  const groupingPolicies = await enforcer.getGroupingPolicy();
  
  const roleBreakdown: Record<string, number> = {};
  
  for (const policy of groupingPolicies) {
    const role = policy[1];
    roleBreakdown[role] = (roleBreakdown[role] || 0) + 1;
  }
  
  return {
    totalRoles: Object.keys(roleBreakdown).length,
    totalAssignments: groupingPolicies.length,
    roleBreakdown,
  };
}
