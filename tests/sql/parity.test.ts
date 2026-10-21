import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDevice, dropDevice } from '../helpers/devices';
import { createSupabaseDb, resetData, addUser, asOwner, asUser, USER_A, USER_B, USER_C } from '../helpers/supabaseSql';
import { PostgrestOverPglite } from '../helpers/postgrestOverPglite';
import { SupabaseTransport } from '$lib/sync/supabaseTransport';
import { syncOnce, checkAccount } from '$lib/sync/engine';
import { runFirstSignIn } from '$lib/sync/firstSignIn';
import { pushPending } from '$lib/sync/push';
import { getState, LINKED_ACCOUNT } from '$lib/sync/state';
import { COLLECTIONS, toRow } from '$lib/sync/registry';
import { resetClockForTests } from '$lib/sync/clock';
import type { BudgetDatabase } from '$lib/db';

// The engine, through the real SupabaseTransport, against the real SQL.
// The same scenarios the FakeServer tests run, so a difference between the
// fake and the database shows up here.

let pg: PGlite;
let A: BudgetDatabase;
let B: BudgetDatabase;
const day = new Date(2026, 9, 20);
const transport = () => new SupabaseTransport(new PostgrestOverPglite(pg) as never);
const ctx = (db: BudgetDatabase) => ({ db, transport: transport() });
const sync = (db: BudgetDatabase) => syncOnce(ctx(db));
const bucket = (id: string) => ({ id, name: id, color: '#000', order: 0, isDefault: false, allocationType: 'fixed' as const, fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: true, createdAt: new Date(2026, 0, 1) });
const tx = (id: string, over: Record<string, unknown> = {}) => ({ id, amount: 100, bucketId: 'b1', date: day, ...over });

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

const live = async (table: string) => {
  await asOwner(pg);
  const rows = (await pg.query<{ id: string; amount_cents: string }>(`select id, amount_cents from public.${table} where deleted_at is null order by id`)).rows;
  await asUser(pg, USER_A);
  return rows;
};

beforeAll(async () => {
  pg = await createSupabaseDb();
});

beforeEach(async () => {
  resetClockForTests();
  await resetData(pg);
  await addUser(pg, USER_A);
  await addUser(pg, USER_B);
  await addUser(pg, USER_C, false);
  await asUser(pg, USER_A);
  A = await makeDevice('sql-a');
  B = await makeDevice('sql-b');
});

afterEach(async () => {
  await dropDevice(A);
  await dropDevice(B);
});

