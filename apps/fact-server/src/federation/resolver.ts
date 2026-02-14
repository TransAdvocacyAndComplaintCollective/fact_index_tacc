/**
 * OpenID Federation Trust Resolution
 * Resolves OpenID Provider metadata via federation trust chains
 */

export interface ResolvedOP {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri?: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  grant_types_supported?: string[];
}

export interface FederationResolveOptions {
  opEntityId: string;
  trustAnchorEntityId?: string;
  trustAnchorResolveEndpoint?: string;
}

/**
 * Resolve OpenID Provider metadata via Trust Anchor resolve endpoint
 * This is the recommended approach for production federation deployments
 */
export async function resolveOpenIdProviderViaTrustAnchor(opts: FederationResolveOptions): Promise<ResolvedOP> {
  const trustAnchorEndpoint = opts.trustAnchorResolveEndpoint || 
    process.env.FEDERATION_TRUST_ANCHOR_RESOLVE_ENDPOINT ||
    `${opts.trustAnchorEntityId}/federation/resolve`;

  const trustAnchorId = opts.trustAnchorEntityId || 
    process.env.FEDERATION_TRUST_ANCHOR_ENTITY_ID ||
    process.env.FEDERATION_ENTITY_ID; // Use self as trust anchor for simple cases

  const url = new URL(trustAnchorEndpoint);
  url.searchParams.set('sub', opts.opEntityId);
  url.searchParams.set('trust_anchor', trustAnchorId!);
  url.searchParams.set('entity_type', 'openid_provider');

  console.log('[federation] Resolving OP via trust anchor:', { 
    opEntityId: opts.opEntityId, 
    trustAnchor: trustAnchorId,
    endpoint: url.toString() 
  });

  try {
    const res = await fetch(url.toString(), { method: 'GET' });
    if (!res.ok) {
      throw new Error(`Federation resolve failed: ${res.status} ${res.statusText}`);
    }

    // Response may be JWT (application/entity-statement+jwt) or JSON
    const contentType = res.headers.get('content-type') || '';
    
    let metadata: any;
    if (contentType.includes('jwt') || contentType.includes('entity-statement')) {
      // JWT response - decode without verification for now
      // In production: verify signature using trust anchor federation keys
      const jwt = await res.text();
      metadata = decodeJwtWithoutVerifying(jwt);
      console.log('[federation] Received signed resolve response');
    } else {
      // JSON response
      metadata = await res.json();
      console.log('[federation] Received JSON resolve response');
    }

    // Extract OpenID Provider metadata from resolve response
    const opMetadata = metadata?.metadata?.openid_provider || metadata?.openid_provider || metadata;
    
    if (!opMetadata?.issuer || !opMetadata?.authorization_endpoint || !opMetadata?.token_endpoint) {
      throw new Error('Resolve response missing required OP metadata');
    }

    return {
      issuer: opMetadata.issuer,
      authorization_endpoint: opMetadata.authorization_endpoint,
      token_endpoint: opMetadata.token_endpoint,
      userinfo_endpoint: opMetadata.userinfo_endpoint,
      jwks_uri: opMetadata.jwks_uri,
      scopes_supported: opMetadata.scopes_supported,
      response_types_supported: opMetadata.response_types_supported,
    };
  } catch (error) {
    console.error('[federation] Failed to resolve OP:', error);
    throw error;
  }
}

/**
 * Fallback: Direct entity configuration fetch
 * Use when no trust anchor resolve endpoint is available
 */
export async function resolveOpenIdProviderDirect(entityId: string): Promise<ResolvedOP> {
  // In development, allow HTTP for localhost testing
  const isDev = process.env.NODE_ENV === 'development';
  const isLocalhost = entityId.startsWith('http://localhost') || entityId.startsWith('http://127.0.0.1');
  const isHttps = entityId.startsWith('https://');
  
  if (!isHttps && !isDev) {
    throw new Error('Entity ID must use HTTPS scheme in production');
  }
  if (!isHttps && isDev && !isLocalhost) {
    throw new Error('Entity ID must use HTTPS scheme (except for localhost in development)');
  }

  const entityConfigUrl = `${entityId}/.well-known/openid-federation`;
  
  console.log('[federation] Fetching entity configuration:', { 
    entityConfigUrl, 
    isDev, 
    isLocalhost 
  });

  try {
    const res = await fetch(entityConfigUrl, { method: 'GET' });
    if (!res.ok) {
      throw new Error(`Entity configuration fetch failed: ${res.status} ${res.statusText}`);
    }

    // Entity configuration is always a JWT
    const jwt = await res.text();
    const entityConfig = decodeJwtWithoutVerifying(jwt);
    
    // TODO: In production, verify JWT signature using entity's federation keys
    
    const opMetadata = entityConfig?.metadata?.openid_provider;
    if (!opMetadata?.issuer || !opMetadata?.authorization_endpoint || !opMetadata?.token_endpoint) {
      throw new Error('Entity configuration missing required OP metadata');
    }

    return {
      issuer: opMetadata.issuer,
      authorization_endpoint: opMetadata.authorization_endpoint,
      token_endpoint: opMetadata.token_endpoint,
      userinfo_endpoint: opMetadata.userinfo_endpoint,
      jwks_uri: opMetadata.jwks_uri,
      scopes_supported: opMetadata.scopes_supported,
      response_types_supported: opMetadata.response_types_supported,
    };
  } catch (error) {
    console.error('[federation] Failed to fetch entity configuration:', error);
    throw error;
  }
}

/**
 * Main federation resolver - tries trust anchor first, falls back to direct
 */
export async function resolveFederatedOpenIdProvider(opts: FederationResolveOptions): Promise<ResolvedOP> {
  // If we have trust anchor configuration, use it
  if (opts.trustAnchorEntityId || process.env.FEDERATION_TRUST_ANCHOR_ENTITY_ID) {
    try {
      return await resolveOpenIdProviderViaTrustAnchor(opts);
    } catch (error) {
      console.warn('[federation] Trust anchor resolution failed, falling back to direct:', error);
    }
  }

  // Fallback to direct entity configuration fetch
  try {
    return await resolveOpenIdProviderDirect(opts.opEntityId);
  } catch (error) {
    console.warn('[federation] Direct resolution failed:', error);
    
    // Development fallback: If resolving the entity fails and we're in development mode,
    // return a mock OIDC provider configuration for testing
    if (process.env.NODE_ENV === 'development' && opts.opEntityId.includes('localhost')) {
      console.log('[federation] Using development fallback for local testing');
      return {
        issuer: opts.opEntityId,
        authorization_endpoint: `${opts.opEntityId}/oidc/authorization`,
        token_endpoint: `${opts.opEntityId}/oidc/token`,
        userinfo_endpoint: `${opts.opEntityId}/oidc/userinfo`,
        jwks_uri: `${opts.opEntityId}/.well-known/openid-connect/jwks.json`,
        scopes_supported: ['openid', 'profile', 'email'],
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
      };
    }
    
    throw error;
  }
}

/**
 * Decode JWT payload without signature verification
 * WARNING: Only use for development or when signature verification happens elsewhere
 */
function decodeJwtWithoutVerifying(jwt: string): any {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }
    
    const payload = parts[1];
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    return JSON.parse(decoded);
  } catch (error) {
    throw new Error(`Failed to decode JWT: ${error}`);
  }
}