
import express from "express";
import type { Request, Response, Router } from "express";
import logger from "../../logger.ts";
import { casbinMiddleware } from "../../auth/casbin.ts";
import {
  createFact,
  findFacts,
  getFactById,
  listAudiences,
  listSubjects,
  updateFact,
  deleteFact,
} from "@factdb/db-core";
import type { NewFactInput } from "@factdb/types";
const router: Router = express.Router();

function serverError(
  res: Response,
  route: string,
  err: unknown,
  extra: Record<string, unknown> = {},
): void {
  logger.error(`[api] ${route} error`, {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    ...extra,
  });
  res.status(500).json({ error: "Server error" });
}

function parseFactId(rawId: string | string[] | undefined): number | null {
  const idValue = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!idValue) {
    return null;
  }
  const id = Number(idValue);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.get("/facts", casbinMiddleware(), async (req: Request, res: Response) => {
  try {
    const q = req.query.q as string | undefined;
    const results = await findFacts({ keyword: q || undefined });
    res.json(results);
  } catch (err) {
    serverError(res, "/api/facts/facts GET", err, { query: req.query });
  }
});

// Return list of distinct audiences (from `context`)
router.get("/audiences", casbinMiddleware(), async (req: Request, res: Response) => {
  try {
    const audiences = await listAudiences();
    res.json({ audiences });
  } catch (err) {
    serverError(res, "/api/facts/audiences GET", err, { path: req.path });
  }
});

// Return list of distinct subjects (from `type`)
router.get("/subjects", casbinMiddleware(), async (req: Request, res: Response) => {
  try {
    const subjects = await listSubjects();
    res.json({ subjects });
  } catch (err) {
    serverError(res, "/api/facts/subjects GET", err, { path: req.path });
  }
});

router.get("/facts/:id", casbinMiddleware(), async (req: Request, res: Response) => {
  try {
    const id = parseFactId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "Invalid fact id" });
    }
    const fact = await getFactById(id);
    if (!fact) return res.status(404).json({ error: "Not found" });
    res.json(fact);
  } catch (err) {
    serverError(res, "/api/facts/facts/:id GET", err, { params: req.params });
  }
});

router.post("/facts", casbinMiddleware(), async (req: Request, res: Response) => {
  try {
    const created = await createFact(req.body as NewFactInput);
    res.json(created);
  } catch (err) {
    serverError(res, "/api/facts/facts POST", err, { body: req.body });
  }
});

router.put("/facts/:id", casbinMiddleware(), async (req: Request, res: Response) => {
  try {
    const id = parseFactId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "Invalid fact id" });
    }
    await updateFact(id, req.body as Partial<NewFactInput>);
    res.json({ ok: true });
  } catch (err) {
    serverError(res, "/api/facts/facts/:id PUT", err, { params: req.params, body: req.body });
  }
});

router.delete("/facts/:id", casbinMiddleware(), async (req: Request, res: Response) => {
  try {
    const id = parseFactId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "Invalid fact id" });
    }
    await deleteFact(id);
    res.json({ ok: true });
  } catch (err) {
    serverError(res, "/api/facts/facts/:id DELETE", err, { params: req.params });
  }
});

router.get("/", (_req: Request, res: Response) => {
  res.json({ message: "Welcome to the Fabs Fact DB API" });
});

export default router;