describe('the engine against the real database', () => {
  it('spreads new records from one device to the other', async () => {
    await A.buckets.add(bucket('b1'));
    await A.transactions.add(tx('t1', { note: 'Flight', foreign: { amount: 500000, currency: 'INR', rate: 84.25, base: 'USD' } }));
    expect(await sync(A)).toMatchObject({ status: 'ok', pushed: 2 });
    await settle();
    expect(await B.transactions.get('t1')).toMatchObject({ amount: 100, note: 'Flight', foreign: { amount: 500000, currency: 'INR', rate: 84.25, base: 'USD' } });
    expect(await state(A)).toEqual(await state(B));
    expect(await A.syncOutbox.count()).toBe(0);
  });

  it('does not rewrite a device\'s own records when its pushed rows come back', async () => {
    await A.buckets.add(bucket('b1'));
    await A.transactions.add(tx('t1', { date: new Date(2026, 9, 20, 15, 30), createdAt: 1790000000123 }));
    await sync(A);
    expect(await sync(A)).toMatchObject({ status: 'ok', changed: false, pushed: 0 });
    expect((await A.transactions.get('t1'))!.date.getHours()).toBe(15);
  });

  it('converges on the later edit when both devices edit the same record', async () => {
    await A.buckets.add(bucket('b1'));
    await A.transactions.add(tx('t1'));
    await settle();
    await A.transactions.update('t1', { amount: 1 });
    await B.transactions.update('t1', { amount: 2 });
    await settle();
    expect((await A.transactions.get('t1'))!.amount).toBe(2);
    expect((await live('transactions')).map((r) => [r.id, Number(r.amount_cents)])).toEqual([['t1', 2]]);
  });

  it('keeps an edit made after a delete, and a delete made after an edit', async () => {
    await A.buckets.add(bucket('b1'));
    await A.transactions.bulkAdd([tx('keep'), tx('gone')]);
    await settle();
    await A.transactions.delete('keep');
    await B.transactions.update('keep', { amount: 5 });
    await B.transactions.update('gone', { amount: 5 });
    await A.transactions.delete('gone');
    await settle();
    expect((await A.transactions.get('keep'))!.amount).toBe(5);
    expect(await B.transactions.get('gone')).toBeUndefined();
    expect((await live('transactions')).map((r) => r.id)).toEqual(['keep']);
    expect(await state(A)).toEqual(await state(B));
  });

  it('lets a device edit a record whose latest version came from a clock ahead of its own', async () => {
    await A.buckets.add(bucket('b1'));
    await sync(A);
    // Another device with a clock 30 s ahead (inside the server's 1 minute allowance).
    const ahead = Date.now() + 30_000;
    const def = COLLECTIONS.find((c) => c.table === 'transactions')!;
    await transport().upsert('transactions', [{ ...toRow(def, tx('t1')), updated_at: new Date(ahead).toISOString(), deleted_at: null }]);
    await sync(A);
    await A.transactions.update('t1', { amount: 42 });
    expect((await A.syncOutbox.get('transactions:t1'))!.at).toBe(ahead + 1);
    await settle();
    expect(Number((await live('transactions'))[0].amount_cents)).toBe(42);
    expect((await B.transactions.get('t1'))!.amount).toBe(42);
  });

  it('caps an edit time far in the future, and still lets the device edit again afterwards', async () => {
    await A.buckets.add(bucket('b1'));
    await A.transactions.add(tx('t1'));
    await A.syncVersions.put({ key: 'transactions:t1', at: Date.now() + 10 * 86_400_000 });
    await A.transactions.update('t1', { amount: 7 });
    await sync(A);
    const stored = (await A.syncVersions.get('transactions:t1'))!.at;
    expect(stored).toBeLessThan(Date.now() + 120_000); // the server's cap, not the 10 days
    await A.transactions.update('t1', { amount: 8 });
    await settle();
    expect(Number((await live('transactions'))[0].amount_cents)).toBe(8);
  });

  it('merges assignments to different buckets in the same month', async () => {
    await A.allocations.put({ id: '2026-10:b1', month: '2026-10', bucketId: 'b1', amount: 100 });
    await B.allocations.put({ id: '2026-10:b2', month: '2026-10', bucketId: 'b2', amount: 200 });
    await settle();
    for (const d of [A, B]) expect((await d.allocations.toArray()).map((a) => a.id).sort()).toEqual(['2026-10:b1', '2026-10:b2']);
  });

  it('files a transaction under Unsorted when its bucket was deleted on the other device', async () => {
    await A.buckets.add(bucket('b1'));
    await settle();
    await A.buckets.delete('b1');
    await B.transactions.add(tx('t9'));
    await settle();
    for (const d of [A, B]) {
      expect(await d.buckets.get('b1')).toBeUndefined();
      expect((await d.transactions.get('t9'))!.bucketId).toBe('unsorted');
    }
    expect(await state(A)).toEqual(await state(B));
  });

  it('adds up sold shares when both devices sell from the same lot', async () => {
    await A.investmentLots.add({ id: 'l1', symbol: 'VTI', shares: 10, pricePerShare: 1000, purchaseDate: day, soldShares: 0 });
    await settle();
    await A.investmentSells.add({ id: 's1', lotId: 'l1', shares: 3, pricePerShare: 1100, sellDate: day });
    await A.investmentLots.update('l1', { soldShares: 3 });
    await B.investmentSells.add({ id: 's2', lotId: 'l1', shares: 4, pricePerShare: 1100, sellDate: day });
    await B.investmentLots.update('l1', { soldShares: 4 });
    await settle();
    for (const d of [A, B]) expect((await d.investmentLots.get('l1'))!.soldShares).toBe(7);
  });

  it('parks a row the database refuses and still uploads the rest', async () => {
    await A.allocations.bulkAdd([
      { id: '2026-10:ok', month: '2026-10', bucketId: 'ok', amount: 1 },
      { id: 'bad', month: 'not-a-month', bucketId: 'bad', amount: 1 },
    ]);
    const result = await sync(A);
    expect(result).toMatchObject({ status: 'ok', pushed: 1, parked: 1 });
    const parked = (await A.syncOutbox.get('allocations:bad'))!;
    expect(parked.parked).toBe(true);
    expect(parked.error).toMatch(/month_valid|check constraint/);
    expect((await live('allocations')).map((r) => r.id)).toEqual(['2026-10:ok']);
  });

  it('stops an account that is not invited, with a message instead of an error', async () => {
    await asUser(pg, USER_C);
    expect(await checkAccount(ctx(A))).toMatchObject({ status: 'notAllowed' });
    await A.buckets.add(bucket('b1'));
    expect(await sync(A)).toMatchObject({ status: 'notAllowed' });
    expect(await A.syncOutbox.count()).toBe(1);
  });

  it('reports an account that is not signed in as a session problem', async () => {
    await asOwner(pg);
    await pg.exec(`set role anon`);
    expect(await checkAccount(ctx(A))).toMatchObject({ status: 'auth' });
  });
});

