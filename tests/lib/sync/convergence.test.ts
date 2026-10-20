import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeDevice, dropDevice } from '../../helpers/devices';
import { FakeServer } from '../../helpers/fakeServer';
import { syncOnce } from '$lib/sync/engine';
import { COLLECTIONS, collectionByTable, toRow } from '$lib/sync/registry';
import { autoTransaction } from '$lib/sync/transactions';
import { resetClockForTests } from '$lib/sync/clock';
import type { BudgetDatabase } from '$lib/db';

let A: BudgetDatabase;
let B: BudgetDatabase;
let server: FakeServer;
const day = new Date(2026, 9, 20);
const sync = (d: BudgetDatabase) => syncOnce({ db: d, transport: server });
const bucket = (id: string) => ({ id, name: id, color: '#000', order: 0, isDefault: false, allocationType: 'fixed' as const, fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: true, createdAt: new Date(2026, 0, 1) });
const tx = (id: string, over: Record<string, unknown> = {}) => ({ id, amount: 100, bucketId: 'b1', date: day, ...over });

// A few rounds of A then B: enough for any change to reach the other device
// and for repairs to settle.
async function settle() {
  for (let i = 0; i < 3; i++) {
    await sync(A);
    await sync(B);
  }
}

async function state(d: BudgetDatabase) {
  const out: Record<string, string[]> = {};
  for (const def of COLLECTIONS) {
    out[def.table] = (await d.table(def.table).toArray()).map((r) => JSON.stringify(toRow(def, r as Record<string, unknown>))).sort();
  }
  return out;
}

beforeEach(async () => {
  resetClockForTests();
  A = await makeDevice('device-a');
  B = await makeDevice('device-b');
  server = new FakeServer(() => 5_000_000_000_000);
});

afterEach(async () => {
  await dropDevice(A);
  await dropDevice(B);
});

