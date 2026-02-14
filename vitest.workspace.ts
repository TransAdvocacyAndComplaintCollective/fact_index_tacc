import { defineWorkspace } from 'vitest/workspace';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineWorkspace([
  path.join(dir, 'apps/fact-index/vitest.config.ts'),
  path.join(dir, 'apps/fact-index/.storybook/vitest.storybook.config.ts'),
]);