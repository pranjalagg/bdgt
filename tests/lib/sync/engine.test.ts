import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeDevice, dropDevice } from '../../helpers/devices';
import { FakeServer } from '../../helpers/fakeServer';
import { syncOnce, checkAccount, REQUIRED_SCHEMA_VERSION } from '$lib/sync/engine';
import { collectionByTable, toRow } from '$lib/sync/registry';
import { resetClockForTests } from '$lib/sync/clock';
import type { BudgetDatabase } from '$lib/db';

let device: BudgetDatabase;
let server: FakeServer;
const ctx = () => ({ db: device, transport: server });
const day = new Date(2026, 9, 20);
const tx = (id: string, over: Record<string, unknown> = {}) => ({ id, amount: 100, bucketId: 'b1', date: day, ...over });
const bucket = (id: string) => ({ id, name: id, color: '#000', order: 0, isDefault: false, allocationType: 'fixed' as const, fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: true, createdAt: new Date(2026, 0, 1) });

async function remote(table: string, record: Record<string, unknown>, atMs: number) {
  const def = collectionByTable(table)!;
  await server.upsert(def.remote, [{ ...toRow(def, record), updated_at: new Date(atMs).toISOString(), deleted_at: null }]);
}

beforeEach(async () => {
  resetClockForTests();
  device = await makeDevice('engine-test');
  server = new FakeServer(() => 5_000_000_000_000);
});

afterEach(() => dropDevice(device));

describe('checkAccount', () => {
  it('passes for an invited account on a current database', async () => {
    const result = await checkAccount(ctx());
    expect(result.status).toBe('ok');
  });

  it('reports an account that is not invited', async () => {
    server.allowed = false;
    expect(await checkAccount(ctx())).toMatchObject({ status: 'notAllowed' });
  });

  it('reports a database older than the app expects', async () => {
    server.schemaVersion = REQUIRED_SCHEMA_VERSION - 1;
    expect(await checkAccount(ctx())).toMatchObject({ status: 'schema' });
  });

  it('reports being offline', async () => {
    server.offline = true;
    expect(await checkAccount(ctx())).toMatchObject({ status: 'offline' });
  });
});

describe('syncOnce', () => {
  it('pushes local changes and pulls remote ones in one cycle', async () => {
    await device.buckets.add(bucket('b1'));
    await device.transactions.add(tx('mine'));
    await remote('transactions', tx('theirs'), 1000);

    const result = await syncOnce(ctx());

    expect(result).toEqual({ status: 'ok', changed: true, pushed: 2, parked: 0 }); // the bucket and the transaction
    expect(await device.transactions.get('theirs')).toBeTruthy();
    expect(server.live('transactions').map((r) => r.id).sort()).toEqual(['mine', 'theirs']);
    expect(await device.syncOutbox.count()).toBe(0);
  });

  it('reports no change when there is nothing to do', async () => {
    expect(await syncOnce(ctx())).toEqual({ status: 'ok', changed: false, pushed: 0, parked: 0 });
  });

  it('keeps the queue and reports offline when the network is down', async () => {
    await device.transactions.add(tx('mine'));
    server.offline = true;
    expect(await syncOnce(ctx())).toMatchObject({ status: 'offline' });
    expect(await device.syncOutbox.count()).toBe(1);
    server.offline = false;
    expect(await syncOnce(ctx())).toMatchObject({ status: 'ok', pushed: 1 });
  });

  it('reports an account that is not invited', async () => {
    server.allowed = false;
    expect(await syncOnce(ctx())).toMatchObject({ status: 'notAllowed' });
  });

  it('pulls again when the server skipped a push because it held a newer edit', async () => {
    await device.buckets.add(bucket('b1'));
    await device.transactions.add(tx('t1', { amount: 1 }));
    const original = server.upsert.bind(server);
    let injected = false;
    server.upsert = async (remoteTable, rows) => {
      if (!injected && remoteTable === 'transactions') {
        injected = true;
        await remote('transactions', tx('t1', { amount: 99 }), Date.now() + 60_000);
      }
      return original(remoteTable, rows);
    };

    const result = await syncOnce(ctx());

    expect(result).toMatchObject({ status: 'ok', changed: true });
    expect((await device.transactions.get('t1'))!.amount).toBe(99);
    expect(await device.syncOutbox.count()).toBe(0);
  });

  it('repairs after a pull and uploads the repair in the same cycle', async () => {
    await remote('transactions', tx('t1', { bucketId: 'gone' }), 1000);

    await syncOnce(ctx());

    expect((await device.transactions.get('t1'))!.bucketId).toBe('unsorted');
    expect(server.live('buckets').map((r) => r.id)).toEqual(['unsorted']);
    expect(server.live('transactions')[0].bucket_id).toBe('unsorted');
    expect(await device.syncOutbox.count()).toBe(0);
  });

  it('does not repair, or re-upload, a bucket that does exist', async () => {
    await remote('buckets', bucket('b1'), 1000);
    await remote('transactions', tx('t1'), 1000);
    const callsBefore = server.upsertCalls.length;
    await syncOnce(ctx());
    expect(await device.buckets.get('unsorted')).toBeUndefined();
    expect(server.upsertCalls.length).toBe(callsBefore);
  });

  it('counts a row the server refuses as parked and still reports ok', async () => {
    await device.transactions.bulkAdd([tx('a'), tx('bad')]);
    server.rejectIds.add('bad');
    expect(await syncOnce(ctx())).toMatchObject({ status: 'ok', pushed: 1, parked: 1 });
  });
});
