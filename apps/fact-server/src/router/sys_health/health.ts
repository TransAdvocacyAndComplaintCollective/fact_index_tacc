import express, { default as expressDefault } from "express";
import type { Request, Response, NextFunction } from "express";


const router = express.Router();

router.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

export default router;
