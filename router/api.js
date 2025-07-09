import express from 'express';
import facts from './fact/facts.js';

const router = express.Router();

// --- ENDPOINTS FOR ALL API ---

router.all('/', (req, res, next) => {
  console.log('[DEBUG] /api/facts middleware', req.method, req.originalUrl);
  // Ensure user is authenticated for all fact routes
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});
router.use('/facts', facts);


export default router;