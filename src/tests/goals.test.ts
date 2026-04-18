import { describe, it, expect } from 'vitest';
import {
  calculateGoalProgress,
  calculateMonthlyNeeded,
  getGoalStatus,
  monthsBetween
} from '$lib/utils/goals';
import type { SavingsGoal, MonthSnapshot } from '$lib/types';

function createGoal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: 'goal-1',
    name: 'Test Goal',
    bucketId: 'bucket-1',
    targetAmount: 100000, // $1000
    createdAt: new Date('2024-01-15'),
    startingBalance: 0,
    ...overrides
  };
}

function createSnapshot(month: string, allocations: Record<string, number> = {}): MonthSnapshot {
  return {
    month,
    incomeTotal: 0,
    allocations,
    spent: {},
    rollovers: {}
  };
}

describe('calculateGoalProgress', () => {
  it('sums allocations from createdAt month onward', () => {
    const goal = createGoal({ createdAt: new Date('2024-02-01'), startingBalance: 5000 });
    const snapshots = [
      createSnapshot('2024-01', { 'bucket-1': 1000 }), // before createdAt, ignored
      createSnapshot('2024-02', { 'bucket-1': 2000 }),
      createSnapshot('2024-03', { 'bucket-1': 3000 })
    ];
    expect(calculateGoalProgress(goal, snapshots)).toBe(5000 + 2000 + 3000);
  });

  it('includes startingBalance', () => {
    const goal = createGoal({ startingBalance: 10000 });
    expect(calculateGoalProgress(goal, [])).toBe(10000);
  });

  it('handles missing bucket allocations', () => {
    const goal = createGoal({ createdAt: new Date('2024-01-01') });
    const snapshots = [
      createSnapshot('2024-01', { 'other-bucket': 5000 }),
      createSnapshot('2024-02', { 'bucket-1': 2000 })
    ];
    expect(calculateGoalProgress(goal, snapshots)).toBe(2000);
  });
});

describe('monthsBetween', () => {
  it('calculates months between two dates', () => {
    expect(monthsBetween(new Date('2024-01-15'), new Date('2024-06-20'))).toBe(5);
  });

  it('handles same month', () => {
    expect(monthsBetween(new Date('2024-03-01'), new Date('2024-03-31'))).toBe(0);
  });

  it('handles year boundaries', () => {
    expect(monthsBetween(new Date('2023-11-01'), new Date('2024-02-01'))).toBe(3);
  });
});

describe('calculateMonthlyNeeded', () => {
  it('divides remaining by months left', () => {
    const goal = createGoal({
      targetAmount: 12000,
      targetDate: new Date('2024-07-01')
    });
    const today = new Date('2024-01-01');
    // 6 months, need 12000, = 2000/month
    expect(calculateMonthlyNeeded(goal, 0, today)).toBe(2000);
  });

  it('rounds up to nearest cent', () => {
    const goal = createGoal({
      targetAmount: 10000,
      targetDate: new Date('2024-04-01')
    });
    const today = new Date('2024-01-01');
    // 3 months, need 10000 = 3333.33... -> 3334
    expect(calculateMonthlyNeeded(goal, 0, today)).toBe(3334);
  });

  it('returns 0 when no targetDate', () => {
    const goal = createGoal({ targetDate: undefined });
    expect(calculateMonthlyNeeded(goal, 0)).toBe(0);
  });

  it('returns 0 when goal already met', () => {
    const goal = createGoal({
      targetAmount: 10000,
      targetDate: new Date('2024-12-01')
    });
    expect(calculateMonthlyNeeded(goal, 15000, new Date('2024-01-01'))).toBe(0);
  });

  it('returns full remaining when deadline passed', () => {
    const goal = createGoal({
      targetAmount: 10000,
      targetDate: new Date('2024-01-01')
    });
    const today = new Date('2024-03-01');
    // deadline passed, return full remaining
    expect(calculateMonthlyNeeded(goal, 3000, today)).toBe(7000);
  });
});

describe('getGoalStatus', () => {
  it('returns completed when currentAmount >= targetAmount', () => {
    expect(getGoalStatus(10000, 10000, 500, 0)).toBe('completed');
    expect(getGoalStatus(12000, 10000, 500, 0)).toBe('completed');
  });

  it('returns on-track when monthlyNeeded is 0', () => {
    expect(getGoalStatus(5000, 10000, 0, 0)).toBe('on-track');
  });

  it('returns on-track when allocation meets or exceeds monthlyNeeded', () => {
    expect(getGoalStatus(5000, 10000, 1000, 1000)).toBe('on-track');
    expect(getGoalStatus(5000, 10000, 1000, 1500)).toBe('on-track');
  });

  it('returns behind when allocation is less than monthlyNeeded', () => {
    expect(getGoalStatus(5000, 10000, 1000, 500)).toBe('behind');
    expect(getGoalStatus(5000, 10000, 1000, 0)).toBe('behind');
  });
});
