import express from 'express';
import discordRouter from './discordRouter.js';
import { validateAndRefreshSession } from './passport-discord.js';
import passport from 'passport';

const DEV_MODE = process.env.DEV_MODE === 'TRUE' || process.env.NODE_ENV === 'development';
console.info(`🔒 Auth router started – DEV_MODE=${DEV_MODE}`);

const router = express.Router();

router.use('/discord', discordRouter);

// ----- Dev login (for local development) -----
router.get('/dev-login', (req, res, next) => {
  if (!DEV_MODE) {
    console.warn('Attempt to dev-login in non-dev mode');
    return res.status(403).send('🚫 dev-login not allowed in production.');
  }

  const redirectTo = req.query.redirect || '/';

  const user = {
    id: process.env.DEV_ID || 'dev-id',
    username: process.env.DEV_USERNAME || 'DevUser',
    avatar: null,
    guild: process.env.DISCORD_GUILD_ID,
    hasRole: true,
    accessToken: 'fake-access-token',
    refreshToken: 'fake-refresh-token',
    expires: Date.now() + 3600 * 1000,
    devBypass: true,
  };

  req.login(user, (err) => {
    if (err) {
      console.error('[dev-login] Passport login error:', err);
      return next(err);
    }
    req.session.save((err) => {
      if (err) {
        console.error('Error saving session after dev-login:', err);
        return next(err);
      }
      console.info('[dev-login] User session saved:', user);
      return res.redirect(redirectTo);
    });
  });
});

// ----- Auth status (shared by Discord & dev login) -----
router.get('/status', validateAndRefreshSession, (req, res) => {
  if (req.isAuthenticated() && req.user) {
    res.json({
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
    res.json({ authenticated: false });
  }
});

export default router;
