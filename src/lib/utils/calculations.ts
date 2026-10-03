import type { Bucket, Income } from '$lib/types';
import { getMonthKey } from './dates';

export function calculateUnallocated(
  income: number,
  allocations: Record<string, number>
): number {
  const totalAllocated = Object.values(allocations).reduce((sum, val) => sum + val, 0);
  return income - totalAllocated;
}

export function calculateBucketRemaining(
  allocated: number,
  spent: number,
  rollover: number
): number {
  return allocated + rollover - spent;
}

export function getBucketStatus(
  allocated: number,
  spent: number
): 'success' | 'warning' | 'danger' | 'credit' {
  if (spent < 0) return 'credit';
  if (spent > allocated) return 'danger';
  if (allocated > 0 && spent >= allocated * 0.9) return 'warning';
  return 'success';
}

export function calculateTotalSpent(spent: Record<string, number>): number {
  return Object.values(spent).reduce((sum, val) => sum + val, 0);
}

export function calculateTotalAllocated(allocations: Record<string, number>): number {
  return Object.values(allocations).reduce((sum, val) => sum + val, 0);
}

export function computeAllocation(bucket: Bucket, totalIncome: number): number {
  const fixed = bucket.fixedAmount || 0;
  const pct = bucket.percentageAmount || 0;
  const fromPercentage = Math.round((pct / 100) * totalIncome);

  switch (bucket.allocationType) {
    case 'fixed': return fixed;
    case 'percentage': return fromPercentage;
    case 'hybrid': return fixed + fromPercentage;
    default: return fixed;
  }
}

export function getTotalPercentage(buckets: Bucket[]): number {
  return buckets.reduce((sum, b) => sum + (b.percentageAmount || 0), 0);
}

export function filterFixedIncome(incomes: Income[]): Income[] {
  return incomes.filter((i) => i.type === 'fixed');
}

export function sumIncome(incomes: Income[]): number {
  return incomes.reduce((sum, i) => sum + i.amount, 0);
}

export function incomePercentage(spent: number, fixedIncome: number): number | null {
  if (fixedIncome <= 0 || spent <= 0) return null;
  return Math.round((spent / fixedIncome) * 1000) / 10;
}

export function calculateSavingsRate(income: number, spent: number): number | null {
  if (income <= 0) return null;
  return Math.round(((income - spent) / income) * 1000) / 10;
}

// A bucket has no plan for months before the one it was created in, so
// those months must not show its (current) default amount as an
// allocation. An explicit assignment for that month overrides this: the
// user (or a migration) decided it had a plan then, and the same rule must
// hold for the displayed allocation and for rollover.
export function bucketExistsInMonth(bucket: Bucket, month: string, hasExplicitAllocation = false): boolean {
  return hasExplicitAllocation || month >= getMonthKey(bucket.createdAt);
}

// Change in savings rate, in percentage points, vs the previous month.
// Null when either month has no income (no rate to compare). Rounded to
// one decimal like the rates themselves; a move under a tenth of a point
// is reported as 0 so the UI can show "flat" instead of a phantom arrow.
export function savingsRateDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  const delta = Math.round((current - previous) * 10) / 10;
  return delta === 0 ? 0 : delta;
}

// Rollover carried into a month = everything allocated to a bucket in
// every prior month minus everything spent from it in those months.
// Because remaining telescopes (each month's leftover feeds the next),
// this single running sum equals the previous month's remaining balance
// without storing anything per month.
export function accumulateRollovers(
  monthsBefore: string[],
  buckets: Bucket[],
  allocationOverrides: Record<string, Record<string, number>>,
  incomeByMonth: Record<string, number>,
  spentByMonthBucket: Record<string, Record<string, number>>
): Record<string, number> {
  const rollovers: Record<string, number> = {};

  for (const month of monthsBefore) {
    const overrides = allocationOverrides[month] ?? {};
    const monthIncome = incomeByMonth[month] ?? 0;
    const spent = spentByMonthBucket[month] ?? {};

    for (const bucket of buckets) {
      // Per-month overrides only make sense for fixed buckets; percentage
      // and hybrid always re-derive from that month's income.
      const override = bucket.allocationType === 'fixed' ? overrides[bucket.id] : undefined;

      // A bucket accrues no rollover for a month before it existed --
      // its current fixed amount must not retroactively backfill history --
      // unless that month carries an explicit assignment for it.
      if (!bucketExistsInMonth(bucket, month, override !== undefined)) continue;

      const allocated = override ?? computeAllocation(bucket, monthIncome);
      const delta = allocated - (spent[bucket.id] ?? 0);
      if (delta !== 0) {
        rollovers[bucket.id] = (rollovers[bucket.id] ?? 0) + delta;
      }
    }
  }

  return rollovers;
}

