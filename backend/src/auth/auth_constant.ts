// auth/auth_constant.ts
import jwt from "jsonwebtoken";
import pinologger from "../logger/pino.js";
const logger = pinologger.child({ component: "auth-router-stateless" });
/**
 * Timing config
 */
export const AUTH_CHECK_IN = process.env.AUTH_CHECK_IN || "2h";
export const AUTH_MIN_RENEW = process.env.AUTH_MIN_RENEW || "2h"; // if <= this remaining, suggest rotate

/**
 * JWT lifetimes
 */
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";

/**
 * Algorithms & Secrets (support rolling keys)
 * - "NEW" key is used to issue tokens
 * - "OLD" key remains valid for verification until fully rotated out
 */
export const JWT_ALGORITHM_NEW = (process.env.JWT_ALGORITHM_NEW || "HS256") as jwt.Algorithm;
export const JWT_ALGORITHM_OLD = (process.env.JWT_ALGORITHM_OLD || "HS256") as jwt.Algorithm;

export const JWT_SECRET_NEW = process.env.JWT_SECRET_NEW || "new-secret";
export const JWT_SECRET_OLD = process.env.JWT_SECRET_OLD || "old-secret";

// Optional key IDs for kid header (recommended)
export const JWT_SECRET_NEW_ID = process.env.JWT_SECRET_NEW_ID || "key-new";
export const JWT_SECRET_OLD_ID = process.env.JWT_SECRET_OLD_ID || "key-old";

/**
 * Issuer & Audience
 * - You can choose to enforce these during sign/verify via the toggles below.
 */
export const JWT_ISSUER = process.env.JWT_ISSUER || "TACC FACT DATABASE";
export const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "TACC FACT DATABASE";

// Toggle enforcement of iss/aud (set to "true" to enforce)
export const JWT_ENFORCE_ISSUER = (process.env.JWT_ENFORCE_ISSUER || "false").toLowerCase() === "true";
export const JWT_ENFORCE_AUDIENCE = (process.env.JWT_ENFORCE_AUDIENCE || "false").toLowerCase() === "true";

// Small clock skew tolerance (seconds)
export const JWT_CLOCK_TOLERANCE_SEC = Number.parseInt(process.env.JWT_CLOCK_TOLERANCE_SEC || "5", 10);


/**
 * Validate algorithm envs against allowed HMAC algs
 */
const ALLOWED_HS_ALGS = new Set<jwt.Algorithm>(["HS256", "HS384", "HS512"]);
for (const alg of [JWT_ALGORITHM_NEW, JWT_ALGORITHM_OLD]) {
  if (!ALLOWED_HS_ALGS.has(alg)) {
    logger.error({ alg }, "Invalid HMAC algorithm configured for JWT");
    process.exit(1);
  }
}

/**
 * Internal key representation to support rotation.
 */
export type HmacKey = {
  id: string; // kid
  secret: string;
  algorithm: jwt.Algorithm;
};

export const KEYS: HmacKey[] = [
  { id: JWT_SECRET_NEW_ID, secret: JWT_SECRET_NEW, algorithm: JWT_ALGORITHM_NEW }, // active
  { id: JWT_SECRET_OLD_ID, secret: JWT_SECRET_OLD, algorithm: JWT_ALGORITHM_OLD }, // legacy
].filter(k => !!k.secret);

export function getActiveKey(): HmacKey | undefined {
  return KEYS[0];
}
