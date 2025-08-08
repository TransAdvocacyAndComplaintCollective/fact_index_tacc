
import express from 'express';

import pkg from 'express';
type NextFunction = pkg.NextFunction;
type Response = pkg.Response;
type Request = pkg.Request;

import factsRouter from './fact/facts.ts';
import pinologger from '../logger/pino.ts';


const pinolog = pinologger.child({ component: 'api' });
const apiRouter = express.Router();

apiRouter.use(
  '/facts',
  (req: Request, res: Response, next: NextFunction) => {
    pinolog.debug({ method: req.method, url: req.originalUrl }, '/api/facts middleware');
    if (typeof req.isAuthenticated !== 'function' || !req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  },
  factsRouter
);

export default apiRouter;
