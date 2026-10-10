# Bucket Pattern Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect which everyday buckets trade off or move together from monthly totals, and show the findings (with honest confidence labels) on the Insights page.

**Architecture:** A pure-function engine in `src/lib/insights/` (monthly series, rank correlation, steadier-together measure, confidence tiers) feeds one Svelte card on the Insights page. Nothing is stored; results are recomputed from the existing `buckets` and `transactions` stores.

**Tech Stack:** SvelteKit 5 + TypeScript, Vitest, Chart.js via the existing `BarChart` component. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-10-bucket-pattern-insights-design.md`

## Global Constraints

- Money is integer cents everywhere; month keys are `YYYY-MM`.
- No new dependencies. No server. Nothing is persisted.
- Only monthly totals are used. Never rely on dates inside a month (the user batch-logs).
- Window is the last 12 complete months before `now`'s month; the current partial month is excluded.
- Eligible buckets: not `isSavings`, not `isSystem`, `isEveryday` true, with a nonzero total in at least 4 window months.
- A pair is compared only from the later of the two buckets' first active months in the window; it needs at least 4 months.
- Confidence tiers: early = 4-7 months and |rho| >= 0.5; likely = 8-11 months and |rho| >= 0.6; strong = 12+ months and |rho| >= 0.6; watching = 4+ months, |rho| >= 0.3 and below that tier's cutoff; below 0.3 or under 4 months = not returned.
- Copy rules: say "tends to", never "causes"; always name the number of months; no dollar amounts in insight text (hide-amounts must keep working).
- Commits: use `git commit --no-gpg-sign`, no Co-Authored-By line (user's standing preference). Work on branch `feat/bucket-pattern-insights`.

## Review Focus

- **One huge one-off month** (e.g. a $1,780 payment) must not create or flip a relationship: rank correlation is used, so a test pins that the outlier changes the result no more than any other single month would (Task 4).
- **Net-negative months** (refunds exceeding spend in a bucket) must be handled as negative totals, not clamped or dropped (Task 1).
- **A bucket added late** is compared only over the months it existed, and never with zero-filled months before it started (Task 4).
- **Month boundary:** when `now` is the 1st of a month, the month just ended counts as complete and the new month is excluded (Task 1).
- **No data / nothing eligible:** returns `[]` and a comparable-pair count of 0, so the UI shows the right empty state instead of an error (Task 4, Task 5).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/insights/monthlySeries.ts` | Window of complete months; bucket x month totals |
| `src/lib/insights/relations.ts` | Rank-with-ties, Pearson, Spearman, steadier-together |
| `src/lib/insights/confidence.ts` | `classify(months, absRho)` into a tier or null |
| `src/lib/insights/index.ts` | `findBucketRelations`, `countComparablePairs`, `BucketRelation` type |
| `src/lib/insights/copy.ts` | Sentences and labels (pure, testable) |
| `src/lib/components/insights/PatternInsights.svelte` | The Insights-page card |
| `src/routes/analytics/+page.svelte` | Mount the card (modify) |
| `tests/lib/insights/*.test.ts` | One test file per module above (except the component) |

---

### Task 1: Monthly series

**Files:**
- Create: `src/lib/insights/monthlySeries.ts`
- Test: `tests/lib/insights/monthlySeries.test.ts`

**Interfaces:**
- Produces: `WINDOW_MONTHS = 12`; `completeMonths(now: Date, count?: number): string[]` (oldest first); `monthlyTotals(transactions: { bucketId: string; amount: number; date: Date | string }[]): Map<string, Map<string, number>>` (bucketId -> month -> cents, refunds negative).

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/insights/monthlySeries.test.ts
import { describe, it, expect } from 'vitest';
import { completeMonths, monthlyTotals, WINDOW_MONTHS } from '$lib/insights/monthlySeries';

describe('completeMonths', () => {
  it('returns the months before now, oldest first, excluding the current month', () => {
    expect(completeMonths(new Date(2026, 9, 15), 3)).toEqual(['2026-07', '2026-08', '2026-09']);
  });

  it('counts the month just ended as complete on the 1st of a month', () => {
    expect(completeMonths(new Date(2026, 9, 1), 2)).toEqual(['2026-08', '2026-09']);
  });

  it('defaults to the 12-month window and crosses a year boundary', () => {
    const months = completeMonths(new Date(2026, 1, 10));
    expect(months).toHaveLength(WINDOW_MONTHS);
    expect(months[0]).toBe('2025-02');
    expect(months[11]).toBe('2026-01');
  });
});

