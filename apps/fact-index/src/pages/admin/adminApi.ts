export function getHeaders(method: string, customHeaders?: HeadersInit): Record<string, string> {
  const normalized: Record<string, string> = {};
  if (customHeaders instanceof Headers) {
    customHeaders.forEach((value, key) => {
      normalized[key] = value;
    });
  } else if (customHeaders && typeof customHeaders === "object") {
    Object.assign(normalized, customHeaders as Record<string, string>);
  }

  if (!normalized["Content-Type"] && method !== "GET") {
    normalized["Content-Type"] = "application/json";
  }

  return normalized;
}

export async function authJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = getHeaders(method, options.headers);
  const response = await fetch(path, {
    ...options,
    method,
    headers,
    credentials: "include",
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object"
        ? (payload?.message as string | undefined) ?? (payload?.error as string | undefined)
        : undefined;
    throw new Error(message || `Request failed (${response.status})`);
  }

  return payload as T;
}

export function formatError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

export function toRoleIdSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
