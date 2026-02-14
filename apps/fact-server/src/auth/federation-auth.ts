/**
 * Federation-aware OIDC Authentication Routes
 * Implements Backend-for-Frontend (BFF) pattern for OpenID Federation login
 */

import type { Express, Request, Response } from 'express';
import * as client from 'openid-client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveFederatedOpenIdProvider } from '../federation/resolver.ts';

type AuthorizationDetailsEntry = {
  type: string;
  [key: string]: unknown;
};

type AuthorizationRequestParameters = Record<string, string>;

// Extend session type for OIDC state
declare module 'express-session' {
  interface SessionData {
    pkce?: {
      codeVerifier: string;
      state?: string;
    };
    federationLogin?: {
      opEntityId: string;
      issuer: string;
      authorizationEndpoint: string;
      tokenEndpoint: string;
      userinfoEndpoint?: string;
      jwksUri?: string;
      clientId: string;
      clientSecret?: string;
      redirectUri: string;
      codeVerifier: string;
      state?: string;
      scope: string;
      authorizationDetails?: AuthorizationDetailsEntry[];
      oauthAuthorizationParams?: AuthorizationRequestParameters;
    };
    user?: {
      sub: string;
      email?: string;
      name?: string;
      isAdmin?: boolean;
      [key: string]: any;
    };
    oidcUid?: string; // For compatibility with existing OIDC provider
  }
}

function parseAuthorizationDetails(input: unknown): AuthorizationDetailsEntry[] | null {
  if (input == null) return null;

  let parsed: unknown;
  const looksLikeEntryArray =
    Array.isArray(input) &&
    input.length > 0 &&
    input.every((entry) => entry && typeof entry === 'object' && !Array.isArray(entry));

  if (looksLikeEntryArray) {
    parsed = input;
  } else {
    const raw = Array.isArray(input) ? String(input[0] || "") : String(input);
    if (!raw.trim()) return null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('authorization_details must be valid JSON');
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error('authorization_details must be a JSON array');
  }
  if (!parsed.length) {
    throw new Error('authorization_details must not be empty');
  }
  if (parsed.length > 20) {
    throw new Error('authorization_details has too many entries (max 20)');
  }

  return parsed.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('authorization_details entries must be objects');
    }

    const type = String((entry as any).type || '').trim();
    if (!type) {
      throw new Error('authorization_details entries require a non-empty "type"');
    }

    return {
      ...(entry as Record<string, unknown>),
      type,
    };
  });
}

function getDefaultAuthorizationDetails(): AuthorizationDetailsEntry[] | null {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname_local = path.dirname(__filename);
    const adminConfigPath = path.resolve(__dirname_local, '..', 'config', 'discord-auth.json');

    if (fs.existsSync(adminConfigPath)) {
      const rawConfig = fs.readFileSync(adminConfigPath, { encoding: 'utf8' });
      const parsedConfig = rawConfig ? JSON.parse(rawConfig) : {};
      const fromConfig = parseAuthorizationDetails(parsedConfig?.federationPolicy?.defaultAuthorizationDetails);
      if (fromConfig?.length) return fromConfig;
    }
  } catch (err) {
    console.warn('[federation-auth] Failed to load default authorization_details from admin config:', err);
  }

  const raw = process.env.FEDERATION_AUTHORIZATION_DETAILS;
  if (!raw) return null;
  return parseAuthorizationDetails(raw);
}

function getSingleQueryString(input: unknown): string | null {
  const value = Array.isArray(input) ? input[0] : input;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseClaimsParameter(input: unknown): string | null {
  const raw = getSingleQueryString(input);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('claims must be a JSON object');
    }
    return JSON.stringify(parsed);
  } catch {
    throw new Error('claims must be valid JSON');
  }
}

function parseOAuthAuthorizationRequestParameters(query: Request['query']): AuthorizationRequestParameters {
  const params: AuthorizationRequestParameters = {};
  const allowlistedStringKeys = [
    'resource',
    'audience',
    'prompt',
    'login_hint',
    'acr_values',
    'ui_locales',
    'nonce',
  ] as const;

  for (const key of allowlistedStringKeys) {
    const value = getSingleQueryString(query[key]);
    if (value) {
      params[key] = value;
    }
  }

  const claims = parseClaimsParameter(query.claims);
  if (claims) {
    params.claims = claims;
  }

  return params;
}

