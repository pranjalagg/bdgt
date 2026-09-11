import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const { txState } = vi.hoisted(() => ({ txState: { recurring: [] as unknown[] } }));

vi.mock('$lib/db', () => ({
  DATE_FIELDS: { transactions: ['date'], recurringTransactions: ['nextDueDate'] },
  db: {
    transaction: vi.fn((_mode: string, _tables: unknown, cb: () => unknown) => cb()),
    transactions: { bulkAdd: vi.fn().mockResolvedValue(undefined) },
    recurringTransactions: {
      filter: vi.fn((pred: (r: unknown) => boolean) => ({
        toArray: vi.fn().mockResolvedValue(txState.recurring.filter(pred)),
      })),
      update: vi.fn().mockResolvedValue(undefined),
      toArray: vi.fn().mockResolvedValue([]),
    },
  },
}));

import { dueOccurrences, processRecurring } from '$lib/stores/recurringStore';
import { transactions } from '$lib/stores/budgetStore';
import { db } from '$lib/db';

describe('dueOccurrences', () => {
  it('returns nothing when the next due date is still in the future', () => {
    const next = new Date(2026, 5, 1);
    const until = new Date(2026, 4, 20);
    const result = dueOccurrences(next, 'monthly', until);
    expect(result.occurrences).toEqual([]);
    expect(result.nextDueDate.getTime()).toBe(next.getTime());
  });

  it('catches up every missed monthly occurrence in one pass', () => {
    const result = dueOccurrences(new Date(2026, 0, 15), 'monthly', new Date(2026, 3, 20));
    expect(result.occurrences.map((d) => d.getMonth())).toEqual([0, 1, 2, 3]);
    expect(result.nextDueDate.getMonth()).toBe(4); // May
  });

  it('catches up weekly occurrences', () => {
    const result = dueOccurrences(new Date(2026, 0, 1), 'weekly', new Date(2026, 0, 29));
    expect(result.occurrences).toHaveLength(5); // Jan 1, 8, 15, 22, 29
    expect(result.nextDueDate.getDate()).toBe(5); // Feb 5
  });

  it('advances biweekly by 14 days', () => {
    const result = dueOccurrences(new Date(2026, 0, 1), 'biweekly', new Date(2026, 0, 20));
    expect(result.occurrences).toHaveLength(2); // Jan 1, Jan 15
    expect(result.nextDueDate.getDate()).toBe(29);
  });

  it('caps runaway catch-up and fast-forwards past the cutoff', () => {
    const result = dueOccurrences(new Date(2000, 0, 1), 'weekly', new Date(2026, 0, 1));
    expect(result.occurrences.length).toBeLessThanOrEqual(366);
    expect(result.nextDueDate.getTime()).toBeGreaterThan(new Date(2026, 0, 1).getTime());
  });

  it('terminates instead of hanging on a frequency that never advances the cursor', () => {
    // An imported record can carry a frequency outside the TS union
    // (parseImport doesn't validate it). calculateNextDueDate's switch
    // has no default case, so an unknown frequency leaves cursor
    // unchanged -- this must not spin forever.
    const start = new Date(2020, 0, 1);
    const result = dueOccurrences(start, 'yearly' as never, new Date(2026, 0, 1));
    expect(result.occurrences).toEqual([]);
    expect(result.nextDueDate.getTime()).toBe(start.getTime());
  }, 2000);
});

describe('processRecurring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txState.recurring = [];
    transactions.set([]);
  });

  it('does nothing when nothing is due', async () => {
    const count = await processRecurring();
    expect(count).toBe(0);
    expect(db.transactions.bulkAdd).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('inserts every occurrence and advances nextDueDate in one transaction', async () => {
    txState.recurring = [
      { id: 'r1', amount: 500, bucketId: 'b1', frequency: 'monthly', nextDueDate: new Date(), isActive: true },
    ];

    const count = await processRecurring();

    expect(count).toBe(1);
    expect(db.transaction).toHaveBeenCalledWith('rw', [db.transactions, db.recurringTransactions], expect.any(Function));
    expect(db.transactions.bulkAdd).toHaveBeenCalledWith([
      expect.objectContaining({ amount: 500, bucketId: 'b1', recurringId: 'r1' }),
    ]);
    expect(db.recurringTransactions.update).toHaveBeenCalledWith('r1', { nextDueDate: expect.any(Date) });
    expect(get(transactions)).toHaveLength(1);
  });

  it('never advances nextDueDate for an item that produced no occurrences', async () => {
    txState.recurring = [
      { id: 'r-broken', amount: 500, bucketId: 'b1', frequency: 'yearly' as never, nextDueDate: new Date(2020, 0, 1), isActive: true },
    ];

    const count = await processRecurring();

    expect(count).toBe(0);
    expect(db.recurringTransactions.update).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('skips an item with a non-finite amount instead of writing NaN transactions', async () => {
    txState.recurring = [
      { id: 'r-nan', amount: NaN, bucketId: 'b1', frequency: 'monthly', nextDueDate: new Date(), isActive: true },
      { id: 'r-ok', amount: 500, bucketId: 'b1', frequency: 'monthly', nextDueDate: new Date(), isActive: true },
    ];

    const count = await processRecurring();

    expect(count).toBe(1);
    expect(db.transactions.bulkAdd).toHaveBeenCalledWith([
      expect.objectContaining({ recurringId: 'r-ok' }),
    ]);
    expect(db.recurringTransactions.update).toHaveBeenCalledTimes(1);
    expect(db.recurringTransactions.update).toHaveBeenCalledWith('r-ok', { nextDueDate: expect.any(Date) });
  });

  it('leaves the local transactions store untouched if the db transaction fails', async () => {
    txState.recurring = [
      { id: 'r1', amount: 500, bucketId: 'b1', frequency: 'monthly', nextDueDate: new Date(), isActive: true },
    ];
    vi.mocked(db.transactions.bulkAdd).mockRejectedValueOnce(new Error('quota exceeded'));

    await expect(processRecurring()).rejects.toThrow('quota exceeded');

    expect(get(transactions)).toHaveLength(0);
    expect(db.recurringTransactions.update).not.toHaveBeenCalled();
  });
});
