import type { Response } from "express";
import { authTokenCookieOptions } from "../../config/securityConfig.ts";

/**
 * Set JWT token as secure HttpOnly cookie and redirect to home
 * Prevents token leakage via:
 * - Browser history (query strings are stored in history)
 * - Referer headers (tokens in URLs are sent in referer to external sites)
 * - Server logs (query strings are logged)
 * - Browser extensions
 *
 * Use this instead of redirecting with /?token=... query strings.
 */
function isValidRedirectPath(path: string): boolean {
  // Only allow relative paths starting with / to prevent open redirect
  if (!path || typeof path !== "string") return false;
  // Reject absolute URLs and protocol-relative URLs
  if (path.includes("//") || path.includes(":")) return false;
  // Must start with /
  return path.startsWith("/");
}

export function redirectWithSecureToken(res: Response, token: string, redirectPath: string = "/"): void {
  // Set cookie with centralized security configuration
  // Validate redirect path to prevent open redirect attacks
  const safeRedirectPath = isValidRedirectPath(redirectPath) ? redirectPath : "/";

  res.cookie("auth_token", token, authTokenCookieOptions);

  res.redirect(safeRedirectPath);
}
