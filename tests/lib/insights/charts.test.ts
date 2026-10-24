import { describe, it, expect } from 'vitest';
import { isTrendChart, TREND_CHARTS } from '$lib/insights/charts';

describe('trend chart pages', () => {
  it('knows the four charts', () => {
    expect(TREND_CHARTS).toEqual(['spending', 'income', 'envelopes', 'savings-rate']);
    for (const c of TREND_CHARTS) expect(isTrendChart(c)).toBe(true);
  });
  it('turns anything else away', () => {
    expect(isTrendChart('investments')).toBe(false);
    expect(isTrendChart('constructor')).toBe(false);
    expect(isTrendChart('')).toBe(false);
  });
});
