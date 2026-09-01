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
    transactions: { where: txChain.where, add: vi.fn().mockResolvedValue(undefined) },
    recurringTransactions: { where: recChain.where },
    incomes: { add: vi.fn().mockResolvedValue(undefined) },
    savingsGoals: { where: goalChain.where },
    monthSnapshots: {
      get: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

import { buckets, transactions, incomes, monthSnapshots, bucketStatuses, deleteBucket, addTransaction, addIncome } from '$lib/stores/budgetStore';
import { currentMonthKey } from '$lib/stores/uiStore';

const bucket = (id: string, over: Partial<import('$lib/types').Bucket> = {}) => ({
  id, name: id, color: '#000', order: 0, isDefault: false,
  allocationType: 'fixed' as const, fixedAmount: 0, percentageAmount: 0, isSavings: false, ...over,
});

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

describe('amount validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a transaction with a NaN amount', async () => {
    await expect(
      addTransaction({ amount: NaN, bucketId: 'b1', date: new Date(2026, 0, 1) })
    ).rejects.toThrow(/amount/i);
  });

  it('rejects income with a non-finite amount', async () => {
    await expect(
      addIncome({ amount: Infinity, date: new Date(2026, 0, 1), isRecurring: false, type: 'fixed' })
    ).rejects.toThrow(/amount/i);
  });

  it('accepts a valid transaction amount', async () => {
    await expect(
      addTransaction({ amount: 1234, bucketId: 'b1', date: new Date(2026, 0, 1) })
    ).resolves.toBeDefined();
  });
});

describe('bucketStatuses rollover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buckets.set([bucket('groceries', { fixedAmount: 50000 })]);
    incomes.set([]);
    monthSnapshots.set([]);
    currentMonthKey.set('2026-03');
  });

  it('carries unspent fixed allocation from prior months into the current month', () => {
    transactions.set([
      { id: 'a', amount: 30000, bucketId: 'groceries', date: new Date(2026, 0, 10) }, // Jan: 50000-30000 = +20000
      { id: 'b', amount: 45000, bucketId: 'groceries', date: new Date(2026, 1, 10) }, // Feb: 50000-45000 = +5000
    ]);
    const status = get(bucketStatuses).find((s) => s.bucket.id === 'groceries')!;
    expect(status.rollover).toBe(25000);
    // March: 50000 allocated + 25000 rolled over, nothing spent yet
    expect(status.remaining).toBe(75000);
  });

  it('ignores the current and future months when computing rollover', () => {
    transactions.set([
      { id: 'c', amount: 10000, bucketId: 'groceries', date: new Date(2026, 2, 5) }, // March (current)
      { id: 'd', amount: 10000, bucketId: 'groceries', date: new Date(2026, 5, 5) }, // June (future)
    ]);
    const status = get(bucketStatuses).find((s) => s.bucket.id === 'groceries')!;
    expect(status.rollover).toBe(0);
  });
});
