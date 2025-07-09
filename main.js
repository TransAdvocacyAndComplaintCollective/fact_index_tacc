// ----------------- ENVIRONMENT SETUP ----------------- //
// ESM can't use require('dotenv') or require('fs'), so we must use dynamic imports for early .env loading

import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let dotenvLoaded = false;

if (fs.existsSync('.env_tacc')) {
  await import('dotenv').then(dotenv => dotenv.config({ path: '.env_tacc' }));
  console.log('Loaded .env_tacc');
  dotenvLoaded = true;
} else if (fs.existsSync('.env')) {
  await import('dotenv').then(dotenv => dotenv.config({ path: '.env' }));
  console.log('Loaded .env');
  dotenvLoaded = true;
} else {
  console.warn('No .env_tacc or .env file found!');
}

// ----------------- IMPORTS ----------------- //

import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import helmet from 'helmet';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { middleware as botMiddleware } from 'es6-crawler-detect';

import auth from './auth/authRouter.js';
import api from './router/api.js';
import staticRouter from './router/static/static.mjs';
import health from './router/sys_health/health.js';
import { securityMiddleware } from './suspicious/suspicious.js';

// ----------------- CONFIGURATION ----------------- //
const PORT = Number(process.env.PORT || 16261);


const PORT_SSH_FWD = PORT + 1;

const BAD_UA_REGEX = /(sqlmap|nikto|acunetix|dirbuster|masscan|wpscan|nmap|hydra|arachni|python-requests|curl)/i;

// Rate limiter config (10 requests per second per IP)
const rateLimiter = new RateLimiterMemory({ points: 10, duration: 1 });

// --------------- INITIALIZE APP ------------------ //
const app = express();
console.log(`[${new Date().toISOString()}] [main.js] Express app initialized`);

// --------------- HEADER SETUP -------------------- //
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self'");
  next();
});

// --------------- MIDDLEWARE SETUP ---------------- //
// Rate limiting
app.use(async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip);
    next();
  } catch {
    res.status(429).send('Too Many Requests');
  }
});
app.use(botMiddleware());
// Block bad UAs
app.use((req, res, next) => {
  const ua = req.get('User-Agent') || '';
  const scanner = req.crawlerDetect;
  const manualScan = BAD_UA_REGEX.test(ua);
  if (scanner || manualScan || ua.trim() === '') {
    console.warn(`[${new Date().toISOString()}] Blocked automated access: UA="${ua}" scanner=${scanner}`);
    return res.status(403).send('Forbidden');
  }
  next();
});

// Custom security checks
app.use(securityMiddleware);

// Security headers
app.use(helmet({ crossOriginResourcePolicy: false }));

// CORS and body parsing
app.use(cors());
app.use(bodyParser.json());

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  }
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Request logging
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

startServer(PORT, 'public');

export default app;
