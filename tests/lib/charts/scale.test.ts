import { describe, it, expect } from 'vitest';
import { barCap, heightsFrom, linear, linePath, donutSegments } from '$lib/charts/scale';

describe('barCap', () => {
  it('caps an outlier (rent) at the second-largest bar times 1.3', () => {
    expect(barCap([180000, 12410, 9105])).toBe(16133);
  });
  it('otherwise leaves 8% headroom over the largest', () => {
    expect(barCap([100, 90])).toBe(108);
  });
  it('is 1 when nothing is positive', () => {
    expect(barCap([0, -500])).toBe(1);
    expect(barCap([])).toBe(1);
  });
});

describe('heightsFrom', () => {
  it('turns values into 0..1 heights, negatives at 0 and capped ones at 1', () => {
    expect(heightsFrom([-50, 54, 200], 108)).toEqual([0, 0.5, 1]);
  });
});

describe('linear', () => {
  it('maps a domain onto a range', () => {
    const y = linear([0, 100], [200, 0]);
    expect(y(0)).toBe(200);
    expect(y(25)).toBe(150);
  });
});

describe('linePath', () => {
  it('draws straight segments through the points', () => {
    expect(linePath([[0, 10], [5, 7.25]])).toBe('M0 10 L5 7.25');
  });
});

describe('donutSegments', () => {
  it('splits the circle by share with a gap between slices', () => {
    expect(donutSegments([3, 1], 100, 2)).toEqual([{ length: 73, offset: 0 }, { length: 23, offset: -75 }]);
  });
  it('a single slice gets no gap', () => {
    expect(donutSegments([5, 0], 100, 2)).toEqual([{ length: 100, offset: 0 }, { length: 0, offset: -100 }]);
  });
});
