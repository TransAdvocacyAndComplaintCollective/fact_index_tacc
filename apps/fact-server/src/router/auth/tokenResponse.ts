import type { Response } from "express";

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
  // Set cookie with security flags:
  // - HttpOnly: prevents JavaScript (XSS) from accessing the token
  // - Secure: only sent over HTTPS (prevents man-in-the-middle)
  // - SameSite: prevents CSRF attacks by not sending cookie on cross-site requests
  // - MaxAge: 7 days (matches JWT expiry)
  // Validate redirect path to prevent open redirect attacks
  const safeRedirectPath = isValidRedirectPath(redirectPath) ? redirectPath : "/";

  res.cookie("auth_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
  });

  res.redirect(safeRedirectPath);
}
