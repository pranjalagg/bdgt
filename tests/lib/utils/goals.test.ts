import { describe, it, expect } from 'vitest';
import {
  calculateGoalProgress,
  calculateMonthlyNeeded,
  getGoalStatus,
  monthsBetween
} from '$lib/utils/goals';
import type { SavingsGoal, Bucket } from '$lib/types';

function createGoal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: 'goal-1',
    name: 'Test Goal',
    bucketId: 'bucket-1',
    targetAmount: 100000, // $1000
    createdAt: new Date(2024, 0, 15),
    startingBalance: 0,
    ...overrides
  };
}

function fixedBucket(fixedAmount: number): Bucket {
  return {
    id: 'bucket-1', name: 'Savings', color: '#000', order: 0, isDefault: false,
    allocationType: 'fixed', fixedAmount, percentageAmount: 0, isSavings: true,
  };
}

describe('calculateGoalProgress', () => {
  it('accrues the bucket balance from the goal\'s start month onward', () => {
    const goal = createGoal({ createdAt: new Date(2024, 1, 1), startingBalance: 5000 });
    const result = calculateGoalProgress(
      goal,
      fixedBucket(2000),
      ['2024-01', '2024-02', '2024-03'], // Jan is before start -> ignored
      {},
      {},
      {}
    );
    expect(result).toBe(5000 + 2000 + 2000); // Feb + Mar allocations
  });

  it('includes the starting balance when there are no months', () => {
    expect(calculateGoalProgress(createGoal({ startingBalance: 10000 }), fixedBucket(0), [], {}, {}, {})).toBe(10000);
  });

  it('subtracts money spent (withdrawn) from the linked bucket', () => {
    const goal = createGoal({ createdAt: new Date(2024, 0, 1), startingBalance: 0 });
    const result = calculateGoalProgress(
      goal,
      fixedBucket(3000),
      ['2024-01', '2024-02'],
      {},
      {},
      { '2024-02': { 'bucket-1': 5000 } } // withdrew 5000 in Feb
    );
    expect(result).toBe(3000 + 3000 - 5000);
  });

  it('honours a per-month allocation override', () => {
    const goal = createGoal({ createdAt: new Date(2024, 0, 1) });
    const result = calculateGoalProgress(
      goal,
      fixedBucket(3000),
      ['2024-01'],
      { '2024-01': { 'bucket-1': 9000 } },
      {},
      {}
    );
    expect(result).toBe(9000);
  });

  it('returns just the starting balance when the bucket is gone', () => {
    const goal = createGoal({ startingBalance: 4200, createdAt: new Date(2024, 0, 1) });
    expect(calculateGoalProgress(goal, undefined, ['2024-01', '2024-02'], {}, {}, {})).toBe(4200);
  });
});

describe('monthsBetween', () => {
  it('calculates months between two dates', () => {
    expect(monthsBetween(new Date(2024, 0, 15), new Date(2024, 5, 20))).toBe(5);
  });

  it('handles same month', () => {
    expect(monthsBetween(new Date(2024, 2, 1), new Date(2024, 2, 31))).toBe(0);
  });

  it('handles year boundaries', () => {
    expect(monthsBetween(new Date(2023, 10, 1), new Date(2024, 1, 1))).toBe(3);
  });
});

describe('calculateMonthlyNeeded', () => {
  it('divides remaining by months left', () => {
    const goal = createGoal({
      targetAmount: 12000,
      targetDate: new Date(2024, 6, 1)
    });
    const today = new Date(2024, 0, 1);
    // 6 months, need 12000, = 2000/month
    expect(calculateMonthlyNeeded(goal, 0, today)).toBe(2000);
  });

  it('rounds up to nearest cent', () => {
    const goal = createGoal({
      targetAmount: 10000,
      targetDate: new Date(2024, 3, 1)
    });
    const today = new Date(2024, 0, 1);
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
      targetDate: new Date(2024, 11, 1)
    });
    expect(calculateMonthlyNeeded(goal, 15000, new Date(2024, 0, 1))).toBe(0);
  });

  it('returns full remaining when deadline passed', () => {
    const goal = createGoal({
      targetAmount: 10000,
      targetDate: new Date(2024, 0, 1)
    });
    const today = new Date(2024, 2, 1);
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
