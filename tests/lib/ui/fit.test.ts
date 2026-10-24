import { describe, it, expect } from 'vitest';
import { fitFontSize, textWidthEm } from '$lib/ui/fit';

describe('textWidthEm', () => {
  it('counts digits and symbols wide and separators narrow', () => {
    expect(textWidthEm('$4,512.34')).toBeCloseTo(0.62 * 7 + 0.3 * 2, 5);
  });
});

describe('fitFontSize', () => {
  it('keeps the largest size when the figure fits', () => {
    expect(fitFontSize('$900', 100, 24, 12)).toBe(24);
  });
  it('shrinks a figure that would spill out of its space', () => {
    // The Big purchases donut's hole is about 100px: ~$4,500 with cents.
    const size = fitFontSize('$4,512.34', 100, 24, 12);
    expect(size).toBeLessThan(24);
    expect(textWidthEm('$4,512.34') * size).toBeLessThanOrEqual(100);
  });
  it('never goes below the smallest size', () => {
    expect(fitFontSize('$1,234,567,890.12', 60, 24, 14)).toBe(14);
  });
});
