import { setProjectAnnotations } from '@storybook/react';
import * as preview from './preview';

// Apply your normal preview annotations, but force dark for this test project
setProjectAnnotations([
  preview,
  { initialGlobals: { ...(preview as any).initialGlobals, theme: 'dark' } },
]);
