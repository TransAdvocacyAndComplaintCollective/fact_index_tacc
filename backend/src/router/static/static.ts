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
import logger from '../../logger/pino.ts';

const pinolog = logger.child({ component: 'static' });
// If using CommonJS, __filename and __dirname are available by default.
// If using ES modules, uncomment the following lines:
import { fileURLToPath } from 'url';
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

function isPortInUse(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const tester = net.createServer()
      .once('error', () => resolve(true))
      .once('listening', () => tester.close(() => resolve(false)))
      .listen(port, '127.0.0.1');
  });
}

async function ensureParcelDevServer(): Promise<void> {
  if (parcelEnsured) return;
  parcelEnsured = true;
  if (parcelProcess || parcelStarting) return;

  const portInUse = await isPortInUse(PARCEL_PORT);
  if (portInUse) return;

  parcelStarting = true;
  parcelProcess = spawn(npmCmd, ['run', 'start'], {
    cwd: frontendDir,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, PORT: String(PARCEL_PORT), PROXY_MODE: 'TRUE' }
  });

  parcelProcess.once('exit', () => {
    parcelProcess = null;
    parcelStarting = false;
    parcelEnsured = false;
  });
  parcelProcess.once('error', () => {
    parcelProcess = null;
    parcelStarting = false;
    parcelEnsured = false;
  });
}

function setupParcelShutdown(): void {
  const shutdown = (signal: NodeJS.Signals) => {
    if (parcelProcess) parcelProcess.kill(signal);
    process.exit();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
setupParcelShutdown();

const router = express.Router();
router.use((req: Request, res: Response, next: NextFunction) => {
  pinolog.debug('Static middleware:', req.method, req.originalUrl);
  next();
});

if (process.env.DEBUG_REACT === 'TRUE') {
  ensureParcelDevServer().catch(() => {});
  // Import the correct type for the proxy

  const proxy: any = createProxyMiddleware({
    target: `http://localhost:${PARCEL_PORT}`,
    changeOrigin: true,
    ws: true
  });

  // Attach error handler for proxy
  if (typeof proxy.on === 'function') {
    proxy.on('error', (err: Error, _req: Request, res: Response) => {
      pinolog.error('Proxy error:', err);
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Proxy error.');
    });
  }

  router.use(proxy as RequestHandler);
} else {
  router.use(express.static(reactBuildDir, { maxAge: '1d' }));
  router.use(express.static(fallbackDir));
}

export default router;
