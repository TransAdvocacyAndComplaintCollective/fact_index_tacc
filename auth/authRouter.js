// ./auth/authRouter.js
import express from 'express';
import discordRouter from './discordRouter.js';
import { validateAndRefreshSession as discordValidate } from './passport-discord.js';
import { Strategy as DiscordStrategy } from 'passport-discord';
import passport from 'passport';

const DEV_MODE = process.env.DEV_MODE === 'TRUE' || process.env.NODE_ENV === 'development';
const router = express.Router();

console.info('🔒 Running in production mode.');
// Mount Discord-specific auth routes at /auth/discord/*
router.use('/discord', discordRouter);

// Universal status route for the frontend
router.get('/status', discordValidate, (req, res) => {
  // req.authStatus is set by validateAndRefreshSession, but fallback to unauthenticated if not present
  res.json({
    discord: req.authStatus ?? { authenticated: false },
    // In the future, you can add other providers here: bluesky: ..., facebook: ...
  });
});


export default router;
