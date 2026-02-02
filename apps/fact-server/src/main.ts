import 'dotenv/config';
import express from 'express';
import passport from 'passport';
import logger from './logger.ts';
// wellknownRouter is imported after DB init to avoid importing auth modules early
import * as dbSchema from './db/schema.ts';
// authRouter and passport strategies are imported after DB init to avoid
// performing DB queries (token revocation checks) before the schema exists.

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
const isDev = process.env.NODE_ENV === 'development';

const app = express();

// Parse incoming JSON/URL-encoded payloads so POST routes can access req.body.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log that the router module was initialized
logger.info('[serve] Express router initialized');

// Passport initialization for JWT strategy (stateless authentication)
app.use(passport.initialize());
// Note: No session middleware or passport.session() - we use JWT tokens instead

// well-known endpoints (JWKS, discovery, etc.) mounted after DB init



// open port from environment or default to 3000
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;


// Start the server after DB initialization + schema creation
(async () => {
  try {
    console.log('[serve] Starting initialization...');

    console.log('[serve] Initializing database...');
    await dbSchema.initializeDb();
    console.log('[serve] Database connection ready, ensuring schema...');
    
    // Only create schema if database is available (check by trying to get db instance)
    try {
      const db = dbSchema.getDb();
      if (db) {
        await dbSchema.createSchema(db);
        console.log('[serve] Schema ready');
      }
    } catch (dbErr) {
      // In dev mode, database may not be available due to missing better-sqlite3 bindings
      // This is okay - the server can still run and serve the frontend
      if (isDev) {
        console.warn('[serve] Database not available in development mode, continuing without DB');
      } else {
        throw dbErr;
      }
    }

    // Now that DB and schema are ready, register passport strategies and mount auth routes
    console.log('[serve] Registering passport strategies and auth routes...');
    await import('./auth/passport-discord.ts');
    // import auth router and mount it
    const { default: authRouter } = await import('./router/auth/auth.ts');
    app.use(authRouter);
    console.log('[serve] Auth routes registered');

    // Mount well-known endpoints (JWKS, discovery, etc.) after JWKS initialization
    const { default: wellknown } = await import('./router/wellknown.ts');
    app.use("/.well-known", wellknown);
    console.log('[serve] Well-known routes registered');

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
