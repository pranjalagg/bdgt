import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
  DATE_FIELDS: { transactions: ['date'], incomes: ['date'] },
  db: {
    transaction: vi.fn((_mode: string, _tables: unknown, cb: () => unknown) => cb()),
    buckets: {
      delete: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      orderBy: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
    },
    transactions: {
      where: txChain.where,
      add: vi.fn().mockResolvedValue(undefined),
      toArray: vi.fn().mockResolvedValue([]),
    },
    recurringTransactions: { where: recChain.where },
    incomes: { add: vi.fn().mockResolvedValue(undefined), toArray: vi.fn().mockResolvedValue([]) },
    savingsGoals: { where: goalChain.where },
    monthSnapshots: {
      get: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
      toArray: vi.fn().mockResolvedValue([]),
    },
  },
}));

import { buckets, transactions, incomes, monthSnapshots, bucketStatuses, monthlyLedger, deleteBucket, addTransaction, addIncome, loadData, addBucket, setAllocation, setAllocations, carryForwardAllocations, updateBucketAllocation, safeToSpendPerDay } from '$lib/stores/budgetStore';
import { db } from '$lib/db';
import { currentMonthKey } from '$lib/stores/uiStore';

const bucket = (id: string, over: Partial<import('$lib/types').Bucket> = {}) => ({
  id, name: id, color: '#000', order: 0, isDefault: false,
  allocationType: 'fixed' as const, fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: true,
  createdAt: new Date(2000, 0, 1), ...over,
});

describe('deleteBucket cascade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buckets.set([
      bucket('b1', { name: 'Food', color: '#000' }),
      bucket('b2', { name: 'Rent', color: '#111', order: 1 }),
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

describe('monthlyLedger range', () => {
  it('is not dragged back to the epoch by a migrated bucket\'s sentinel createdAt', () => {
    // The v8 migration backfills pre-existing buckets' createdAt to the
    // epoch so the rollover cutoff never excludes them -- but the ledger's
    // own month range must not treat that sentinel as "this bucket has
    // existed since 1970" and blow up to ~670 months for every user.
    buckets.set([bucket('groceries', { createdAt: new Date(0) })]);
    transactions.set([
      { id: 'a', amount: 100, bucketId: 'groceries', date: new Date(2026, 0, 15) },
    ]);
    incomes.set([]);
    monthSnapshots.set([]);

    const { months } = get(monthlyLedger);
    expect(months.length).toBeLessThan(24);
    expect(months[0]).toBe('2026-01');
  });
});

describe('safeToSpendPerDay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    monthSnapshots.set([]);
    incomes.set([]);
  });

  afterEach(() => vi.useRealTimers());

  it('is null when viewing a month other than the current one', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15)); // today: March 15
    buckets.set([bucket('groceries', { fixedAmount: 30000 })]);
    transactions.set([]);
    currentMonthKey.set('2026-02'); // viewing February, not the current month
    expect(get(safeToSpendPerDay)).toBeNull();
  });

  it('divides remaining everyday-bucket money by the days left including today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 21)); // March has 31 days; 11 days left incl. today
    buckets.set([
      bucket('groceries', { fixedAmount: 60000, isEveryday: true, createdAt: new Date(2026, 2, 1) }),
      bucket('rent', { fixedAmount: 210000, isEveryday: false, createdAt: new Date(2026, 2, 1) }),
    ]);
    transactions.set([
      { id: 'a', amount: 15000, bucketId: 'groceries', date: new Date(2026, 2, 5) },
      { id: 'b', amount: 210000, bucketId: 'rent', date: new Date(2026, 2, 1) },
    ]);
    currentMonthKey.set('2026-03');

    // groceries remaining 60000-15000=45000, rent excluded (not everyday)
    // 45000 / 11 = 4090.9 -> rounds to 4091
    expect(get(safeToSpendPerDay)).toBe(4091);
  });
});

describe('bucketStatuses rollover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buckets.set([bucket('groceries', { fixedAmount: 50000, createdAt: new Date(2026, 0, 1) })]);
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
    // Bucket created this month specifically, so there are no quiet
    // prior months to legitimately accrue -- isolates that March
    // (current) and June (future) themselves are excluded.
    buckets.set([bucket('groceries', { fixedAmount: 50000, createdAt: new Date(2026, 2, 1) })]);
    transactions.set([
      { id: 'c', amount: 10000, bucketId: 'groceries', date: new Date(2026, 2, 5) }, // March (current)
      { id: 'd', amount: 10000, bucketId: 'groceries', date: new Date(2026, 5, 5) }, // June (future)
    ]);
    const status = get(bucketStatuses).find((s) => s.bucket.id === 'groceries')!;
    expect(status.rollover).toBe(0);
  });

  it('still accrues a completely quiet month with no transaction, income or snapshot', () => {
    // Jan has activity; Feb has none at all (not even a snapshot); the
    // bucket's $500 fixed allocation must still roll over from Feb even
    // though nothing was recorded that month.
    transactions.set([
      { id: 'a', amount: 30000, bucketId: 'groceries', date: new Date(2026, 0, 10) }, // Jan: +20000
    ]);
    const status = get(bucketStatuses).find((s) => s.bucket.id === 'groceries')!;
    // Jan +20000, Feb (quiet) +50000
    expect(status.rollover).toBe(70000);
  });
});

describe('loadData', () => {
  it('normalizes transaction and income dates that survived as strings', async () => {
    vi.mocked(db.transactions.toArray).mockResolvedValue([
      { id: 't1', amount: 500, bucketId: 'b1', date: '2026-03-05T00:00:00.000Z' } as never,
    ]);
    vi.mocked(db.incomes.toArray).mockResolvedValue([
      { id: 'i1', amount: 500000, date: '2026-03-01T00:00:00.000Z', isRecurring: false, type: 'fixed' } as never,
    ]);

    await loadData();

    expect(get(transactions)[0].date).toBeInstanceOf(Date);
    expect(get(incomes)[0].date).toBeInstanceOf(Date);
  });
});

