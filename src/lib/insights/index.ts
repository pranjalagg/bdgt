import type { Bucket } from '$lib/types';
import { classify, type Confidence } from './confidence';
import { completeMonths, monthlyTotals } from './monthlySeries';
import { spearman, steadierBy } from './relations';

export interface BucketRef {
  id: string;
  name: string;
  color: string;
}

export interface BucketRelation {
  a: BucketRef;
  b: BucketRef;
  months: number;
  rho: number;
  relation: 'trade-off' | 'move-together';
  steadierBy: number | null; // percent; only for trade-offs
  confidence: Confidence;
  series: { months: string[]; a: number[]; b: number[] }; // cents, one per month
}

type Tx = { bucketId: string; amount: number; date: Date | string };

const MIN_MONTHS = 4;

interface Comparable {
  a: Bucket;
  b: Bucket;
  months: string[];
  aSeries: number[];
  bSeries: number[];
}

// Every pair of eligible buckets with at least MIN_MONTHS comparable months,
// regardless of how strongly they relate.
function comparablePairs(buckets: Bucket[], transactions: Tx[], now: Date): Comparable[] {
  const window = completeMonths(now);
  const inWindow = new Set(window);
  const totals = monthlyTotals(transactions);

  // Months in the window where the bucket has a nonzero total.
  const activeMonths = (id: string) =>
    window.filter((m) => (totals.get(id)?.get(m) ?? 0) !== 0);

  const eligible = buckets
    .filter((b) => !b.isSavings && !b.isSystem && b.isEveryday)
    .filter((b) => activeMonths(b.id).length >= MIN_MONTHS);

  // First window month in which the bucket has any transaction.
  const firstMonth = (id: string) =>
    window.find((m) => totals.get(id)?.has(m) && inWindow.has(m));

  const pairs: Comparable[] = [];
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const [a, b] = eligible[i].order <= eligible[j].order ? [eligible[i], eligible[j]] : [eligible[j], eligible[i]];
      const startA = firstMonth(a.id);
      const startB = firstMonth(b.id);
      if (!startA || !startB) continue;
      const start = startA > startB ? startA : startB;
      // A bucket that stopped being used has no more months to compare, so the
      // pair ends at the earlier of the two last active months. Otherwise the
      // empty months after it would read as genuinely low spending.
      const lastA = activeMonths(a.id).at(-1)!;
      const lastB = activeMonths(b.id).at(-1)!;
      const end = lastA < lastB ? lastA : lastB;
      const months = window.filter((m) => m >= start && m <= end);
      if (months.length < MIN_MONTHS) continue;
      // Each bucket must be active in enough of the pair's own months; a few
      // stray transactions elsewhere in the window do not count.
      const activeIn = (id: string) => months.filter((m) => (totals.get(id)?.get(m) ?? 0) !== 0).length;
      if (activeIn(a.id) < MIN_MONTHS || activeIn(b.id) < MIN_MONTHS) continue;
      pairs.push({
        a,
        b,
        months,
        aSeries: months.map((m) => totals.get(a.id)?.get(m) ?? 0),
        bSeries: months.map((m) => totals.get(b.id)?.get(m) ?? 0),
      });
    }
  }
  return pairs;
}

export function countComparablePairs(buckets: Bucket[], transactions: Tx[], now: Date = new Date()): number {
  return comparablePairs(buckets, transactions, now).length;
}

const ref = (b: Bucket): BucketRef => ({ id: b.id, name: b.name, color: b.color });

export function findBucketRelations(
  buckets: Bucket[],
  transactions: Tx[],
  now: Date = new Date()
): BucketRelation[] {
  const results: BucketRelation[] = [];

  for (const p of comparablePairs(buckets, transactions, now)) {
    const rho = spearman(p.aSeries, p.bSeries);
    if (rho === null) continue;
    const confidence = classify(p.months.length, Math.abs(rho));
    if (confidence === null) continue;

    const relation = rho < 0 ? 'trade-off' : 'move-together';
    results.push({
      a: ref(p.a),
      b: ref(p.b),
      months: p.months.length,
      rho,
      relation,
      steadierBy: relation === 'trade-off' ? steadierBy(p.aSeries, p.bSeries) : null,
      confidence,
      series: { months: p.months, a: p.aSeries, b: p.bSeries },
    });
  }

  return results.sort(
    (x, y) =>
      Math.abs(y.rho) - Math.abs(x.rho) ||
      y.months - x.months ||
      x.a.name.localeCompare(y.a.name) ||
      x.b.name.localeCompare(y.b.name)
  );
}
