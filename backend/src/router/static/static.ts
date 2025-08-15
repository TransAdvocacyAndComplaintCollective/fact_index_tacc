import express from 'express';
import pkg from 'express';
type NextFunction = pkg.NextFunction;
type Response = pkg.Response;
type Request = pkg.Request;
type RequestHandler = pkg.RequestHandler;
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import os from 'os';
import { spawn, ChildProcess } from 'child_process';
import process from 'process';
import net from 'net';
import logger from '../../logger/pino.js';

const pinolog = logger.child({ component: 'static' });
import { fileURLToPath } from 'url';
import { IncomingMessage } from 'http';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const reactBuildDir = path.resolve(__dirname, '../../../../frontend/dist');
const fallbackDir = path.resolve(__dirname, '../../fallback');
const frontendDir = path.resolve(__dirname, '../../../../frontend');

const PARCEL_PORT = 1234;
let parcelProcess: ChildProcess | null = null;
let parcelStarting = false;
let parcelEnsured = false;
const npmCmd = os.platform() === 'win32' ? 'npm.cmd' : 'npm';

function timestamp() {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function log(level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR', msg: string, extra: Record<string, any> = {}) {
  const base = {
    nodeVersion: process.version,
    appName: 'backend',
    component: 'static',
    ...extra
  };
  console.log(`[${timestamp()}] ${level}: : [] ${msg}`);
  Object.entries(base).forEach(([k, v]) => {
    console.log(`    ${k}: ${JSON.stringify(v)}`);
  });
}

function isPortInUse(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const tester = net.createServer()
      .once('error', () => resolve(true))
      .once('listening', () => tester.close(() => resolve(false)))
      .listen(port, '127.0.0.1');
  });
}

async function ensureParcelDevServer(): Promise<void> {
  if (parcelEnsured) {
    log('DEBUG', 'Parcel dev server already ensured.');
    return;
  }
  parcelEnsured = true;

  if (parcelProcess || parcelStarting) {
    log('DEBUG', 'Parcel dev server already starting or running.');
    return;
  }

  log('INFO', `Checking if port ${PARCEL_PORT} is in use...`);
  const portInUse = await isPortInUse(PARCEL_PORT);
  if (portInUse) {
    log('INFO', `Port ${PARCEL_PORT} already in use. Assuming Parcel is running.`);
    return;
  }

  log('INFO', 'Starting Parcel dev server...');
  parcelStarting = true;
  parcelProcess = spawn(npmCmd, ['run', 'start'], {
    cwd: frontendDir,
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PARCEL_PORT), PROXY_MODE: 'TRUE' }
  });

  parcelProcess.stdout?.on('data', data => {
    process.stdout.write(`[${timestamp()}] DEBUG: : [] [Parcel STDOUT] ${data}`);
  });

  parcelProcess.stderr?.on('data', data => {
    process.stderr.write(`[${timestamp()}] ERROR: : [] [Parcel STDERR] ${data}`);
  });

  parcelProcess.once('exit', (code, signal) => {
    log('WARN', 'Parcel process exited', { code, signal });
    parcelProcess = null;
    parcelStarting = false;
    parcelEnsured = false;
  });

  parcelProcess.once('error', err => {
    log('ERROR', 'Parcel process error', { err });
    parcelProcess = null;
    parcelStarting = false;
    parcelEnsured = false;
  });
}

function setupParcelShutdown(): void {
  const shutdown = (signal: NodeJS.Signals) => {
    log('INFO', 'Shutting down Parcel process...', { signal });
    if (parcelProcess) parcelProcess.kill(signal);
    process.exit();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
setupParcelShutdown();

const router = express.Router();
router.use((req: Request, res: Response, next: NextFunction) => {
  log('DEBUG', 'Static middleware request', { method: req.method, url: req.originalUrl });
  next();
});

if (process.env.DEBUG_REACT === 'TRUE') {
  log('INFO', 'DEBUG_REACT mode enabled. Proxying to Parcel dev server.');
  ensureParcelDevServer().catch(err => log('ERROR', 'Failed to ensure Parcel dev server', { err }));

  const proxy = createProxyMiddleware({
    target: `http://localhost:${PARCEL_PORT}`,
    changeOrigin: true,
    ws: true
  }) as any;

  proxy.on('proxyReq', (proxyReq: any, req: Request, res: Response) => {
    log('DEBUG', 'Proxying request to Parcel', { url: req.url, method: req.method });
  });

  proxy.on('proxyRes', (proxyRes: any, req: Request, res: Response) => {
    log('DEBUG', 'Received response from Parcel', { url: req.url, statusCode: proxyRes.statusCode });
  });

  proxy.on('error', (err: Error, _req: Request, res: Response) => {
    log('ERROR', 'Proxy error', { err });
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Proxy error.');
  });

  router.use(proxy);
} else {
  log('INFO', 'Serving static files from build and fallback directories.');
  router.use(express.static(reactBuildDir, { maxAge: '1d' }));
  router.use(express.static(fallbackDir));
}

export default router;
