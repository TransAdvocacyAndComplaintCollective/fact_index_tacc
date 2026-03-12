export function safeCanAccess(
  canAccess: (permission: any) => boolean,
  permission: string,
): boolean {
  try {
    return Boolean(canAccess(permission));
  } catch {
    return false;
  }
}

