import express from "express";
import type { Request, Response, NextFunction, Router } from "express";
import facts from "./fact/facts.ts";
import { validateAndRefreshSession } from "../auth/passport-discord.ts";

const router: Router = express.Router();

router.use(validateAndRefreshSession);

router.use((req: Request, res: Response, next: NextFunction) => {
  console.log("[DEBUG] /api/facts middleware", req.method, req.originalUrl);
  const authStatus = (req as Request & { authStatus?: { authenticated: boolean; reason?: string } }).authStatus;
  if (authStatus?.authenticated) {
    return next();
  }
  return res.status(401).json({ error: "Unauthorized", reason: authStatus?.reason ?? "unauthenticated" });
});

router.use("/facts", facts as any);

export default router;
