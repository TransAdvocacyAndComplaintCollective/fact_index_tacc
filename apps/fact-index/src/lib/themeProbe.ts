const toLinear = (value: number) => {
  const normalized = value / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
};

export const MIN_LIGHT_DARK_MARGIN = 0.15;

export function rgbToLuminance(rgb: string) {
  const nums = rgb.match(/-?\d+\.?\d*/g)?.map(Number);
  if (!nums || nums.length < 3) throw new Error(`Unexpected color: ${rgb}`);
  const [r, g, b] = nums.slice(0, 3);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function getBodyLuminances() {
  const styles = getComputedStyle(document.body);
  const bgLum = rgbToLuminance(styles.backgroundColor);
  const fgLum = rgbToLuminance(styles.color);
  return { bgLum, fgLum, average: (bgLum + fgLum) / 2 };
}
