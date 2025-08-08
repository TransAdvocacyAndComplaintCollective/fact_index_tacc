// backend/src/router/fact/facts.ts

import express from 'express';

import pkg from 'express';
type NextFunction = pkg.NextFunction;
type Response = pkg.Response;
type Request = pkg.Request;

import pinologger from '../../logger/pino.ts';
import {
  findFacts,
  getFactById,
  createFact,
  updateFact,
  deleteFact,
} from '../../db/fact_crud.ts';
import { countFacts } from '../../db/bulk_dedup_helpers.ts';
import { suppressFact } from '../../db/suppression_helpers.ts';

import {
  listSuppressedFacts,
  listSubjects,
  upsertSubject,
  deleteSubject,
  getFactsForSubject,
} from '../../db/subjects_helpers.ts';

import {
  listAudiences,
  upsertAudience,
  deleteAudience,
  getFactsForAudience,
} from '../../db/audiences_helpers.ts';

const pinolog = pinologger.child({ component: 'facts_router' });
const router = express.Router();



// Type for Fact search parameters
interface FactSearchParams {
  keyword?: string;
  yearFrom?: number;
  yearTo?: number;
  offset?: number;
  limit?: number;
  includeSuppressed?: boolean;
  subjectsInclude?: string[];
  subjectsExclude?: string[];
  audiencesInclude?: string[];
  audiencesExclude?: string[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  // additional optional params
  targets?: string[];
  subjects?: string[];
  year?: number;
}

// Middleware to require authentication on all /api/facts routes
router.use((req: Request, res: Response, next: NextFunction) => {
  pinolog.debug('/api/facts middleware', req.method, req.originalUrl);
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Helper to parse query param into array
const parseArrayParam = (v: unknown): string[] => {
  if (v === undefined || v === null || v === '') return [];
  if (Array.isArray(v)) return v as string[];
  return String(v).split(',').map(s => s.trim()).filter(Boolean);
};

// GET /api/facts - list/search facts with filters
router.get('/facts', async (req: Request, res: Response) => {
  try {
    pinolog.debug('[DEBUG] GET /api/facts query', req.query);

    const {
      keyword = '',
      yearFrom,
      yearTo,
      dateFrom,
      dateTo,
      offset = '0',
      limit = '50',
      includeSuppressed,
      subjectsInclude,
      subjectsExclude,
      audiencesInclude,
      audiencesExclude,
      sortBy,
      sortOrder,
    } = req.query;

    const includeSuppressedBool =
      includeSuppressed === '1' ||
      includeSuppressed === 'true';

    const subjectsIncludeArr = parseArrayParam(subjectsInclude);
    const subjectsExcludeArr = parseArrayParam(subjectsExclude);
    const audiencesIncludeArr = parseArrayParam(audiencesInclude);
    const audiencesExcludeArr = parseArrayParam(audiencesExclude);

    const from = yearFrom || dateFrom;
    const to = yearTo || dateTo;

    const facts = await findFacts({
      keyword: String(keyword),
      yearFrom: from ? Number(from) : undefined,
      yearTo: to ? Number(to) : undefined,
      offset: Number(offset),
      limit: Number(limit),
      includeSuppressed: includeSuppressedBool,
      subjectsInclude: subjectsIncludeArr,
      subjectsExclude: subjectsExcludeArr,
      audiencesInclude: audiencesIncludeArr,
      audiencesExclude: audiencesExcludeArr,
      sortBy: (sortBy === 'date' || sortBy === 'year' || sortBy === 'name' || sortBy === 'relevance') ? sortBy as 'date' | 'year' | 'name' | 'relevance' : 'date',
      sortOrder: (sortOrder === 'asc' || sortOrder === 'desc') ? sortOrder : 'desc',
    });

    pinolog.debug(`[DEBUG] GET /api/facts found ${facts.length} facts`);
    res.json(facts);
  } catch (err) {
    pinolog.error('[ERROR] GET /api/facts', err);
    res.status(500).json({ error: 'Failed to fetch facts', detail: (err as Error).message });
  }
});

// GET /api/facts/:id - get fact by ID
router.get('/facts/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    pinolog.debug('[DEBUG] GET /api/facts/:id', id);

    const fact = await getFactById(id);
    if (!fact) return res.status(404).json({ error: 'Fact not found' });

    res.json(fact);
  } catch (err) {
    pinolog.error('[ERROR] GET /api/facts/:id', err);
    res.status(500).json({ error: 'Failed to fetch fact', detail: (err as Error).message });
  }
});

// POST /api/facts - create fact
router.post('/facts', async (req: Request, res: Response) => {
  try {
    pinolog.debug('[DEBUG] POST /api/facts', req.body);

    const newFact = await createFact(req.body);
    res.status(201).json(newFact);
  } catch (err) {
    pinolog.error('[ERROR] POST /api/facts', err);
    res.status(400).json({ error: 'Failed to create fact', detail: (err as Error).message });
  }
});

// PUT /api/facts/:id - update fact
router.put('/facts/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { changes = {}, subjects, audiences } = req.body;

    pinolog.debug('[DEBUG] PUT /api/facts/:id', id, { changes, subjects, audiences });

    const updatedFact = await updateFact(id, changes, subjects, audiences);
    res.json(updatedFact);
  } catch (err) {
    pinolog.error('[ERROR] PUT /api/facts/:id', err);
    res.status(400).json({ error: 'Failed to update fact', detail: (err as Error).message });
  }
});

