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

import type { Bucket } from '$lib/types';

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

import type { Income } from '$lib/types';

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

export function calculateProjectedSpend(
  spent: number,
  dayOfMonth: number,
  daysInMonth: number
): number {
  if (dayOfMonth <= 0) return spent;
  return Math.round((spent / dayOfMonth) * daysInMonth);
}

export function isProjectionReliable(dayOfMonth: number): boolean {
  return dayOfMonth >= 7;
}
