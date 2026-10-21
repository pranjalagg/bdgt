import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeDevice, dropDevice } from '../../helpers/devices';
import { setCaptureEnabled } from '$lib/sync/capture';
import { syncCounts, listParked, retryParked, discardParked } from '$lib/sync/parked';
import type { BudgetDatabase } from '$lib/db';

let device: BudgetDatabase;
const entry = (id: string, over: Record<string, unknown> = {}) => ({ key: `transactions:${id}`, table: 'transactions', id, op: 'upsert' as const, at: 5, ...over });

beforeEach(async () => {
  device = await makeDevice('parked-test');
  await device.syncOutbox.bulkPut([entry('a'), entry('b', { parked: true, error: 'bad month' }), entry('c', { parked: true, error: 'x' })]);
});

afterEach(() => dropDevice(device));

describe('parked changes', () => {
  it('counts waiting and parked separately', async () => {
    expect(await syncCounts(device)).toEqual({ waiting: 1, parked: 2 });
  });

  it('lists only the parked ones, with why', async () => {
    const parked = await listParked(device);
    expect(parked.map((e) => [e.id, e.error])).toEqual([['b', 'bad month'], ['c', 'x']]);
  });

  it('puts parked changes back in the queue, clearing the flag and the reason', async () => {
    expect(await retryParked(device)).toBe(2);
    expect(await syncCounts(device)).toEqual({ waiting: 3, parked: 0 });
    expect(await device.syncOutbox.get('transactions:b')).toEqual(entry('b'));
  });

  it('drops parked changes without touching the records or the waiting ones', async () => {
    setCaptureEnabled(false); // editing a record would re-queue it and un-park it
    await device.transactions.add({ id: 'b', amount: 1, bucketId: 'x', date: new Date(2026, 9, 20) });
    setCaptureEnabled(true);
    expect(await discardParked(device)).toBe(2);
    expect(await syncCounts(device)).toEqual({ waiting: 1, parked: 0 });
    expect(await device.transactions.get('b')).toBeTruthy();
  });
});
