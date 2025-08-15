import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import passport from 'passport';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { middleware as botMiddleware } from 'es6-crawler-detect';
import pinoHttp, { stdSerializers } from 'pino-http';

import pinologger from './logger/pino.js';
import authRouter from './auth/authRouter.js';
import apiRouter from './router/api.js';
import staticRouter from './router/static/static.js';
// import { initializeDatabase } from './db/db.js';

// Extend Express Request type to include crawlerDetect
declare global {
  namespace Express {
    interface Request {
      crawlerDetect?: boolean;
    }
  }
}

const appLogger = pinologger.child({ component: 'main' });
appLogger.info('[main.ts] Loading config and env');
const {
  PORT = '16261',
  NODE_ENV,
  BEHIND_PROXY,
  COOKIE_SECURE,
  SESSION_SECRET = 'change_me'
} = process.env;

// await initializeDatabase();
appLogger.info({ PORT, NODE_ENV, BEHIND_PROXY, COOKIE_SECURE }, '[main.ts] Loaded env:');
const portNumber = Number(PORT);
const isProd = NODE_ENV === 'production';
const behindProxy = BEHIND_PROXY === 'TRUE';
const cookieSecure = isProd && COOKIE_SECURE === 'TRUE';

appLogger.info({ portNumber }, '[main.ts] portNumber');
appLogger.info({ isProd }, '[main.ts] isProd');
appLogger.info({ behindProxy }, '[main.ts] behindProxy');
appLogger.info({ cookieSecure }, '[main.ts] cookieSecure');

appLogger.info({ port: portNumber, env: NODE_ENV, behindProxy, cookieSecure }, 'Initializing application');

const app = express();
appLogger.info('[main.ts] Express app created');

// app.use(pinoHttp({ logger: pinologger }));

appLogger.info('[main.ts] Attached pino-http middleware');

appLogger.debug('Attached pino-http middleware with enriched request logging');

app.use((req, res, next) => {
  // console.log('[main.ts] Incoming request', req.method, req.url, { query: req.query, body: req.body });
  // appLogger.trace({ query: req.query, body: req.body }, 'Request initial payload logged');
  next();
});


// app.use(rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 100,
//   standardHeaders: true,
//   legacyHeaders: false,
//   handler: (req, res) => {
//     pinologger.warn({ ip: req.ip }, '[main.ts] Rate limit exceeded for IP');
//     res.status(429).send('Too many requests, please try again later.');
//   }
// }));
appLogger.info('Configured rate limiting middleware');

app.disable('x-powered-by');
appLogger.info('Disabled x-powered-by header');

app.set('trust proxy', behindProxy);
console.log('[main.ts] trust proxy set:', behindProxy);
appLogger.info({ behindProxy }, 'Configured trust proxy');

app.use(helmet());
console.log('[main.ts] Helmet applied');
appLogger.info('Applied Helmet security middleware');

app.use(cors({ origin: true, credentials: true }));
console.log('[main.ts] CORS applied');
appLogger.info('Applied CORS policy');

app.use(express.json({ limit: '2mb' }));
console.log('[main.ts] JSON body parser applied');
appLogger.info('JSON parser configured');

app.use(express.urlencoded({ extended: false, limit: '2mb' }));
console.log('[main.ts] URL-encoded parser applied');
appLogger.info('URL-encoded parser configured');

app.use(botMiddleware());
console.log('[main.ts] Bot detection middleware applied');
appLogger.info('Bot detection middleware applied');

app.use((req, res, next) => {
  const ua = req.get('User-Agent') || '';
  appLogger.info({ ua }, '[main.ts] User-Agent');
  // appLogger.info({ ua }, 'Captured User-Agent');
  if (req.crawlerDetect || /sqlmap|nikto|curl|nmap|hydra|arachni|masscan/i.test(ua)) {
      pinologger.warn({ ua }, '[main.ts] Blocked suspicious User-Agent');
      return res.sendStatus(403);
  }
  // appLogger.trace('User-Agent passed');
  next();
});

// app.use(session({
//   name: 'session_id',
//   secret: SESSION_SECRET,
//   resave: false,
//   saveUninitialized: false,
//   cookie: { httpOnly: true, secure: cookieSecure, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 }
// }));
console.log('[main.ts] Session middleware applied');
appLogger.info('Session middleware applied');

app.use(passport.initialize());
// app.use(passport.session());
console.log('[main.ts] Passport initialized');
appLogger.info('Passport initialized');

app.use('/auth', authRouter);
console.log('[main.ts] Mounted authRouter at /auth');
appLogger.info('Mounted authRouter at /auth');

app.use('/api', apiRouter);
console.log('[main.ts] Mounted apiRouter at /api');
appLogger.info('Mounted apiRouter at /api');

app.use(staticRouter);
console.log('[main.ts] Mounted static assets router');
appLogger.info('Mounted static assets router');

app.use((req, res) => {
  appLogger.warn({ method: req.method, url: req.originalUrl }, '[main.ts] 404 Not Found');
  res.status(404).send("Sorry, can't find that!");
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[main.ts] Unhandled error:', err);
  appLogger.error({ err: err.message, stack: err.stack, url: req.originalUrl }, 'Unhandled error occurred');
  res.status(500).send('Internal Server Error');
});

app.listen(portNumber, '0.0.0.0', () => {
  appLogger.info({ port: portNumber, env: NODE_ENV }, 'Server started and listening');
});