// Total spent excluding transactions routed into savings-type buckets.
// Money moved into savings is saved, not spent, so it must not depress
// the savings rate.
export function spentExcludingSavings(
  transactions: { bucketId: string; amount: number }[],
  savingsBucketIds: Set<string> | string[]
): number {
  const savings = savingsBucketIds instanceof Set ? savingsBucketIds : new Set(savingsBucketIds);
  return transactions.reduce(
    (sum, t) => (savings.has(t.bucketId) ? sum : sum + t.amount),
    0
  );
}

export interface DayGroup<T> {
  key: string;          // YYYY-MM-DD
  date: Date;
  transactions: T[];
  total: number;        // spending only — money set aside is excluded
  setAside: number;     // what went into savings buckets that day
}

// A ledger reads by day, not by row. Repeating the same date on nine
// consecutive rows is noise; one header carrying the day's total is the
// thing you actually scan for.
export function groupTransactionsByDay<T extends { amount: number; bucketId: string; date: Date; createdAt?: number }>(
  transactions: T[],
  savingsBucketIds: Set<string> | string[] = []
): DayGroup<T>[] {
  const savings = savingsBucketIds instanceof Set ? savingsBucketIds : new Set(savingsBucketIds);
  const byDay = new Map<string, DayGroup<T>>();

  for (const t of transactions) {
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let group = byDay.get(key);
    if (!group) {
      group = { key, date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), transactions: [], total: 0, setAside: 0 };
      byDay.set(key, group);
    }
    group.transactions.push(t);
    if (savings.has(t.bucketId)) group.setAside += t.amount;
    else group.total += t.amount;
  }

  return [...byDay.values()]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map((g) => ({ ...g, transactions: [...g.transactions].sort(
      (a, b) => (b.createdAt ?? new Date(b.date).getTime()) - (a.createdAt ?? new Date(a.date).getTime())
    ) }));
}

export interface BucketMonthlySeries {
  bucketId: string;
  label: string;
  color: string;
  data: number[]; // cents, one entry per month in `months`, same index
}

// Per-bucket transaction totals for each of the given months, for a
// "spend trend by bucket" chart. A bucket with no activity in any of
// the months is left out entirely rather than plotting a flat empty
// line.
export function monthlyBucketSpend(
  buckets: Bucket[],
  transactions: { bucketId: string; amount: number; date: Date }[],
  months: string[]
): BucketMonthlySeries[] {
  const monthSet = new Set(months);
  // Maps, not plain objects: bucket ids come from imported files, and an id
  // like "__proto__" must not alias Object.prototype.
  const byBucketMonth = new Map<string, Map<string, number>>();

  for (const t of transactions) {
    const m = getMonthKey(new Date(t.date));
    if (!monthSet.has(m)) continue;
    let bucketTotals = byBucketMonth.get(t.bucketId);
    if (!bucketTotals) byBucketMonth.set(t.bucketId, (bucketTotals = new Map()));
    bucketTotals.set(m, (bucketTotals.get(m) ?? 0) + t.amount);
  }

  return buckets
    .map((b) => ({
      bucketId: b.id,
      label: b.name,
      color: b.color,
      data: months.map((m) => byBucketMonth.get(b.id)?.get(m) ?? 0),
    }))
    .filter((series) => series.data.some((v) => v !== 0));
}

// What's actually free to spend today: everything left in day-to-day
// envelopes, divided across the days remaining. Excludes savings buckets
// (that money isn't "spendable") and any bucket marked as a fixed
// obligation rather than everyday spend (rent, a subscription) -- those
// are already committed, not safe to eat into.
export function calculateSafeToSpendPerDay(
  statuses: { bucket: { isSavings: boolean; isEveryday: boolean }; remaining: number }[],
  daysLeftInMonth: number
): number {
  const pool = statuses
    .filter((s) => !s.bucket.isSavings && s.bucket.isEveryday)
    .reduce((sum, s) => sum + s.remaining, 0);
  const days = Math.max(daysLeftInMonth, 1);
  return Math.round(pool / days);
}

export type BucketFitStatus = 'neutral' | 'unfunded' | 'fits' | 'tight';

// Entry is amount-first: type what you're about to spend, and every
// bucket answers "does this fit?" before you pick one, instead of
// picking a bucket blind and finding out you broke it after the fact.
export function calculateBucketFit(
  amountCents: number,
  remaining: number,
  allocated: number
): BucketFitStatus {
  if (amountCents <= 0) return 'neutral';
  // Nothing assigned this month, but a positive balance carried from
  // earlier months still funds the spend.
  if (allocated === 0 && remaining <= 0) return 'unfunded';
  return amountCents <= remaining ? 'fits' : 'tight';
}
