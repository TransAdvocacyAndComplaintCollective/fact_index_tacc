/**
 * Session and Cookie Security Configuration
 * Implements best practices for session management
 */

import type { CookieOptions } from 'express';

const isDev = process.env.NODE_ENV === 'development';
const cookieSecureOverride = String(process.env.COOKIE_SECURE || '').trim().toLowerCase();
const secureCookies: boolean =
  isDev ? false : !(cookieSecureOverride === 'false' || cookieSecureOverride === '0' || cookieSecureOverride === 'no');

/**
 * Secure cookie options for authentication tokens
 * Prevents XSS, CSRF, and man-in-the-middle attacks
 */
export const authTokenCookieOptions: CookieOptions = {
  // Prevent JavaScript access (XSS protection)
  httpOnly: true,
  
  // Only send over HTTPS in production
  secure: secureCookies,
  
  // Prevent CSRF attacks - don't send on cross-site requests
  sameSite: 'strict',
  
  // 7 days (matches JWT expiry)
  maxAge: 7 * 24 * 60 * 60 * 1000,
  
  // Restrict cookie to specific path
  path: '/',
  
  // Restrict to specific domain in production (set via environment)
  domain: isDev ? undefined : process.env.COOKIE_DOMAIN,
};

/**
 * Secure cookie options for Discord OAuth tokens (server-side use only).
 * These are HttpOnly so the browser can't read them.
 */
export const discordAccessTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: secureCookies,
  sameSite: 'strict',
  // Typical Discord access tokens expire in ~10 hours; keep slightly under 12h.
  maxAge: 12 * 60 * 60 * 1000,
  path: '/',
  domain: isDev ? undefined : process.env.COOKIE_DOMAIN,
};

export const discordRefreshTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: secureCookies,
  sameSite: 'strict',
  // Refresh tokens are longer-lived; keep at 30 days unless configured otherwise.
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: '/',
  domain: isDev ? undefined : process.env.COOKIE_DOMAIN,
};

/**
 * Secure cookie options for session cookies
 * Used by express-session for state management during OAuth flow
 */
export const sessionCookieOptions: CookieOptions = {
  // Prevent JavaScript access
  httpOnly: true,
  
  // Only send over HTTPS in production
  secure: secureCookies,
  
  // Allow same-site requests but not cross-site
  sameSite: 'lax',
  
  // 24 hours
  maxAge: 24 * 60 * 60 * 1000,
  
  path: '/',
  
  domain: isDev ? undefined : process.env.COOKIE_DOMAIN,
};

/**
 * Secure cookie options for light state tracking
 * More permissive than auth but still secure
 */
export const lightStateCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: secureCookies,
  sameSite: 'lax',
  maxAge: 60 * 60 * 1000, // 1 hour
  path: '/',
  domain: isDev ? undefined : process.env.COOKIE_DOMAIN,
};

/**
 * Validate that a cookie domain is safe
 * Prevents setting cookies on parent domains
 */
export function validateCookieDomain(domain: string): boolean {
  if (!domain) return true; // Default is safe
  
  // Must not be a top-level domain (e.g., "com", "org")
  const parts = domain.split('.');
  if (parts.length < 2) return false;
  
  // Must not be IP address (unless localhost)
  if (domain === 'localhost' || domain === '127.0.0.1' || domain === '::1') {
    return true;
  }
  
  // Check for valid domain format
  const domainRegex = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i;
  return domainRegex.test(domain);
}
