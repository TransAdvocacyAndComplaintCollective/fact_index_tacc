// main.js
const express = require('express');
const bodyParser = require('body-parser');
const PORT = process.env.PORT || 16233;
const path = require('path');
const app = express();
// --- GLOBAL ERROR LOGGING ---
process.on('uncaughtException', err => {
  console.error('[FATAL] Uncaught Exception:', err);
  process.exit(1); // Exit, or consider not exiting for dev
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
process.on('SIGTERM', () => {
  console.warn('SIGTERM signal received: closing server...');
  process.exit(0);
});
process.on('SIGINT', () => {
  console.warn('SIGINT (Ctrl+C) received: shutting down...');
  process.exit(0);
});

// --- LOG REQUESTS ---
app.use((req, res, next) => {
  console.info(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});


app.use(express.static(path.join(__dirname, 'fallback')));

const server = app.listen(PORT, '0.0.0.0', err => {
  if (err) {
    console.error('❌ [main.js] Error in app.listen:', err);
    return;
  } else {
    console.log(`✅ [main.js] Fabs Fact DB server running on IPv4 port ${PORT}`);
  }
});
