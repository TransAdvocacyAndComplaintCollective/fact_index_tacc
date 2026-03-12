import { getPermissionsForSubjects } from "../../../../libs/db-core/src/authzRepository.ts";
import type { AuthStatus } from "../../../../libs/types/src/index.ts";

export const ADMIN_ACTIONS = [
  "admin:read",
  "admin:write",
  "taxonomy:read",
  "taxonomy:write",
  "fact:read",
  "fact:write",
  "fact:pubwrite",
  "fact:superuser",
  "superuser",
];

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}


export function deriveCasbinSubjects(authStatus: AuthStatus | undefined | null): string[] {
  if (!authStatus?.authenticated || !authStatus?.user?.id) return ["nobody"];

  const userId = String(authStatus.user.id);
  const subjects: string[] = [`user:${userId}`];

  const memberRoles = normalizeStringArray(authStatus.user.cachedMemberRoles);
  for (const roleId of memberRoles) subjects.push(`role:discord:${roleId}`);

  return Array.from(new Set(subjects));
}

export async function derivePermissionsFromDb(authStatus: AuthStatus | undefined | null): Promise<string[]> {
  const subjects = deriveCasbinSubjects(authStatus);
  if (!subjects.length || subjects[0] === "nobody") return [];
  return getPermissionsForSubjects(subjects);
}

export function mapRequestToPermission(pathname: string, method: string): string | null {
  const normalizedMethod = method.toUpperCase();
  if (pathname.startsWith("/api/facts")) {
    return normalizedMethod === "GET" ? "fact:read" : "fact:write";
  }
  return null;
}

export function parsePermission(permission: string): { resource: string; action: string } | null {
  const idx = permission.lastIndexOf(":");
  if (idx <= 0 || idx === permission.length - 1) return null;
  return {
    resource: permission.slice(0, idx),
    action: permission.slice(idx + 1),
  };
}
