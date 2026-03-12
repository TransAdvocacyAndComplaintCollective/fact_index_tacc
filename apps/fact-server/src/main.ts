import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import passport from 'passport';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import logger from './logger.ts';
import { sessionCookieOptions } from './config/securityConfig.ts';
import { globalErrorHandler } from './utils/errorHandler.ts';
import { requestContextMiddleware } from './middleware/requestContext.ts';
import * as dbSchema from './db/schema.ts';
import { initializeCasbin, validateLoginRolesMiddleware } from './auth/casbin.ts';
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

// Log whether Discord env vars are present
logger.info('[serve] Discord env:', {
  DISCORD_CLIENT_ID: Boolean(process.env.DISCORD_CLIENT_ID),
  DISCORD_CLIENT_SECRET: Boolean(process.env.DISCORD_CLIENT_SECRET),
  DISCORD_CALLBACK_URL: Boolean(process.env.DISCORD_CALLBACK_URL),
  DEV_LOGIN_MODE: process.env.DEV_LOGIN_MODE,
});

function configureOutboundProxy() {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy ||
    "";
  if (!proxyUrl) return;
  try {
    setGlobalDispatcher(new ProxyAgent(String(proxyUrl)));
    logger.info("[serve] Outbound proxy enabled for Node fetch", { proxy: String(proxyUrl).replace(/:\/\/.*@/, "://***@") });
  } catch (err) {
    logger.warn("[serve] Failed to configure outbound proxy", { error: err instanceof Error ? err.message : String(err) });
  }
}

configureOutboundProxy();

// staticRouter and apiRouter are imported lazily after schema creation
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let apiRouter: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let staticRouter: any = null;
const isDev = process.env.NODE_ENV === 'development';

const app = express();

// If running behind a reverse proxy (common in production), this enables correct `req.secure`
// and supports `cookie.secure = "auto"` for session cookies.
if (process.env.NODE_ENV === 'production') {
  const trustProxy = String(process.env.TRUST_PROXY || '1').trim();
  app.set('trust proxy', trustProxy === 'true' ? 1 : Number.isFinite(Number(trustProxy)) ? Number(trustProxy) : 1);
}

const SESSION_SECRET_RAW = process.env.SESSION_SECRET || '';
const DEFAULT_DEV_SESSION_SECRET = 'dev-secret-change-in-production';
if (process.env.NODE_ENV === 'production') {
  const usingDefault = !SESSION_SECRET_RAW || SESSION_SECRET_RAW === DEFAULT_DEV_SESSION_SECRET;
  if (usingDefault || SESSION_SECRET_RAW.length < 32) {
    throw new Error(
      'SECURITY: SESSION_SECRET must be set to a strong random value (>= 32 chars) in production.',
    );
  }
}
const SESSION_SECRET = SESSION_SECRET_RAW || DEFAULT_DEV_SESSION_SECRET;

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

// Add request context middleware FIRST (before all other middleware)
// Assigns unique ID to each request for correlation across logs
// Tracks request duration and logs completion
app.use(requestContextMiddleware);

app.use(cors(corsOptions));

// Add comprehensive security headers middleware (OWASP recommendations)
app.use((req, res, next) => {
  // Prevent clickjacking attacks
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection in older browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Content Security Policy - restrict sources to same-origin, prevent inline scripts
  // Allows: same-origin resources only, no unsafe inline scripts/styles
  const cspHeader = process.env.NODE_ENV === 'production'
    ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:"
    : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: http: https:; font-src 'self' data:; connect-src 'self' http: https: ws: wss:";
  res.setHeader('Content-Security-Policy', cspHeader);
  
  // Prevent embedding in cross-domain contexts
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  
  // Control referrer header to prevent information leakage
  res.setHeader('Referrer-Policy', 'strict-no-referrer');
  
  // Restrict browser features (geolocation, camera, microphone, etc.)
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()');
  
  // Strict Transport Security - HTTPS only, with preload for production
  if (process.env.NODE_ENV === 'production') {
    // max-age: 1 year, includeSubDomains: apply to subdomains, preload: allow HSTS preload
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  // Dev: Skip HSTS in development to allow HTTP-only testing
  
  next();
});

// Parse incoming JSON/URL-encoded payloads so POST routes can access req.body.
// Set reasonable size limits to prevent DoS attacks
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Parse cookies from the Cookie header
app.use(cookieParser());

// Add session middleware for OAuth state (e.g., login redirects)
// Uses centralized security configuration for consistent cookie handling
const sessionCookieSecureRaw = String(process.env.SESSION_COOKIE_SECURE || '').trim().toLowerCase();
const sessionCookieSecure: boolean | 'auto' =
  isDev
    ? false
    : sessionCookieSecureRaw === 'true'
      ? true
      : sessionCookieSecureRaw === 'false'
        ? false
        : 'auto';

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { ...sessionCookieOptions, secure: sessionCookieSecure } as any,
}));

