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

import { savingsGoals, loadGoals } from '$lib/stores/goalsStore';

describe('loadGoals', () => {
  it('normalizes date fields that survived as strings, so getMonthKey never sees a non-Date', async () => {
    await loadGoals();
    const [goal] = get(savingsGoals);
    expect(goal.createdAt).toBeInstanceOf(Date);
    expect(goal.targetDate).toBeInstanceOf(Date);
  });
});