// DELETE /api/facts/:id - delete fact
router.delete('/facts/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    pinolog.debug('[DEBUG] DELETE /api/facts/:id', id);

    await deleteFact(id);
    res.json({ success: true });
  } catch (err) {
    pinolog.error('[ERROR] DELETE /api/facts/:id', err);
    res.status(400).json({ error: 'Failed to delete fact', detail: (err as Error).message });
  }
});

// POST /api/facts/:id/suppress - suppress or unsuppress fact
router.post('/facts/:id/suppress', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const value = req.body.value !== undefined ? Boolean(req.body.value) : true;

    pinolog.debug('[DEBUG] POST /api/facts/:id/suppress', id, { value });

    const updatedFact = await suppressFact(id, value);
    res.json(updatedFact);
  } catch (err) {
    pinolog.error('[ERROR] POST /api/facts/:id/suppress', err);
    res.status(400).json({ error: 'Failed to suppress fact', detail: (err as Error).message });
  }
});

// GET /api/subjects - list subjects
router.get('/subjects', async (req: Request, res: Response) => {
  try {
    pinolog.debug('[DEBUG] GET /api/subjects');
    const subjects = await listSubjects();
    res.json(subjects);
  } catch (err) {
    pinolog.error('[ERROR] GET /api/subjects', err);
    res.status(500).json({ error: 'Failed to fetch subjects', detail: (err as Error).message });
  }
});

// POST /api/subjects - upsert subject
router.post('/subjects', async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    pinolog.debug('[DEBUG] POST /api/subjects', { name });
    const id = await upsertSubject(name);
    res.status(201).json({ id });
  } catch (err) {
    pinolog.error('[ERROR] POST /api/subjects', err);
    res.status(400).json({ error: 'Failed to create subject', detail: (err as Error).message });
  }
});

// DELETE /api/subjects/:id - delete subject
router.delete('/subjects/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    pinolog.debug('[DEBUG] DELETE /api/subjects/:id', id);
    await deleteSubject(id);
    res.json({ success: true });
  } catch (err) {
    pinolog.error('[ERROR] DELETE /api/subjects/:id', err);
    res.status(400).json({ error: 'Failed to delete subject', detail: (err as Error).message });
  }
});

// GET /api/subjects/:name/facts - get facts for subject
router.get('/subjects/:name/facts', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    pinolog.debug('[DEBUG] GET /api/subjects/:name/facts', name);
    const facts = await getFactsForSubject(name);
    res.json(facts);
  } catch (err) {
    pinolog.error('[ERROR] GET /api/subjects/:name/facts', err);
    res.status(500).json({ error: 'Failed to fetch facts for subject', detail: (err as Error).message });
  }
});

// GET /api/audiences - list audiences
router.get('/audiences', async (req: Request, res: Response) => {
  try {
    pinolog.debug('[DEBUG] GET /api/audiences');
    const audiences = await listAudiences();
    res.json(audiences);
  } catch (err) {
    pinolog.error('[ERROR] GET /api/audiences', err);
    res.status(500).json({ error: 'Failed to fetch audiences', detail: (err as Error).message });
  }
});

