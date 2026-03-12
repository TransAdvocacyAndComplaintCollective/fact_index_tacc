/// <reference types="vitest" />

import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
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
    storybookTest({
      configDir: path.join(dirname, '.storybook'),
      storybookScript: 'pnpm run storybook --no-open',
    }),
  ],

  resolve: {
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
  },

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./.storybook/vitest.setup.ts'],
    exclude: ['node_modules', 'dist'],
    browser: {
      enabled: true,
      provider: playwright({}),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
});
