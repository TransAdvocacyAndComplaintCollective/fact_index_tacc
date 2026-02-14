/**
 * OpenID Federation Routes
 * Exposes federation-required endpoints:
 * - /.well-known/openid-federation (Entity Configuration)
 * - /federation/fetch (Subordinate Statement) - if trust anchor
 * - /federation/list (List subordinates) - if trust anchor
 */

import type { Express, Router } from 'express';
import { getFederationKeys, getFederationName, getFederationEntityId } from './keys.ts';
import {
  buildEntityConfigurationJwt,
  buildOpenIdProviderMetadata,
} from './entity-config.ts';

/**
 * Register federation routes
 * Mounts the well-known OpenID Federation endpoint
 */
export function registerFederationRoutes(app: Express) {
  // Entity Configuration endpoint (required for all federation entities)
  // Spec: https://openid.net/specs/openid-federation-1_0.html#section-5.1.1
  app.get('/.well-known/openid-federation', async (_req, res) => {
    try {
      const { entityId, kid, privateKey, publicKeyJwk } = await getFederationKeys();
      const federationName = getFederationName();

      // Build OIDC Provider metadata (we're an OP in the federation)
      const opMetadata = buildOpenIdProviderMetadata({
        issuer: entityId,
      });

      // Build entity configuration
      const federationKeys = await getFederationKeys();
      const jwt = await buildEntityConfigurationJwt({
        entityId,
        kid,
        federationKeys,
        metadata: {
          openid_provider: opMetadata,
          federation_entity: {
            organization_name: federationName,
            homepage_uri: entityId,
            contacts: [process.env.FEDERATION_CONTACT_EMAIL || 'admin@example.com'],
          },
        },
        authorityHints: process.env.FEDERATION_AUTHORITY_HINTS
          ? process.env.FEDERATION_AUTHORITY_HINTS.split(',')
          : [],
        lifetimeSeconds: 3600,
      });

      // Respond with Entity Configuration JWT
      // Content-Type is standardized in the OpenID Federation spec
      res.type('application/entity-statement+jwt').send(jwt);
      console.log('[federation] Served entity configuration');
    } catch (err) {
      console.error('[federation] Error building entity configuration:', err);
      res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to generate entity configuration',
      });
    }
  });

  console.log('[federation] Routes registered');
}

/**
 * Subordinate Statement endpoints (for Trust Anchor / Intermediate)
 * These are optional and only needed if you're vouching for other entities
 */
export function registerTrustAnchorRoutes(app: Express) {
  /**
   * Fetch: Returns a subordinate statement about another entity
   * Spec: https://openid.net/specs/openid-federation-1_0.html#section-5.2.3
   */
  app.get('/federation/fetch', async (req, res) => {
    try {
      const sub = String(req.query.sub || '');
      if (!sub) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing required "sub" parameter',
        });
      }

      // TODO: Implement subordinate statement lookup
      // This would fetch from a DB table storing subordinate metadata/policies
      // and sign it with your trust anchor key

      res.status(501).json({
        error: 'not_implemented',
        error_description: 'Trust anchor subordinate fetch not yet implemented',
      });
    } catch (err) {
      console.error('[federation] Error in fetch endpoint:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  /**
   * List: Returns immediate subordinates
   * Spec: https://openid.net/specs/openid-federation-1_0.html#section-5.2.4
   */
  app.get('/federation/list', async (_req, res) => {
    try {
      // TODO: Implement subordinate listing
      // Query DB for immediate children/subordinates
      const subordinates: string[] = [];
      res.json(subordinates);
    } catch (err) {
      console.error('[federation] Error in list endpoint:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  /**
   * Resolve: Returns resolved metadata and trust chain
   * Spec: https://openid.net/specs/openid-federation-1_0.html#section-5.2.5
   * (Note: This is complex and often proxied to a dedicated resolver)
   */
  app.get('/federation/resolve', async (req, res) => {
    try {
      const sub = String(req.query.sub || '');
      const anchor = String(req.query.anchor || '');

      if (!sub) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing required "sub" parameter',
        });
      }

      // TODO: Implement trust chain resolution
      // This is non-trivial (requires building a trust chain, validating signatures, applying policies)
      // Many implementations proxy this to a dedicated resolver service

      res.status(501).json({
        error: 'not_implemented',
        error_description: 'Federation resolve endpoint not yet implemented',
      });
    } catch (err) {
      console.error('[federation] Error in resolve endpoint:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  console.log('[federation] Trust anchor routes registered (fetch, list, resolve)');
}
