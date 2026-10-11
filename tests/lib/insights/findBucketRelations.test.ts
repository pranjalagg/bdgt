import { describe, it, expect } from 'vitest';
import { findBucketRelations, countComparablePairs } from '$lib/insights';
import type { Bucket } from '$lib/types';

const NOW = new Date(2026, 9, 15); // October 2026; window ends September

const bucket = (id: string, over: Partial<Bucket> = {}): Bucket => ({
  id, name: id, color: '#000', order: 0, isDefault: false, allocationType: 'fixed',
  fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: true,
  createdAt: new Date(2000, 0, 1), ...over,
});

// One transaction per month per bucket, in dollars, for months starting at
// `startMonth` (0-based month of 2026).
function series(bucketId: string, startMonth: number, dollars: number[]) {
  return dollars.map((d, i) => ({
    bucketId, amount: Math.round(d * 100), date: new Date(2026, startMonth + i, 5),
  }));
}

describe('findBucketRelations', () => {
  it('finds a clear trade-off with a steadier-together figure', () => {
    // Apr..Sep (months 3..8): one goes up while the other goes down
    const tx = [...series('g', 3, [50, 60, 70, 80, 90, 100]), ...series('e', 3, [300, 260, 220, 180, 140, 100])];
    const [r] = findBucketRelations([bucket('g'), bucket('e')], tx, NOW);
    expect(r.relation).toBe('trade-off');
    expect(r.rho).toBeCloseTo(-1, 6);
    expect(r.confidence).toBe('early');
    expect(r.months).toBe(6);
    expect(r.steadierBy).not.toBeNull();
    expect(r.series.months[0]).toBe('2026-04');
    expect(r.series.a).toHaveLength(6);
  });

  it('finds buckets that rise together', () => {
    const tx = [...series('a', 3, [10, 20, 30, 40, 50, 60]), ...series('b', 3, [15, 22, 33, 41, 55, 70])];
    const [r] = findBucketRelations([bucket('a'), bucket('b')], tx, NOW);
    expect(r.relation).toBe('move-together');
    expect(r.steadierBy).toBeNull();
  });

  it('marks a weak lean as watching (the six-month grocery/eating-out shape)', () => {
    const tx = [
      ...series('g', 3, [74, 320, 294, 236, 229, 69]),
      ...series('e', 3, [304, 336, 78, 347, 83, 580]),
    ];
    const [r] = findBucketRelations([bucket('g', { name: 'Groceries' }), bucket('e', { name: 'Eating Out' })], tx, NOW);
    expect(r.confidence).toBe('watching');
    expect(r.relation).toBe('trade-off');
    expect(r.rho).toBeCloseTo(-0.371, 2);
  });

  it('shows that shape is fragile: dropping September alone erases the pattern', () => {
    const g = [74, 320, 294, 236, 229]; // Apr..Aug, September removed
    const e = [304, 336, 78, 347, 83];
    const tx = [...series('g', 3, g), ...series('e', 3, e)];
    // rank correlation turns slightly positive (about +0.1), below the 0.3 floor
    // now is mid-September, so the window ends in August
    const septemberNow = new Date(2026, 8, 15);
    expect(findBucketRelations([bucket('g'), bucket('e')], tx, septemberNow)).toEqual([]);
  });

  it('is not swung by one huge outlier month', () => {
    const tx = [
      ...series('a', 3, [10, 20, 30, 40, 50, 60]),
      ...series('b', 3, [12, 19, 33, 38, 52, 9000]),
    ];
    const [r] = findBucketRelations([bucket('a'), bucket('b')], tx, NOW);
    expect(r.rho).toBeCloseTo(1, 6);
  });

  it('treats a net-negative month as a negative total', () => {
    const tx = [
      ...series('a', 3, [10, 20, 30, 40, 50, 60]),
      ...series('b', 3, [60, 50, 40, 30, 20, -15]),
    ];
    const [r] = findBucketRelations([bucket('a'), bucket('b')], tx, NOW);
    expect(r.series.b[5]).toBe(-1500);
    expect(r.rho).toBeCloseTo(-1, 6);
  });

  it('compares a late-added bucket only over the months it existed', () => {
    // b starts in June (month 5): window for the pair is Jun..Sep = 4 months
    const tx = [
      ...series('a', 3, [10, 20, 30, 40, 50, 60]),
      ...series('b', 5, [60, 40, 20, 5]),
    ];
    const [r] = findBucketRelations([bucket('a'), bucket('b')], tx, NOW);
    expect(r.months).toBe(4);
    expect(r.series.months[0]).toBe('2026-06');
    expect(r.series.b).toEqual([6000, 4000, 2000, 500]);
  });

  it('excludes savings, system, and non-everyday buckets', () => {
    const tx = [
      ...series('a', 3, [10, 20, 30, 40, 50, 60]),
      ...series('s', 3, [60, 50, 40, 30, 20, 10]),
      ...series('u', 3, [60, 50, 40, 30, 20, 10]),
      ...series('r', 3, [60, 50, 40, 30, 20, 10]),
    ];
    const buckets = [
      bucket('a'),
      bucket('s', { isSavings: true }),
      bucket('u', { isSystem: true }),
      bucket('r', { isEveryday: false }),
    ];
    expect(findBucketRelations(buckets, tx, NOW)).toEqual([]);
    expect(countComparablePairs(buckets, tx, NOW)).toBe(0);
  });

  it('ignores a bucket active in fewer than 4 window months', () => {
    const tx = [...series('a', 3, [10, 20, 30, 40, 50, 60]), ...series('b', 6, [5, 6, 7])];
    expect(findBucketRelations([bucket('a'), bucket('b')], tx, NOW)).toEqual([]);
    expect(countComparablePairs([bucket('a'), bucket('b')], tx, NOW)).toBe(0);
  });

  it('skips a constant series without throwing', () => {
    const tx = [...series('a', 3, [50, 50, 50, 50, 50, 50]), ...series('b', 3, [1, 2, 3, 4, 5, 6])];
    expect(findBucketRelations([bucket('a'), bucket('b')], tx, NOW)).toEqual([]);
    expect(countComparablePairs([bucket('a'), bucket('b')], tx, NOW)).toBe(1);
  });

  it('ignores the current partial month', () => {
    const tx = [
      ...series('a', 3, [10, 20, 30, 40, 50, 60, 5000]), // 7th value lands in October
      ...series('b', 3, [60, 50, 40, 30, 20, 10, 5000]),
    ];
    const [r] = findBucketRelations([bucket('a'), bucket('b')], tx, NOW);
    expect(r.months).toBe(6);
    expect(r.series.months[5]).toBe('2026-09');
  });

  it('does not let one stray transaction make a sparse bucket look related', () => {
    // a: active Oct-Jan 2025/26 (eligible on its own), then one $5 in June.
    // b: starts in Feb. Within the pair's months a has a single nonzero month.
    const a = [
      { bucketId: 'a', amount: 5000, date: new Date(2025, 9, 5) },
      { bucketId: 'a', amount: 5000, date: new Date(2025, 10, 5) },
      { bucketId: 'a', amount: 5000, date: new Date(2025, 11, 5) },
      { bucketId: 'a', amount: 5000, date: new Date(2026, 0, 5) },
      { bucketId: 'a', amount: 500, date: new Date(2026, 5, 5) },
    ];
    const tx = [...a, ...series('b', 1, [10, 20, 30, 40, 50, 60, 70, 80])];
    expect(findBucketRelations([bucket('a'), bucket('b')], tx, NOW)).toEqual([]);
    expect(countComparablePairs([bucket('a'), bucket('b')], tx, NOW)).toBe(0);
  });

  it('stops comparing once a bucket is abandoned instead of counting empty months as low', () => {
    // a: used Oct 2025 - Mar 2026 then abandoned; b ramps up from April.
    const a = [
      { bucketId: 'a', amount: 9000, date: new Date(2025, 9, 5) },
      { bucketId: 'a', amount: 8000, date: new Date(2025, 10, 5) },
      { bucketId: 'a', amount: 9500, date: new Date(2025, 11, 5) },
      { bucketId: 'a', amount: 7000, date: new Date(2026, 0, 5) },
      { bucketId: 'a', amount: 8500, date: new Date(2026, 1, 5) },
      { bucketId: 'a', amount: 8200, date: new Date(2026, 2, 5) },
    ];
    const b = [
      ...series('b', 0, [10, 12, 11]), // Jan-Mar
      ...series('b', 3, [60, 70, 80, 90, 100, 110]), // Apr-Sep
    ];
    const bPre = [
      { bucketId: 'b', amount: 1000, date: new Date(2025, 9, 9) },
      { bucketId: 'b', amount: 1100, date: new Date(2025, 10, 9) },
      { bucketId: 'b', amount: 1200, date: new Date(2025, 11, 9) },
    ];
    const out = findBucketRelations([bucket('a'), bucket('b')], [...a, ...bPre, ...b], NOW);
    // the pair must end where a ends (2026-03), never reach the empty months
    for (const r of out) expect(r.series.months.at(-1)! <= '2026-03').toBe(true);
    expect(out.some((r) => r.confidence === 'strong' && r.relation === 'trade-off')).toBe(false);
  });

  it('returns nothing for no data or no buckets', () => {
    expect(findBucketRelations([], [], NOW)).toEqual([]);
    expect(findBucketRelations([bucket('a'), bucket('b')], [], NOW)).toEqual([]);
    expect(countComparablePairs([], [], NOW)).toBe(0);
  });

  it('ranks by strength, then months, and orders buckets by their order field', () => {
    const tx = [
      ...series('a', 3, [10, 20, 30, 40, 50, 60]),
      ...series('b', 3, [60, 50, 40, 30, 20, 10]),
      ...series('c', 3, [10, 22, 29, 41, 49, 70]),
    ];
    const buckets = [bucket('a', { order: 0 }), bucket('b', { order: 1 }), bucket('c', { order: 2 })];
    const out = findBucketRelations(buckets, tx, NOW);
    expect(out.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < out.length; i++) {
      expect(Math.abs(out[i - 1].rho)).toBeGreaterThanOrEqual(Math.abs(out[i].rho) - 1e-9);
    }
    expect(buckets.findIndex((x) => x.id === out[0].a.id)).toBeLessThan(buckets.findIndex((x) => x.id === out[0].b.id));
  });
});
