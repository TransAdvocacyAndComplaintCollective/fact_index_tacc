import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { middleware as botMiddleware } from 'es6-crawler-detect';
import pinoHttp, { stdSerializers } from 'pino-http';

import pinologger from './logger/pino.ts';
import authRouter from './auth/authRouter.ts';
import apiRouter from './router/api.ts';
import staticRouter from './router/static/static.ts';
import { securityMiddleware } from './models/suspicious.ts';

// Extend Express Request type to include crawlerDetect
declare global {
  namespace Express {
    interface Request {
      crawlerDetect?: boolean;
    }
  }
}

console.log('[main.ts] Loading config and env');
const {
  PORT = '16261',
  NODE_ENV,
  BEHIND_PROXY,
  COOKIE_SECURE,
  SESSION_SECRET = 'change_me'
} = process.env;

console.log('[main.ts] Loaded env:', { PORT, NODE_ENV, BEHIND_PROXY, COOKIE_SECURE });
const portNumber = Number(PORT);
const isProd = NODE_ENV === 'production';
const behindProxy = BEHIND_PROXY === 'TRUE';
const cookieSecure = isProd && COOKIE_SECURE === 'TRUE';

console.log('[main.ts] portNumber:', portNumber);
console.log('[main.ts] isProd:', isProd);
console.log('[main.ts] behindProxy:', behindProxy);
console.log('[main.ts] cookieSecure:', cookieSecure);

const appLogger = pinologger.child({ component: 'main' });
appLogger.info({ port: portNumber, env: NODE_ENV, behindProxy, cookieSecure }, 'Initializing application');

const app = express();
console.log('[main.ts] Express app created');

app.use(pinoHttp({ logger: pinologger }));

console.log('[main.ts] Attached pino-http middleware');

appLogger.debug('Attached pino-http middleware with enriched request logging');

app.use((req, res, next) => {
  console.log('[main.ts] Incoming request', req.method, req.url, { query: req.query, body: req.body });
  req.log.trace({ query: req.query, body: req.body }, 'Request initial payload logged');
  next();
});

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn('[main.ts] Rate limit exceeded for IP:', req.ip);
    req.log.warn({ ip: req.ip }, 'Rate limit exceeded');
    res.status(429).send('Too many requests, please try again later.');
  }
}));
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
  console.log('[main.ts] User-Agent:', ua);
  req.log.info({ ua }, 'Captured User-Agent');
  if (req.crawlerDetect || /sqlmap|nikto|curl|nmap|hydra|arachni|masscan/i.test(ua)) {
    console.warn('[main.ts] Blocked suspicious User-Agent:', ua);
    req.log.warn({ crawler: req.crawlerDetect, ua }, 'Blocked suspicious User-Agent');
    return res.sendStatus(403);
  }
  req.log.trace('User-Agent passed');
  next();
});

app.use(session({
  name: 'session_id',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: cookieSecure, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 }
}));
console.log('[main.ts] Session middleware applied');
appLogger.info('Session middleware applied');

app.use(passport.initialize());
app.use(passport.session());
console.log('[main.ts] Passport initialized');
appLogger.info('Passport initialized');

app.use(securityMiddleware);
console.log('[main.ts] Custom security middleware applied');
appLogger.info('Custom security middleware applied');

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
  console.warn('[main.ts] 404 Not Found:', req.method, req.originalUrl);
  req.log.warn({ method: req.method, url: req.originalUrl }, '404 Not Found');
  res.status(404).send("Sorry, can't find that!");
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[main.ts] Unhandled error:', err);
  req.log.error({ err: err.message, stack: err.stack, url: req.originalUrl }, 'Unhandled error occurred');
  res.status(500).send('Internal Server Error');
});

app.listen(portNumber, '0.0.0.0', () => {
  console.log('[main.ts] Server started on port', portNumber, 'env:', NODE_ENV);
  appLogger.info({ port: portNumber, env: NODE_ENV }, 'Server started and listening');
});
