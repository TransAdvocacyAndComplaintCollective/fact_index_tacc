// ThemeContract.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { expect, within, waitFor } from 'storybook/test';
import { rgbToLuminance, getBodyLuminances } from '../lib/themeProbe';

const ThemeProbe = () => (
  <div
    data-testid="probe"
    style={{
      padding: 16,
      borderRadius: 12,
      background: 'var(--mantine-color-body)',
      color: 'var(--mantine-color-text)',
    }}
  >
    Theme probe
  </div>
);

const meta = {
  title: 'test/ThemeContract',
  component: ThemeProbe,
  tags: ['test'],
  parameters: {
    // optional if you already have this globally in preview.ts
    a11y: { test: 'error' },
  },
} satisfies Meta<typeof ThemeProbe>;

export default meta;
type Story = StoryObj<typeof meta>;

async function averageSentinelScreenshotLuminance(testId: string): Promise<number | undefined> {
  const pageContext = (globalThis as any).page;
  if (!pageContext?.getByTestId) {
    console.warn('Playwright page object is not available for screenshot-based luminance checks.');
    return undefined;
  }

  const screenshotResult = await pageContext.getByTestId(testId).screenshot({ type: 'png' });
  const arrayBuffer =
    screenshotResult instanceof ArrayBuffer
      ? screenshotResult
      : screenshotResult instanceof Uint8Array
      ? screenshotResult.buffer
      : new Uint8Array(screenshotResult as ArrayBufferLike).buffer;

  const blob = new Blob([arrayBuffer], { type: 'image/png' });
  const bitmap = await createImageBitmap(blob);

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to acquire 2D rendering context for luminance check.');
  }

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  let total = 0;
  const data = imageData.data;
  const pixelCount = data.length / 4;
  for (let offset = 0; offset < data.length; offset += 4) {
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    total += 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  }

  return total / pixelCount;
}

export const Light: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await waitFor(() =>
      expect(
        document.documentElement.getAttribute('data-mantine-color-scheme')
      ).toBe('light')
    );

    const probe = canvas.getByTestId('probe') as HTMLElement;
    const styles = getComputedStyle(probe);

    const bg = styles.backgroundColor;
    const fg = styles.color;

    // Contract: light mode => background luminance > text luminance
    await expect(rgbToLuminance(bg)).toBeGreaterThan(rgbToLuminance(fg));

    const { bgLum, fgLum, average } = getBodyLuminances();
    await expect(bgLum).toBeGreaterThan(fgLum);

    const lightAverage = average;
    await expect(lightAverage).toBeGreaterThan(0.4);

    const screenshotLum = await averageSentinelScreenshotLuminance('probe');
    if (screenshotLum != null) {
      await expect(screenshotLum).not.toBeNaN();
      await expect(screenshotLum).toBeGreaterThan(fgLum);
    }
  },
};

export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await waitFor(() =>
      expect(
        document.documentElement.getAttribute('data-mantine-color-scheme')
      ).toBe('dark')
    );

    const probe = canvas.getByTestId('probe') as HTMLElement;
    const styles = getComputedStyle(probe);

    const bg = styles.backgroundColor;
    const fg = styles.color;

    // Contract: dark mode => background luminance < text luminance
    await expect(rgbToLuminance(bg)).toBeLessThan(rgbToLuminance(fg));

    const { bgLum, fgLum, average } = getBodyLuminances();
    await expect(bgLum).toBeLessThan(fgLum);

    const darkAverage = average;
    await expect(darkAverage).toBeLessThan(0.5);

    const screenshotLum = await averageSentinelScreenshotLuminance('probe');
    if (screenshotLum != null) {
      await expect(screenshotLum).not.toBeNaN();
      await expect(screenshotLum).toBeLessThan(fgLum);
    }
  },
};
function toLinear(g: number) {
  throw new Error('Function not implemented.');
}

