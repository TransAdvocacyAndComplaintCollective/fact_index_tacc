// src/router/api.ts
import express from 'express';
import pkg_express from 'express';
type Request = pkg_express.Request;
type Response = pkg_express.Response;
type NextFunction = pkg_express.NextFunction;
import factsRouter from './fact/facts.js';
import pinologger from '../logger/pino.js';
import { validateAndRefreshStateless } from '../auth/authRouter.js';
import type { AuthUser, UnauthenticatedUser } from '../auth/auth_types.d.ts';

const pinolog = pinologger.child({ component: 'api' });
const apiRouter = express.Router();

apiRouter.use(  '/facts', (req: Request, res: Response, next: NextFunction) => {
    pinolog.debug({ method: req.method, url: req.originalUrl }, '/api/facts middleware');
    next();
  },
  factsRouter
);

export default apiRouter;
