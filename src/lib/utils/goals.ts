import type { SavingsGoal, MonthSnapshot } from '$lib/types';
import { getMonthKey } from './dates';

export function calculateGoalProgress(
  goal: SavingsGoal,
  monthSnapshots: MonthSnapshot[]
): number {
  const startMonth = getMonthKey(goal.createdAt);
  const allocations = monthSnapshots
    .filter((s) => s.month >= startMonth)
    .reduce((sum, s) => sum + (s.allocations[goal.bucketId] || 0), 0);
  return goal.startingBalance + allocations;
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
