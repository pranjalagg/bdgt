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
      // A bucket accrues no rollover for a month before it existed --
      // its current fixed amount must not retroactively backfill history.
      if (month < getMonthKey(bucket.createdAt)) continue;

      // Per-month overrides only make sense for fixed buckets; percentage
      // and hybrid always re-derive from that month's income.
      const allocated = bucket.allocationType === 'fixed'
        ? (overrides[bucket.id] ?? computeAllocation(bucket, monthIncome))
        : computeAllocation(bucket, monthIncome);
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
