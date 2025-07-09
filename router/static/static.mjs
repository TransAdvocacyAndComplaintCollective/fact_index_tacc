import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

// Fix __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Paths
const reactBuildDir = path.join(__dirname, '../../fact_index', 'dist');
const fallbackDir = path.join(__dirname, '../../fallback');
const factIndexDir = path.join(__dirname, '../../fact_index');

const PARCEL_PORT = 1234;
let parcelProcess = null;
let parcelStarting = false;

// Logging util
function log(...args) {
  console.info(`[${new Date().toISOString()}]`, ...args);
}

// Ensure Parcel is running
async function ensureParcelDevServer() {
  if (parcelProcess || parcelStarting) {
    log('[dev] Parcel already running or starting.');
    return;
  }
  parcelStarting = true;
  log('[dev] Checking if Parcel dev server is running on port', PARCEL_PORT);

  const isPortInUse = await new Promise(resolve => {
    const net = require('net');
    const sock = net.createConnection({ port: PARCEL_PORT }, () => {
      sock.destroy();
      resolve(true);
    });
    sock.on('error', () => resolve(false));
  });

  if (!isPortInUse) {
    log('[dev] Parcel not running. Starting with `npm run start`...');
    parcelProcess = spawn('npm', ['run', 'start'], {
      cwd: factIndexDir,
      shell: true,
      stdio: 'inherit',
      env: { ...process.env, PORT: PARCEL_PORT },
    });
    parcelProcess.on('exit', (code, signal) => {
      log(`[dev] Parcel exited (${code ?? signal})`);
      parcelProcess = null;
      parcelStarting = false;
    });
  } else {
    log('[dev] Parcel is already running.');
  }

  parcelStarting = false;
}

// Proxy all routes to Parcel
const parcelProxy = createProxyMiddleware({
  target: `http://localhost:${PARCEL_PORT}`,
  changeOrigin: true,
  ws: true,
  logLevel: 'warn',
  onProxyReq: (proxyReq, req) =>
    log('[proxy] ➜', req.method, req.originalUrl),
  onError: (err, req, res) => {
    log('[proxy] Error:', err.message);
    res.status(502).send('Parcel dev server unreachable.');
  },
});

// Main router logic
router.use(async (req, res, next) => {
  const isLocalDev = req.socket.localPort === PARCEL_PORT;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress ||  'unknown';
  log('[route] Request:', req.method, req.originalUrl, 'on port', req.socket.localPort, "IP:", ip);

  if (isLocalDev & !req.headers['x-forwarded-for']) {
    log('[dev] Proxying via Parcel dev server...');
    await ensureParcelDevServer();
    return parcelProxy(req, res, next);
  }

  next();
});

// Production: serve static build
router.use(express.static(reactBuildDir));
router.use(express.static(fallbackDir));

// Log static and fallback
router.use((req, res, next) => {
  log('[serve] Attempted static:', req.originalUrl);
  next();
});

// Catch-all for SPA: production build
router.get('/{*splat}', (req, res) => {
  const indexPath = path.join(reactBuildDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    log('[spa] Serving build index.html');
    res.sendFile(indexPath);
  } else {
    log('[spa] Build missing, serving fallback index.html');
    res.sendFile(path.join(fallbackDir, 'index.html'));
  }
});

export default router;