const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID || 'fact-index-frontend';
const OIDC_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET || 'dev-secret';
const OIDC_REDIRECT_URI = process.env.OIDC_REDIRECT_URI || 'http://localhost:5332/auth/federation/callback';
const FRONTEND_REDIRECT_AFTER_LOGIN = process.env.FRONTEND_URL || 'http://localhost:4300';

type FederationProviderClient = {
  id?: string;
  name?: string;
  clientId: string;
  clientSecret?: string;
  redirectUri?: string;
  scopes?: string;
};

type FederationProvider = {
  name: string;
  entityId: string;
  available: boolean;
  clients?: FederationProviderClient[];
};

function uniqueProviders(providers: FederationProvider[]): FederationProvider[] {
  const byEntityId = new Map<string, FederationProvider>();

  for (const provider of providers) {
    const key = provider.entityId.trim();
    if (!key) continue;

    const existing = byEntityId.get(key);
    if (!existing) {
      byEntityId.set(key, {
        ...provider,
        entityId: key,
      });
      continue;
    }

    byEntityId.set(key, {
      ...existing,
      name: existing.name || provider.name,
      available: existing.available || provider.available,
      clients: [...(existing.clients || []), ...(provider.clients || [])],
    });
  }

  return Array.from(byEntityId.values());
}

function parseFederationOpsFromJson(): FederationProvider[] {
  const raw = process.env.FEDERATION_OPS;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry: any): FederationProvider | null => {
        const entityId = String(entry?.entityId || '').trim();
        if (!entityId) return null;

        const clients = Array.isArray(entry?.clients)
          ? entry.clients
              .map((c: any): FederationProviderClient | null => {
                const clientId = String(c?.clientId || '').trim();
                if (!clientId) return null;
                return {
                  id: c?.id ? String(c.id) : undefined,
                  name: c?.name ? String(c.name) : undefined,
                  clientId,
                  clientSecret: c?.clientSecret ? String(c.clientSecret) : undefined,
                  redirectUri: c?.redirectUri ? String(c.redirectUri) : undefined,
                  scopes: c?.scopes ? String(c.scopes) : undefined,
                };
              })
              .filter((c): c is FederationProviderClient => Boolean(c))
          : undefined;

        return {
          name: String(entry?.name || `Federation OP (${entityId})`),
          entityId,
          available: Boolean(entry?.available ?? true),
          clients,
        };
      })
      .filter((provider): provider is FederationProvider => Boolean(provider));
  } catch (err) {
    console.error('[federation-auth] Failed to parse FEDERATION_OPS JSON:', err);
    return [];
  }
}

function getProviderByEntityId(entityId: string): FederationProvider | null {
  const providers = getFederationProviders();
  return providers.find((p) => p.entityId === entityId) || null;
}

function resolveProviderClient(
  provider: FederationProvider | null,
  requestedClientId: string | null
): FederationProviderClient {
  const fallbackClient: FederationProviderClient = {
    clientId: OIDC_CLIENT_ID,
    clientSecret: OIDC_CLIENT_SECRET,
    redirectUri: OIDC_REDIRECT_URI,
    scopes: 'openid profile email',
  };

  const clients = provider?.clients || [];
  if (!clients.length) return fallbackClient;

  const requested = (requestedClientId || '').trim();
  if (!requested) {
    return {
      ...fallbackClient,
      ...clients[0],
      redirectUri: clients[0].redirectUri || fallbackClient.redirectUri,
      scopes: clients[0].scopes || fallbackClient.scopes,
    };
  }

  const matched =
    clients.find((c) => c.id === requested) ||
    clients.find((c) => c.name === requested) ||
    clients.find((c) => c.clientId === requested);

  if (!matched) {
    throw new Error(`Unknown federation client "${requested}" for provider ${provider?.entityId || 'unknown'}`);
  }

  return {
    ...fallbackClient,
    ...matched,
    redirectUri: matched.redirectUri || fallbackClient.redirectUri,
    scopes: matched.scopes || fallbackClient.scopes,
  };
}