describe('monthlyTotals', () => {
  it('sums per bucket per month in cents', () => {
    const totals = monthlyTotals([
      { bucketId: 'a', amount: 1000, date: new Date(2026, 7, 3) },
      { bucketId: 'a', amount: 250, date: new Date(2026, 7, 20) },
      { bucketId: 'a', amount: 400, date: new Date(2026, 8, 1) },
      { bucketId: 'b', amount: 99, date: new Date(2026, 8, 5) },
    ]);
    expect(totals.get('a')?.get('2026-08')).toBe(1250);
    expect(totals.get('a')?.get('2026-09')).toBe(400);
    expect(totals.get('b')?.get('2026-09')).toBe(99);
  });

  it('keeps refunds as negative totals, including a net-negative month', () => {
    const totals = monthlyTotals([
      { bucketId: 'a', amount: 300, date: new Date(2026, 7, 3) },
      { bucketId: 'a', amount: -800, date: new Date(2026, 7, 9) },
    ]);
    expect(totals.get('a')?.get('2026-08')).toBe(-500);
  });

  it('accepts ISO date strings', () => {
    const totals = monthlyTotals([{ bucketId: 'a', amount: 5, date: '2026-08-15T12:00:00.000Z' }]);
    expect(totals.get('a')?.get('2026-08')).toBe(5);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lib/insights/monthlySeries.test.ts`
Expected: FAIL (cannot resolve `$lib/insights/monthlySeries`).

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/insights/monthlySeries.ts
import { getMonthKey, getPreviousMonthKey } from '$lib/utils/dates';

export const WINDOW_MONTHS = 12;

// The last `count` complete months before `now`'s month, oldest first. The
// current month is partial, so it never counts.
export function completeMonths(now: Date, count: number = WINDOW_MONTHS): string[] {
  const months: string[] = [];
  let month = getPreviousMonthKey(getMonthKey(now));
  for (let i = 0; i < count; i++) {
    months.unshift(month);
    month = getPreviousMonthKey(month);
  }
  return months;
}

// bucketId -> month -> cents. Refunds stay negative; a net-negative month is
// real information, not something to clamp.
export function monthlyTotals(
  transactions: { bucketId: string; amount: number; date: Date | string }[]
): Map<string, Map<string, number>> {
  const totals = new Map<string, Map<string, number>>();
  for (const t of transactions) {
    const month = getMonthKey(new Date(t.date));
    let perMonth = totals.get(t.bucketId);
    if (!perMonth) totals.set(t.bucketId, (perMonth = new Map()));
    perMonth.set(month, (perMonth.get(month) ?? 0) + t.amount);
  }
  return totals;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/lib/insights/monthlySeries.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/insights/monthlySeries.ts tests/lib/insights/monthlySeries.test.ts
git commit --no-gpg-sign -m "feat(insights): monthly bucket totals over complete months"
```

---

### Task 2: Relation measures

**Files:**
- Create: `src/lib/insights/relations.ts`
- Test: `tests/lib/insights/relations.test.ts`

**Interfaces:**
- Produces: `rankWithTies(values: number[]): number[]`; `pearson(x: number[], y: number[]): number | null`; `spearman(x: number[], y: number[]): number | null` (null when either series has no variation); `steadierBy(x: number[], y: number[]): number | null` (whole percent steadier than independent, null unless it rounds to at least 1).

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/insights/relations.test.ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lib/insights/relations.test.ts`
Expected: FAIL (cannot resolve `$lib/insights/relations`).

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/insights/relations.ts

// Ascending ranks starting at 1; tied values share the average of the ranks
// they span.
export function rankWithTies(values: number[]): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const average = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[order[k][1]] = average;
    i = j + 1;
  }
  return ranks;
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// Population standard deviation.
function sd(values: number[]): number {
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length);
}

export function pearson(x: number[], y: number[]): number | null {
  const mx = mean(x);
  const my = mean(y);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < x.length; i++) {
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
    sxy += (x[i] - mx) * (y[i] - my);
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

// Rank correlation: compares which months were high or low, not by how much,
// so one-off spikes cannot dominate. Null when either series is constant.
export function spearman(x: number[], y: number[]): number | null {
  return pearson(rankWithTies(x), rankWithTies(y));
}

// How much steadier the combined total is than if the two were independent:
// combinedSd / sqrt(sdA^2 + sdB^2). Below 1 means they offset each other.
// Returned as a whole percent, or null unless it rounds to at least 1.
export function steadierBy(x: number[], y: number[]): number | null {
  const denominator = Math.sqrt(sd(x) ** 2 + sd(y) ** 2);
  if (denominator === 0) return null;
  const combined = x.map((v, i) => v + y[i]);
  const percent = Math.round((1 - sd(combined) / denominator) * 100);
  return percent >= 1 ? percent : null;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/lib/insights/relations.test.ts`
Expected: PASS (all tests). If the 29% case fails by one point, recompute with the exact sample values and fix the expected number, not the formula.

- [ ] **Step 5: Commit**

```bash
git add src/lib/insights/relations.ts tests/lib/insights/relations.test.ts
git commit --no-gpg-sign -m "feat(insights): rank correlation and steadier-together measures"
```

---

### Task 3: Confidence tiers

**Files:**
- Create: `src/lib/insights/confidence.ts`
- Test: `tests/lib/insights/confidence.test.ts`

**Interfaces:**
- Produces: `type Confidence = 'early' | 'likely' | 'strong' | 'watching'`; `WATCHING_MIN = 0.3`; `classify(months: number, absRho: number): Confidence | null`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/insights/confidence.test.ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lib/insights/confidence.test.ts`
Expected: FAIL (cannot resolve `$lib/insights/confidence`).

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/insights/confidence.ts
export type Confidence = 'early' | 'likely' | 'strong' | 'watching';

export const WATCHING_MIN = 0.3;

// How much to trust a relationship, from how many months it rests on and how
// strong it is. At six data points rank correlation needs about 0.9 to be
// statistically solid, so even the top tier at low month counts is named a
// "signal"; weaker leanings are only "watching".
export function classify(months: number, absRho: number): Confidence | null {
  if (months < 4) return null;
  const tier: Exclude<Confidence, 'watching'> = months >= 12 ? 'strong' : months >= 8 ? 'likely' : 'early';
  const cutoff = tier === 'early' ? 0.5 : 0.6;
  if (absRho >= cutoff) return tier;
  if (absRho >= WATCHING_MIN) return 'watching';
  return null;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/lib/insights/confidence.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/insights/confidence.ts tests/lib/insights/confidence.test.ts
git commit --no-gpg-sign -m "feat(insights): confidence tiers including a watching band"
```

---

### Task 4: Pair engine

**Files:**
- Create: `src/lib/insights/index.ts`
- Test: `tests/lib/insights/findBucketRelations.test.ts`

**Interfaces:**
- Consumes: `completeMonths`, `monthlyTotals` (Task 1); `spearman`, `steadierBy` (Task 2); `classify`, `Confidence` (Task 3).
- Produces:
  - `interface BucketRef { id: string; name: string; color: string }`
  - `interface BucketRelation { a: BucketRef; b: BucketRef; months: number; rho: number; relation: 'trade-off' | 'move-together'; steadierBy: number | null; confidence: Confidence; series: { months: string[]; a: number[]; b: number[] } }`
  - `findBucketRelations(buckets: Bucket[], transactions: { bucketId: string; amount: number; date: Date | string }[], now?: Date): BucketRelation[]`
  - `countComparablePairs(buckets, transactions, now?): number` (pairs with at least 4 comparable months, regardless of strength).

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/insights/findBucketRelations.test.ts
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
    expect(findBucketRelations([bucket('g'), bucket('e')], tx, NOW)).toEqual([]);
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lib/insights/findBucketRelations.test.ts`
Expected: FAIL (cannot resolve `$lib/insights`).

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/insights/index.ts
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
      const months = window.filter((m) => m >= start);
      if (months.length < MIN_MONTHS) continue;
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
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/lib/insights/`
Expected: PASS for all insights tests. Then `npm run check` (0 errors).
Note for the `ranks by strength` test: if the leftover `expect(out[0].a.id < out[0].b.id || true)` line is flagged by lint, delete that line; it is a no-op.

- [ ] **Step 5: Commit**

```bash
git add src/lib/insights/index.ts tests/lib/insights/findBucketRelations.test.ts
git commit --no-gpg-sign -m "feat(insights): find relations between everyday buckets"
```

---

### Task 5: Copy helpers

**Files:**
- Create: `src/lib/insights/copy.ts`
- Test: `tests/lib/insights/copy.test.ts`

**Interfaces:**
- Consumes: `BucketRelation` (Task 4).
- Produces: `headline(r: BucketRelation): string`; `watchingNote(r: BucketRelation): string`; `confidenceLabel(r: BucketRelation): string`; `steadierLine(percent: number): string`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/insights/copy.test.ts
import { describe, it, expect } from 'vitest';
import { headline, watchingNote, confidenceLabel, steadierLine } from '$lib/insights/copy';
import type { BucketRelation } from '$lib/insights';

const rel = (over: Partial<BucketRelation> = {}): BucketRelation => ({
  a: { id: 'e', name: 'Eating Out', color: '#f00' },
  b: { id: 'g', name: 'Groceries', color: '#0f0' },
  months: 6, rho: -0.7, relation: 'trade-off', steadierBy: 18, confidence: 'early',
  series: { months: [], a: [], b: [] },
  ...over,
});

describe('copy', () => {
  it('words a trade-off without claiming cause', () => {
    expect(headline(rel())).toBe('When Eating Out is high, Groceries tends to be low.');
  });

  it('words buckets that rise together', () => {
    expect(headline(rel({ relation: 'move-together', rho: 0.8 }))).toBe('Eating Out and Groceries tend to rise together.');
  });

  it('writes a watching note that names the months', () => {
    expect(watchingNote(rel({ confidence: 'watching' }))).toBe(
      "Eating Out and Groceries lean opposite, but 6 months isn't enough to be sure."
    );
    expect(watchingNote(rel({ confidence: 'watching', relation: 'move-together', months: 7 }))).toBe(
      "Eating Out and Groceries lean the same way, but 7 months isn't enough to be sure."
    );
  });

  it('labels confidence with the month count', () => {
    expect(confidenceLabel(rel({ confidence: 'early', months: 6 }))).toBe('Early signal · 6 months');
    expect(confidenceLabel(rel({ confidence: 'likely', months: 9 }))).toBe('Likely · 9 months');
    expect(confidenceLabel(rel({ confidence: 'strong', months: 12 }))).toBe('Strong · 12 months');
  });

  it('describes the steadier-together benefit with no dollar amounts', () => {
    const line = steadierLine(18);
    expect(line).toBe('Together they vary 18% less than separately. A combined budget may fit better than two separate ones.');
    expect(line).not.toMatch(/\$/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lib/insights/copy.test.ts`
Expected: FAIL (cannot resolve `$lib/insights/copy`).

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/insights/copy.ts
import type { BucketRelation } from './index';

// Wording rules: "tends to", never "causes"; always name the months; no
// dollar amounts, so hide-amounts has nothing to leak.

export function headline(r: BucketRelation): string {
  return r.relation === 'trade-off'
    ? `When ${r.a.name} is high, ${r.b.name} tends to be low.`
    : `${r.a.name} and ${r.b.name} tend to rise together.`;
}

export function watchingNote(r: BucketRelation): string {
  const lean = r.relation === 'trade-off' ? 'opposite' : 'the same way';
  return `${r.a.name} and ${r.b.name} lean ${lean}, but ${r.months} months isn't enough to be sure.`;
}

export function confidenceLabel(r: BucketRelation): string {
  const name = r.confidence === 'early' ? 'Early signal' : r.confidence === 'likely' ? 'Likely' : 'Strong';
  return `${name} · ${r.months} months`;
}

export function steadierLine(percent: number): string {
  return `Together they vary ${percent}% less than separately. A combined budget may fit better than two separate ones.`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/lib/insights/copy.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/insights/copy.ts tests/lib/insights/copy.test.ts
git commit --no-gpg-sign -m "feat(insights): wording for relations and confidence"
```

---

### Task 6: Insights card and page wiring

**Files:**
- Create: `src/lib/components/insights/PatternInsights.svelte`
- Modify: `src/routes/analytics/+page.svelte` (import near the other component imports; mount as the last child of the root `<div class="space-y-6">`, after the Savings Rate Trend card)

**Interfaces:**
- Consumes: `findBucketRelations`, `countComparablePairs`, `BucketRelation` (Task 4); `headline`, `watchingNote`, `confidenceLabel`, `steadierLine` (Task 5); existing `buckets`, `transactions` stores (`$lib/stores/budgetStore`), `today` (`$lib/stores/uiStore`), `BarChart` (`$lib/components/charts/BarChart.svelte`, props `labels: string[]`, `datasets: {label,data,color}[]`), `InfoPopover` (`$lib/components/shared/InfoPopover.svelte`, prop `label`, default slot), `formatMonthYear` (`$lib/utils/dates`), `centsToDollars` (`$lib/utils/currency`).
- Produces: a card; no exports.

- [ ] **Step 1: Write the component**

```svelte
<!-- src/lib/components/insights/PatternInsights.svelte -->
<script lang="ts">
  // Which everyday buckets trade off or rise together, from monthly totals.
  // Only strong-enough pairs get a row and chart; weak leans are one quiet
  // line, so a few months of data never reads as a finding.
  import { buckets, transactions } from '$lib/stores/budgetStore';
  import { today } from '$lib/stores/uiStore';
  import { findBucketRelations, countComparablePairs } from '$lib/insights';
  import { headline, watchingNote, confidenceLabel, steadierLine } from '$lib/insights/copy';
  import { formatMonthYear } from '$lib/utils/dates';
  import { centsToDollars } from '$lib/utils/currency';
  import BarChart from '$lib/components/charts/BarChart.svelte';
  import InfoPopover from '$lib/components/shared/InfoPopover.svelte';

  const VISIBLE = 3;
  const MAX_WATCHING = 2;

  let showAll = false;

  $: all = findBucketRelations($buckets, $transactions, $today);
  $: signals = all.filter((r) => r.confidence !== 'watching');
  $: watching = all.filter((r) => r.confidence === 'watching').slice(0, MAX_WATCHING);
  $: shown = showAll ? signals : signals.slice(0, VISIBLE);
  $: comparable = countComparablePairs($buckets, $transactions, $today);

  const monthLabel = (m: string) => formatMonthYear(m).split(' ')[0].slice(0, 3);
</script>

<div class="card">
  <div class="flex items-center gap-1.5 border-b border-gray-100 px-5 py-4 dark:border-border-dark">
    <h2 class="section-title">Patterns between buckets</h2>
    <InfoPopover label="How patterns are found">
      <p class="font-medium text-gray-900 dark:text-gray-50">How these are found</p>
      <p>
        Each pair of everyday buckets is compared month by month: do the months where one is high tend to be the
        months where the other is low (or high too)? Rent, subscriptions, savings and one-off buckets are left out.
      </p>
      <p>
        It compares which months were high or low, not by how much, so one unusual month can't create a pattern on
        its own. With only a few months of history, a lean is shown as "watching" and not as a finding.
      </p>
      <p class="text-muted dark:text-muted-dark">It describes what happened. It can't tell you why.</p>
    </InfoPopover>
  </div>

  <div class="space-y-5 p-5">
    {#if signals.length === 0 && watching.length === 0}
      <p class="py-6 text-center text-sm text-muted dark:text-muted-dark">
        {comparable === 0
          ? 'Patterns appear after 4 complete months of spending in at least two everyday buckets.'
          : 'No clear patterns between your buckets yet.'}
      </p>
    {/if}

    {#each shown as r (r.a.id + r.b.id)}
      <div class="space-y-2">
        <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p class="text-[13.5px] font-medium text-gray-900 dark:text-gray-100">{headline(r)}</p>
          <span class="rounded-full border border-border px-2 py-0.5 text-[11.5px] text-muted dark:border-border-dark dark:text-muted-dark">
            {confidenceLabel(r)}
          </span>
        </div>
        {#if r.relation === 'trade-off' && r.steadierBy !== null}
          <p class="text-[12.5px] text-muted dark:text-muted-dark">{steadierLine(r.steadierBy)}</p>
        {/if}
        {#key r.a.id + r.b.id + r.months}
          <BarChart
            labels={r.series.months.map(monthLabel)}
            datasets={[
              { label: r.a.name, data: r.series.a.map(centsToDollars), color: r.a.color },
              { label: r.b.name, data: r.series.b.map(centsToDollars), color: r.b.color },
            ]}
          />
        {/key}
      </div>
    {/each}

    {#if signals.length > VISIBLE}
      <button
        type="button"
        class="rounded text-[13px] font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-expanded={showAll}
        on:click={() => (showAll = !showAll)}
      >
        {showAll ? 'Show less' : `Show ${signals.length - VISIBLE} more`}
      </button>
    {/if}

    {#if watching.length > 0}
      <ul class="space-y-1 border-t border-gray-100 pt-4 dark:border-border-dark">
        {#each watching as r (r.a.id + r.b.id)}
          <li class="text-[12.5px] text-muted dark:text-muted-dark">{watchingNote(r)}</li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
```

- [ ] **Step 2: Mount it on the Insights page**

In `src/routes/analytics/+page.svelte`, add to the imports (next to the other component imports):

```ts
import PatternInsights from '$lib/components/insights/PatternInsights.svelte';
```

and add, as the last child inside the root `<div class="space-y-6">` (immediately after the closing `</div>` of the "Savings Rate Trend" card):

```svelte
  <PatternInsights />
```

- [ ] **Step 3: Type-check and run all tests**

Run: `npm run check && npx vitest run`
Expected: 0 errors, 0 warnings; all tests pass.

- [ ] **Step 4: Verify in the running app (the user's data)**

Start the dev server with `npm run dev -- --port 5199`. In a clean browser profile, import the user's current migrated backup via Setup -> Settings -> Import JSON (the newest `rebucketed-v4-with-notes` file in `~/Downloads/bdgt/`), then open `/analytics` and scroll to "Patterns between buckets". Check, at desktop (1200px) and phone (390px) widths and with Hide amounts on and off:

- Groceries and Eating Out appear only as the one-line watching note ("Eating Out and Groceries lean opposite, but 6 months isn't enough to be sure.") or, if other pairs pass the cutoff, below them. They must NOT appear as an early-signal row.
- If any pair passes, its row shows the sentence, the confidence chip, a two-series bar chart, and (for trade-offs) the steadier line; there are no dollar amounts in any text.
- With Hide amounts on, the charts are blurred and the text is unchanged.
- The ⓘ popover opens on hover, focus and tap, and fits at 390px.
- On a profile with no data the empty state reads "Patterns appear after 4 complete months of spending in at least two everyday buckets."

Capture one screenshot per width and read them. Fix anything visibly off (overflow, spacing) in one batch, then confirm once more.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/insights/PatternInsights.svelte src/routes/analytics/+page.svelte
git commit --no-gpg-sign -m "feat(insights): patterns between buckets card on the Insights page"
```

---

## Self-review notes

- **Spec coverage:** window and eligibility (Task 1, 4); Spearman and steadiness (Task 2); tiers including Watching and its worked example (Task 3, 4); output shape and ranking (Task 4); presentation, Show more, watching notes, empty states, copy rules (Task 5, 6); testing list and regression (Tasks 2-4); build order matches.
- **Spec delta:** the spec names a single `findBucketRelations` returning ranked results. The plan adds `countComparablePairs` so the card can tell "not enough history" apart from "no clear pattern" without a second result shape.
- **Types:** `BucketRelation`, `Confidence`, `classify`, `spearman`, `steadierBy`, `completeMonths`, `monthlyTotals` are used with the same names and signatures in every task.
- **Known judgment call:** a bucket's "first active month" is the first window month with any transaction, while eligibility needs 4 months with a nonzero total; both rules are tested in Task 4.