describe('two devices', () => {
  it('spreads new records from one device to the other', async () => {
    await A.buckets.add(bucket('b1'));
    await A.transactions.add(tx('t1', { note: 'Flight' }));
    await settle();
    expect(await B.transactions.get('t1')).toMatchObject({ amount: 100, bucketId: 'b1', note: 'Flight' });
    expect(await state(A)).toEqual(await state(B));
    expect(await A.syncOutbox.count()).toBe(0);
    expect(await B.syncOutbox.count()).toBe(0);
  });

  it('does not rewrite a device\'s own records when its pushed rows come back', async () => {
    await A.buckets.add(bucket('b1'));
    await A.transactions.add(tx('t1', { date: new Date(2026, 9, 20, 15, 30) }));
    await sync(A);
    const second = await sync(A);
    expect(second).toMatchObject({ status: 'ok', changed: false, pushed: 0 });
    expect((await A.transactions.get('t1'))!.date.getHours()).toBe(15);
  });

  it('converges on the later edit when both devices edit the same record', async () => {
    await A.buckets.add(bucket('b1'));
    await A.transactions.add(tx('t1'));
    await settle();
    await A.transactions.update('t1', { amount: 1 });
    await B.transactions.update('t1', { amount: 2 }); // later in time
    await settle();
    expect((await A.transactions.get('t1'))!.amount).toBe(2);
    expect(server.live('transactions')[0].amount_cents).toBe(2);
    expect(await state(A)).toEqual(await state(B));
  });

  it('keeps an edit made after a delete', async () => {
    await A.buckets.add(bucket('b1'));
    await A.transactions.add(tx('t1'));
    await settle();
    await A.transactions.delete('t1');
    await B.transactions.update('t1', { amount: 5 });
    await settle();
    expect((await A.transactions.get('t1'))!.amount).toBe(5);
    expect(await state(A)).toEqual(await state(B));
  });

  it('keeps a delete made after an edit', async () => {
    await A.buckets.add(bucket('b1'));
    await A.transactions.add(tx('t1'));
    await settle();
    await B.transactions.update('t1', { amount: 5 });
    await A.transactions.delete('t1');
    await settle();
    expect(await B.transactions.get('t1')).toBeUndefined();
    expect(server.live('transactions')).toEqual([]);
    expect(await state(A)).toEqual(await state(B));
  });

  it('lets a device edit a record whose latest version came from a clock ahead of its own', async () => {
    await A.buckets.add(bucket('b1'));
    await sync(A);
    const ahead = Date.now() + 3_600_000;
    const def = collectionByTable('transactions')!;
    await server.upsert('transactions', [{ ...toRow(def, tx('t1')), updated_at: new Date(ahead).toISOString(), deleted_at: null }]);
    await sync(A);

    await A.transactions.update('t1', { amount: 42 });

    expect((await A.syncOutbox.get('transactions:t1'))!.at).toBe(ahead + 1);
    await settle();
    expect(server.live('transactions')[0].amount_cents).toBe(42);
    expect((await B.transactions.get('t1'))!.amount).toBe(42);
  });

  it('merges assignments to different buckets in the same month', async () => {
    await A.allocations.put({ id: '2026-10:b1', month: '2026-10', bucketId: 'b1', amount: 100 });
    await B.allocations.put({ id: '2026-10:b2', month: '2026-10', bucketId: 'b2', amount: 200 });
    await settle();
    for (const d of [A, B]) expect((await d.allocations.toArray()).map((a) => a.id).sort()).toEqual(['2026-10:b1', '2026-10:b2']);
    expect(await state(A)).toEqual(await state(B));
  });

  it('makes one record when both devices generate the same recurring occurrence, and keeps a real edit', async () => {
    await A.buckets.add(bucket('b1'));
    await settle();
    const occurrence = (amount: number) => ({ id: 'r1:2026-10-08', amount, bucketId: 'b1', date: new Date(2026, 9, 8), recurringId: 'r1' });
    await autoTransaction(A, [A.transactions], () => A.transactions.put(occurrence(500)));
    await autoTransaction(B, [B.transactions], () => B.transactions.put(occurrence(500)));
    await A.transactions.update('r1:2026-10-08', { amount: 600 });
    await settle();
    expect(server.live('transactions')).toHaveLength(1);
    expect((await B.transactions.get('r1:2026-10-08'))!.amount).toBe(600);
    expect(await state(A)).toEqual(await state(B));
    expect(await B.syncOutbox.count()).toBe(0);
  });

  it('files a transaction under Unsorted when its bucket was deleted on the other device', async () => {
    await A.buckets.add(bucket('b1'));
    await settle();
    await A.buckets.delete('b1');
    await B.transactions.add(tx('t9'));
    await settle();
    for (const d of [A, B]) {
      expect(await d.buckets.get('b1')).toBeUndefined();
      expect(await d.buckets.get('unsorted')).toBeTruthy();
      expect((await d.transactions.get('t9'))!.bucketId).toBe('unsorted');
    }
    expect(await state(A)).toEqual(await state(B));
  });

  it('adds up sold shares when both devices sell from the same lot', async () => {
    const lot = { id: 'l1', symbol: 'VTI', shares: 10, pricePerShare: 1000, purchaseDate: day, soldShares: 0 };
    const sell = (id: string, shares: number) => ({ id, lotId: 'l1', shares, pricePerShare: 1100, sellDate: day });
    await A.investmentLots.add(lot);
    await settle();
    await A.investmentSells.add(sell('s1', 3));
    await A.investmentLots.update('l1', { soldShares: 3 });
    await B.investmentSells.add(sell('s2', 4));
    await B.investmentLots.update('l1', { soldShares: 4 });
    await settle();
    for (const d of [A, B]) {
      expect((await d.investmentLots.get('l1'))!.soldShares).toBe(7);
      expect(await d.investmentSells.count()).toBe(2);
    }
    expect(await state(A)).toEqual(await state(B));
  });

  it('delivers changes made offline once the connection is back', async () => {
    await A.buckets.add(bucket('b1'));
    await settle();
    server.offline = true;
    await A.transactions.add(tx('t1'));
    expect(await sync(A)).toMatchObject({ status: 'offline' });
    expect(await A.syncOutbox.count()).toBe(1);
    server.offline = false;
    await settle();
    expect(await B.transactions.get('t1')).toBeTruthy();
    expect(await A.syncOutbox.count()).toBe(0);
  });

  it('applies nothing from a pull that failed halfway, and recovers', async () => {
    await A.buckets.add(bucket('b1'));
    await A.transactions.add(tx('t1'));
    await sync(A);
    server.failNextPull('transactions');
    expect(await sync(B)).toMatchObject({ status: 'offline' });
    expect(await B.buckets.count()).toBe(0);
    expect(await B.transactions.count()).toBe(0);
    await settle();
    expect(await B.transactions.get('t1')).toBeTruthy();
    expect(await state(A)).toEqual(await state(B));
  });
});
