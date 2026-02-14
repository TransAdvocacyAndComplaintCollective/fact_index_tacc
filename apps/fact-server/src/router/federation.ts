/**
 * Federation Routes
 * OpenID Federation endpoints
 */

import express from "express";
import type { Router } from "express";
import {
  handleWellKnownOpenIDFederation,
  handleFederationFetch,
  handleFederationList,
  handleFederationResolve,
} from "../../auth/federationService.ts";

const router: Router = express.Router();

/**
 * GET /.well-known/openid-federation
 * Returns Entity Configuration JWT
 */
router.get("/.well-known/openid-federation", async (req, res) => {
  await handleWellKnownOpenIDFederation(req, res);
});

/**
 * GET|POST /federation/fetch?sub=...
 * Returns subordinate statement
 */
router.get("/federation/fetch", async (req, res) => {
  await handleFederationFetch(req, res);
});

router.post("/federation/fetch", async (req, res) => {
  await handleFederationFetch(req, res);
});

/**
 * GET /federation/list
 * Returns list of subordinates
 */
router.get("/federation/list", async (req, res) => {
  await handleFederationList(req, res);
});

/**
 * POST /federation/resolve
 * Resolves entity and builds trust chain
 */
router.post("/federation/resolve", async (req, res) => {
  await handleFederationResolve(req, res);
});

export default router;
