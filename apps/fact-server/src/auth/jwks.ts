/**
 * JWKS (JSON Web Key Set) Key Management
 * Manages 3 keys: old (expired but still valid), current (active), next (upcoming)
 * Implements key rotation without disrupting existing tokens
 */

import { generateKeyPairSync, randomBytes } from "node:crypto";
import { createPrivateKey, createPublicKey } from "node:crypto";
import type { KeyObject } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import logger from "../logger.ts";

interface JWKSKey {
  kid: string; // Key ID
  kty: string;
  use: string;
  alg: string;
  n?: string; // RSA modulus (public key)
  e?: string; // RSA exponent (public key)
  d?: string; // RSA private exponent (private key)
  dp?: string;
  dq?: string;
  qi?: string;
  p?: string;
  q?: string;
  iat: number; // Issued at (unix timestamp)
  exp?: number; // Expires at (unix timestamp) - for old key only
}

interface KeySet {
  old?: { keyObject: KeyObject; kid: string; iat: number; exp: number };
  current: { keyObject: KeyObject; kid: string; iat: number };
  next?: { keyObject: KeyObject; kid: string; iat: number };
}

const KEYS_DIR = process.env.KEYS_DIR || path.join(process.cwd(), ".keys");
const KEY_ROTATION_INTERVAL = parseInt(process.env.KEY_ROTATION_INTERVAL_DAYS || "30", 10) * 24 * 60 * 60 * 1000;
const KEY_OVERLAP_DAYS = parseInt(process.env.KEY_OVERLAP_DAYS || "7", 10);

let keySet: KeySet = {
  current: { keyObject: null as any, kid: "", iat: 0 },
};

// Guard to prevent multiple initializations (circular dependencies, etc.)
let isInitialized = false;
let rotationTimeoutId: NodeJS.Timeout | null = null;
const MAX_TIMEOUT_MS = 0x7fffffff;

/**
 * Generate a new RSA key pair for JWT signing/verification
 */
function generateNewKeyPair(): { privateKey: KeyObject; publicKey: KeyObject; kid: string } {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });

  const kid = randomBytes(16).toString("hex");

  // Convert PEM to KeyObject if needed
  const privateKeyObj =
    typeof privateKey === "string" ? createPrivateKey(privateKey) : privateKey;
  const publicKeyObj =
    typeof publicKey === "string" ? createPublicKey(publicKey) : publicKey;

  return { privateKey: privateKeyObj, publicKey: publicKeyObj, kid };
}

/**
 * Save keys to disk for persistence
 */
