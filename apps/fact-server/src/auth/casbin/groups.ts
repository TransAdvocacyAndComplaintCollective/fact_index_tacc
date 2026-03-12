/**
 * Group management for Casbin RBAC
 * Groups allow organizing users and applying roles collectively
 */

import { getCasbinEnforcer } from "./enforcer.ts";

/**
 * Group definition
 */
export interface Group {
  name: string;
  description?: string;
  members: string[];
  roles: string[];
  domain: string;
}

/**
 * Create a new group (user group membership)
 * Format: g2, user:userId, group:groupName, domain
 */
export async function createGroup(
  groupName: string,
  domain: string = "global",
  initialMembers: string[] = [],
  initialRoles: string[] = []
): Promise<Group> {
  const enforcer = await getCasbinEnforcer();
  
  // Add initial members
  for (const userId of initialMembers) {
    const subject = `user:${userId}`;
    const groupId = `group:${groupName}`;
    const exists = await enforcer.hasGroupingPolicy(subject, groupId, domain);
    if (!exists) {
      await enforcer.addGroupingPolicy(subject, groupId, domain);
    }
  }
  
  console.log(`[groups] Created group ${groupName} in domain ${domain}`);
  
  return {
    name: groupName,
    members: initialMembers,
    roles: initialRoles,
    domain,
  };
}

/**
 * Add a user to a group
 */
export async function addUserToGroup(
  userId: string,
  groupName: string,
  domain: string = "global"
): Promise<void> {
  const enforcer = await getCasbinEnforcer();
  const subject = `user:${userId}`;
  const group = `group:${groupName}`;
  
  const exists = await enforcer.hasGroupingPolicy(subject, group, domain);
  if (!exists) {
    await enforcer.addGroupingPolicy(subject, group, domain);
    console.log(`[groups] Added user ${userId} to group ${groupName} in domain ${domain}`);
  }
}

/**
 * Remove a user from a group
 */
export async function removeUserFromGroup(
  userId: string,
  groupName: string,
  domain: string = "global"
): Promise<void> {
  const enforcer = await getCasbinEnforcer();
  const subject = `user:${userId}`;
  const group = `group:${groupName}`;
  
  await enforcer.removeGroupingPolicy(subject, group, domain);
  console.log(`[groups] Removed user ${userId} from group ${groupName} in domain ${domain}`);
}

/**
 * Get all groups a user belongs to
 */
export async function getUserGroups(
  userId: string,
  domain: string = "global"
): Promise<string[]> {
  const enforcer = await getCasbinEnforcer();
  const subject = `user:${userId}`;
  
  const policies = await enforcer.getFilteredGroupingPolicy(0, subject);
  return policies
    .filter((policy) => policy[2] === domain && policy[1].startsWith("group:"))
    .map((policy) => policy[1].replace(/^group:/, ""));
}

/**
 * Get all members of a group
 */
export async function getGroupMembers(
  groupName: string,
  domain: string = "global"
): Promise<string[]> {
  const enforcer = await getCasbinEnforcer();
  const group = `group:${groupName}`;
  
  const policies = await enforcer.getFilteredGroupingPolicy(1, group);
  return policies
    .filter((policy) => policy[2] === domain)
    .map((policy) => {
      const match = policy[0].match(/^user:(.+)$/);
      return match ? match[1] : null;
    })
    .filter((userId): userId is string => userId !== null);
}

/**
 * Check if user belongs to a group
 */
export async function isUserInGroup(
  userId: string,
  groupName: string,
  domain: string = "global"
): Promise<boolean> {
  const enforcer = await getCasbinEnforcer();
  const subject = `user:${userId}`;
  const group = `group:${groupName}`;
  
  return enforcer.hasGroupingPolicy(subject, group, domain);
}

/**
 * Delete a group (remove all members)
 */
export async function deleteGroup(
  groupName: string,
  domain: string = "global"
): Promise<void> {
  const enforcer = await getCasbinEnforcer();
  const group = `group:${groupName}`;
  
  const policies = await enforcer.getFilteredGroupingPolicy(1, group);
  for (const policy of policies) {
    if (policy[2] === domain) {
      await enforcer.removeGroupingPolicy(...policy);
    }
  }
  
  console.log(`[groups] Deleted group ${groupName} from domain ${domain}`);
}

/**
 * Get all groups in a domain
 */
export async function getAllGroups(domain: string = "global"): Promise<string[]> {
  const enforcer = await getCasbinEnforcer();
  const policies = await enforcer.getGroupingPolicy();
  
  const groups = new Set<string>();
  for (const policy of policies) {
    if (policy[2] === domain && policy[1].startsWith("group:")) {
      groups.add(policy[1].replace(/^group:/, ""));
    }
  }
  
  return Array.from(groups);
}

/**
 * Get group statistics
 */
export async function getGroupStats(domain: string = "global"): Promise<{
  totalGroups: number;
  totalMembers: number;
  averageMembersPerGroup: number;
  groupSizes: Record<string, number>;
}> {
  const enforcer = await getCasbinEnforcer();
  const groups = await getAllGroups(domain);
  
  const groupSizes: Record<string, number> = {};
  let totalMembers = 0;
  
  for (const groupName of groups) {
    const members = await getGroupMembers(groupName, domain);
    groupSizes[groupName] = members.length;
    totalMembers += members.length;
  }
  
  return {
    totalGroups: groups.length,
    totalMembers,
    averageMembersPerGroup: groups.length > 0 ? totalMembers / groups.length : 0,
    groupSizes,
  };
}
