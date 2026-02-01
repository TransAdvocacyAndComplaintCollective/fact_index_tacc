import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { setProjectAnnotations } from '@storybook/react';
import * as previewAnnotations from './preview';
import * as a11yAnnotations from '@storybook/addon-a11y/preview';
// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Extend expect with custom matchers if needed
expect.extend({});

const annotations = setProjectAnnotations([a11yAnnotations,previewAnnotations]);
