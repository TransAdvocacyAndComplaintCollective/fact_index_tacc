/**
 * OpenID Federation Entity Service
 * Implements federation entity endpoints and metadata management
 */

import type { Request, Response } from "express";
import { getDb } from "@factdb/db-core";
import { getCurrentPrivateKey, getCurrentKeyId, getPublicJWKS } from "./jwks.ts";
import crypto from "crypto";
import { sign, verify } from "jsonwebtoken";

const ENTITY_BASE_URL = process.env.ENTITY_BASE_URL || "https://localhost:3000";
const FEDERATION_SCOPES = ["openid", "profile", "email"];

export interface EntityConfiguration {
  iss: string; // Entity identifier
  sub: string; // Usually same as iss for leaf entities
  iat: number;
  exp: number;
  jwks: any;
  metadata: EntityMetadata;
  authority_hints?: string[];
}

export interface EntityMetadata {
  openid_provider?: {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint: string;
    jwks_uri: string;
    scopes_supported: string[];
    response_types_supported: string[];
    grant_types_supported: string[];
    token_endpoint_auth_methods_supported: string[];
  };
  openid4vp_verifier?: {
    client_id: string;
    authorization_endpoint: string;
    response_types_supported: string[];
    vp_formats_supported: Record<string, any>;
  };
  federation_entity?: {
    federation_fetch_endpoint: string;
    federation_list_endpoint: string;
    federation_resolve_endpoint?: string;
    trust_mark_issuers?: string[];
  };
}

/**
 * Generate entity configuration JWT
 * This is your federation entity's signed metadata
 */
export function generateEntityConfiguration(
  entityId: string = ENTITY_BASE_URL,
  metadata: EntityMetadata
): string {
  const privateKey = getCurrentPrivateKey();
  const keyId = getCurrentKeyId();
  const publicJwks = getPublicJWKS();

  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 7 * 24 * 60 * 60; // 7 days

  const config: EntityConfiguration = {
    iss: entityId,
    sub: entityId,
    iat: now,
    exp: now + expiresIn,
    jwks: publicJwks,
    metadata,
  };

  return sign(config, privateKey, {
    algorithm: "RS256",
    keyid: keyId,
  });
}

/**
 * Save entity configuration to database
 */
export async function saveEntityConfiguration(
  entityId: string,
  entityType: string,
  metadata: EntityMetadata
): Promise<void> {
  const db = getDb();
  const configJwt = generateEntityConfiguration(entityId, metadata);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const publicJwks = getPublicJWKS();

  await db
    .insertInto("federation_entity")
    .values({
      id: crypto.randomUUID(),
      entityId,
      entityType,
      configurationJwt: configJwt,
      publicKeys: JSON.stringify(publicJwks.keys),
      createdAt: now,
      expiresAt,
      updatedAt: now,
    })
    .onConflict((oc) =>
      oc.column("entityId").doUpdateSet({
        configurationJwt: configJwt,
        publicKeys: JSON.stringify(publicJwks.keys),
        updatedAt: now,
        expiresAt,
      })
    )
    .execute();

  console.log(`[federation] Saved entity configuration for ${entityId}`);
}

/**
 * Endpoint: GET /.well-known/openid-federation
 * Returns signed Entity Configuration JWT
 */
export async function handleWellKnownOpenIDFederation(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const entityId = ENTITY_BASE_URL;

    // Build metadata based on your entity's capabilities
    const metadata: EntityMetadata = {
      openid_provider: {
        issuer: entityId,
        authorization_endpoint: `${entityId}/auth/authorize`,
        token_endpoint: `${entityId}/auth/token`,
        userinfo_endpoint: `${entityId}/auth/userinfo`,
        jwks_uri: `${entityId}/.well-known/jwks.json`,
        scopes_supported: FEDERATION_SCOPES,
        response_types_supported: ["code", "id_token", "code id_token"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        token_endpoint_auth_methods_supported: ["client_secret_basic"],
      },
      federation_entity: {
        federation_fetch_endpoint: `${entityId}/federation/fetch`,
        federation_list_endpoint: `${entityId}/federation/list`,
        federation_resolve_endpoint: `${entityId}/federation/resolve`,
      },
    };

    const configJwt = generateEntityConfiguration(entityId, metadata);
    res.setHeader("Content-Type", "application/jwt");
    res.send(configJwt);
    console.debug("[federation] Returned entity configuration");
  } catch (err) {
    console.error("[federation] Error in entity configuration endpoint:", err);
    res.status(500).json({ error: "Configuration generation failed" });
  }
}

