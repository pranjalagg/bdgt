import { describe, it, expect } from 'vitest';
import { rankWithTies, pearson, spearman, steadierBy } from '$lib/insights/relations';

describe('rankWithTies', () => {
  it('ranks ascending from 1', () => {
    expect(rankWithTies([30, 10, 20])).toEqual([3, 1, 2]);
  });

  it('gives tied values the average rank', () => {
    expect(rankWithTies([5, 5, 9, 1])).toEqual([2.5, 2.5, 4, 1]);
  });
});

describe('pearson', () => {
  it('is 1 for a perfect line and -1 for a perfect inverse', () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10);
    expect(pearson([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1, 10);
  });

  it('is null when a series is constant', () => {
    expect(pearson([1, 2, 3], [4, 4, 4])).toBeNull();
  });
});

describe('spearman', () => {
  it('is 1 for any strictly increasing relationship, even a nonlinear one', () => {
    expect(spearman([1, 2, 3, 4], [1, 10, 100, 100000])).toBeCloseTo(1, 10);
  });

  it('is -1 for a strictly decreasing one', () => {
    expect(spearman([1, 2, 3, 4], [9, 7, 3, 0])).toBeCloseTo(-1, 10);
  });

  it('is null for a constant series', () => {
    expect(spearman([5, 5, 5, 5], [1, 2, 3, 4])).toBeNull();
  });

  it('matches the hand-computed value for the six-month grocery/eating-out shape', () => {
    const groceries = [74, 320, 294, 236, 229, 69];
    const eatingOut = [304, 336, 78, 347, 83, 580];
    expect(spearman(groceries, eatingOut)).toBeCloseTo(-0.3714, 3);
  });

  it('is not flipped by one huge outlier month', () => {
    const base = spearman([10, 20, 30, 40, 50], [11, 19, 33, 38, 52]);
    const withOutlier = spearman([10, 20, 30, 40, 5000], [11, 19, 33, 38, 52]);
    expect(base).toBeCloseTo(1, 10);
    expect(withOutlier).toBeCloseTo(1, 10);
  });
});

describe('steadierBy', () => {
  it('is large when two series offset each other exactly', () => {
    // combined is constant -> spread 0 -> 100% steadier
    expect(steadierBy([10, 20, 30], [30, 20, 10])).toBe(100);
  });

  it('is null when they move together (combined is more volatile)', () => {
    expect(steadierBy([10, 20, 30], [10, 20, 30])).toBeNull();
  });

  it('is about 0 for independent-looking series', () => {
    expect(steadierBy([1, 2, 1, 2], [1, 1, 2, 2])).toBeNull();
  });

  it('is null when both series are constant', () => {
    expect(steadierBy([4, 4, 4], [7, 7, 7])).toBeNull();
  });

  it('gives roughly 29% for the six-month grocery/eating-out shape', () => {
    const groceries = [74, 320, 294, 236, 229, 69];
    const eatingOut = [304, 336, 78, 347, 83, 580];
    expect(steadierBy(groceries, eatingOut)).toBe(29);
  });
});
