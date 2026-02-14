import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import passport from 'passport';
import logger from './logger.ts';
// wellknownRouter is imported after DB init to avoid importing auth modules early
import * as dbSchema from './db/schema.ts';
import { initializeCasbin, validateLoginRolesMiddleware } from './auth/casbin.ts';
import { registerFederationRoutes } from './federation/routes.ts';
import { registerOidcInteractions } from './oidc/interactions.ts';
import { createOidcProvider } from './oidc/provider.ts';
import { registerFederationAuthRoutes } from './auth/federation-auth.ts';
import { createOidcStorageTables } from './oidc/adapter.ts';
// authRouter and passport strategies are imported after DB init to avoid
// performing DB queries (token revocation checks) before the schema exists.

// Set up global error handlers FIRST
process.on('uncaughtException', (err) => {
  console.error('[serve] UNCAUGHT EXCEPTION');
  logger.error('[serve] Uncaught exception', { error: String(err), stack: err instanceof Error ? err.stack : 'no stack' });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[serve] UNHANDLED REJECTION');
  logger.error('[serve] Unhandled rejection', { reason: String(reason) });
});

// Feature flags
const ENABLE_FEDERATION = process.env.ENABLE_FEDERATION !== 'false';
const ENABLE_FEDERATION_PROVIDER = process.env.ENABLE_FEDERATION_PROVIDER !== 'false';
const ENABLE_FEDERATION_LOGIN = process.env.ENABLE_FEDERATION_LOGIN !== 'false';

// Log whether Discord env vars are present
logger.info('[serve] Discord env:', {
  DISCORD_CLIENT_ID: Boolean(process.env.DISCORD_CLIENT_ID),
  DISCORD_CLIENT_SECRET: Boolean(process.env.DISCORD_CLIENT_SECRET),
  DISCORD_CALLBACK_URL: Boolean(process.env.DISCORD_CALLBACK_URL),
  DEV_LOGIN_MODE: process.env.DEV_LOGIN_MODE,
});

// Log OpenID Federation status
logger.info('[serve] OpenID Federation:', {
  enabled: ENABLE_FEDERATION,
  provider: ENABLE_FEDERATION_PROVIDER,
  login: ENABLE_FEDERATION_LOGIN,
});
// staticRouter and apiRouter are imported lazily after schema creation
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let apiRouter: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let staticRouter: any = null;
const isDev = process.env.NODE_ENV === 'development';

const app = express();

// Configure CORS for cross-origin requests from the frontend
// In production, configure FRONTEND_URL environment variable for proper origins
function createCorsOptions(): cors.CorsOptions {
  if (process.env.NODE_ENV === 'production') {
    // In production, require explicit FRONTEND_URL configuration
    const frontendUrl = process.env.FRONTEND_URL;
    if (!frontendUrl) {
      logger.warn('[serve] FRONTEND_URL not configured in production - CORS will be restrictive');
      return { credentials: true }; // Reject all origins by default
    }
    return { origin: frontendUrl, credentials: true };
  }
  // In development, allow localhost and common dev ports
  const allowedOrigins = [
    'http://localhost',
    'http://localhost:4200',
    'http://localhost:4300',
    'http://localhost:5173', // Vite default
    'http://localhost:5174',
    'http://localhost:5332',
    'http://127.0.0.1',
    'http://127.0.0.1:4200',
    'http://127.0.0.1:4300',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:5332',
  ];
  return {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn(`[cors] Rejecting request from origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  };
}

// Enable CORS with credentials (cookies) support
const corsOptions = createCorsOptions();
app.use(cors(corsOptions));

// Add security headers middleware
app.use((req, res, next) => {
  // Prevent clickjacking attacks
  res.setHeader('X-Frame-Options', 'DENY');
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Enable XSS protection in older browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Strict Transport Security (only in production)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Parse incoming JSON/URL-encoded payloads so POST routes can access req.body.
// Set reasonable size limits to prevent DoS attacks
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Parse cookies from the Cookie header
app.use(cookieParser());

// Add session middleware for OIDC interactions
// This keeps track of login state during the OAuth flow
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

// Log that the router module was initialized
logger.info('[serve] Express router initialized');

// Passport initialization for JWT strategy (stateless authentication)
app.use(passport.initialize());
// Note: No session middleware or passport.session() - we use JWT tokens instead

// Validate user maintains required login roles (logs them out if they lose required roles)
app.use(validateLoginRolesMiddleware);

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
    await dbSchema.createSchema(dbSchema.getDb());
    console.log('[serve] Schema ready');

    // Create OIDC storage tables  
    console.log('[serve] Creating OIDC storage tables...');
    await createOidcStorageTables(dbSchema.getDb());
    console.log('[serve] OIDC storage tables ready');

    // Initialize casbin authorization engine
    console.log('[serve] Initializing casbin authorization...');
    await initializeCasbin();
    console.log('[serve] Casbin authorization ready');

    // Register OpenID Federation routes (/.well-known/openid-federation)
    // Pass both app and a reference to the OIDC provider (will be null if federation disabled)
    let oidcProvider = null;

    if (ENABLE_FEDERATION) {
      console.log('[serve] Registering OpenID Federation routes...');
      registerFederationRoutes(app);
      console.log('[serve] OpenID Federation routes registered');
    }

    if (ENABLE_FEDERATION_PROVIDER) {
      // Create and mount OIDC Provider
      const issuer = process.env.FEDERATION_ENTITY_ID || 'https://fact.example.com';
      const baseUrl = process.env.OIDC_BASE_URL || issuer;
      console.log('[serve] Creating OIDC Provider...');
      oidcProvider = await createOidcProvider({
        issuer,
        baseUrl,
      });
      console.log('[serve] OIDC Provider created');

      // Mount OIDC provider (handles /oidc/* endpoints)
      console.log('[serve] Mounting OIDC provider...');
      
      // Add debug middleware to log requests to /oidc
      app.use('/oidc', (req, res, next) => {
        console.log(`[oidc-debug] Incoming request: ${req.method} ${req.path} - URL: ${req.originalUrl}`);
        next();
      });
      
      const oidcCallback = oidcProvider.callback();
      console.log('[serve] OIDC callback middleware created');
      app.use('/oidc', oidcCallback);
      console.log('[serve] OIDC provider mounted');
    }

    if (ENABLE_FEDERATION_LOGIN && oidcProvider) {
      // Register OIDC interaction routes (login, consent, discord callback)
      console.log('[serve] Registering OIDC interaction routes...');
      registerOidcInteractions(app, oidcProvider);
      console.log('[serve] OIDC interaction routes registered');

      // Register federation authentication routes (BFF pattern)
      try {
        console.log('[serve] Registering federation auth routes...');
        registerFederationAuthRoutes(app);
        console.log('[serve] Federation auth routes registered');
      } catch (err) {
        console.error('[serve] Failed to register federation auth routes:', err);
      }
    } else if (ENABLE_FEDERATION_LOGIN && !oidcProvider) {
      console.warn('[serve] OIDC login requested but OIDC Provider not enabled - skipping login routes');
    }

    if (!ENABLE_FEDERATION && !ENABLE_FEDERATION_PROVIDER && !ENABLE_FEDERATION_LOGIN) {
      console.log('[serve] OpenID Federation features disabled');
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
    console.error('[serve] Failed to start server');
    logger.error('[serve] Failed to start server', { message: errorMessage, stack: errorStack });
    process.exit(1);
  }
})();
