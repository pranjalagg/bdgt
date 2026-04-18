import { writable, derived } from 'svelte/store';
import { db } from '$lib/db';
import { monthSnapshots, currentSnapshot, buckets } from './budgetStore';
import { calculateGoalProgress, calculateMonthlyNeeded, calculateProjectedDate, getGoalStatus, type GoalStatus } from '$lib/utils/goals';
import type { SavingsGoal, Bucket } from '$lib/types';

export const savingsGoals = writable<SavingsGoal[]>([]);

export async function loadGoals(): Promise<void> {
  const goals = await db.savingsGoals.toArray();
  savingsGoals.set(goals);
}

export async function addGoal(goal: Omit<SavingsGoal, 'id'>): Promise<string> {
  const id = crypto.randomUUID();
  const newGoal = { ...goal, id };
  await db.savingsGoals.add(newGoal);
  savingsGoals.update((g) => [...g, newGoal]);
  return id;
}

export async function updateGoal(id: string, updates: Partial<SavingsGoal>): Promise<void> {
  await db.savingsGoals.update(id, updates);
  savingsGoals.update((g) => g.map((goal) => (goal.id === id ? { ...goal, ...updates } : goal)));
}

export async function deleteGoal(id: string): Promise<void> {
  await db.savingsGoals.delete(id);
  savingsGoals.update((g) => g.filter((goal) => goal.id !== id));
}

export interface GoalStatusInfo {
  goal: SavingsGoal;
  bucket: Bucket | undefined;
  currentAmount: number;
  progress: number;
  monthlyNeeded: number;
  projectedDate: Date | null;
  status: GoalStatus;
  currentMonthAllocation: number;
}

export const goalStatuses = derived(
  [savingsGoals, monthSnapshots, currentSnapshot, buckets],
  ([$goals, $snapshots, $currentSnapshot, $buckets]): GoalStatusInfo[] => {
    return $goals.map((goal) => {
      const bucket = $buckets.find((b) => b.id === goal.bucketId);
      const currentAmount = calculateGoalProgress(goal, $snapshots);
      const progress = Math.min(currentAmount / goal.targetAmount, 1);
      const currentMonthAllocation = $currentSnapshot.allocations[goal.bucketId] || 0;

      let monthlyNeeded = 0;
      let projectedDate: Date | null = null;

      if (goal.targetDate) {
        monthlyNeeded = calculateMonthlyNeeded(goal, currentAmount);
      } else if (goal.monthlyContribution) {
        monthlyNeeded = goal.monthlyContribution;
        projectedDate = calculateProjectedDate(goal, currentAmount);
      }

      const status = getGoalStatus(currentAmount, goal.targetAmount, monthlyNeeded, currentMonthAllocation);

      return { goal, bucket, currentAmount, progress, monthlyNeeded, projectedDate, status, currentMonthAllocation };
    });
  }
);
