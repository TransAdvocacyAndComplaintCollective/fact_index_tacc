// src/router/api.ts
import express from 'express';
import pkg_express from 'express';
type Request = pkg_express.Request;
type Response = pkg_express.Response;
type NextFunction = pkg_express.NextFunction;
import factsRouter from './fact/facts.ts';
import pinologger from '../logger/pino.ts';
import { validateAndRefreshStateless } from '../auth/authRouter.ts';
import type { AuthUser, UnauthenticatedUser } from '../auth/auth_types.d.ts';

const pinolog = pinologger.child({ component: 'api' });
const apiRouter = express.Router();

apiRouter.use(
  '/facts',
  validateAndRefreshStateless, // <- use your stateless JWT validator
  (req: Request, res: Response, next: NextFunction) => {
    pinolog.debug({ method: req.method, url: req.originalUrl }, '/api/facts middleware');

    const auth = (req as any).authStatus as AuthUser | UnauthenticatedUser | undefined;

    if (!auth?.authenticated) {
      return res.status(401).json({
        authenticated: false,
        user: null,
        reason: auth?.reason ?? 'unauthenticated',
      });
    }

    // expose user to downstream handlers if helpful
    (req as any).user = auth;
    res.locals.user = auth;
    next();
  },
  factsRouter
);

export default apiRouter;