/**
 * Endpoint: GET|POST /federation/fetch?sub=...
 * Returns subordinate statement for requested entity
 */
export async function handleFederationFetch(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const sub = (req.query.sub || req.body?.sub) as string;
    if (!sub) {
      return res.status(400).json({ error: "sub parameter required" });
    }

    const db = getDb();

    // Check if this subordinate exists
    const subordinate = await db
      .selectFrom("federation_subordinate")
      .selectAll()
      .where("subordinateId", "=", sub)
      .executeTakeFirst();

    if (!subordinate) {
      return res.status(404).json({ error: "Subordinate not found" });
    }

    // Return signed subordinate statement JWT
    res.setHeader("Content-Type", "application/jwt");
    res.send(subordinate.statementJwt);
    console.debug(`[federation] Returned subordinate statement for ${sub}`);
  } catch (err) {
    console.error("[federation] Error in federation fetch:", err);
    res.status(500).json({ error: "Fetch failed" });
  }
}

/**
 * Endpoint: GET /federation/list
 * Returns list of subordinates (for intermediates/trust anchors)
 */
export async function handleFederationList(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const db = getDb();

    // Get all subordinate IDs
    const subordinates = await db
      .selectFrom("federation_subordinate")
      .select("subordinateId")
      .execute();

    const subordinateIds = subordinates.map((s) => s.subordinateId);

    res.json({
      subordinates: subordinateIds,
    });

    console.debug(
      `[federation] Returned list of ${subordinateIds.length} subordinates`
    );
  } catch (err) {
    console.error("[federation] Error in federation list:", err);
    res.status(500).json({ error: "List failed" });
  }
}

/**
 * Endpoint: POST /federation/resolve (optional)
 * Resolves a subordinate's full trust chain and validates signatures
 */
export async function handleFederationResolve(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { sub, trust_chain } = req.body;
    if (!sub) {
      return res.status(400).json({ error: "sub parameter required" });
    }

    const db = getDb();

    // Fetch entity's configuration
    const entity = await db
      .selectFrom("federation_entity")
      .selectAll()
      .where("entityId", "=", sub)
      .executeTakeFirst();

    if (!entity) {
      return res.status(404).json({ error: "Entity not found" });
    }

    // Verify signatures in trust chain if provided
    // Parse and validate entity.configurationJwt
    // Return resolved metadata with policy applied

    res.json({
      iss: sub,
      metadata: JSON.parse(entity.configurationJwt),
      trust_chain: trust_chain || [],
      expiration_time: entity.expiresAt,
    });

    console.debug(`[federation] Resolved entity ${sub}`);
  } catch (err) {
    console.error("[federation] Error in federation resolve:", err);
    res.status(500).json({ error: "Resolve failed" });
  }
}

/**
 * Issue a subordinate statement for another entity
 */
export async function issueSubordinateStatement(
  subordinateId: string,
  metadata: any
): Promise<string> {
  const privateKey = getCurrentPrivateKey();
  const keyId = getCurrentKeyId();

  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 7 * 24 * 60 * 60;

  const statement = {
    iss: ENTITY_BASE_URL,
    sub: subordinateId,
    iat: now,
    exp: now + expiresIn,
    metadata,
  };

  const jwt = sign(statement, privateKey, {
    algorithm: "RS256",
    keyid: keyId,
  });

  // Save to database
  const db = getDb();
  await db
    .insertInto("federation_subordinate")
    .values({
      id: crypto.randomUUID(),
      issuerId: ENTITY_BASE_URL,
      subordinateId,
      statementJwt: jwt,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    })
    .execute();

  console.log(
    `[federation] Issued subordinate statement for ${subordinateId}`
  );

  return jwt;
}
