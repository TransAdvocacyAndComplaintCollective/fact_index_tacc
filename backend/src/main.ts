
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { middleware as botMiddleware } from 'es6-crawler-detect';
import pinoHttp from 'pino-http';

import pinologger from './logger/pino.ts';
import authRouter from './auth/authRouter.ts';
import apiRouter from './router/api.ts';
import staticRouter from './router/static/static.ts';
import { securityMiddleware } from './models/suspicious.ts';

const { PORT = '16261', NODE_ENV, BEHIND_PROXY, COOKIE_SECURE, SESSION_SECRET = 'change_me' } = process.env;
const portNumber = Number(PORT);
const isProd = NODE_ENV === 'production';
const behindProxy = BEHIND_PROXY === 'TRUE';
const cookieSecure = isProd && COOKIE_SECURE === 'TRUE';

 pinologger.child({ component: 'main' });
const app = express();

pinologger.info(`Configuration: PORT=${PORT}, NODE_ENV=${NODE_ENV}, behindProxy=${behindProxy}, cookieSecure=${cookieSecure}`);

app.use((req, res, next) => {
  pinologger.info(`Received ${req.method} request for ${req.url}`);
  pinologger.debug({ method: req.method, url: req.url }, 'Incoming request');
  next();
});


app.use(pinoHttp({
  logger: pinologger as any,
  autoLogging: true,
}));
// app.use(slowDown({
//   windowMs: 15 * 60 * 1000,
//   delayAfter: 50,
//   delayMs: 200,
//   onLimitReached: (req) => {
//     pinologger.info(`Slowdown limit reached for IP: ${req.ip}`);
//     req.log.warn({ ip: req.ip }, 'Slowdown limit reached');
//   },
// }));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    pinologger.info(`Rate limit exceeded for IP: ${req.ip}`);
    req.log.warn({ ip: req.ip }, 'Too many requests');
    res.status(429).send('Too many requests, please try again later.');
  },
}));

app.disable('x-powered-by');
pinologger.info('Disabled x-powered-by header');
app.set('trust proxy', behindProxy);
pinologger.info(`Set trust proxy to ${behindProxy}`);
app.use(helmet());
pinologger.info('Applied Helmet security headers');
app.use(cors({ origin: true, credentials: true }));
pinologger.info('Applied CORS middleware');
app.use(express.json({ limit: '2mb' }));
pinologger.info('Configured JSON body parser');
app.use(express.urlencoded({ extended: false, limit: '2mb' }));
pinologger.info('Configured URL-encoded body parser');

app.use(botMiddleware());
pinologger.info('Applied bot detection middleware');
app.use((req, res, next) => {
  const ua = req.get('User-Agent') || '';
  pinologger.info(`User-Agent: ${ua}`);
  if (req.crawlerDetect || /sqlmap|nikto|acunetix|dirbuster|masscan|wpscan|nmap|hydra|arachni|python-requests|curl/i.test(ua)) {
    pinologger.info(`Blocked suspicious User-Agent: ${ua}`);
    req.log.warn({ crawler: req.crawlerDetect, ua }, 'Blocked suspicious User-Agent');
    return res.sendStatus(403);
  }
  pinologger.info('User-Agent passed check');
  next();
});

app.use(session({
  name: 'session_id',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: cookieSecure, sameSite: 'lax', maxAge: 86400000 },
}));
pinologger.info('Session middleware applied');
app.use(passport.initialize());
app.use(passport.session());
pinologger.info('Passport initialized and session handling applied');

app.use(securityMiddleware);
pinologger.info('Applied custom security middleware');

app.use('/auth', authRouter);
pinologger.info('Mounted auth router at /auth');
app.use('/api', apiRouter);
pinologger.info('Mounted API router at /api');
app.use(staticRouter);
pinologger.info('Applied static router');

app.use((req, res) => {
  pinologger.info(`404 Not Found: ${req.originalUrl}`);
  req.log.info({ url: req.originalUrl }, '404 Not Found');
  res.status(404).send("Sorry, can't find that!");
});

import type { Request, Response, NextFunction } from 'express';

// Extend Express Request type to include crawlerDetect
declare module 'express-serve-static-core' {
  interface Request {
    crawlerDetect?: boolean;
  }
}

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  pinologger.error(`Unhandled error at ${req.originalUrl}:`, err);
  req.log.error({ err, url: req.originalUrl, stack: err.stack }, 'Unhandled error');
  res.status(500).send('Internal Server Error');
});

// process.on('unhandledRejection', (reason, promise) => {
//   pinologger.error('Unhandled Rejection:', reason);
//   pinologger.error({ reason, promise }, 'Unhandled Rejection');
// });
// process.on('uncaughtException', (err) => {
//   pinologger.error('Uncaught Exception:', err);
//   pinologger.error({ err }, 'Uncaught Exception');
//   process.exit(1);
// });
app.listen(portNumber, '0.0.0.0', () => {
  pinologger.info(`Server started on port ${portNumber} with env ${NODE_ENV}, behindProxy=${behindProxy}, cookieSecure=${cookieSecure}`);
  pinologger.info({ port: portNumber, env: NODE_ENV, behindProxy, cookieSecure }, 'Server listening');
});