// Log that the router module was initialized
logger.info('[serve] Express router initialized');

// Passport initialization for JWT strategy (stateless authentication)
app.use(passport.initialize());
// Note: No session middleware or passport.session() - we use JWT tokens instead

// Validate user maintains required login roles (logs them out if they lose required roles)
app.use(validateLoginRolesMiddleware);

// open port from environment or default to 3000
import { parseEnvInt } from './utils/parsing.ts';
const PORT = parseEnvInt('PORT', 3000, 1);


// Start the server after DB initialization + schema creation
(async () => {
  try {
    console.log('[serve] Starting initialization...');

    console.log('[serve] Initializing database...');
    await dbSchema.initializeDb();
    console.log('[serve] Database connection ready, ensuring schema...');
    await dbSchema.createSchema(dbSchema.getDb());
    console.log('[serve] Schema ready');

    // Initialize casbin authorization engine
    console.log('[serve] Initializing casbin authorization...');
    await initializeCasbin();
    console.log('[serve] Casbin authorization ready');

    // Now that DB and schema are ready, register passport strategies and mount auth routes
    console.log('[serve] Registering passport strategies and auth routes...');
    await import('./auth/passport-discord.ts');
    // import auth router and mount it
    const { default: authRouter } = await import('./router/auth.ts');
    app.use(authRouter);
    console.log('[serve] Auth routes registered');

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

    // Global error handler middleware (must be last)
    // Ensures all errors are logged and responded to consistently
    app.use(globalErrorHandler);

    const server = app.listen(PORT, () => {
      logger.info(`[serve] Fact Index server listening on port ${PORT} - mode: ${isDev ? 'development' : 'production'}`);
    });
    // Handles SIGTERM and SIGINT to shut down gracefully
    // Gives the server 10 seconds to close connections before forced exit
    const gracefulShutdown = (signal: string) => {
      return async () => {
        logger.info(`[serve] ${signal} received, starting graceful shutdown...`);
        
        // Stop accepting new connections
        server.close(async () => {
          logger.info('[serve] HTTP server stopped accepting new connections');
          
          try {
            // Close database connection
            const db = dbSchema.getDb();
            if (db) {
              logger.info('[serve] Closing database connection...');
              await db.destroy();
              logger.info('[serve] Database connection closed');
            }
            
            logger.info('[serve] Graceful shutdown complete, exiting');
            process.exit(0);
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            logger.error('[serve] Error during graceful shutdown', { error: errorMessage });
            process.exit(1);
          }
        });
        
        // Force shutdown after 10 seconds if graceful shutdown hasn't completed
        // This prevents hanging processes during deployments
        setTimeout(() => {
          logger.error('[serve] Graceful shutdown timeout (10s) exceeded, forcing exit');
          process.exit(1);
        }, 10000);
      };
    };

    // Register shutdown handlers for common termination signals
    process.on('SIGTERM', gracefulShutdown('SIGTERM'));
    process.on('SIGINT', gracefulShutdown('SIGINT'));
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : '';
    console.error('[serve] Failed to start server');
    logger.error('[serve] Failed to start server', { message: errorMessage, stack: errorStack });
    process.exit(1);
  }
})();
