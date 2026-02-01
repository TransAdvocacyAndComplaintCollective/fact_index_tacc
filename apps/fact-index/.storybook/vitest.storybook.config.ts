import { defineConfig, mergeConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import viteConfig from './vite.config';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const sbConfigDir = path.join(dirname, '.storybook');

const baseStorybookProject = (name: string, setupFile: string) => ({
  extends: true,
  plugins: [
    storybookTest({
      configDir: sbConfigDir,
      storybookScript: 'pnpm storybook --no-open',
      // Optional: if you rely on tags, keep this.
      // By default, the plugin runs stories with the `test` tag. :contentReference[oaicite:3]{index=3}
      // tags: { include: ['test'] },
    }),
  ],
  test: {
    name,
    browser: {
      enabled: true,
      provider: playwright({}),
      headless: true,
      instances: [{ browser: 'chromium' as const }],
    },
    setupFiles: [setupFile],
  },
});

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        baseStorybookProject('storybook:light', './.storybook/vitest.light.setup.ts'),
        baseStorybookProject('storybook:dark', './.storybook/vitest.dark.setup.ts'),
      ],
    },
  })
);
