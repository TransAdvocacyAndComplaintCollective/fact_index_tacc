// File: router/static/static.mjs
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Paths
const reactBuildDir = path.join(__dirname, '../../fact_index/dist');
const fallbackDir = path.join(__dirname, '../../fallback');
const factIndexDir = path.join(__dirname, '../../fact_index');

const PARCEL_PORT = 1234;
let parcelProcess = null;
let parcelStarting = false;

function log(...args) {
  console.info(`[${new Date().toISOString()}]`, ...args);
}

const PORT = Number(process.env.PORT || 16261);
async function ensureParcelDevServer() {
  if (parcelProcess || parcelStarting) return;
  parcelStarting = true;

  const net = await import('net');
  const isPortInUse = await new Promise(resolve => {
    const sock = net.createConnection({ port: PARCEL_PORT }, () => {
      sock.destroy();
      resolve(true);
    });
    sock.on('error', () => resolve(false));
  });

  if (!isPortInUse) {
    log('[dev] Starting Parcel dev server...');
    parcelProcess = spawn('npm', ['run', 'start'], {
      cwd: factIndexDir,
      shell: true,
      stdio: 'inherit',

      env: {
        ...process.env,
        PORT: PARCEL_PORT,
        PROXY_MODE: 'TRUE',
        PROXY_PORT: PORT, // or whatever port you want
      }
    });
    parcelProcess.on('exit', code => {
      log(`[dev] Parcel exited (${code})`);
      parcelProcess = null;
    });
  }

  parcelStarting = false;
}

if (process.env.DEBUG_REACT === 'TRUE') {

    router.use((req, res, next) => {
    res.setHeader('Content-Security-Policy',
      [
        `default-src 'self' http://localhost:${PARCEL_PORT};`,
        `script-src 'self' http://localhost:${PARCEL_PORT};`,
        `connect-src 'self' ws://localhost:${PARCEL_PORT} http://localhost:${PARCEL_PORT};`,
        `style-src 'self' 'unsafe-inline' http://localhost:${PARCEL_PORT};`,
      ].join(' ')
    );
    next();
  });

  const parcelProxy = createProxyMiddleware({
    target: `http://localhost:${PARCEL_PORT}`,
    changeOrigin: true,
    ws: true,
    logLevel: 'warn',
    onProxyReq: (proxyReq, req) => log('[proxy] ➜', req.method, req.originalUrl),
    onError: (err, req, res) => {
      log('[proxy] Error:', err.message);
      res.status(502).send('Parcel dev server unreachable.');
    },
  });

  router.use(async (req, res, next) => {
    await ensureParcelDevServer();
    return parcelProxy(req, res, next);
  });
} else {
  // Production: serve bundled static assets
  router.use(express.static(reactBuildDir));
  router.use(express.static(fallbackDir));

  // Serve index.html for SPA clients
  router.get('/*splat', (req, res) => {
    const indexPath = path.join(reactBuildDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      log('[serve] SPA index.html from build');
      res.sendFile(indexPath);
    } else {
      log('[serve] SPA index.html fallback');
      res.sendFile(path.join(fallbackDir, 'index.html'));
    }
  });
}


export default router;
