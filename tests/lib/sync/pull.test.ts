import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeDevice, dropDevice } from '../../helpers/devices';
import { FakeServer } from '../../helpers/fakeServer';
import { pullAll } from '$lib/sync/pull';
import { pushPending } from '$lib/sync/push';
import { collectionByTable, toRow } from '$lib/sync/registry';
import { getState } from '$lib/sync/state';
import { resetClockForTests } from '$lib/sync/clock';
import type { BudgetDatabase } from '$lib/db';

let device: BudgetDatabase;
let server: FakeServer;
const ctx = () => ({ db: device, transport: server });
const day = new Date(2026, 9, 20);
const iso = (ms: number) => new Date(ms).toISOString();

// A row as another device would have pushed it.
async function remote(table: string, record: Record<string, unknown>, atMs: number, deleted = false) {
  const def = collectionByTable(table)!;
  const base = deleted ? { id: String(record[def.keyProp]) } : toRow(def, record);
  await server.upsert(def.remote, [{ ...base, updated_at: iso(atMs), deleted_at: deleted ? iso(atMs) : null }]);
}
const tx = (id: string, over: Record<string, unknown> = {}) => ({ id, amount: 100, bucketId: 'b1', date: day, ...over });

beforeEach(async () => {
  resetClockForTests();
  device = await makeDevice('pull-test');
  server = new FakeServer(() => 5_000_000_000_000);
});

afterEach(() => dropDevice(device));

describe('pullAll: applying rows', () => {
  it('writes remote records, records their versions and never queues them for upload', async () => {
    await remote('transactions', tx('t1', { note: 'Flight' }), 1000);

    const result = await pullAll(ctx());

    expect(result).toMatchObject({ changed: true, rows: 1 });
    expect(await device.transactions.get('t1')).toMatchObject({ id: 't1', amount: 100, bucketId: 'b1', note: 'Flight' });
    expect((await device.syncVersions.get('transactions:t1'))!.at).toBe(1000);
    expect(await device.syncOutbox.count()).toBe(0);
  });

  it('applies several tables in one pull', async () => {
    await remote('buckets', { id: 'b1', name: 'Rent', color: '#000', order: 0, isDefault: false, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: true, createdAt: new Date('2026-01-01T00:00:00.000Z') }, 1000);
    await remote('allocations', { id: '2026-10:b1', month: '2026-10', bucketId: 'b1', amount: 5000 }, 1000);
    await remote('settings', { key: 'baseCurrency', value: 'INR' }, 1000);
    await pullAll(ctx());
    expect((await device.buckets.get('b1'))?.name).toBe('Rent');
    expect((await device.allocations.get('2026-10:b1'))?.amount).toBe(5000);
    expect((await device.settings.get('baseCurrency'))?.value).toBe('INR');
  });

  it('removes a record the server deleted, and remembers the version', async () => {
    await device.transactions.add(tx('t1'));
    await device.syncOutbox.clear();
    await remote('transactions', { id: 't1' }, Date.now() + 10_000, true);
    const result = await pullAll(ctx());
    expect(result.changed).toBe(true);
    expect(await device.transactions.get('t1')).toBeUndefined();
    expect((await device.syncVersions.get('transactions:t1'))!.at).toBeGreaterThan(Date.now());
  });

  it('remembers a tombstone for a record it never held, so an older save cannot bring it back', async () => {
    await remote('transactions', { id: 'ghost' }, 5000, true);
    const result = await pullAll(ctx());
    expect(result.changed).toBe(false);
    expect((await device.syncVersions.get('transactions:ghost'))!.at).toBe(5000);
  });

  it('skips a remote row older than the local version', async () => {
    await device.transactions.add(tx('t1', { amount: 111 }));
    const mine = (await device.syncVersions.get('transactions:t1'))!.at;
    await remote('transactions', tx('t1', { amount: 5 }), mine - 1000);
    await pullAll(ctx());
    expect((await device.transactions.get('t1'))!.amount).toBe(111);
    expect(await device.syncOutbox.get('transactions:t1')).toBeTruthy();
    expect((await device.syncVersions.get('transactions:t1'))!.at).toBe(mine);
  });

  it('applies a remote row with exactly the local edit time, so devices that tie converge on the server', async () => {
    await device.transactions.add(tx('t1', { amount: 111 }));
    const mine = (await device.syncVersions.get('transactions:t1'))!.at;
    await remote('transactions', tx('t1', { amount: 5 }), mine);
    await pullAll(ctx());
    expect((await device.transactions.get('t1'))!.amount).toBe(5);
  });

  it('drops a queued change that the remote row is not older than, and keeps a newer one', async () => {
    await device.transactions.bulkAdd([tx('old'), tx('new')]);
    const oldAt = (await device.syncOutbox.get('transactions:old'))!.at;
    const newAt = (await device.syncOutbox.get('transactions:new'))!.at;
    await remote('transactions', tx('old', { amount: 7 }), oldAt + 10);
    await remote('transactions', tx('new', { amount: 8 }), newAt - 10);
    await pullAll(ctx());
    expect(await device.syncOutbox.get('transactions:old')).toBeUndefined();
    expect(await device.syncOutbox.get('transactions:new')).toBeTruthy();
    expect((await device.transactions.get('old'))!.amount).toBe(7);
    expect((await device.transactions.get('new'))!.amount).toBe(100);
  });

  it('does not rewrite a record whose data is already identical', async () => {
    const withTime = new Date(2026, 9, 20, 15, 30);
    await device.transactions.add(tx('t1', { date: withTime }));
    await pushPending(ctx());
    const result = await pullAll(ctx());
    expect(result.changed).toBe(false);
    expect((await device.transactions.get('t1'))!.date.getHours()).toBe(15);
  });
});

