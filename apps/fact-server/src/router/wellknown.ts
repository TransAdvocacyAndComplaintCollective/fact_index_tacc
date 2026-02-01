/**
 * Well-known endpoints (/.well-known/*)
 * Public endpoints for OAuth2/OIDC discovery
 */

import express from "express";
import type { Router } from "express";
import { getJWKSEndpoint } from "../auth/passport-discord.ts";
import logger from "../logger.ts";

const router: Router = express.Router();

/**
 * /.well-known/jwks.json
 * JWKS (JSON Web Key Set) endpoint for public key distribution
 * Used for JWT verification with key rotation support
 * Exposes: old (deprecated), current (active), and next (upcoming) keys
 */
router.get("/jwks.json", (_req, res) => {
  try {
    const jwks = getJWKSEndpoint();
    res.setHeader("Cache-Control", "public, max-age=3600"); // Cache for 1 hour
    res.setHeader("Content-Type", "application/json");
    return res.json(jwks);
  } catch (err) {
    logger.error("[wellknown] JWKS endpoint error:", err instanceof Error ? { message: err.message, stack: err.stack } : { error: String(err) });
    return res.status(500).json({ error: "Failed to retrieve JWKS" });
  }
});

export default router;