export function registerFederationAuthRoutes(app: Express) {
  /**
   * Initiate Federation OIDC Login
   * GET /auth/federation/login?op=<entity_id>
   * 
   * 1. Resolve OP metadata via federation
   * 2. Generate PKCE challenge
   * 3. Build authorization URL
   * 4. Redirect to OP
   */
  app.get('/auth/federation/login', async (req: Request, res: Response) => {
    try {
      const opEntityId = String(req.query.op || '');
      const requestedClientId = req.query.client ? String(req.query.client) : null;
      const requestedAuthorizationDetails =
        req.query.authorization_details ??
        req.query.authorizationDetails ??
        req.query.rar;
      if (!opEntityId) {
        return res.status(400).json({ 
          error: 'missing_parameter', 
          error_description: 'Missing required "op" parameter' 
        });
      }

      // Validate entity ID format (allow HTTP for localhost in development)
      const isDev = process.env.NODE_ENV === 'development';
      const isHttps = opEntityId.startsWith('https://');
      const isLocalhost = opEntityId.startsWith('http://localhost') || opEntityId.startsWith('http://127.0.0.1');
      
      if (!isHttps && !(isDev && isLocalhost)) {
        return res.status(400).json({
          error: 'invalid_entity_id',
          error_description: 'Entity ID must use HTTPS scheme (except localhost in development)'
        });
      }

      console.log('[federation-auth] Initiating login for OP:', opEntityId);

      const provider = getProviderByEntityId(opEntityId);
      const selectedClient = resolveProviderClient(provider, requestedClientId);
      const authorizationDetails =
        parseAuthorizationDetails(requestedAuthorizationDetails) || getDefaultAuthorizationDetails();
      const oauthAuthorizationParams = parseOAuthAuthorizationRequestParameters(req.query);

      // 1. Resolve OP via federation
      const opMetadata = await resolveFederatedOpenIdProvider({ opEntityId });
      console.log('[federation-auth] Resolved OP metadata:', { 
        issuer: opMetadata.issuer, 
        authEndpoint: opMetadata.authorization_endpoint 
      });

      // 2. Create OIDC client configuration
      const serverMetadata = {
        issuer: opMetadata.issuer,
        authorization_endpoint: opMetadata.authorization_endpoint,
        token_endpoint: opMetadata.token_endpoint,
        userinfo_endpoint: opMetadata.userinfo_endpoint,
        jwks_uri: opMetadata.jwks_uri,
        ...opMetadata, // Include any additional metadata
      };
      
      const clientOptions: Record<string, string> = {};
      if (selectedClient.clientSecret) {
        clientOptions.client_secret = selectedClient.clientSecret;
      }
      
      // Allow HTTP in development mode (for localhost testing)
      if (isDev && opMetadata.issuer.startsWith('http://')) {
        console.log('[federation-auth] Development mode: allowing HTTP for configuration');
        // openid-client will validate HTTPS in production, but for dev we skip this
      }
      
      const config = new client.Configuration(serverMetadata, selectedClient.clientId, clientOptions);

      // 3. Generate PKCE for this login attempt
      const codeVerifier = client.randomPKCECodeVerifier();
      const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
      const scope = selectedClient.scopes || 'openid profile email';

      // 4. Build authorization parameters
      const authParams: Record<string, string> = {
        redirect_uri: selectedClient.redirectUri || OIDC_REDIRECT_URI,
        scope,
        ...oauthAuthorizationParams,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      };
      if (authorizationDetails?.length) {
        authParams.authorization_details = JSON.stringify(authorizationDetails);
      }

      // Add state parameter if PKCE not fully supported
      if (!config.serverMetadata().supportsPKCE?.()) {
        const state = client.randomState();
        req.session.pkce = { codeVerifier, state };
        authParams.state = state;
      } else {
        req.session.pkce = { codeVerifier };
      }

      req.session.federationLogin = {
        opEntityId,
        issuer: opMetadata.issuer,
        authorizationEndpoint: opMetadata.authorization_endpoint,
        tokenEndpoint: opMetadata.token_endpoint,
        userinfoEndpoint: opMetadata.userinfo_endpoint,
        jwksUri: opMetadata.jwks_uri,
        clientId: selectedClient.clientId,
        clientSecret: selectedClient.clientSecret,
        redirectUri: selectedClient.redirectUri || OIDC_REDIRECT_URI,
        codeVerifier,
        state: req.session.pkce.state,
        scope,
        authorizationDetails: authorizationDetails || undefined,
        oauthAuthorizationParams: oauthAuthorizationParams || undefined,
      };

      // 5. Build authorization URL
      let authUrl: URL;
      
      // In development with HTTP, manually construct the authorization URL
      // since oauth4webapi enforces HTTPS validation
      if (isDev && opMetadata.issuer.startsWith('http://')) {
        console.log('[federation-auth] Development mode: manually constructing authorization URL for HTTP');
        const baseUrl = new URL(opMetadata.authorization_endpoint);
        Object.entries(authParams).forEach(([key, value]) => {
          baseUrl.searchParams.set(key, value);
        });
        baseUrl.searchParams.set('client_id', selectedClient.clientId);
        baseUrl.searchParams.set('response_type', 'code');
        authUrl = baseUrl;
      } else {
        // Production: use openid-client's strict validation
        authUrl = client.buildAuthorizationUrl(config, authParams);
      }
      
      console.log('[federation-auth] Redirecting to authorization endpoint:', authUrl.href);
      
      res.redirect(authUrl.href);
    } catch (error) {
      console.error('[federation-auth] Login initiation failed:', error);
      res.status(500).json({
        error: 'federation_error',
        error_description: error instanceof Error ? error.message : 'Failed to initiate federation login'
      });
    }
  });

  /**
   * OIDC Authorization Code Callback
   * GET /auth/federation/callback
   * 
   * 1. Extract authorization code
   * 2. Exchange for tokens using PKCE
   * 3. Extract user claims
   * 4. Create application session
   * 5. Redirect to frontend
   */
  app.get('/auth/federation/callback', async (req: Request, res: Response) => {
    try {
      const login = req.session.federationLogin;
      if (!login?.codeVerifier) {
        return res.status(400).json({
          error: 'invalid_session',
          error_description: 'Missing federation login session state'
        });
      }

      // Handle authorization errors
      const error = req.query.error;
      if (error) {
        const errorDescription = req.query.error_description || error;
        console.error('[federation-auth] Authorization error:', { error, errorDescription });
        
        // Redirect to frontend with error
        const redirectUrl = new URL(FRONTEND_REDIRECT_AFTER_LOGIN);
        redirectUrl.searchParams.set('error', String(error));
        redirectUrl.searchParams.set('error_description', String(errorDescription));
        return res.redirect(redirectUrl.href);
      }

      const authorizationCode = req.query.code;
      if (!authorizationCode) {
        return res.status(400).json({
          error: 'missing_code',
          error_description: 'Missing authorization code'
        });
      }

      console.log('[federation-auth] Processing authorization code callback');

      const serverMetadata = {
        issuer: login.issuer,
        authorization_endpoint: login.authorizationEndpoint,
        token_endpoint: login.tokenEndpoint,
        userinfo_endpoint: login.userinfoEndpoint,
        jwks_uri: login.jwksUri,
      };

      const clientOptions: Record<string, string> = {};
      if (login.clientSecret) {
        clientOptions.client_secret = login.clientSecret;
      }
      const config = new client.Configuration(serverMetadata, login.clientId, clientOptions);

      const currentUrl = new URL(
        `${req.protocol}://${req.get('host')}${req.originalUrl}`
      );

      // Exchange authorization code for tokens
      const tokens = await client.authorizationCodeGrant(config, currentUrl, {
        pkceCodeVerifier: login.codeVerifier,
        expectedState: login.state,
      });

      console.log('[federation-auth] Successfully exchanged code for tokens');

      // Extract user claims from tokens
      const claims = tokens.claims?.() || {} as any;
      const trustAnchorEntityId =
        process.env.FEDERATION_TRUST_ANCHOR_ENTITY_ID ||
        process.env.FEDERATION_ENTITY_ID ||
        undefined;
      const issuerEntityId = login.opEntityId || claims.iss || login.issuer;
      const subjectEntityId = claims.sub ? String(claims.sub) : '';
      const grantedPermissions: string[] = [];

      console.log('[federation-auth] Extracted user claims:', { 
        sub: claims.sub, 
        email: claims.email, 
        name: claims.name,
        issuerEntityId,
        trustAnchorEntityId,
      });

      // Create application session
      req.session.user = {
        sub: claims.sub || '',
        email: claims.email || undefined,
        name: claims.name || undefined,
        isAdmin: Boolean(claims.isAdmin),
        permissions: grantedPermissions,
        federationContext: {
          trustAnchorEntityId,
          issuerEntityId,
          subjectEntityId,
        },
      };

      // Clear PKCE state
      delete req.session.pkce;
      delete req.session.federationLogin;

      // Redirect to frontend
      console.log('[federation-auth] Login successful, redirecting to frontend');
      res.redirect(FRONTEND_REDIRECT_AFTER_LOGIN);
      
    } catch (error) {
      console.error('[federation-auth] Token exchange failed:', error);
      
      // Redirect to frontend with error
      const redirectUrl = new URL(FRONTEND_REDIRECT_AFTER_LOGIN);
      redirectUrl.searchParams.set('error', 'token_exchange_failed');
      redirectUrl.searchParams.set('error_description', 
        error instanceof Error ? error.message : 'Failed to exchange authorization code'
      );
      res.redirect(redirectUrl.href);
    }
  });

  /**
   * User info endpoint
   * GET /api/me
   * 
   * Returns current user from session
   */
  app.get('/api/me', (req: Request, res: Response) => {
    const user = req.session.user || null;
    res.json({ user });
  });

  /**
   * Federation logout
   * POST /auth/federation/logout
   * 
   * Destroys session and redirects to frontend
   */
  app.post('/auth/federation/logout', (req: Request, res: Response) => {
    console.log('[federation-auth] User logout');
    
    req.session.destroy((err) => {
      if (err) {
        console.error('[federation-auth] Session destruction failed:', err);
        return res.status(500).json({ error: 'logout_failed' });
      }
      
      // Clear session cookie
      res.clearCookie('connect.sid'); // Default express-session cookie name
      res.json({ success: true });
    });
  });

  console.log('[federation-auth] Federation auth routes registered');
}