describe('allocation domain validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a negative fixed allocation via setAllocation', async () => {
    await expect(setAllocation('b1', -500)).rejects.toThrow(/negative/i);
    expect(db.monthSnapshots.put).not.toHaveBeenCalled();
  });

  it('rejects a negative fixedAmount when adding a bucket', async () => {
    await expect(
      addBucket({
        name: 'Pets', color: '#000', order: 0, isDefault: false,
        allocationType: 'fixed', fixedAmount: -1000, percentageAmount: 0, isSavings: false, isEveryday: true,
        createdAt: new Date(),
      })
    ).rejects.toThrow(/negative/i);
    expect(db.buckets.add).not.toHaveBeenCalled();
  });

  it('rejects a negative percentageAmount when adding a bucket', async () => {
    await expect(
      addBucket({
        name: 'Pets', color: '#000', order: 0, isDefault: false,
        allocationType: 'percentage', fixedAmount: 0, percentageAmount: -10, isSavings: false, isEveryday: true,
        createdAt: new Date(),
      })
    ).rejects.toThrow(/negative/i);
    expect(db.buckets.add).not.toHaveBeenCalled();
  });

  it('rejects a negative fixedAmount from updateBucketAllocation even for a hybrid bucket', async () => {
    // Hybrid writes fixedAmount straight to db.buckets.update, bypassing
    // setAllocation entirely -- the only other place this was validated.
    await expect(updateBucketAllocation('b1', 'hybrid', -200, 10)).rejects.toThrow(/negative/i);
    expect(db.buckets.update).not.toHaveBeenCalled();
  });

  it('rejects a negative percentageAmount from updateBucketAllocation', async () => {
    await expect(updateBucketAllocation('b1', 'percentage', 0, -5)).rejects.toThrow(/negative/i);
    expect(db.buckets.update).not.toHaveBeenCalled();
  });

  it('accepts a zero allocation (fully unfunded bucket)', async () => {
    await expect(setAllocation('b1', 0)).resolves.toBeUndefined();
  });
});

describe('setAllocations (bulk assign)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    monthSnapshots.set([]);
    currentMonthKey.set('2026-03');
  });

  it('writes every bucket in one snapshot put', async () => {
    await setAllocations({ b1: 50000, b2: 25000 });

    expect(db.monthSnapshots.put).toHaveBeenCalledTimes(1);
    const written = vi.mocked(db.monthSnapshots.put).mock.calls[0][0] as { allocations: Record<string, number> };
    expect(written.allocations).toEqual({ b1: 50000, b2: 25000 });
    expect(get(monthSnapshots)[0].allocations).toEqual({ b1: 50000, b2: 25000 });
  });

  it('merges into allocations already set for the month', async () => {
    vi.mocked(db.monthSnapshots.get).mockResolvedValue({
      month: '2026-03', incomeTotal: 0, allocations: { b1: 10000, keep: 700 }, spent: {}, rollovers: {},
    });

    await setAllocations({ b1: 50000 });

    const written = vi.mocked(db.monthSnapshots.put).mock.calls[0][0] as { allocations: Record<string, number> };
    expect(written.allocations).toEqual({ b1: 50000, keep: 700 });
  });

  it('rejects the whole batch if any amount is negative', async () => {
    await expect(setAllocations({ b1: 50000, b2: -1 })).rejects.toThrow(/negative/i);
    expect(db.monthSnapshots.put).not.toHaveBeenCalled();
  });

  it('rejects a non-finite amount', async () => {
    await expect(setAllocations({ b1: NaN })).rejects.toThrow(/amount|finite/i);
    expect(db.monthSnapshots.put).not.toHaveBeenCalled();
  });
});

describe('carryForwardAllocations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks keeps mockResolvedValue from earlier tests — reset the
    // snapshot read back to "no snapshot for this month yet".
    vi.mocked(db.monthSnapshots.get).mockResolvedValue(undefined as never);
    currentMonthKey.set('2026-03');
    buckets.set([bucket('b1'), bucket('b2')]);
  });

  it('copies the previous month\'s allocations into the current month', async () => {
    monthSnapshots.set([
      { month: '2026-02', incomeTotal: 0, allocations: { b1: 50000, b2: 25000 }, spent: {}, rollovers: {} },
    ]);

    const count = await carryForwardAllocations();

    expect(count).toBe(2);
    const written = vi.mocked(db.monthSnapshots.put).mock.calls[0][0] as { month: string; allocations: Record<string, number> };
    expect(written.month).toBe('2026-03');
    expect(written.allocations).toEqual({ b1: 50000, b2: 25000 });
  });

  it('copies nothing when the previous month has no snapshot', async () => {
    monthSnapshots.set([]);
    const count = await carryForwardAllocations();
    expect(count).toBe(0);
    expect(db.monthSnapshots.put).not.toHaveBeenCalled();
  });

  it('skips allocations for buckets that no longer exist', async () => {
    monthSnapshots.set([
      { month: '2026-02', incomeTotal: 0, allocations: { b1: 50000, deleted: 9999 }, spent: {}, rollovers: {} },
    ]);

    const count = await carryForwardAllocations();

    expect(count).toBe(1);
    const written = vi.mocked(db.monthSnapshots.put).mock.calls[0][0] as { allocations: Record<string, number> };
    expect(written.allocations).toEqual({ b1: 50000 });
  });
});
