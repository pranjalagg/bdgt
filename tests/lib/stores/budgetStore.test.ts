import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const { txChain, recChain, goalChain } = vi.hoisted(() => {
  const make = () => {
    const del = vi.fn().mockResolvedValue(1);
    return { where: vi.fn(() => ({ equals: vi.fn(() => ({ delete: del })) })), del };
  };
  return { txChain: make(), recChain: make(), goalChain: make() };
});

vi.mock('$lib/db', () => ({
  initializeDefaultBuckets: vi.fn().mockResolvedValue(undefined),
  db: {
    buckets: { delete: vi.fn().mockResolvedValue(undefined) },
    transactions: { where: txChain.where },
    recurringTransactions: { where: recChain.where },
    savingsGoals: { where: goalChain.where },
    monthSnapshots: {
      get: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

import { buckets, transactions, deleteBucket } from '$lib/stores/budgetStore';

describe('deleteBucket cascade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buckets.set([
      { id: 'b1', name: 'Food', color: '#000', order: 0, isDefault: false, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0, isSavings: false },
      { id: 'b2', name: 'Rent', color: '#111', order: 1, isDefault: false, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0, isSavings: false },
    ]);
    transactions.set([
      { id: 't1', amount: 100, bucketId: 'b1', date: new Date(2026, 0, 1) },
      { id: 't2', amount: 200, bucketId: 'b2', date: new Date(2026, 0, 2) },
      { id: 't3', amount: 300, bucketId: 'b1', date: new Date(2026, 0, 3) },
    ]);
  });

  it('removes the bucket from the store', async () => {
    await deleteBucket('b1');
    expect(get(buckets).map((b) => b.id)).toEqual(['b2']);
  });

  it('drops the deleted bucket\'s transactions from the store', async () => {
    await deleteBucket('b1');
    expect(get(transactions).map((t) => t.id)).toEqual(['t2']);
  });

  it('deletes the bucket\'s transactions, recurring items and goals in the db', async () => {
    await deleteBucket('b1');
    expect(txChain.del).toHaveBeenCalled();
    expect(recChain.del).toHaveBeenCalled();
    expect(goalChain.del).toHaveBeenCalled();
  });
});
