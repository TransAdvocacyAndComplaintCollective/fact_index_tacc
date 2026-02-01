
import express from "express";
import type { Request, Response, NextFunction, Router } from "express";
import logger from "../../logger.ts";
import { validateJWTOnly } from "../../auth/passport-discord.ts";

import {createFact, findFacts, getFactById, listAudiences, listSubjects, updateFact, deleteFact} from '@factdb/db-core';
import type { NewFactInput } from '@factdb/types';
const router: Router = express.Router();

// Note: JWT authentication is validated via validateJWTOnly middleware
// Endpoints require valid Discord auth token

router.get('/facts', validateJWTOnly, async (req: Request, res: Response) => {
  try {
    const q = req.query.q as string | undefined;
    const results = await findFacts({ keyword: q || undefined });
    res.json(results);
  } catch (err) {
    logger.error('[api] /api/facts/facts GET error', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      query: req.query,
    });
    res.status(500).json({ error: 'Server error' });
  }
});

// Return list of distinct audiences (from `context`)
router.get('/audiences', async (req: Request, res: Response) => {
  try {
    const audiences = await listAudiences();
    res.json({ audiences });
  } catch (err) {
    logger.error('[api] /api/facts/audiences GET error', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    res.status(500).json({ error: 'Server error' });
  }
});

// Return list of distinct subjects (from `type`)
router.get('/subjects', async (req: Request, res: Response) => {
  try {
    const subjects = await listSubjects();
    res.json({ subjects });
  } catch (err) {
    logger.error('[api] /api/facts/subjects GET error', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/facts/:id', validateJWTOnly, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const fact = await getFactById(id);
    if (!fact) return res.status(404).json({ error: 'Not found' });
    res.json(fact);
  } catch (err) {
    logger.error('[api] /api/facts/facts/:id GET error', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      params: req.params,
    });
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/facts', validateJWTOnly, async (req: Request, res: Response) => {
  try {
  const created = await createFact(req.body as NewFactInput);
    res.json(created);
  } catch (err) {
    logger.error('[api] /api/facts/facts POST error', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      body: req.body,
    });
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/facts/:id', validateJWTOnly, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    await updateFact(id, req.body as Partial<NewFactInput>);
    res.json({ ok: true });
  } catch (err) {
    logger.error('[api] /api/facts/facts/:id PUT error', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      params: req.params,
      body: req.body,
    });
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/facts/:id', validateJWTOnly, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    await deleteFact(id);
    res.json({ ok: true });
  } catch (err) {
    logger.error('[api] /api/facts/facts/:id DELETE error', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      params: req.params,
    });
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Welcome to the Fabs Fact DB API' });
});

export default router;
