
import express from "express";
import type { Request, Response, NextFunction, Router } from "express";

import * as factRepo from '../../db/factRepository.ts';

const router: Router = express.Router();

router.all('/', (req: Request, res: Response, next: NextFunction) => {
  console.log('[DEBUG] /api/facts middleware', req.method, req.originalUrl);
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

router.get('/facts', async (req: Request, res: Response) => {
  try {
    const q = req.query.q as string | undefined;
    const results = await factRepo.findFacts({ keyword: q || undefined });
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Return list of distinct audiences (from `context`)
router.get('/audiences', async (req: Request, res: Response) => {
  try {
    const audiences = await factRepo.listAudiences();
    res.json({ audiences });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Return list of distinct subjects (from `type`)
router.get('/subjects', async (req: Request, res: Response) => {
  try {
    const subjects = await factRepo.listSubjects();
    res.json({ subjects });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/facts/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const fact = await factRepo.getFactById(id);
    if (!fact) return res.status(404).json({ error: 'Not found' });
    res.json(fact);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/facts', async (req: Request, res: Response) => {
  try {
    const created = await factRepo.createFact(req.body as any);
    res.json(created);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/facts/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    await factRepo.updateFact(id, req.body as any);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/facts/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    await factRepo.deleteFact(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Welcome to the Fabs Fact DB API' });
});

export default router;
