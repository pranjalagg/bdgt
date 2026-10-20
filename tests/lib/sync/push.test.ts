import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeDevice, dropDevice } from '../../helpers/devices';
import { FakeServer } from '../../helpers/fakeServer';
import { pushPending } from '$lib/sync/push';
import { resetClockForTests } from '$lib/sync/clock';
import type { BudgetDatabase } from '$lib/db';

let device: BudgetDatabase;
let server: FakeServer;
const ctx = () => ({ db: device, transport: server });
const tx = (id: string, over: Record<string, unknown> = {}) => ({ id, amount: 100, bucketId: 'b1', date: new Date(2026, 9, 20), ...over });
const queued = async () => (await device.syncOutbox.toArray()).map((e) => e.key).sort();

beforeEach(async () => {
  resetClockForTests();
  device = await makeDevice('push-test');
  server = new FakeServer();
});

afterEach(() => dropDevice(device));

describe('pushPending', () => {
  it('uploads a saved record as a row stamped with its edit time, and clears the queue', async () => {
    await device.transactions.add(tx('t1', { note: 'Flight' }));
    const entry = (await device.syncOutbox.get('transactions:t1'))!;

    const result = await pushPending(ctx());

    expect(result).toEqual({ sent: 1, skipped: 0, parked: 0 });
    const [stored] = server.live('transactions');
    expect(stored).toMatchObject({ id: 't1', amount_cents: 100, bucket_id: 'b1', date: '2026-10-20', note: 'Flight', deleted_at: null });
    expect(Date.parse(String(stored.updated_at))).toBe(entry.at);
    expect(await queued()).toEqual([]);
  });

  it('records the time the server stored as the version', async () => {
    await device.transactions.add(tx('t1'));
    await pushPending(ctx());
    const stored = server.live('transactions')[0];
    expect((await device.syncVersions.get('transactions:t1'))!.at).toBe(Date.parse(String(stored.updated_at)));
  });

  it('uploads a deleted record as a tombstone', async () => {
    await device.transactions.add(tx('t1'));
    await pushPending(ctx());
    await device.transactions.delete('t1');
    await pushPending(ctx());
    expect(server.live('transactions')).toEqual([]);
    expect(server.all('transactions')[0].deleted_at).toBeTruthy();
  });

  it('sends a save whose record has vanished as a delete', async () => {
    await device.transactions.add(tx('t1'));
    await device.transactions.delete('t1');
    await device.syncOutbox.put({ key: 'transactions:t1', table: 'transactions', id: 't1', op: 'upsert', at: 5 });
    await pushPending(ctx());
    expect(server.all('transactions')[0].deleted_at).toBeTruthy();
  });

  it('sends saves and deletes in separate requests, dependencies first', async () => {
    await device.buckets.add({ id: 'b1', name: 'X', color: '#000', order: 0, isDefault: false, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: true, createdAt: new Date(2026, 0, 1) });
    await device.transactions.bulkAdd([tx('t1'), tx('t2')]);
    await device.transactions.delete('t2');
    await pushPending(ctx());
    expect(server.upsertCalls.map((c) => `${c.remote}:${c.rows.length}`)).toEqual(['buckets:1', 'transactions:1', 'transactions:1']);
    expect(server.upsertCalls[1].rows[0].deleted_at).toBeNull();
    expect(server.upsertCalls[2].rows[0].deleted_at).toBeTruthy();
  });

  it('splits a large queue into batches', async () => {
    await device.transactions.bulkAdd([tx('1'), tx('2'), tx('3'), tx('4'), tx('5')]);
    await pushPending(ctx(), 2);
    expect(server.upsertCalls.map((c) => c.rows.length)).toEqual([2, 2, 1]);
    expect(await queued()).toEqual([]);
  });

  it('does nothing when the queue is empty', async () => {
    expect(await pushPending(ctx())).toEqual({ sent: 0, skipped: 0, parked: 0 });
    expect(server.upsertCalls).toEqual([]);
  });

  it('drops an entry the server skipped because it held a newer edit, leaving the version alone', async () => {
    await device.transactions.add(tx('t1'));
    const mine = (await device.syncOutbox.get('transactions:t1'))!.at;
    await server.upsert('transactions', [{ id: 't1', updated_at: new Date(mine + 5000).toISOString(), deleted_at: null, amount_cents: 7, extra: {} }]);

    const result = await pushPending(ctx());

    expect(result).toEqual({ sent: 0, skipped: 1, parked: 0 });
    expect(await queued()).toEqual([]);
    expect((await device.syncVersions.get('transactions:t1'))!.at).toBe(mine);
    expect(server.live('transactions')[0].amount_cents).toBe(7);
  });

  it('keeps an entry that was edited again while the upload was in flight', async () => {
    await device.transactions.add(tx('t1'));
    const original = server.upsert.bind(server);
    server.upsert = async (remote, rows) => {
      await device.transactions.put(tx('t1', { amount: 999 }));
      return original(remote, rows);
    };

    await pushPending(ctx());

    const entry = (await device.syncOutbox.get('transactions:t1'))!;
    const version = (await device.syncVersions.get('transactions:t1'))!;
    expect(entry.at).toBe(version.at);
    expect(server.live('transactions')[0].amount_cents).toBe(100);
    server.upsert = original;
    await pushPending(ctx());
    expect(server.live('transactions')[0].amount_cents).toBe(999);
    expect(await queued()).toEqual([]);
  });

  it('keeps the queue and rethrows when the network fails', async () => {
    await device.transactions.add(tx('t1'));
    server.offline = true;
    await expect(pushPending(ctx())).rejects.toMatchObject({ kind: 'network' });
    expect(await queued()).toEqual(['transactions:t1']);
  });
});

describe('pushPending with a row the server refuses', () => {
  it('uploads the good rows, parks only the bad one and records why', async () => {
    await device.transactions.bulkAdd([tx('a'), tx('b'), tx('bad'), tx('d'), tx('e')]);
    server.rejectIds.add('bad');

    const result = await pushPending(ctx());

    expect(result).toEqual({ sent: 4, skipped: 0, parked: 1 });
    expect(server.live('transactions').map((r) => r.id).sort()).toEqual(['a', 'b', 'd', 'e']);
    const parked = (await device.syncOutbox.get('transactions:bad'))!;
    expect(parked.parked).toBe(true);
    expect(parked.error).toMatch(/rejected/);
    expect(await queued()).toEqual(['transactions:bad']);
  });

  it('leaves a parked entry alone on later pushes', async () => {
    await device.transactions.add(tx('bad'));
    server.rejectIds.add('bad');
    await pushPending(ctx());
    server.upsertCalls.length = 0;
    expect(await pushPending(ctx())).toEqual({ sent: 0, skipped: 0, parked: 0 });
    expect(server.upsertCalls).toEqual([]);
  });

  it('retries a parked record once it is edited again', async () => {
    await device.transactions.add(tx('bad'));
    server.rejectIds.add('bad');
    await pushPending(ctx());
    server.rejectIds.clear();
    await device.transactions.put(tx('bad', { amount: 5 }));
    expect((await device.syncOutbox.get('transactions:bad'))!.parked).toBeUndefined();
    expect(await pushPending(ctx())).toMatchObject({ sent: 1 });
    expect(server.live('transactions')[0].amount_cents).toBe(5);
  });
});
