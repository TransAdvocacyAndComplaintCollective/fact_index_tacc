import express from 'express';
import factRepository from '../../db/factRepository.js';


const router = express.Router();

// --- FACTS API ---

router.all('/', (req, res, next) => {
  console.log('[DEBUG] /api/facts middleware', req.method, req.originalUrl);
  // Ensure user is authenticated for all fact routes
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Search, filter, list facts
router.get('/facts', async (req, res) => {
  try {
    console.log('[DEBUG] /api/facts', req.query);

    const arrayParam = v =>
      typeof v === "undefined" || v === "" ? []
      : Array.isArray(v) ? v
      : v.split(',');

    const {
      keyword,
      targets,
      subjects,
      yearFrom,
      yearTo,
      dateFrom,
      dateTo,
      offset,
      limit,
      includeSuppressed,
      subjectsInclude,
      subjectsExclude,
      audiencesInclude,
      audiencesExclude,
    } = req.query;

    const targetsArr = arrayParam(targets);
    const subjectsArr = arrayParam(subjects);
    const subjectsIncludeArr = arrayParam(subjectsInclude);
    const subjectsExcludeArr = arrayParam(subjectsExclude);
    const audiencesIncludeArr = arrayParam(audiencesInclude);
    const audiencesExcludeArr = arrayParam(audiencesExclude);

    let includeSuppressedBool = false;
    if (typeof includeSuppressed !== "undefined") {
      includeSuppressedBool = (includeSuppressed === "1" || includeSuppressed === "true" || includeSuppressed === true);
    }

    const from = yearFrom || dateFrom;
    const to = yearTo || dateTo;

    console.log('[DEBUG] /api/facts query params:', {
      keyword,
      targetsArr,
      subjectsArr,
      from,
      to,
      offset,
      limit,
      includeSuppressedBool,
      subjectsIncludeArr,
      subjectsExcludeArr,
      audiencesIncludeArr,
      audiencesExcludeArr
    });

    const facts = await factRepository.findFacts({
      keyword,
      targets: targetsArr,
      subjects: subjectsArr,
      yearFrom: from,
      yearTo: to,
      offset: offset ? Number(offset) : 0,
      limit: limit ? Number(limit) : 50,
      includeSuppressed: includeSuppressedBool,
      subjectsInclude: subjectsIncludeArr,
      subjectsExclude: subjectsExcludeArr,
      audiencesInclude: audiencesIncludeArr,
      audiencesExclude: audiencesExcludeArr,
    });

    console.log('[DEBUG] /api/facts found:', facts.length, 'facts');
    res.json(facts);

  } catch (err) {
    console.error('[ERROR] /api/facts:', err);
    res.status(500).json({ error: 'Failed to fetch facts' });
  }
});

// Get a fact by id
router.get('/facts/:id', async (req, res) => {
  try {
    console.log('[DEBUG] /api/facts/:id', req.params.id);
    const fact = await factRepository.getFactById(req.params.id);
    if (!fact) return res.status(404).json({ error: 'Not found' });
    res.json(fact);
  } catch (err) {
    console.error('[ERROR] /api/facts/:id', err);
    res.status(500).json({ error: 'Failed to fetch fact' });
  }
});

// Create a fact
router.post('/facts', async (req, res) => {
  try {
    console.log('[DEBUG] POST /api/facts', req.body);
    const newFact = await factRepository.createFact(req.body);
    res.status(201).json(newFact);
  } catch (err) {
    console.error('[ERROR] POST /api/facts', err);
    res.status(400).json({ error: 'Failed to create fact', detail: err.message });
  }
});

// Update a fact
router.put('/facts/:id', async (req, res) => {
  try {
    console.log('[DEBUG] PUT /api/facts/:id', req.params.id, req.body);
    const updated = await factRepository.updateFact(
      req.params.id,
      req.body.changes,
      req.body.subjects,
      req.body.audiences
    );
    res.json(updated);
  } catch (err) {
    console.error('[ERROR] PUT /api/facts/:id', err);
    res.status(400).json({ error: 'Failed to update fact', detail: err.message });
  }
});

// Delete a fact
router.delete('/facts/:id', async (req, res) => {
  try {
    console.log('[DEBUG] DELETE /facts/:id', req.params.id);
    await factRepository.deleteFact(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[ERROR] DELETE /:id', err);
    res.status(400).json({ error: 'Failed to delete fact', detail: err.message });
  }
});

// Suppress or unsuppress a fact
router.post('/facts/:id/suppress', async (req, res) => {
  try {
    const value = req.body.value !== undefined ? req.body.value : true;
    const updated = await factRepository.suppressFact(req.params.id, value);
    res.json(updated);
  } catch (err) {
    console.error('[ERROR] POST /facts/:id/suppress', err);
    res.status(400).json({ error: 'Failed to suppress fact', detail: err.message });
  }
});

// --- SUBJECTS API ---

router.get('/subjects', async (req, res) => {
  try {
    console.log('[DEBUG] GET/subjects');
    res.json(await factRepository.listSubjects());
  } catch (err) {
    console.error('[ERROR] /subjects', err);
    res.status(500).json({ error: 'Failed to fetch subjects' });
  }
});

router.post('/subjects', async (req, res) => {
  try {
    const id = await factRepository.upsertSubject(req.body.name);
    res.status(201).json({ id });
  } catch (err) {
    console.error('[ERROR] POST /subjects', err);
    res.status(400).json({ error: 'Failed to create subject', detail: err.message });
  }
});

router.delete('/subjects/:id', async (req, res) => {
  try {
    await factRepository.deleteSubject(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[ERROR] DELETE /subjects/:id', err);
    res.status(400).json({ error: 'Failed to delete subject', detail: err.message });
  }
});

router.get('/subjects/:name/facts', async (req, res) => {
  try {
    const facts = await factRepository.getFactsForSubject(req.params.name);
    res.json(facts);
  } catch (err) {
    console.error('[ERROR] GET /subjects/:name/facts', err);
    res.status(500).json({ error: 'Failed to fetch facts for subject' });
  }
});

// --- AUDIENCES API ---

router.get('/audiences', async (req, res) => {
  try {
    console.log('[DEBUG] GET/audiences');
    res.json(await factRepository.listAudiences());
  } catch (err) {
    console.error('[ERROR] /audiences', err);
    res.status(500).json({ error: 'Failed to fetch audiences' });
  }
});

router.post('/audiences', async (req, res) => {
  try {
    const id = await factRepository.upsertAudience(req.body.name);
    res.status(201).json({ id });
  } catch (err) {
    console.error('[ERROR] POST /audiences', err);
    res.status(400).json({ error: 'Failed to create audience', detail: err.message });
  }
});

router.delete('/audiences/:id', async (req, res) => {
  try {
    await factRepository.deleteAudience(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[ERROR] DELETE /audiences/:id', err);
    res.status(400).json({ error: 'Failed to delete audience', detail: err.message });
  }
});

router.get('/audiences/:name/facts', async (req, res) => {
  try {
    const facts = await factRepository.getFactsForAudience(req.params.name);
    res.json(facts);
  } catch (err) {
    console.error('[ERROR] GET /audiences/:name/facts', err);
    res.status(500).json({ error: 'Failed to fetch facts for audience' });
  }
});

router.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Fabs Fact DB API' });
});

// Count facts (optionally filtered)
router.get('/facts-count', async (req, res) => {
  try {
    const { type, subject, audience } = req.query;
    const count = await factRepository.countFacts({ type, subject, audience });
    res.json({ count });
  } catch (err) {
    console.error('[ERROR] /facts-count', err);
    res.status(500).json({ error: 'Failed to count facts' });
  }
});

// List suppressed facts
router.get('/facts-suppressed', async (req, res) => {
  try {
    res.json(await factRepository.listSuppressedFacts());
  } catch (err) {
    console.error('[ERROR] /facts-suppressed', err);
    res.status(500).json({ error: 'Failed to fetch suppressed facts' });
  }
});

export default router;
