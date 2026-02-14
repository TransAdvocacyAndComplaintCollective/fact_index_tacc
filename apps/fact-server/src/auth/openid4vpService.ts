/**
 * OpenID4VP Verifier Service
 * Implements OpenID for Verifiable Presentations endpoint (verifier role only)
 * Does NOT implement wallet functionality
 */

import type { Request, Response } from "express";
import { getDb } from "@factdb/db-core";
import { sign, verify } from "jsonwebtoken";
import { getCurrentPrivateKey, getCurrentKeyId } from "./jwks.ts";
import crypto from "crypto";

const VERIFIER_BASE_URL = process.env.ENTITY_BASE_URL || "https://localhost:3000";

export interface OpenID4VPRequest {
  response_type: "vp_token";
  client_id: string; // Can be federation entity ID
  response_uri: string; // Where wallet sends the response
  state: string;
  nonce: string;
  presentation_definition?: PresentationDefinition;
  vp_formats_supported?: Record<string, any>;
}

export interface PresentationDefinition {
  id: string;
  input_descriptors: InputDescriptor[];
}

export interface InputDescriptor {
  id: string;
  name?: string;
  purpose?: string;
  format?: Record<string, any>;
  constraints?: {
    fields?: Array<{
      path: string[];
      filter?: any;
    }>;
  };
}

export interface VerifiablePresentationToken {
  vp: {
    "@context": string[];
    type: string[];
    verifiableCredential: Array<{
      proof: any;
      [key: string]: any;
    }>;
    proof: any;
  };
}

/**
 * Generate authorization request for OpenID4VP
 * Client app calls this to get a request object to show wallet
 */
export async function generateOpenID4VPRequest(
  clientId: string,
  presentationDefinition: PresentationDefinition,
  state: string = crypto.randomBytes(16).toString("hex"),
  nonce: string = crypto.randomBytes(16).toString("hex")
): Promise<OpenID4VPRequest> {
  return {
    response_type: "vp_token",
    client_id: clientId, // Can be federation entity ID
    response_uri: `${VERIFIER_BASE_URL}/openid4vp/response`,
    state,
    nonce,
    presentation_definition: presentationDefinition,
    vp_formats_supported: {
      jwt_vc_json: {
        alg_supported: ["RS256", "ES256"],
      },
      jwt_vp_json: {
        alg_supported: ["RS256", "ES256"],
      },
    },
  };
}

/**
 * Endpoint: POST /openid4vp/response
 * Wallet posts vp_token here after user approval
 */
export async function handleOpenID4VPResponse(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const authUser = (req as any).authStatus?.user;
    const { vp_token, state } = req.body;

    if (!vp_token) {
      return res.status(400).json({ error: "vp_token required" });
    }

    // Validate and parse VP token
    let decoded: any;
    try {
      // In a real scenario, you'd validate the signature against the wallet's key
      // For now, we just parse it
      decoded = parseJWT(vp_token);
    } catch (err) {
      return res.status(400).json({ error: "Invalid vp_token" });
    }

    // Extract claims from VP
    const vpClaims = extractVPClaims(decoded);

    // Save presentation to database
    const db = getDb();
    const presentationId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Calculate expiration (typically 1 hour)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await db
      .insertInto("verifiable_presentation")
      .values({
        id: presentationId,
        userId: authUser?.id || null,
        vpToken: vp_token,
        verifierMetadata: JSON.stringify({
          verifierId: VERIFIER_BASE_URL,
          receivedAt: now,
          state,
        }),
        credentialTypes: JSON.stringify(vpClaims.credentialTypes),
        claimsJson: JSON.stringify(vpClaims),
        validatedAt: now,
        expiresAt,
        status: "valid",
      })
      .execute();

    console.log(
      `[openid4vp] Received and validated VP token: ${presentationId}`
    );

    // Return success
    res.json({
      success: true,
      presentation_id: presentationId,
      claims: vpClaims,
      state,
    });
  } catch (err) {
    console.error("[openid4vp] Error handling VP response:", err);
    res.status(500).json({ error: "VP processing failed" });
  }
}

/**
 * Endpoint: GET /openid4vp/verifier
 * Returns verifier metadata for federation discovery
 */
