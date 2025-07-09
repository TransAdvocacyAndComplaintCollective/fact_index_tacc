// ./auth/discordRouter.js (ESM version)
import express from 'express';
import passport from 'passport';
import { validateAndRefreshSession } from './passport-discord.js'; // middleware, must call next() or res
import './passport-discord.js'; // registers the Discord passport strategy



const router = express.Router();

// --- Discord OAuth endpoints ---

// Step 1: Initiate Discord login
router.get('/discord', passport.authenticate('discord'));

// Step 2: OAuth2 callback from Discord
// After passport authenticates, make sure session is saved before redirect
router.get(
  '/discord/callback',
  passport.authenticate('discord', {
    failureRedirect: '/',
    // Do not use successRedirect here if you want to guarantee session save before redirect
  }),
  (req, res, next) => {
    // Always save session before redirecting, to prevent lost login
    req.session.save((err) => {
      if (err) {
        console.error('[discordRouter] Error saving session after login:', err);
        return next(err);
      }
      res.redirect('/'); // Or wherever you want users to land after login
    });
  }
);

// Auth status route (for frontend polling)
router.get(
  '/status',
  validateAndRefreshSession,
  (req, res) => {
    console.info('[GET /status] Checking user authentication status.');

    if (!req.user) {
      console.warn('[GET /status]  req.user!');
      return res.json({ authenticated: false });
    }
    else{
      console.info(`[GET /status] User "${req.user.username}" found in session.`);
    }

    if (!req.isAuthenticated()) {
      console.info('[GET /status] User is not authenticated (req.isAuthenticated() === false).');
      return res.json({ authenticated: false });
    }
    else{
      console.info('[GET /status] User is authenticated (req.isAuthenticated() === true).');
        }

    console.info(`[GET /status] User "${req.user.username}" authenticated and authorized.`);

    return res.json({
      authenticated: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        avatar: req.user.avatar,
        guild: req.user.guild,
        hasRole: req.user.hasRole,
        devBypass: req.user.devBypass || false,
      },
    });
  }
);

// ----- Logout route (unified logout) -----
router.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) {
      console.error('[logout] Error in req.logout:', err);
      return next(err);
    }
    req.session.destroy((err) => {
      if (err) console.error('[logout] Session destroy error:', err);
      res.redirect('/');
    });
  });
});

export default router;
