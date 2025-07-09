// authRouter.js (ESM)
import express from 'express';
import passport from 'passport';
import { Strategy as CustomStrategy } from 'passport-custom';
import discordRouter from './discordRouter.js';
import { validateAndRefreshSession } from './passport-discord.js';

const DEV_LOGIN_MODE = process.env.DEV_LOGIN_MODE === 'TRUE' || process.env.NODE_ENV === 'development';

console.info(`🔒 [init] Auth router initialized – DEV_LOGIN_MODE=${DEV_LOGIN_MODE}`);

const router = express.Router();

// --------- Strategies ---------
passport.use(new LocalStrategy((username, password, done) => {
  if (
    username === (process.env.DEV_USERNAME || 'DevUser') &&
    password === (process.env.DEV_PASSWORD || 'devpass')
  ) {
    return done(null, {
      id: process.env.DEV_ID || 'dev-id',
      username,
      avatar: null,
      guild: process.env.DISCORD_GUILD_ID,
      hasRole: true,
      accessToken: 'fake-access-token',
      refreshToken: 'fake-refresh-token',
      expires: Date.now() + 3600 * 1000,
      devBypass: true,
    });
  }
  return done(null, false, { message: 'Invalid dev credentials' });
}));

if (DEV_LOGIN_MODE) {
  passport.use('dev', new CustomStrategy((req, done) => {
    return done(null, {
      id: process.env.DEV_ID || 'dev-id',
      username: process.env.DEV_USERNAME || 'DevUser',
      avatar: "fdsdf",
      guild: process.env.DISCORD_GUILD_ID,
      hasRole: true,
      accessToken: 'fake-access-token',
      refreshToken: 'fake-refresh-token',
      expires: Date.now() + 3600 * 1000,
      devBypass: true,
    });
  }));
}

// --------- Routers ---------
router.use('/discord', discordRouter);

// --------- /dev-login (GET, DEV_LOGIN_MODE only) ---------
router.get(
  '/dev-login',
  (req, res, next) => {
    if (!DEV_LOGIN_MODE) return res.status(403).send('🚫 dev-login not allowed in production.');
    next();
  },
  passport.authenticate('dev', {
    failureRedirect: '/login?error=dev-login-failed',
    failureMessage: true,
    session: true
  }),
  (req, res, next) => {
    req.session.save((err) => {
      if (err) return next(err);
      res.redirect(req.query.redirect || '/');
    });
  }
);

// --------- /status (GET) ---------
router.get('/status',
  validateAndRefreshSession,
  (req, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user || !req.user.hasRole) {
      return res.json({ discord: { authenticated: false } });
    }
    if (process.env.DISCORD_GUILD_ID && req.user.guild !== process.env.DISCORD_GUILD_ID) {
      return res.json({ discord: { authenticated: false } });
    }
    res.json({
      discord: {
        authenticated: true,
        user: {
          id: req.user.id,
          username: req.user.username,
          avatar: req.user.avatar,
          guild: req.user.guild,
          hasRole: req.user.hasRole,
          devBypass: req.user.devBypass || false,
        },
      }
    });
  }
);

// --------- /logout (GET) ---------
router.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy((err) => {
      if (err) return next(err);
      res.redirect('/');
    });
  });
});

export default router;
