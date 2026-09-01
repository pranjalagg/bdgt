import type { SavingsGoal, Bucket } from '$lib/types';
import { getMonthKey } from './dates';
import { computeAllocation } from './calculations';

// Progress toward a goal = its starting balance plus the running balance
// of the linked bucket (allocated minus spent) for every month from the
// goal's creation onward. Derived from raw data, so withdrawing from the
// bucket actually lowers progress.
export function calculateGoalProgress(
  goal: SavingsGoal,
  bucket: Bucket | undefined,
  months: string[],
  allocationOverrides: Record<string, Record<string, number>>,
  incomeByMonth: Record<string, number>,
  spentByMonthBucket: Record<string, Record<string, number>>
): number {
  const startMonth = getMonthKey(goal.createdAt);
  let balance = goal.startingBalance;

  for (const month of months) {
    if (month < startMonth) continue;
    if (!bucket) continue;

    const allocated = bucket.allocationType === 'fixed'
      ? (allocationOverrides[month]?.[goal.bucketId] ?? computeAllocation(bucket, incomeByMonth[month] ?? 0))
      : computeAllocation(bucket, incomeByMonth[month] ?? 0);
    const spent = spentByMonthBucket[month]?.[goal.bucketId] ?? 0;
    balance += allocated - spent;
  }

  return balance;
}

export function monthsBetween(from: Date, to: Date): number {
  const fromYear = from.getFullYear();
  const fromMonth = from.getMonth();
  const toYear = to.getFullYear();
  const toMonth = to.getMonth();
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

export function calculateMonthlyNeeded(
  goal: SavingsGoal,
  currentAmount: number,
  today: Date = new Date()
): number {
  if (!goal.targetDate) return 0;
  const remaining = goal.targetAmount - currentAmount;
  if (remaining <= 0) return 0;
  const monthsLeft = monthsBetween(today, goal.targetDate);
  if (monthsLeft <= 0) return remaining;
  return Math.ceil(remaining / monthsLeft);
}

export function calculateProjectedDate(
  goal: SavingsGoal,
  currentAmount: number,
  today: Date = new Date()
): Date | null {
  if (!goal.monthlyContribution || goal.monthlyContribution <= 0) return null;
  const remaining = goal.targetAmount - currentAmount;
  if (remaining <= 0) return today;
  const monthsNeeded = Math.ceil(remaining / goal.monthlyContribution);
  const projected = new Date(today);
  projected.setMonth(projected.getMonth() + monthsNeeded);
  return projected;
}

export type GoalStatus = 'completed' | 'on-track' | 'behind';

export function getGoalStatus(
  currentAmount: number,
  targetAmount: number,
  monthlyNeeded: number,
  currentMonthAllocation: number = 0
): GoalStatus {
  if (currentAmount >= targetAmount) return 'completed';
  if (monthlyNeeded <= 0 || currentMonthAllocation >= monthlyNeeded) return 'on-track';
  return 'behind';
}
