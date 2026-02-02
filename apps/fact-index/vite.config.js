/// <reference types="vitest" />

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { resolve } from 'path';

export default defineConfig(() => {
  return {
    // Nx monorepo: resolve paths from the project folder
    root: __dirname,

    // Nx monorepo: keep Vite cache in the workspace-level node_modules
    cacheDir: resolve(__dirname, '../../node_modules/.vite/apps/fact-index'),

    plugins: [
      react(),
      // Nx monorepo: support TS path aliases from tsconfig
      nxViteTsPaths(),
    ],

    base: '/',

    resolve: {
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
    },

    define: {
      __DEFINES__: JSON.stringify({}),
    },

    optimizeDeps: {},

    build: {
      // Nx monorepo: output should live under dist/apps/<app>
      outDir: resolve(__dirname, '../../dist/apps/fact-index'),
      emptyOutDir: true,
      assetsDir: 'assets',

      // Production build settings
      minify: 'esbuild',
      sourcemap: false,

      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',

          // Preserve manifest, favicon, and logo filenames
          assetFileNames: (assetInfo) => {
            const rawName = assetInfo?.name ?? '';
            const name = rawName.toLowerCase();

            if (
              name === 'manifest.json' ||
              name === 'favicon.ico' ||
              /^logo\d+\.(png|jpg|jpeg|gif|svg)$/.test(name)
            ) {
              return 'assets/[name][extname]';
            }

            return 'assets/[name]-[hash][extname]';
          },
        },
      },
    },

    server: {
      port: 4200,
      host: process.env.HOST ?? 'localhost',
      strictPort: false,      allowedHosts: ['wizard.mylocal'],
      // NOTE:
      // - If you want Nx to control HMR via the `serve` target option, don’t force it here.
      // - If you *must* disable HMR, uncomment the next line:
      // hmr: false,

      proxy: {
        '/auth': {
          target: 'http://localhost:5332',
          changeOrigin: true,
          secure: false,
        },
        '/api': {
          target: 'http://localhost:5332',
          changeOrigin: true,
          secure: false,
        },
      },
    },

    // Optional, but handy if you use `vite preview`
    // (Vite preview can also use proxy rules.)
    preview: {
      port: 4300,
      host: process.env.HOST ?? 'localhost',
      allowedHosts: ['wizard.mylocal'],
      proxy: {
        '/auth': {
          target: 'http://localhost:5332',
          changeOrigin: true,
          secure: false,
        },
        '/api': {
          target: 'http://localhost:5332',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
