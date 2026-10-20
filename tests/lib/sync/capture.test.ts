import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BudgetDatabase } from '$lib/db';
import { setCaptureEnabled } from '$lib/sync/capture';
import { autoTransaction, remoteTransaction, resetTransaction } from '$lib/sync/transactions';
import { resetClockForTests } from '$lib/sync/clock';

let device: BudgetDatabase;
const t = () => device.table('transactions');
const rec = (id: string, over: Record<string, unknown> = {}) => ({ id, amount: 100, bucketId: 'b1', date: new Date(2026, 9, 20), ...over });
const queue = async () => (await device.syncOutbox.toArray()).map((e) => `${e.key}|${e.op}`).sort();

beforeEach(async () => {
  resetClockForTests();
  device = new BudgetDatabase('capture-test');
  await device.open();
  setCaptureEnabled(true);
});

afterEach(async () => {
  setCaptureEnabled(false);
  device.close();
  await Dexie.delete('capture-test');
});

describe('capture: writes become queue entries', () => {
  it('records an add with a matching version', async () => {
    await t().add(rec('1'));
    expect(await queue()).toEqual(['transactions:1|upsert']);
    const entry = await device.syncOutbox.get('transactions:1');
    expect((await device.syncVersions.get('transactions:1'))?.at).toBe(entry?.at);
    expect(entry).toMatchObject({ table: 'transactions', id: '1' });
  });

  it('records put, bulkAdd and bulkPut', async () => {
    await t().put(rec('1'));
    await t().bulkAdd([rec('2'), rec('3')]);
    await t().bulkPut([rec('3', { amount: 5 }), rec('4')]);
    expect(await queue()).toEqual(['transactions:1|upsert', 'transactions:2|upsert', 'transactions:3|upsert', 'transactions:4|upsert']);
  });

  it('records update, modify and bulkUpdate', async () => {
    await t().bulkAdd([rec('1'), rec('2'), rec('3')]);
    await device.syncOutbox.clear();
    await t().update('1', { amount: 5 });
    await t().where('bucketId').equals('b1').modify({ note: 'x' });
    await t().bulkUpdate([{ key: '2', changes: { amount: 9 } }]);
    expect(await queue()).toEqual(['transactions:1|upsert', 'transactions:2|upsert', 'transactions:3|upsert']);
  });

  it('records delete, bulkDelete, where().delete() and clear as deletes', async () => {
    await t().bulkAdd([rec('1'), rec('2'), rec('3', { bucketId: 'b2' }), rec('4'), rec('5')]);
    await device.syncOutbox.clear();
    await t().delete('1');
    await t().bulkDelete(['2']);
    await t().where('bucketId').equals('b2').delete();
    expect(await queue()).toEqual(['transactions:1|delete', 'transactions:2|delete', 'transactions:3|delete']);
    await device.syncOutbox.clear();
    await t().clear();
    expect(await queue()).toEqual(['transactions:4|delete', 'transactions:5|delete']);
  });

  it('keeps one entry per record: the latest operation wins', async () => {
    await t().add(rec('1'));
    await t().delete('1');
    expect(await queue()).toEqual(['transactions:1|delete']);
    await t().add(rec('1'));
    expect(await queue()).toEqual(['transactions:1|upsert']);
  });

  it('captures every synced table touched in one explicit transaction, and ignores bookkeeping tables', async () => {
    await device.transaction('rw', device.transactions, device.buckets, device.syncState, async () => {
      await device.buckets.add({ id: 'b1', name: 'X', color: '#000', order: 0, isDefault: false, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: true, createdAt: new Date(2026, 0, 1) });
      await t().add(rec('1'));
      await device.syncState.put({ key: 'k', value: 1 });
    });
    expect(await queue()).toEqual(['buckets:b1|upsert', 'transactions:1|upsert']);
    expect(await device.syncState.get('k')).toBeTruthy();
  });

  it('records settings, whose key property is called key', async () => {
    await device.settings.put({ key: 'baseCurrency', value: 'INR' });
    expect(await queue()).toEqual(['settings:baseCurrency|upsert']);
  });

  it('leaves nothing behind when the transaction rolls back', async () => {
    await expect(
      device.transaction('rw', device.transactions, async () => {
        await t().add(rec('1'));
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(await t().count()).toBe(0);
    expect(await device.syncOutbox.count()).toBe(0);
    expect(await device.syncVersions.count()).toBe(0);
  });
});

describe('capture: off until the device is linked', () => {
  it('touches no sync table while disabled', async () => {
    setCaptureEnabled(false);
    await t().add(rec('1'));
    await t().delete('1');
    expect(await device.syncOutbox.count()).toBe(0);
    expect(await device.syncVersions.count()).toBe(0);
  });

  it('does not fail a transaction that started before capture was switched on', async () => {
    setCaptureEnabled(false);
    await device.transaction('rw', device.transactions, async () => {
      setCaptureEnabled(true);
      await t().add(rec('1'));
    });
    expect(await t().count()).toBe(1);
    expect(await device.syncOutbox.count()).toBe(0);
  });
});

describe('capture: edit and automatic stamps', () => {
  it('stamps later edits later', async () => {
    await t().add(rec('a'));
    await t().add(rec('b'));
    const a = (await device.syncOutbox.get('transactions:a'))!.at;
    const b = (await device.syncOutbox.get('transactions:b'))!.at;
    expect(b).toBeGreaterThan(a);
  });

  it('stamps an edit newer than the version already held, even when the clock is behind', async () => {
    const future = Date.now() + 10 * 86400_000;
    await device.syncVersions.put({ key: 'transactions:x', at: future });
    await t().put(rec('x'));
    expect((await device.syncOutbox.get('transactions:x'))!.at).toBe(future + 1);
    expect((await device.syncVersions.get('transactions:x'))!.at).toBe(future + 1);
  });

  it('stamps an automatic write 1 for a new record and version + 1 for a known one', async () => {
    await autoTransaction(device, [device.transactions], () => t().put(rec('n')));
    expect((await device.syncOutbox.get('transactions:n'))!.at).toBe(1);
    await autoTransaction(device, [device.transactions], () => t().put(rec('n', { amount: 2 })));
    expect((await device.syncOutbox.get('transactions:n'))!.at).toBe(2);
  });

  it('marks only the transaction it was called for as automatic', async () => {
    await autoTransaction(device, [device.transactions], () => t().put(rec('auto')));
    await t().put(rec('person'));
    expect((await device.syncOutbox.get('transactions:auto'))!.at).toBe(1);
    expect((await device.syncOutbox.get('transactions:person'))!.at).toBeGreaterThan(1_000_000);
  });
});

describe('capture: writes that must not be queued', () => {
  it('skips writes that came from the server', async () => {
    await remoteTransaction(device, [device.transactions], () => t().put(rec('r')));
    expect(await device.syncOutbox.count()).toBe(0);
    expect(await device.syncVersions.count()).toBe(0);
    expect(await t().count()).toBe(1);
  });

  it('skips a local reset', async () => {
    await t().add(rec('1'));
    await device.syncOutbox.clear();
    await resetTransaction(device, [device.transactions], () => t().clear());
    expect(await device.syncOutbox.count()).toBe(0);
  });
});
