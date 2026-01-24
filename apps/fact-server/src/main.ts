import 'dotenv/config';
import express from 'express';
import passport from 'passport';
import logger from './logger.ts';
import authRouter from './router/auth/auth.ts';
// Ensure passport strategies are registered at startup
import './auth/passport-discord.ts';

// Set up global error handlers FIRST
process.on('uncaughtException', (err) => {
  console.error('[serve] UNCAUGHT EXCEPTION:', err);
  logger.error('[serve] Uncaught exception', { error: String(err), stack: err instanceof Error ? err.stack : 'no stack' });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[serve] UNHANDLED REJECTION:', reason);
  logger.error('[serve] Unhandled rejection', { reason: String(reason), promise: String(promise) });
});

// Log whether Discord env vars are present
logger.info('[serve] Discord env:', {
  DISCORD_CLIENT_ID: Boolean(process.env.DISCORD_CLIENT_ID),
  DISCORD_CLIENT_SECRET: Boolean(process.env.DISCORD_CLIENT_SECRET),
  DISCORD_CALLBACK_URL: Boolean(process.env.DISCORD_CALLBACK_URL),
  DEV_LOGIN_MODE: process.env.DEV_LOGIN_MODE,
});
// staticRouter and apiRouter are imported lazily after schema creation
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let apiRouter: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let staticRouter: any = null;
import { createSchema, initializeDb } from './db/schema.ts';
const isDev = process.env.NODE_ENV === 'development';

const app = express();

// Log that the router module was initialized
logger.info('[serve] Express router initialized');

// Mount auth router early so /auth/* endpoints are available before static/Vite handling
// Passport initialization for JWT strategy (stateless authentication)
app.use(passport.initialize());
// Note: No session middleware or passport.session() - we use JWT tokens instead

app.use(authRouter);



// open port from environment or default to 3000
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;


// Start the server without waiting for DB - initialize DB in background
(async () => {
  try {
    console.log('[serve] Starting initialization...');

    // Dynamically import routers now
    console.log('[serve] Importing API router...');
    apiRouter = (await import('./router/api.ts')).default;
    console.log('[serve] API router imported');
    
    console.log('[serve] Importing static router...');
    staticRouter = (await import('./router/static/static.ts')).default;
    console.log('[serve] Static router imported');

    // Mount routers (authRouter already mounted earlier)
    app.use('/api', apiRouter);
    app.use(staticRouter);

    app.listen(PORT, () => {
      logger.info(`[serve] Fact Index server listening on port ${PORT} - mode: ${isDev ? 'development' : 'production'}`);
      
      // Initialize database in background after server is listening
      console.log('[serve] Initializing database in background...');
      initializeDb()
        .then(async () => {
          console.log('[serve] Database initialized, creating schema...');
          const { getDb } = await import('./db/schema.ts');
          await createSchema(getDb());
          console.log('[serve] Database schema ready');
        })
        .catch((err) => {
          console.error('[serve] Failed to initialize database:', err);
          logger.error('[serve] Database initialization failed', { error: String(err) });
        });
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : '';
    console.error('[serve] CAUGHT ERROR - Full error object:', JSON.stringify(err, null, 2));
    console.error('[serve] Error type:', typeof err);
    console.error('[serve] Error constructor:', err?.constructor?.name);
    logger.error('[serve] Failed to start server: ' + errorMessage, { stack: errorStack, fullError: String(err) });
    console.error('[serve] Full error object:', err);
    process.exit(1);
  }
})();