/**
 * Get available federation OPs from configuration
 */
export function getFederationProviders() {
  const providers: FederationProvider[] = [];
  
  // Add self as federation OP if enabled
  if (process.env.ENABLE_FEDERATION_PROVIDER !== 'false') {
    // Use OIDC_BASE_URL if FEDERATION_ENTITY_ID is not set (for development)
    const entityId = process.env.FEDERATION_ENTITY_ID || process.env.OIDC_BASE_URL || 'https://fact.example.com';
    console.log('[federation-auth] Using federation entity ID:', entityId);
    
    providers.push({
      name: 'TACC',
      entityId,
      available: true,
      clients: [{
        id: 'default',
        name: 'default',
        clientId: OIDC_CLIENT_ID,
        clientSecret: OIDC_CLIENT_SECRET,
        redirectUri: OIDC_REDIRECT_URI,
        scopes: 'openid profile email',
      }],
    });
  }
  
  providers.push(...parseFederationOpsFromJson());

  // Add other federation OPs from config
  const otherOps = process.env.FEDERATION_OTHER_OPS?.split(',') || [];
  otherOps.forEach(entityId => {
    if (entityId.trim()) {
      providers.push({
        name: `Federation OP (${entityId})`,
        entityId: entityId.trim(),
        available: true,
      });
    }
  });
  
  return uniqueProviders(providers);
}
