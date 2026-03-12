/// <reference types="vitest" />

import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { resolve } from 'path';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Nx monorepo: resolve paths from the project folder
  root: dirname,

  // Nx monorepo: keep Vite cache in the workspace-level node_modules
  cacheDir: resolve(dirname, '../../node_modules/.vite/apps/fact-index'),

  plugins: [
    react(),
    // Nx monorepo: support TS path aliases from tsconfig
    nxViteTsPaths(),
  ],

  resolve: {
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
  },

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
    include: ['**/?(*.)+(spec|test).[jt]s?(x)'],
    exclude: ['**/*.stories.test.[jt]s?(x)', 'node_modules', 'dist'],
  },
});