// POST /api/audiences - upsert audience
router.post('/audiences', async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    pinolog.debug('[DEBUG] POST /api/audiences', { name });
    const id = await upsertAudience(name);
    res.status(201).json({ id });
  } catch (err) {
    pinolog.error('[ERROR] POST /api/audiences', err);
    res.status(400).json({ error: 'Failed to create audience', detail: (err as Error).message });
  }
});

// DELETE /api/audiences/:id - delete audience
router.delete('/audiences/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    pinolog.debug('[DEBUG] DELETE /api/audiences/:id', id);
    await deleteAudience(id);
    res.json({ success: true });
  } catch (err) {
    pinolog.error('[ERROR] DELETE /api/audiences/:id', err);
    res.status(400).json({ error: 'Failed to delete audience', detail: (err as Error).message });
  }
});

// GET /api/audiences/:name/facts - get facts for audience
router.get('/audiences/:name/facts', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    pinolog.debug('[DEBUG] GET /api/audiences/:name/facts', name);
    const facts = await getFactsForAudience(name);
    res.json(facts);
  } catch (err) {
    pinolog.error('[ERROR] GET /api/audiences/:name/facts', err);
    res.status(500).json({ error: 'Failed to fetch facts for audience', detail: (err as Error).message });
  }
});

// GET /api/facts-count - count facts optionally filtered
router.get('/facts-count', async (req: Request, res: Response) => {
  try {
    const { type, subject, audience, year } = req.query;
    pinolog.debug('[DEBUG] GET /api/facts-count', req.query);
    const count = await countFacts({
      type: type ? String(type) : undefined,
      subject: subject ? String(subject) : undefined,
      audience: audience ? String(audience) : undefined,
      year: year ? Number(year) : undefined,
    });
    res.json({ count });
  } catch (err) {
    pinolog.error('[ERROR] GET /api/facts-count', err);
    res.status(500).json({ error: 'Failed to count facts', detail: (err as Error).message });
  }
});

// POST /api/facts/search - search facts with complex filters
router.post('/search', async (req: Request, res: Response) => {
  pinolog.debug('POST /api/facts/search received body', req.body);

  const toArray = (v: unknown): string[] =>
    v == null
      ? []
      : Array.isArray(v)
      ? v as string[]
      : String(v)
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);

  try {
    const sortBy: 'date' | 'year' | 'name' | 'relevance' =
      req.body.sortBy === 'date' ||
      req.body.sortBy === 'year' ||
      req.body.sortBy === 'name' ||
      req.body.sortBy === 'relevance'
        ? req.body.sortBy
        : 'date';

    const sortOrder: 'asc' | 'desc' =
      req.body.sortOrder === 'asc' || req.body.sortOrder === 'desc'
        ? req.body.sortOrder
        : 'desc';

    // Add your search logic here and assign the result to facts
    const facts = await findFacts({
      keyword: req.body.keyword || '',
      yearFrom: req.body.yearFrom,
      yearTo: req.body.yearTo,
      offset: req.body.offset || 0,
      limit: req.body.limit || 50,
      includeSuppressed: req.body.includeSuppressed === true,
      subjectsInclude: toArray(req.body.subjectsInclude),
      subjectsExclude: toArray(req.body.subjectsExclude),
      audiencesInclude: toArray(req.body.audiencesInclude),
      audiencesExclude: toArray(req.body.audiencesExclude),
      sortBy,
      sortOrder,
    });
    pinolog.debug('Search complete', { returnedCount: facts.length });
    res.json(facts);
  } catch (err) {
    pinolog.error('POST /api/facts/search failed', {
      message: (err as Error).message,
      stack: (err as Error).stack,
    });
    res.status(500).json({
      error: 'Failed to search facts',
      detail: (err as Error).message,
    });
  }
});

// GET /api/facts-suppressed - list suppressed facts
router.get('/facts-suppressed', async (req: Request, res: Response) => {
  try {
    pinolog.debug('[DEBUG] GET /api/facts-suppressed');
    const suppressed = await listSuppressedFacts();
    res.json(suppressed);
  } catch (err) {
    pinolog.error('[ERROR] GET /api/facts-suppressed', err);
    res.status(500).json({ error: 'Failed to fetch suppressed facts', detail: (err as Error).message });
  }
});

// Base welcome message for /api/
router.get('/', (_req: Request, res: Response) => {
  res.json({ message: 'Welcome to the Fabs Fact DB API' });
});

export default router;
