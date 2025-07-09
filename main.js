// main.js
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import helmet from 'helmet';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { middleware as botMiddleware } from 'es6-crawler-detect';
// Routers (ESM only)
import auth from './auth/authRouter.js';
import api from './router/api.js';
import staticRouter from './router/static/static.mjs';
import health from './router/sys_health/health.js';
import { securityMiddleware } from './suspicious/suspicious.js';

// ----------------- ENVIRONMENT SETUP ----------------- //
// Load environment variables from .env_tacc or .env
// This allows for different configurations in different environments
// .env_tacc is for TACC-specific settings, .env is for development!
const dotenv = require('dotenv');
const fs = require('fs');

if (fs.existsSync('.env_tacc')) {
  dotenv.config({ path: '.env_tacc' });
  console.log('Loaded .env_tacc');
} else if (fs.existsSync('.env')) {
  dotenv.config({ path: '.env' });
  console.log('Loaded .env');
} else {
  console.warn('No .env_tacc or .env file found!');
}



// ----------------- CONFIGURATION ----------------- //
const PORT = Number(process.env.PORT || 16261);
const PORT_SSH_FWD = PORT + 1;

// Suspicious UA regex
const BAD_UA_REGEX = /(sqlmap|nikto|acunetix|dirbuster|masscan|wpscan|nmap|hydra|arachni|python-requests|curl)/i;

// Rate limiter config (10 requests per second per IP, tweak as needed)
const rateLimiter = new RateLimiterMemory({ points: 10, duration: 1 });

// --------------- INITIALIZE APP ------------------ //
const app = express();
console.log(`[${new Date().toISOString()}] [main.js] Express app initialized`);


// let set the header 
app.use((req, res, next) => {
  // X-Content-Type-Options
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Subresource Integrity to limit to this domain only
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self'");
  next();
});



// --------------- MIDDLEWARE SETUP ---------------- //
// Rate limiting - blocks abusive IPs early
app.use(async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip);
    next();
  } catch {
    res.status(429).send('Too Many Requests');
  }
});
app.use(botMiddleware());
// Bot/scanner detection - blocks by User-Agent
app.use((req, res, next) => {
  // Now req.crawlerDetect is set (true/false)
  const ua = req.get('User-Agent') || '';
  const scanner = req.crawlerDetect;
  const manualScan = BAD_UA_REGEX.test(ua);
  if (scanner || manualScan || ua.trim() === '') {
    console.warn(`[${new Date().toISOString()}] Blocked automated access: UA="${ua}" scanner=${scanner}`);
    return res.status(403).send('Forbidden');
  }
  next();
});

// Custom security checks (ensure it's robust and safe to run before other handlers)
app.use(securityMiddleware);

// Security headers
app.use(helmet({ crossOriginResourcePolicy: false }));

// CORS and body parsing
app.use(cors());
app.use(bodyParser.json());

// Session (secure: should be true if HTTPS is enabled)
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production', // secure in prod only
  }
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Simple request logging
app.use((req, res, next) => {
  console.info(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ------------------ ROUTES ---------------------- //
console.log(`[${new Date().toISOString()}] [main.js] Loading routes...`);
app.use('/auth', auth);
app.use('/api/', api);
app.use(staticRouter);
app.use(health);

// ------------------ SERVER ---------------------- //
function startServer(port, label) {
  app.listen(port, '0.0.0.0', err => {
    if (err) {
      console.error(`❌ [main.js] Error in app.listen on ${label}:`, err);
    } else {
      console.log(`✅ [main.js] Fabs Fact DB server running on ${label} port ${port}`);
    }
  });
}

// Only call .listen() once per app instance; in practice, two separate listeners are rare.
// If you really need two ports, use two app instances, but usually only one is needed.
// Here we just demonstrate both.
startServer(PORT, 'public');
startServer(PORT_SSH_FWD, 'local/SSH-forwarded');

export default app;