function saveKeysToDisk(): void {
  try {
    if (!fs.existsSync(KEYS_DIR)) {
      fs.mkdirSync(KEYS_DIR, { recursive: true });
    }

    const keysData = {
      old: keySet.old ? { kid: keySet.old.kid, iat: keySet.old.iat, exp: keySet.old.exp } : null,
      current: { kid: keySet.current.kid, iat: keySet.current.iat },
      next: keySet.next ? { kid: keySet.next.kid, iat: keySet.next.iat } : null,
    };

    fs.writeFileSync(path.join(KEYS_DIR, "keys.json"), JSON.stringify(keysData, null, 2));

    // Save private keys (encrypted in production)
    if (keySet.old) {
      fs.writeFileSync(
        path.join(KEYS_DIR, `${keySet.old.kid}.pem`),
        keySet.old.keyObject.export({ format: "pem", type: "pkcs8" })
      );
    }

    fs.writeFileSync(
      path.join(KEYS_DIR, `${keySet.current.kid}.pem`),
      keySet.current.keyObject.export({ format: "pem", type: "pkcs8" })
    );

    if (keySet.next) {
      fs.writeFileSync(
        path.join(KEYS_DIR, `${keySet.next.kid}.pem`),
        keySet.next.keyObject.export({ format: "pem", type: "pkcs8" })
      );
    }

    logger.info("[jwks] Keys persisted to disk", {
      old: keySet.old?.kid,
      current: keySet.current.kid,
      next: keySet.next?.kid,
    });
    cleanupKeyFiles(collectActiveKids());
  } catch (err) {
    logger.error("[jwks] Failed to save keys to disk", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  }
}

/**
 * Load keys from disk if they exist
 */
function loadKeysFromDisk(): boolean {
  try {
    const keysPath = path.join(KEYS_DIR, "keys.json");
    if (!fs.existsSync(keysPath)) {
      return false;
    }

    const keysData = JSON.parse(fs.readFileSync(keysPath, "utf-8")) as {
      old?: { kid: string; iat: number; exp: number };
      current: { kid: string; iat: number };
      next?: { kid: string; iat: number };
    };

    // Load current key (required)
    const currentPemPath = path.join(KEYS_DIR, `${keysData.current.kid}.pem`);
    if (!fs.existsSync(currentPemPath)) {
      logger.warn("[jwks] Current key file not found on disk");
      return false;
    }

    const currentPrivateKey = createPrivateKey(fs.readFileSync(currentPemPath, "utf-8"));
    keySet.current = {
      keyObject: currentPrivateKey,
      kid: keysData.current.kid,
      iat: keysData.current.iat,
    };

    // Load old key if it exists
    if (keysData.old) {
      const oldPemPath = path.join(KEYS_DIR, `${keysData.old.kid}.pem`);
      if (fs.existsSync(oldPemPath)) {
        const oldPrivateKey = createPrivateKey(fs.readFileSync(oldPemPath, "utf-8"));
        keySet.old = {
          keyObject: oldPrivateKey,
          kid: keysData.old.kid,
          iat: keysData.old.iat,
          exp: keysData.old.exp,
        };
      }
    }

    // Load next key if it exists
    if (keysData.next) {
      const nextPemPath = path.join(KEYS_DIR, `${keysData.next.kid}.pem`);
      if (fs.existsSync(nextPemPath)) {
        const nextPrivateKey = createPrivateKey(fs.readFileSync(nextPemPath, "utf-8"));
        keySet.next = {
          keyObject: nextPrivateKey,
          kid: keysData.next.kid,
          iat: keysData.next.iat,
        };
      }
    }

    logger.info("[jwks] Keys loaded from disk", {
      old: keySet.old?.kid,
      current: keySet.current.kid,
      next: keySet.next?.kid,
    });
    cleanupKeyFiles(collectActiveKids());

    return true;
  } catch (err) {
    logger.warn("[jwks] Failed to load keys from disk, will generate new keys", 
      {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      }
    );
  }
}

function collectActiveKids(): Set<string> {
  const kids = new Set<string>();
  if (keySet.old?.kid) {
    kids.add(keySet.old.kid);
  }
  if (keySet.current.kid) {
    kids.add(keySet.current.kid);
  }
  if (keySet.next?.kid) {
    kids.add(keySet.next.kid);
  }
  return kids;
}

function cleanupKeyFiles(allowedKids: Set<string>): void {
  try {
    if (!fs.existsSync(KEYS_DIR)) {
      return;
    }

    const files = fs.readdirSync(KEYS_DIR);
    for (const file of files) {
      if (!file.endsWith(".pem")) {
        continue;
      }
      const kid = file.slice(0, -4);
      if (allowedKids.has(kid)) {
        continue;
      }

      const filePath = path.join(KEYS_DIR, file);
      fs.unlinkSync(filePath);
      logger.info("[jwks] Removed obsolete key file", { kid, file });
    }
  } catch (err) {
    logger.warn("[jwks] Failed to clean up key files", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function readAllowedKidsFromDisk(): Set<string> {
  const keysPath = path.join(KEYS_DIR, "keys.json");
  const kids = new Set<string>();
  if (!fs.existsSync(keysPath)) {
    return kids;
  }

  try {
    const data = JSON.parse(fs.readFileSync(keysPath, "utf-8")) as {
      old?: { kid: string };
      current?: { kid: string };
      next?: { kid: string };
    };

    if (data.old?.kid) {
      kids.add(data.old.kid);
    }
    if (data.current?.kid) {
      kids.add(data.current.kid);
    }
    if (data.next?.kid) {
      kids.add(data.next.kid);
    }
  } catch (err) {
    logger.debug("[jwks] Failed to read allowed kids for cleanup", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return kids;
}

/**
 * Initialize JWKS - load from disk or generate new keys
 */
export function initializeJWKS(): void {
  // Prevent multiple initializations (circular dependencies, multiple imports, etc.)
  if (isInitialized) {
    logger.debug("[jwks] JWKS already initialized, skipping re-initialization");
    return;
  }
  isInitialized = true;

  cleanupKeyFiles(readAllowedKidsFromDisk());

  if (loadKeysFromDisk()) {
    logger.info("[jwks] JWKS initialized with keys from disk");
    scheduleKeyRotation();
    return;
  }

  // Generate new keys if not on disk
  logger.info("[jwks] Generating new RSA key pair for JWKS...");
  const { privateKey: currentPrivateKey, kid: currentKid } = generateNewKeyPair();
  const iat = Math.floor(Date.now() / 1000);

  keySet.current = {
    keyObject: currentPrivateKey,
    kid: currentKid,
    iat,
  };

  // Generate the next key upfront (will become current on rotation)
  const { privateKey: nextPrivateKey, kid: nextKid } = generateNewKeyPair();
  keySet.next = {
    keyObject: nextPrivateKey,
    kid: nextKid,
    iat: Math.floor((Date.now() + KEY_ROTATION_INTERVAL) / 1000),
  };

  saveKeysToDisk();
  scheduleKeyRotation();

  logger.info("[jwks] JWKS initialized with new keys", {
    current: currentKid,
    next: nextKid,
  });
}

/**
 * Get the current private key for signing JWTs
 */
export function getCurrentPrivateKey(): KeyObject {
  return keySet.current.keyObject;
}

/**
 * Get the current key ID
 */
export function getCurrentKeyId(): string {
  return keySet.current.kid;
}

/**
 * Get all public keys for JWKS endpoint
 */
export function getPublicJWKS(): { keys: JWKSKey[] } {
  const keys: JWKSKey[] = [];

  // Add public keys (both active and expired for key rotation tolerance)
  const keysToExpose = [keySet.old, keySet.current, keySet.next].filter(Boolean);

  for (const key of keysToExpose) {
    if (!key) continue;

    const publicKey = createPublicKey(key.keyObject);
    const publicKeyDetails = publicKey.asymmetricKeyDetails as any;

    if (!publicKeyDetails) {
      logger.warn("[jwks] Failed to extract public key details");
      continue;
    }

    const jwk: JWKSKey = {
      kid: key.kid,
      kty: "RSA",
      use: "sig",
      alg: "RS256",
      n: publicKeyDetails.modulusLength ? Buffer.from(publicKeyDetails.n).toString("base64url") : undefined,
      e: Buffer.from([0x01, 0x00, 0x01]).toString("base64url"), // Common RSA exponent
      iat: key.iat,
    };

    // Add expiration for old keys (only old key has exp property)
    if ("exp" in key && typeof (key as any).exp === "number") {
      jwk.exp = (key as any).exp;
    }

    keys.push(jwk);
  }

  return { keys };
}

/**
 * Get a specific key by ID for verification
 */
export function getKeyById(kid: string): KeyObject | null {
  const entry =
    (keySet.current.kid === kid ? keySet.current : null) ||
    (keySet.old?.kid === kid ? keySet.old : null) ||
    (keySet.next?.kid === kid ? keySet.next : null);

  if (!entry) {
    logger.warn(`[jwks] Key not found for kid=${kid}`);
    return null;
  }

  try {
    return createPublicKey(entry.keyObject);
  } catch (err) {
    logger.error("[jwks] Failed to derive public key for verification", {
      kid,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Get all valid keys for JWT verification (current, old, and next)
 */
export function getAllValidKeys(): KeyObject[] {
  return [keySet.old?.keyObject, keySet.current.keyObject, keySet.next?.keyObject].filter(
    Boolean
  ) as KeyObject[];
}

/**
 * Rotate keys: current → old, next → current, generate new next
 */
function rotateKeys(): void {
  logger.info("[jwks] Starting key rotation...");

  const oldKid = keySet.current.kid;
  const oldPrivateKey = keySet.current.keyObject;
  const oldIat = keySet.current.iat;

  // Move current to old with expiration
  const oldExp = Math.floor(Date.now() / 1000) + KEY_OVERLAP_DAYS * 24 * 60 * 60;
  keySet.old = {
    keyObject: oldPrivateKey,
    kid: oldKid,
    iat: oldIat,
    exp: oldExp,
  };

  // Move next to current
  if (keySet.next) {
    keySet.current = {
      keyObject: keySet.next.keyObject,
      kid: keySet.next.kid,
      iat: keySet.next.iat,
    };
  }

  // Generate new next key
  const { privateKey: nextPrivateKey, kid: nextKid } = generateNewKeyPair();
  const nextIat = Math.floor((Date.now() + KEY_ROTATION_INTERVAL) / 1000);

  keySet.next = {
    keyObject: nextPrivateKey,
    kid: nextKid,
    iat: nextIat,
  };

  saveKeysToDisk();

  logger.info("[jwks] Key rotation completed", {
    old: oldKid,
    current: keySet.current.kid,
    next: nextKid,
  });
}

/**
 * Schedule periodic key rotation
 */
function scheduleKeyRotation(): void {
  if (rotationTimeoutId !== null) {
    clearTimeout(rotationTimeoutId);
    logger.debug("[jwks] Cleared existing rotation interval");
  }

  const schedule = (remainingMs: number) => {
    if (remainingMs <= MAX_TIMEOUT_MS) {
      rotationTimeoutId = setTimeout(() => {
        rotateKeys();
        schedule(KEY_ROTATION_INTERVAL);
      }, remainingMs);
      return;
    }

    rotationTimeoutId = setTimeout(() => {
      schedule(remainingMs - MAX_TIMEOUT_MS);
    }, MAX_TIMEOUT_MS);
  };

  schedule(KEY_ROTATION_INTERVAL);

  logger.info(`[jwks] Key rotation scheduled every ${KEY_ROTATION_INTERVAL / 1000 / 60 / 60 / 24} days`);
}

/**
 * Manual key rotation trigger (for testing/management)
 */
export function rotateKeysManually(): void {
  rotateKeys();
}

/**
 * Cleanup JWKS resources (for testing/graceful shutdown)
 */
export function cleanupJWKS(): void {
  if (rotationTimeoutId !== null) {
    clearTimeout(rotationTimeoutId);
    rotationTimeoutId = null;
    logger.info("[jwks] JWKS cleanup: rotation interval cleared");
  }
}

/**
 * Check if JWKS is initialized
 */
export function isJWKSInitialized(): boolean {
  return isInitialized;
}
