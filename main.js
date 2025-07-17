// app.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import helmet from 'helmet';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { middleware as botMiddleware } from 'es6-crawler-detect';

import authRouter from './auth/authRouter.js';
import apiRouter from './router/api.js';
import staticRouter from './router/static/static.mjs';
import { securityMiddleware } from './suspicious/suspicious.js';

const PORT = Number(process.env.PORT) || 16261;
const isProduction = process.env.NODE_ENV === 'production';
const BEHIND_PROXY = process.env.BEHIND_PROXY === 'TRUE';

// Set secure cookies only in production, otherwise allow insecure for localhost/dev
const COOKIE_SECURE = isProduction && process.env.COOKIE_SECURE === 'TRUE';

// --- Security Setup ---
const rateLimiter = new RateLimiterMemory({ points: 10, duration: 1 });
const BAD_UA_REGEX = /(sqlmap|nikto|acunetix|dirbuster|masscan|wpscan|nmap|hydra|arachni|python-requests|curl)/i;

const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: [
    "'self'", "https://cdn.discordapp.com/avatars/", 
    "data:"
  ],
  fontSrc: ["'self'", "https:", "data:"],
  connectSrc: ["'self'"],
  objectSrc: ["'none'"],
  upgradeInsecureRequests: [],
};

// --- Express Initialization ---
const app = express();
console.log(`[${new Date().toISOString()}] Express initialized`);

// --- Trust Proxy ---
app.set('trust proxy', BEHIND_PROXY);

// --- Helmet for Security Headers ---
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: { directives: cspDirectives },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    referrerPolicy: { policy: 'no-referrer' },
    hsts: { maxAge: 31_536_000, includeSubDomains: true },
    noSniff: true,
    frameguard: { action: 'deny' },
  })
);

// --- Request Logging (early to log all requests) ---
app.use((req, res, next) => {
  console.info(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// --- Rate Limiting Middleware ---
// app.use(async (req, res, next) => {
//   try {
//     await rateLimiter.consume(req.ip);
//     next();
//   } catch {
//     res.status(429).send('Too Many Requests');
//   }
// });

// --- Bot and Scanner Protection ---
app.use(botMiddleware());
app.use((req, res, next) => {
  const ua = req.get('User-Agent')?.trim() || '';
  if (req.crawlerDetect || !ua || BAD_UA_REGEX.test(ua)) {
    console.warn(`Forbidden: UA="${ua}", crawler=${req.crawlerDetect}`);
    return res.status(403).send('Forbidden');
  }
  next();
});

// app.use(securityMiddleware);

// --- CORS and Body Parsing ---
app.use(cors({
  // Configure CORS if needed, e.g., origin, credentials
  origin: true,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// --- Session Setup ---
// Important: cookie.secure must be false if testing on HTTP
app.use(
  session({
    name: 'session_id',
    secret: process.env.SESSION_SECRET || 'change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: COOKIE_SECURE, // secure cookies only in production with HTTPS
      sameSite: 'lax',       // 'lax' works better with OAuth flows (adjust if needed)
      maxAge: 24 * 60 * 60 * 1000, // 1 day, adjust as needed
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// --- Debugging Middleware (comment out in production) ---
app.use((req, res, next) => {
  console.log('Session ID:', req.sessionID);
  // console.log('Session object:', req.session);
  console.log('Cookies:', req.headers.cookie);
  next();
});

// --- Application Routes ---
app.use('/auth', authRouter);
app.use('/api', apiRouter);
app.use(staticRouter);

// --- 404 Handler ---
app.use((req, res) => {
  res.status(404).send("Sorry, can't find that!");
});

// --- Error Handler ---
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.originalUrl}`, err);
  res.status(500).send('Internal Server Error');
});

// --- Server Startup ---
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is listening on port ${PORT}`);
});
