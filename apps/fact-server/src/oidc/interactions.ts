/**
 * OIDC Interaction Routes
 * Handles the login and consent flow for the OIDC Provider
 * 
 * When a client initiates an authorization request, oidc-provider redirects to these routes
 * to handle user authentication (Discord login) and consent.
 */

import type { Express } from 'express';
import type Provider from 'oidc-provider';
import passport from 'passport';

// Extend express-session to support OIDC state
declare global {
  namespace Express {
    interface SessionData {
      oidcUid?: string;
    }
  }
}

/**
 * Register OIDC interaction routes
 */
export function registerOidcInteractions(app: Express, provider: Provider) {
  /**
   * Login page / Discord OAuth trigger
   * Visited by users who aren't yet authenticated
   */
  app.get('/interaction/:uid', async (req, res, next) => {
    try {
      const { uid } = req.params;
      const interaction = await provider.Interaction.find(req);

      // For MVP, just redirect to Discord login immediately
      // In a full implementation, you'd show a login page with options
      // (Discord, OIDC federation, etc.)

      if (!interaction) {
        return res.status(400).json({ error: 'interaction_not_found' });
      }

      // Redirect to Discord OAuth via Passport
      // Store the interaction UID in session so we can resume after Discord callback
      (req.session as any).oidcUid = uid;
      req.session!.save((err) => {
        if (err) {
          console.error('[oidc] Session save error:', err);
          return next(err);
        }
        // Kick off Discord OAuth flow
        passport.authenticate('discord', {
          scope: ['identify', 'email', 'guilds'],
        })(req, res, next);
      });
    } catch (err) {
      console.error('[oidc] Error in interaction route:', err);
      next(err);
    }
  });

  /**
   * Discord OAuth callback
   * After user authenticates with Discord, Passport calls this
   */
  app.get('/oidc/discord/callback', passport.authenticate('discord'), async (req, res, next) => {
    try {
      const session = req.session as any;
      const oidcUid = session?.oidcUid;
      if (!oidcUid) {
        return res.status(400).json({ error: 'missing_oidc_uid' });
      }

      // At this point, req.user is populated by Passport
      // It contains the Discord user ID and other identity info
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(400).json({ error: 'no_user_from_discord' });
      }

      // Finish the OIDC interaction
      // This tells oidc-provider that the user is authenticated as 'userId'
      await provider.interactionFinished(req, res, {
        login: {
          accountId: userId,
        },
      });
    } catch (err) {
      console.error('[oidc] Error finishing interaction:', err);
      next(err);
    }
  });

  /**
   * Consent page (stub)
   * In a full implementation, show user what data the client is requesting
   * For MVP, skip consent (implicit trust)
   */
  app.get('/interaction/:uid/consent', async (req, res, next) => {
    try {
      const { uid } = req.params;
      const interaction = await provider.Interaction.find(req);

      if (!interaction) {
        return res.status(400).json({ error: 'interaction_not_found' });
      }

      // For MVP: auto-consent
      // In production, render a consent page and ask user to approve data sharing
      await provider.interactionFinished(req, res, {
        consent: {
          rejectedScopes: [],
          rejectedClaims: [],
        },
      });
    } catch (err) {
      console.error('[oidc] Error in consent:', err);
      next(err);
    }
  });

  console.log('[oidc] Interaction routes registered');
}
