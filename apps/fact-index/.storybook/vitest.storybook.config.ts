import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestProjectConfiguration } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const configDirAbs = path.resolve(dirname);

// Storybook UI filters by: `storybook:${process.env.STORYBOOK_CONFIG_DIR}`
// The absolute path to this .storybook directory must match exactly
const storybookProjectName = `storybook:${configDirAbs}`;

const baseStorybookProject = (setupFile: string): TestProjectConfiguration => {
  return {
    extends: true as const,
    plugins: [
      storybookTest({
        configDir: configDirAbs,
        storybookScript: 'pnpm storybook --no-open',
      }),
    ],
    test: {
      name: storybookProjectName,
      browser: {
        enabled: true,
        provider: playwright({}),
        headless: true,
        instances: [{ browser: 'chromium' as const }],
      },
      setupFiles: [setupFile],
    },
  };
};

export default defineConfig({
  test: {
    projects: [
      baseStorybookProject('./.storybook/vitest.setup.ts'),
    ],
  },
});
