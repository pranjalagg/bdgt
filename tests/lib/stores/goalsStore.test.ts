import { describe, it, expect, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$lib/db', () => ({
  DATE_FIELDS: { savingsGoals: ['createdAt', 'targetDate'] },
  db: {
    savingsGoals: {
      toArray: vi.fn().mockResolvedValue([
        // A goal that survived a pre-fix JSON import: dates are plain
        // strings rather than Date instances.
        {
          id: 'g1',
          name: 'Emergency Fund',
          bucketId: 'b1',
          targetAmount: 500000,
          startingBalance: 0,
          createdAt: '2026-02-01T00:00:00.000Z',
          targetDate: '2026-12-01T00:00:00.000Z',
        },
      ]),
    },
  },
}));

import { savingsGoals, loadGoals, goalStatuses } from '$lib/stores/goalsStore';
import { buckets, transactions } from '$lib/stores/budgetStore';
import { currentMonthKey } from '$lib/stores/uiStore';

describe('loadGoals', () => {
  it('normalizes date fields that survived as strings, so getMonthKey never sees a non-Date', async () => {
    await loadGoals();
    const [goal] = get(savingsGoals);
    expect(goal.createdAt).toBeInstanceOf(Date);
    expect(goal.targetDate).toBeInstanceOf(Date);
  });
});

describe('goalStatuses progress', () => {
  it('accrues a completely quiet month between the goal\'s start and the current month', () => {
    buckets.set([{
      id: 'b1', name: 'Savings', color: '#000', order: 0, isDefault: false,
      allocationType: 'fixed', fixedAmount: 20000, percentageAmount: 0, isSavings: true,
      createdAt: new Date(2026, 0, 1),
    }]);
    transactions.set([
      { id: 't1', amount: 5000, bucketId: 'b1', date: new Date(2026, 0, 10) }, // Jan: +15000
      // Feb: no transaction, no snapshot -- must still accrue +20000
    ]);
    savingsGoals.set([{
      id: 'g1', name: 'Emergency Fund', bucketId: 'b1', targetAmount: 500000,
      startingBalance: 0, createdAt: new Date(2026, 0, 1),
    }]);
    currentMonthKey.set('2026-03');

    const status = get(goalStatuses).find((s) => s.goal.id === 'g1')!;
    // Progress includes the current month: Jan +15000, Feb (quiet)
    // +20000, March (quiet, current) +20000 = 55000
    expect(status.currentAmount).toBe(55000);
  });
});