describe('pullAll: cursors and pages', () => {
  it('saves a cursor per table and fetches from just before it next time', async () => {
    await remote('transactions', tx('t1'), 1000);
    await pullAll(ctx());
    const cursor = (await getState<string>(device, 'cursor:transactions'))!;
    expect(cursor).toBeTruthy();

    const seen: (string | null)[] = [];
    const original = server.pull.bind(server);
    server.pull = (table, since, limit) => {
      if (table === 'transactions') seen.push(since);
      return original(table, since, limit);
    };
    const again = await pullAll(ctx());
    expect(again.changed).toBe(false);
    expect(Date.parse(seen[0]!)).toBe(Date.parse(cursor.replace(/(\.\d{3})\d+/, '$1')) - 60_000);
  });

  it('fetches only the rows near or after the cursor on later pulls', async () => {
    server = new FakeServer(() => 5_000_000_000_000, 120_000); // rows are two minutes apart
    for (const id of ['1', '2', '3']) await remote('transactions', tx(id), 1000);
    await pullAll(ctx());
    await remote('transactions', tx('4'), 1000);

    let returned = 0;
    const original = server.pull.bind(server);
    server.pull = async (table, since, limit) => {
      const rows = await original(table, since, limit);
      if (table === 'transactions') returned = rows.length;
      return rows;
    };
    await pullAll(ctx());

    expect(returned).toBe(2); // row 3, just inside the one-minute overlap, and the new row 4
    expect(await device.transactions.count()).toBe(4);
  });

  it('pages through more rows than one page holds', async () => {
    for (const id of ['1', '2', '3', '4', '5']) await remote('transactions', tx(id), 1000);
    await pullAll(ctx(), 2);
    expect(await device.transactions.count()).toBe(5);
  });

  it('applies nothing and moves no cursor when any table fails to fetch', async () => {
    await remote('buckets', { id: 'b1', name: 'Rent', color: '#000', order: 0, isDefault: false, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: true, createdAt: new Date('2026-01-01T00:00:00.000Z') }, 1000);
    await remote('transactions', tx('t1'), 1000);
    server.failNextPull('transactions');

    await expect(pullAll(ctx())).rejects.toMatchObject({ kind: 'network' });

    expect(await device.buckets.count()).toBe(0);
    expect(await device.transactions.count()).toBe(0);
    expect(await getState(device, 'cursor:buckets')).toBeUndefined();

    await pullAll(ctx());
    expect(await device.buckets.count()).toBe(1);
    expect(await device.transactions.count()).toBe(1);
  });

  it('reports no change when the server has nothing new', async () => {
    expect(await pullAll(ctx())).toEqual({ changed: false, rows: 0 });
  });
});