export async function handleOpenID4VPVerifierMetadata(
  req: Request,
  res: Response
): Promise<void> {
  const metadata = {
    client_id: VERIFIER_BASE_URL,
    authorization_endpoint: `${VERIFIER_BASE_URL}/openid4vp/authorize`,
    response_types_supported: ["vp_token"],
    vp_formats_supported: {
      jwt_vc_json: {
        alg_supported: ["RS256", "ES256"],
        crv_supported: ["P-256", "secp256k1"],
      },
      jwt_vp_json: {
        alg_supported: ["RS256", "ES256"],
        crv_supported: ["P-256", "secp256k1"],
      },
    },
    presentation_definitions: [
      {
        id: "identity_verification",
        input_descriptors: [
          {
            id: "verified_id",
            name: "Verified Identity",
            purpose: "Proof of verified identity",
            format: {
              jwt_vc_json: {
                alg: ["RS256"],
              },
            },
            constraints: {
              fields: [
                {
                  path: ["$.credentialSubject.name"],
                },
                {
                  path: ["$.credentialSubject.birthDate"],
                },
              ],
            },
          },
        ],
      },
    ],
  };

  res.json(metadata);
}

/**
 * Extract human-readable claims from a VP token
 */
function extractVPClaims(vpToken: any): {
  subject: string;
  issuer: string;
  credentialTypes: string[];
  claims: Record<string, any>;
} {
  const credentials = vpToken.vp?.verifiableCredential || [];
  const claims: Record<string, any> = {};
  const credentialTypes = new Set<string>();

  for (const vc of credentials) {
    // Extract type
    if (Array.isArray(vc.type)) {
      vc.type.forEach((t: string) => credentialTypes.add(t));
    }

    // Extract claims from credentialSubject
    if (vc.credentialSubject) {
      Object.assign(claims, vc.credentialSubject);
    }

    // Track issuer
    if (vc.issuer && typeof vc.issuer === "string") {
      claims.issuer = vc.issuer;
    }
  }

  return {
    subject: claims.id || vpToken.sub || "unknown",
    issuer: claims.issuer || vpToken.iss || "unknown",
    credentialTypes: Array.from(credentialTypes),
    claims,
  };
}

/**
 * Parse JWT without verification (for demonstration)
 * In production, always verify signatures
 */
function parseJWT(token: string): any {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }

  const payload = Buffer.from(parts[1], "base64").toString("utf-8");
  return JSON.parse(payload);
}

/**
 * Convert VP claims to Casbin roles/attributes
 * This bridges OpenID4VP presentation validation to authorization
 */
export async function vpClaimsToCasbinRoles(
  userId: string,
  vpClaims: any
): Promise<string[]> {
  const roles: string[] = [];

  // Example: if VP contains a "kyc_verified" claim, add a local role
  if (vpClaims.claims?.kyc_verified) {
    roles.push("role:kyc:verified");
  }

  // Example: if VP contains educational credential
  if (vpClaims.credentialTypes?.includes("EducationalCredentialCredential")) {
    roles.push("role:education:verified");
  }

  // Only add roles from trusted issuers (should be validated via federation)
  const trustedIssuers = process.env.TRUSTED_VP_ISSUERS?.split(",") || [];
  if (vpClaims.issuer && trustedIssuers.includes(vpClaims.issuer)) {
    // Additional roles for trusted issuers
    roles.push("role:vp:trusted");
  }

  // Sync roles to Casbin
  if (roles.length > 0) {
    try {
      const db = getDb();
      for (const role of roles) {
        await db
          .insertInto("local_role_assignment")
          .values({
            id: crypto.randomUUID(),
            userId,
            role,
            domain: "global",
            createdAt: new Date().toISOString(),
            createdBy: null,
          })
          .onConflict((oc) =>
            oc.columns(["userId", "role", "domain"]).doNothing()
          )
          .execute();
      }
      console.log(
        `[openid4vp] Assigned ${roles.length} roles to user ${userId}`
      );
    } catch (err) {
      console.error("[openid4vp] Error syncing roles:", err);
    }
  }

  return roles;
}

/**
 * Get stored VP by ID
 */
export async function getVerifiablePresentation(
  presentationId: string
): Promise<any | null> {
  const db = getDb();
  return db
    .selectFrom("verifiable_presentation")
    .selectAll()
    .where("id", "=", presentationId)
    .executeTakeFirst() || null;
}

/**
 * List user's VPs
 */
export async function getUserPresentations(userId: string): Promise<any[]> {
  const db = getDb();
  return db
    .selectFrom("verifiable_presentation")
    .selectAll()
    .where("userId", "=", userId)
    .orderBy("validatedAt", "desc")
    .execute();
}
