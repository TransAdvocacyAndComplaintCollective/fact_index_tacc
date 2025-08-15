// auth/auth_constant.ts
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { StringValue } from "ms";
import {
  AuthUser,
  JwtValidationResult,
  MaybeRefreshResult,
  RotateReason,
} from "./auth_types.js";
import pinologger from "../logger/pino.js";
import {
  KEYS,
  getActiveKey,
  JWT_EXPIRES_IN,
  JWT_ISSUER,
  JWT_AUDIENCE,
  JWT_CLOCK_TOLERANCE_SEC,
  AUTH_MIN_RENEW,
  JWT_ENFORCE_AUDIENCE,
  JWT_ENFORCE_ISSUER,
  HmacKey,
} from "./auth_constant.js";
import { DEV_ENABLED } from "./provider/passport-dev.js";
import { validateBluesky } from "./provider/passport-bluesky.js";
import { validateFacebook } from "./provider/passport-facebook.js";
import { validateGoogle } from "./provider/passport-google.js";

const logger = pinologger.child({ component: "auth-router-stateless" });

/**
 * Parse JWT_EXPIRES_IN: allow numeric seconds or strings like "10m", "8h", "7d".
 */
function parseExpiresIn(value: string): number | StringValue {
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10);
  if (/^\d+\s*[smhd]$/.test(value))
    return value.replace(/\s+/g, "") as StringValue;
  logger.error({ JWT_EXPIRES_IN: value }, "Invalid JWT_EXPIRES_IN");
  process.exit(1);
}

/**
 * Parse a duration string (e.g., "15m", "2h", "7d", or seconds like "300") to seconds.
 */
export function parseDurationToSeconds(value: string): number {
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10);
  const m = value.trim().match(/^(\d+)\s*([smhd])$/i);
  if (!m) {
    logger.error({ value }, "Invalid duration string");
    process.exit(1);
  }
  const n = Number.parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const mult = unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
  return n * mult;
}

/**
 * Remove obvious sensitive fields before embedding user data in token.
 */
function stripSensitive<T extends Record<string, unknown>>(obj: T): T {
  const deny = new Set([
    "password",
    "hash",
    "salt",
    "secret",
    "token",
    "accessToken",
    "refreshToken",
    "twoFactorSecret",
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!deny.has(k)) out[k] = v;
  }
  return out as T;
}

/**
 * Pick a verification key by kid if present, else try all.
 */
function pickKeysForVerify(token: string): HmacKey[] {
  try {
    const decoded = jwt.decode(token, { complete: true }) as
      | { header: { kid?: string; alg?: string } }
      | null;
    const kid = decoded?.header?.kid;
    if (kid) {
      const byKid = KEYS.find(k => k.id === kid);
      if (byKid) return [byKid];
      return KEYS; // unknown kid → try all keys
    }
  } catch {
    // ignore and try all keys
  }
  return KEYS;
}

/**
 * Build shared verify options (issuer/audience optional).
 */
function buildVerifyOptions(alg: jwt.Algorithm): jwt.VerifyOptions {
  const opts: jwt.VerifyOptions = {
    algorithms: [alg],
    clockTolerance: JWT_CLOCK_TOLERANCE_SEC,
  };
  if (JWT_ENFORCE_ISSUER) opts.issuer = JWT_ISSUER;
  if (JWT_ENFORCE_AUDIENCE) opts.audience = JWT_AUDIENCE;
  return opts;
}

/**
 * Get auth token from cookie in a request.
 */
export async function getIssueJWT(req: Request): Promise<string | null> {
  return req.cookies?.auth_token || null;
}

/**
 * Set auth token cookie on a response.
 */
export async function RequestIssueJWT(
  res: Response,
  user: AuthUser,
  _token = "",
  updateKey = false
) {
  const token = await issueJWT(user, _token, updateKey);
  if (token) {
    res.cookie("auth_token", token, { httpOnly: true, sameSite: "lax" });
  }
}

/**
 * Issue a JWT for the given user.
 */
export async function issueJWT(
  user: AuthUser,
  _token = "",
  auth_check = false
): Promise<string | null> {
  const activeKey = getActiveKey();
  if (!activeKey) {
    logger.error("No JWT signing key configured");
    process.exit(1);
  }




  if (auth_check) {
    // Refresh user profile from provider
    switch (user.provider) {
      case "discord":
        user = await validateDiscord(user);
        break;
      case "bluesky":
        user = await validateBluesky(user);
        break;
      case "facebook":
        user = await validateFacebook(user);
        break;
      case "google":
        user = await validateGoogle(user);
        break;
      case "dev":
        if (!DEV_ENABLED) {
          logger.error({ userId: user.id }, "Dev login rejected");
          return null;
        }
        break;
      case null:
      case undefined:
        return null;
      default:
        logger.error({ userId: user.id, provider: user.provider }, "Unknown user provider");
        return null;
    }
    if (user.provider !== null && !user.expiresAt){
      user.expiresAt = Date.now() + 3600 * 1000; // default 1h
    }
  }

  if (user.provider === "dev" && !DEV_ENABLED) {
    logger.error({ userId: user.id }, "Dev login rejected");
    return null;
  }

  logger.debug({ userId: user.id, provider: user.provider, kid: activeKey.id }, "Issuing JWT");

  const expiresIn = parseExpiresIn(JWT_EXPIRES_IN);
  const signOptions: jwt.SignOptions = {
    expiresIn,
    algorithm: activeKey.algorithm,
    header: { kid: activeKey.id, alg: activeKey.algorithm },
  };
  if (JWT_ENFORCE_ISSUER) signOptions.issuer = JWT_ISSUER;
  if (JWT_ENFORCE_AUDIENCE) signOptions.audience = JWT_AUDIENCE;

  const payload = { ...stripSensitive(user), sub: String(user.id ?? "") };
  return jwt.sign(payload, activeKey.secret, signOptions);
}