describe('first sign-in against the real database', () => {
  const state1 = async () => (await pg.query<{ s: { buckets: unknown[]; hasOtherRows: boolean } }>(`select public.sync_account_state() as s`)).rows[0].s;

  it('uploads a device\'s data to an empty account', async () => {
    await A.buckets.add(bucket('b1'));
    await A.transactions.add(tx('t1'));
    const result = await runFirstSignIn(ctx(A), USER_A.id);
    expect(result).toMatchObject({ status: 'done', plan: 'upload', sync: { status: 'ok' } });
    expect((await live('transactions')).map((r) => r.id)).toEqual(['t1']);
    expect(await getState(A, LINKED_ACCOUNT)).toBe(USER_A.id);
  });

  it('downloads the account into an empty device', async () => {
    await A.buckets.add(bucket('b1'));
    await A.transactions.add(tx('t1'));
    await runFirstSignIn(ctx(A), USER_A.id);
    const result = await runFirstSignIn(ctx(B), USER_A.id);
    expect(result).toMatchObject({ status: 'done', plan: 'download' });
    expect(await B.transactions.get('t1')).toBeTruthy();
    expect(await B.syncOutbox.count()).toBe(0);
  });

  it('asks before replacing a device when both sides hold data', async () => {
    await A.buckets.add(bucket('b1'));
    await runFirstSignIn(ctx(A), USER_A.id);
    await B.buckets.add({ ...bucket('mine'), name: 'Mine' });
    expect(await runFirstSignIn(ctx(B), USER_A.id)).toEqual({ status: 'needsChoice', reason: 'conflict' });
    expect((await state1()).buckets).toHaveLength(1);
  });

  it('replaces the account\'s untouched default buckets with the device\'s data, so none appear twice', async () => {
    const { DEFAULT_BUCKETS } = await import('$lib/db');
    await B.buckets.bulkAdd(DEFAULT_BUCKETS.map((b, i) => ({ ...b, id: `d${i}`, createdAt: new Date(2026, 0, 1) })));
    await runFirstSignIn(ctx(B), USER_A.id); // uploads the defaults to the empty account
    expect((await state1()).buckets).toHaveLength(11);
    await A.buckets.add(bucket('mine'));
    await A.transactions.add(tx('t1', { bucketId: 'mine' }));
    const result = await runFirstSignIn(ctx(A), USER_A.id);
    expect(result).toMatchObject({ status: 'done', plan: 'upload' });
    expect((await state1()).buckets).toHaveLength(1);
  });

  it('says a pushed batch is empty when nothing was waiting', async () => {
    expect(await pushPending(ctx(A))).toEqual({ sent: 0, skipped: 0, parked: 0 });
  });
});
