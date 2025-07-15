import 'dotenv/config';
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
import { securityMiddleware } from './suspicious/suspicious.js';

const PORT = Number(process.env.PORT || 16261);
const BAD_UA_REGEX = /(sqlmap|nikto|acunetix|dirbuster|masscan|wpscan|nmap|hydra|arachni|python-requests|curl)/i;
const rateLimiter = new RateLimiterMemory({ points: 10, duration: 1 });

const app = express();
console.log(`[${new Date().toISOString()}] Express initialized`);

// Disable fingerprinting
app.disable('x-powered-by');

// Security middleware (CSP, headers, etc.)
const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'https://cdn.discordapp.com', 'data:'],
  fontSrc: ["'self'", 'https:', 'data:'],
  connectSrc: ["'self'"],
  objectSrc: ["'none'"],
  upgradeInsecureRequests: [],
};
app.use(
  helmet({
    crossOriginEmbedderPolicy: false, // avoid blocked external images :contentReference[oaicite:11]{index=11}
    crossOriginResourcePolicy: false,
  })
);
app.use(helmet.contentSecurityPolicy({ directives: cspDirectives }));
app.use(helmet.referrerPolicy({ policy: 'no-referrer' }));
app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }));
app.use(helmet.noSniff());
app.use(helmet.frameguard({ action: 'deny' }));

// Rate Limiting + Bot Detection
app.use(async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip);
    next();
  } catch {
    res.status(429).send('Too Many Requests');
  }
});
app.use(botMiddleware());
app.use((req, res, next) => {
  const ua = req.get('User-Agent') || '';
  if (req.crawlerDetect || BAD_UA_REGEX.test(ua) || !ua.trim()) {
    console.warn(`Blocked UA="${ua}" scanner=${req.crawlerDetect}`);
    return res.status(403).send('Forbidden');
  }
  next();
});
app.use(securityMiddleware);

// CORS and parsing
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session + Passport
app.use(
  session({
    name: 'session_id',
    secret: process.env.SESSION_SECRET || 'change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());

// Request Logging
app.use((req, res, next) => {
  console.info(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Routes
app.use('/auth', auth);
app.use('/api', api);
app.use(staticRouter);

// 404 Handler
app.use((req, res) => {
  res.status(404).send("Sorry, can't find that!");
});

// Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Internal Server Error');
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