/**
 * Validate a JWT and detect if it needs rotation.
 */
export async function validateJwt(token: string): Promise<JwtValidationResult> {
  const decoded = jwt.decode(token, { complete: true }) as
    | { header?: { kid?: string }; payload?: any }
    | null;
  const tokenKid = decoded?.header?.kid;

  const candidateKeys = pickKeysForVerify(token);

  for (const key of candidateKeys) {
    try {
      const verified = jwt.verify(token, key.secret, buildVerifyOptions(key.algorithm)) as AuthUser & {
        exp?: number;
        iat?: number;
        authenticated?: boolean;
      };

      if (verified.authenticated === false) {
        return { user: null, rotateRecommended: false, tokenKid, activeKid: getActiveKey()?.id };
      }

      const activeKey = getActiveKey();
      const nowSec = Math.floor(Date.now() / 1000);
      const minRenewSec = parseDurationToSeconds(AUTH_MIN_RENEW);

      const exp = typeof verified.exp === "number" ? verified.exp : undefined;
      const iat = typeof verified.iat === "number" ? verified.iat : undefined;

      let rotateRecommended = false;
      let rotateReason: RotateReason | undefined;

      if (activeKey && key.id !== activeKey.id) {
        rotateRecommended = true;
        rotateReason = "legacy_key";
      }
      if (typeof exp === "number" && exp - nowSec <= minRenewSec) {
        rotateRecommended = true;
        if (!rotateReason) rotateReason = "expiring_soon";
      }

      return { user: verified, rotateRecommended, rotateReason, tokenKid, activeKid: activeKey?.id, exp, iat };
    } catch (err: any) {
      if (err?.name === "TokenExpiredError" || err?.name === "NotBeforeError") {
        logger.warn({ name: err.name, message: err.message }, "JWT not valid for time window");
        return { user: null, rotateRecommended: false, tokenKid, activeKid: getActiveKey()?.id };
      }
      if (err?.name === "JsonWebTokenError") continue;
      logger.warn({ message: String(err?.message || err) }, "JWT verification error");
    }
  }

  return { user: null, rotateRecommended: false, tokenKid, activeKid: getActiveKey()?.id };
}

/**
 * Always re-sign with active key, merging in updated claims.
 */
export async function updateJwt(token: string, userPatch: Partial<AuthUser>): Promise<string> {
  const validation = await validateJwt(token);
  if (!validation.user) throw new Error("Invalid token");

  const merged: AuthUser = { ...(validation.user as any), ...(userPatch as any) };
  const newToken = await issueJWT(stripSensitive(merged), token, true);
  if (!newToken) throw new Error("Failed to issue new JWT");
  return newToken;
}

/**
 * Only refresh when needed: rotation or changed claims.
 */
export async function refreshJwtIfNeeded(
  token: string,
  userPatch?: Partial<AuthUser>
): Promise<MaybeRefreshResult> {
  const validation = await validateJwt(token);
  if (!validation.user) throw new Error("Invalid token");

  const sanitizedCurrent = stripSensitive(validation.user as any);
  const sanitizedPatched = userPatch
    ? stripSensitive({ ...sanitizedCurrent, ...(userPatch as any) })
    : sanitizedCurrent;

  const claimsChanged = JSON.stringify(sanitizedCurrent) !== JSON.stringify(sanitizedPatched);

  const reasons: (RotateReason | "claims_changed")[] = [];
  if (validation.rotateRecommended) reasons.push(validation.rotateReason!);
  if (claimsChanged) reasons.push("claims_changed");

  if (reasons.length === 0) {
    return { token, rotated: false, reasons, oldKid: validation.tokenKid, newKid: validation.activeKid };
  }

  const newToken = await issueJWT(sanitizedPatched as AuthUser);
  if (!newToken) throw new Error("Failed to issue new JWT");

  return { token: newToken, rotated: true, reasons, oldKid: validation.tokenKid, newKid: getActiveKey()?.id };
}

/**
 * Decode without verify (safe for UX/debug only).
 */
export function decodeJwt<T = any>(
  token: string
): { header: any; payload: T; signature: string } | null {
  return (jwt.decode(token, { complete: true }) as any) ?? null;
}
function validateDiscord(user: any): any {
  throw new Error("Function not implemented.");
}

