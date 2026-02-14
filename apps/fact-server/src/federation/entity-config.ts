/**
 * OpenID Federation Entity Configuration
 * Builds and signs the Entity Configuration JWT that is published at /.well-known/openid-federation
 *
 * Spec: https://openid.net/specs/openid-federation-1_0.html
 */

import { SignJWT } from 'jose';
import type { FederationKeyPair } from './keys.ts';

export interface EntityConfigurationOptions {
  entityId: string;
  kid: string;
  federationKeys: FederationKeyPair;
  metadata: Record<string, any>;
  authorityHints?: string[];
  lifetimeSeconds?: number;
}

/**
 * Build the Entity Configuration JWT
 *
 * The Entity Configuration is a self-signed JWT that:
 * - Claims to be the entity (iss = sub = entityId)
 * - Contains its public keys (jwks)
 * - Declares what roles it plays (in metadata)
 * - Is signed with ES256 (federation signing key, not app JWT key)
 *
 * Spec: https://openid.net/specs/openid-federation-1_0.html#section-4.1
 */
export async function buildEntityConfigurationJwt(
  opts: EntityConfigurationOptions
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (opts.lifetimeSeconds ?? 3600);

  const payload = {
    iss: opts.entityId,
    sub: opts.entityId,
    iat: now,
    exp,
    jwks: {
      keys: [opts.federationKeys.publicKeyJwk],
    },
    authority_hints: opts.authorityHints ?? [],
    metadata: opts.metadata,
  };

  // Create and sign JWT with federation private key
  const jwt = await new SignJWT(payload)
    .setProtectedHeader({
      alg: 'ES256',
      kid: opts.kid,
      typ: 'entity-statement+jwt',
    })
    .sign(opts.federationKeys.privateKey);

  return jwt;
}

/**
 * Build metadata for an OIDC Provider in federation context
 */
export function buildOpenIdProviderMetadata(opts: {
  issuer: string;
  clientId?: string;
  responseTypesSupported?: string[];
  grantTypesSupported?: string[];
}): Record<string, any> {
  return {
    issuer: opts.issuer,
    authorization_endpoint: `${opts.issuer}/oidc/authorization`,
    token_endpoint: `${opts.issuer}/oidc/token`,
    userinfo_endpoint: `${opts.issuer}/oidc/userinfo`,
    jwks_uri: `${opts.issuer}/.well-known/openid-connect/jwks.json`,
    scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
    response_types_supported: opts.responseTypesSupported || ['code', 'code id_token', 'id_token'],
    grant_types_supported: opts.grantTypesSupported || ['authorization_code', 'refresh_token'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['ES256', 'RS256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_basic'],
  };
}

/**
 * Build metadata for an OAuth Client (Relying Party / Verifier) in federation context
 */
export function buildOAuthClientMetadata(opts: {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  contacts?: string[];
  logoUri?: string;
}): Record<string, any> {
  return {
    client_id: opts.clientId,
    client_name: opts.clientName,
    redirect_uris: opts.redirectUris,
    response_types: ['code'],
    grant_types: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_method: 'none', // PKCE for public clients
    contacts: opts.contacts || [],
    logo_uri: opts.logoUri,
  };
}

/**
 * Build metadata for a Verifier in OpenID4VP context
 */
export function buildOpenId4VpVerifierMetadata(opts: {
  verifierId: string;
  verifierName: string;
  responseTypesSupported?: string[];
}): Record<string, any> {
  return {
    client_id: opts.verifierId,
    client_name: opts.verifierName,
    response_types: opts.responseTypesSupported || ['vp_token', 'id_token'],
    response_modes_supported: ['direct_post.jwt'],
    vp_formats_supported: {
      jwt_vp: {
        alg_values_supported: ['ES256', 'RS256'],
      },
      jwt_vc: {
        alg_values_supported: ['ES256', 'RS256'],
      },
    },
  };
}
