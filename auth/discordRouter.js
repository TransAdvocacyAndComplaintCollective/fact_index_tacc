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
    // You can add more debug info here if needed
    if (
      req.isAuthenticated() &&
      req.user &&
      req.user.hasRole &&
      req.user.guild === process.env.DISCORD_GUILD_ID
    ) {
      return res.json({
        authenticated: true,
        user: {
          id: req.user.id,
          username: req.user.username,
          avatar: req.user.avatar,
          guild: req.user.guild,
          hasRole: req.user.hasRole,
        },
      });
    } else {
      return res.json({ authenticated: false });
    }
  }
);

// Logout route: Ends session safely
router.get('/logout', (req, res, next) => {
  // passport 0.6+: logout can be async
  req.logout(function(err) {
    if (err) {
      console.error('[discordRouter] Error in req.logout:', err);
      return next(err);
    }
    req.session.destroy((err) => {
      if (err) {
        console.error('[discordRouter] Error destroying session:', err);
        // Optionally, just redirect anyway
      }
      res.redirect('/');
    });
  });
});

export default router;
