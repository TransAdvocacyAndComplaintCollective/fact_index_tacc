// router/sys_health/health.js

import express from 'express';
import path from 'path';

const router = express.Router();

// Health check endpoint
router.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

export default router;
