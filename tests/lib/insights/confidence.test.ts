import { describe, it, expect } from 'vitest';
import { classify } from '$lib/insights/confidence';

describe('classify', () => {
  it('returns null under 4 months, whatever the strength', () => {
    expect(classify(3, 0.99)).toBeNull();
  });

  it('is early for 4-7 months at 0.5 or more', () => {
    expect(classify(4, 0.5)).toBe('early');
    expect(classify(7, 0.9)).toBe('early');
  });

  it('is likely for 8-11 months at 0.6 or more', () => {
    expect(classify(8, 0.6)).toBe('likely');
    expect(classify(11, 0.8)).toBe('likely');
  });

  it('is strong for 12 months or more at 0.6 or more', () => {
    expect(classify(12, 0.6)).toBe('strong');
    expect(classify(24, 0.7)).toBe('strong');
  });

  it('is watching between 0.3 and the tier cutoff', () => {
    expect(classify(6, 0.37)).toBe('watching');
    expect(classify(6, 0.49)).toBe('watching');
    expect(classify(9, 0.59)).toBe('watching');
    expect(classify(12, 0.3)).toBe('watching');
  });

  it('is null below 0.3', () => {
    expect(classify(6, 0.29)).toBeNull();
    expect(classify(12, 0)).toBeNull();
  });
});
