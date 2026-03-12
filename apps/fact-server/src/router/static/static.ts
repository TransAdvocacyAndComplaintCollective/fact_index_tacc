import express, {
  type NextFunction,
  type Request,
  type Response,
  type Router,
} from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import logger from '../../logger.ts';
import type { ViteDevServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router: Router = express.Router();

const isDev = process.env.NODE_ENV === 'development';

logger.debug(`[serve] isDev: ${isDev}`);

// Prefer an explicit workspace root if your runtime provides one.
// Fallbacks try to be robust across running from src or dist.
const workspaceRoot =
  (process.env.NX_WORKSPACE_ROOT &&
    path.resolve(process.env.NX_WORKSPACE_ROOT)) ||
  (process.env.WORKSPACE_ROOT && path.resolve(process.env.WORKSPACE_ROOT)) ||
  path.resolve(__dirname, '../../../../..');

logger.debug(`[serve] Workspace root: ${workspaceRoot}`);

// App paths
const reactAppRoot = path.join(workspaceRoot, 'apps', 'fact-index');
const reactIndexPath = path.join(reactAppRoot, 'index.html');

logger.debug(`[serve] React app root: ${reactAppRoot}`);

// Build output candidates (Nx/Vite commonly emits to dist/apps/<app>)
const buildCandidates = [
  path.join(workspaceRoot, 'dist', 'apps', 'fact-index'),
  path.join(reactAppRoot, 'dist'),
  path.join(reactAppRoot, 'build'),
];

const chosenBuildDir = buildCandidates.find((p) =>
  fs.existsSync(path.join(p, 'index.html')),
);
const buildIndexPath = chosenBuildDir
  ? path.join(chosenBuildDir, 'index.html')
  : undefined;

logger.debug(`[serve] Build candidates: ${buildCandidates.join(', ')}`);
logger.debug(`[serve] Chosen build dir: ${chosenBuildDir || 'none'}`);
logger.debug(`[serve] Build index path: ${buildIndexPath || 'none'}`);

// --- DEV: Vite middleware mode (React HMR) ---
let viteReady: Promise<ViteDevServer | null> | null = null;
let viteServer: ViteDevServer | null = null;

if (isDev) {
  logger.info('[serve] Development mode: enabling Vite middleware (HMR)');

  viteReady = (async () => {
    const { createServer } = await import('vite');

    // middlewareMode + appType:"custom" is the standard pattern for “Express owns the server”
    // while Vite provides dev transforms + HMR. :contentReference[oaicite:2]{index=2}
    const hmrEnabled = String(process.env.VITE_HMR || '').trim().toLowerCase() === 'true';
    const hmrPort = process.env.VITE_HMR_PORT ? Number(process.env.VITE_HMR_PORT) : undefined;
    const hmrHost = String(process.env.VITE_HMR_HOST || '127.0.0.1').trim() || '127.0.0.1';
    const usePolling = String(process.env.VITE_USE_POLLING || '').trim().toLowerCase() !== 'false';
    if (hmrEnabled && hmrPort) logger.info(`[serve] Vite HMR port from env: ${hmrPort}`);
    viteServer = await createServer({
      root: reactAppRoot,
        
      appType: 'custom',
      server: {
        middlewareMode: true,
        allowedHosts: ['wizard.mylocal'],
        hmr: hmrEnabled ? { host: hmrHost, ...(hmrPort ? { port: hmrPort } : {}) } : false,
        watch: {
          usePolling,
          interval: usePolling ? 250 : undefined,
          ignored: [
            '**/node_modules/**',
            '**/dist/**',
            '**/.git/**',
            '**/.nx/**',
          ],
        },
      },
      build: {
        outDir: path.join(workspaceRoot, 'dist', 'apps', 'fact-index'),
        emptyOutDir: true,
      },
    });

    logger.info('[serve] Vite middleware created');
    return viteServer;
  })().catch((err) => {
    logger.error('[serve] Failed to create Vite server', err);
    throw err;
  });

  // Attach a middleware that waits for Vite to exist, then delegates to Vite’s connect app
  router.use(async (req, res, next) => {
    try {
      await viteReady;
      logger.debug(`[serve] Dev middleware handling ${req.method} ${req.path}`);
      if (viteServer && viteServer.middlewares) {
        return viteServer.middlewares(req, res, next);
      }
      logger.warn('[serve] Vite server not available after ready');
      return next(new Error('Vite server not available'));
    } catch (e: unknown) {
      return next(e as Error);
    }
  });

  // SPA fallback in dev: serve index.html transformed by Vite (injects HMR client)
router.use(async (req: Request, res: Response, next: NextFunction) => {
    try {
      logger.debug(`[serve] Dev SPA request: ${req.method} ${req.path}`);
      if (req.method !== 'GET') {
        logger.debug('[serve] Dev SPA skipping non-GET');
        return next();
      }

      const acceptsHtml = (req.headers.accept ?? '').includes('text/html');
      if (!acceptsHtml) return next();

      // If the path looks like a file, let Vite/static handling deal with it
      const looksLikeFile = path.posix.basename(req.path).includes('.');
      if (looksLikeFile) return next();

      await viteReady;

      if (!viteServer) throw new Error('Vite server not available');

      logger.debug('[serve] Reading index.html for transform');
      let html = fs.readFileSync(reactIndexPath, 'utf-8');
      logger.debug('[serve] Transforming index.html via Vite');
      html = await viteServer.transformIndexHtml(req.originalUrl, html);

      logger.info(
        `[serve] Responding with transformed index for ${req.originalUrl}`,
      );
      res.status(200).setHeader('Content-Type', 'text/html').end(html);
    } catch (e: unknown) {
      // Better stack traces in dev — call if available
      if (viteServer) {
        const vs = viteServer as unknown as {
          ssrFixStacktrace?: (err: unknown) => void;
        };
        if (typeof vs.ssrFixStacktrace === 'function') {
          vs.ssrFixStacktrace(e);
        }
      }
      logger.error('[serve] Error while handling dev SPA request', { error: e instanceof Error ? e.message : String(e) });
      next(e as Error);
    }
  });
}

// --- PROD: Serve built assets + SPA fallback ---
if (!isDev) {
  if (chosenBuildDir && buildIndexPath) {
    logger.info(
      `[serve] Production mode: serving static assets from ${chosenBuildDir}`,
    );
    logger.debug(`[serve] Serving build index at ${buildIndexPath}`);

    // index:false disables auto-index; we control the SPA fallback route ourselves. :contentReference[oaicite:3]{index=3}
    router.use(
      express.static(chosenBuildDir, { index: false, fallthrough: true }),
    );

    router.use((req: Request, res: Response, next: NextFunction) => {
      logger.debug(`[serve] Prod request: ${req.method} ${req.path}`);
      if (req.method !== 'GET') return next();

      const acceptsHtml = (req.headers.accept ?? '').includes('text/html');
      if (!acceptsHtml) return next();

      const looksLikeFile = path.posix.basename(req.path).includes('.');
      if (looksLikeFile) return next();

      logger.info(`[serve] Serving built index for ${req.path}`);
      return res.sendFile(buildIndexPath);
    });
  } else {
    logger.warn(
      '[serve] Production mode: no build found (index.html missing). Static routes will 404.',
    );
  }
}

export default router;
