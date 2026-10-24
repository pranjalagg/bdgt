import { describe, it, expect } from 'vitest';
import { highlightIndex } from '$lib/charts/highlight';

const days = (n: number, set: Record<number, number>) => Array.from({ length: n }, (_, i) => set[i] ?? 0);

describe('highlightIndex', () => {
  it('is the bar under the finger while scrubbing', () => {
    expect(highlightIndex([1, 2, 3, 4, 5, 6], 2, null)).toBe(2);
  });
  it('is the latest day with spending so far in a month still going', () => {
    // Today (index 22) has nothing yet; the 21st (index 20) does.
    expect(highlightIndex(days(31, { 3: 500, 20: 645 }), -1, 23)).toBe(20);
  });
  it('is the last bar with a value otherwise', () => {
    expect(highlightIndex([4, 5, 6, 7, 8, 9], -1, null)).toBe(5);
    expect(highlightIndex([4, 5, 0], -1, null)).toBe(1);
  });
  it('is none for an empty chart or one with nothing in it', () => {
    expect(highlightIndex([], -1, null)).toBe(-1);
    expect(highlightIndex([3, 4], -1, 0)).toBe(-1);
    expect(highlightIndex([0, 0, 0], -1, null)).toBe(-1);
  });
});
