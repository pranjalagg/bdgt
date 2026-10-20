import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '$lib/db';
import { setCaptureEnabled } from '$lib/sync/capture';

// The v10 schema exactly as shipped, to build a database the way an
// existing user has it before opening it with the current app.
const V10 = {
  buckets: 'id, name, order',
  transactions: 'id, bucketId, date, recurringId',
  recurringTransactions: 'id, bucketId, nextDueDate, isActive',
  incomes: 'id, date',
  monthSnapshots: 'month',
  savingsGoals: 'id, bucketId',
  investmentLots: 'id, symbol, purchaseDate',
  investmentSells: 'id, lotId, sellDate',
  investmentPrices: 'symbol',
  settings: 'key',
};

async function seedV10(seed: (old: Dexie) => Promise<void>): Promise<void> {
  db.close();
  await Dexie.delete('BudgetDB');
  const old = new Dexie('BudgetDB');
  old.version(10).stores(V10);
  await old.open();
  await seed(old);
  old.close();
}

describe('month record split migration', () => {
  beforeEach(async () => {
    db.close();
    await Dexie.delete('BudgetDB');
  });

  it('copies every allocation and note into their own rows and keeps all other data', async () => {
    await seedV10(async (old) => {
      await old.table('monthSnapshots').bulkAdd([
        {
          month: '2026-06', incomeTotal: 0, allocations: { b1: 50000, b2: 0 }, spent: { b1: 999 }, rollovers: {},
          notes: [{ id: 'n1', text: 'Family visit', effect: 'down', createdAt: 5 }],
        },
        { month: '2026-07', incomeTotal: 0, allocations: {}, spent: {}, rollovers: {}, notes: [{ id: 'n2', text: 'Bonus', effect: 'up', createdAt: 6 }] },
        { month: '2025-01', incomeTotal: 0, allocations: {}, spent: {}, rollovers: {}, notes: [] },
        { month: '2026-08', incomeTotal: 0, allocations: { bad: Number.NaN, b1: 1 }, spent: {}, rollovers: {} },
      ]);
      await old.table('transactions').add({ id: 't1', amount: 500, bucketId: 'b1', date: new Date(2026, 5, 3) });
      await old.table('settings').bulkAdd([{ key: 'baseCurrency', value: 'USD' }, { key: 'currencyConfirmed', value: true }]);
    });

    await db.open();

    expect((await db.allocations.toArray()).sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: '2026-06:b1', month: '2026-06', bucketId: 'b1', amount: 50000 },
      { id: '2026-06:b2', month: '2026-06', bucketId: 'b2', amount: 0 },
      { id: '2026-08:b1', month: '2026-08', bucketId: 'b1', amount: 1 },
    ]);
    expect((await db.monthNotes.toArray()).sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: 'n1', month: '2026-06', text: 'Family visit', effect: 'down', createdAt: 5 },
      { id: 'n2', month: '2026-07', text: 'Bonus', effect: 'up', createdAt: 6 },
    ]);
    expect(await db.transactions.count()).toBe(1);
    expect((await db.transactions.get('t1'))?.date).toBeInstanceOf(Date);
    expect(await db.settings.count()).toBe(2);
    expect(db.verno).toBe(13);
    expect(db.tables.map((t) => t.name)).not.toContain('monthSnapshots');
  });

  it('opens a brand-new database with empty month tables', async () => {
    await db.open();
    expect(await db.allocations.count()).toBe(0);
    expect(await db.monthNotes.count()).toBe(0);
  });

  it('does not queue sync entries for migration writes, even with capture on', async () => {
    await seedV10(async (old) => {
      await old.table('monthSnapshots').add({ month: '2026-06', incomeTotal: 0, allocations: { b1: 5 }, spent: {}, rollovers: {} });
    });
    setCaptureEnabled(true);
    try {
      await db.open();
      expect(await db.allocations.count()).toBe(1);
      expect(await db.syncOutbox.count()).toBe(0);
    } finally {
      setCaptureEnabled(false);
    }
  });
});
