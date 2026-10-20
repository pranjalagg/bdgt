import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeDevice, dropDevice } from '../../helpers/devices';
import { repairAfterPull } from '$lib/sync/repairs';
import { resetClockForTests } from '$lib/sync/clock';
import type { BudgetDatabase } from '$lib/db';

let device: BudgetDatabase;
const day = new Date(2026, 9, 20);
const bucket = (id: string, order = 0) => ({ id, name: id, color: '#000', order, isDefault: false, allocationType: 'fixed' as const, fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: true, createdAt: new Date(2026, 0, 1) });
const lot = (id: string, shares: number, soldShares: number) => ({ id, symbol: 'VTI', shares, pricePerShare: 1000, purchaseDate: day, soldShares });
const sell = (id: string, lotId: string, shares: number) => ({ id, lotId, shares, pricePerShare: 1100, sellDate: day });

beforeEach(async () => {
  resetClockForTests();
  device = await makeDevice('repairs-test');
});

afterEach(() => dropDevice(device));

describe('repairAfterPull: orphaned transactions', () => {
  it('files them under a new Unsorted bucket and deletes nothing', async () => {
    await device.buckets.add(bucket('b1', 4));
    await device.transactions.bulkAdd([
      { id: 't1', amount: 1, bucketId: 'b1', date: day },
      { id: 't2', amount: 2, bucketId: 'gone', date: day },
    ]);
    await device.syncOutbox.clear();
    await device.syncVersions.clear();

    expect(await repairAfterPull(device)).toBe(true);

    expect((await device.transactions.get('t2'))!.bucketId).toBe('unsorted');
    expect((await device.transactions.get('t1'))!.bucketId).toBe('b1');
    const unsorted = await device.buckets.get('unsorted');
    expect(unsorted).toMatchObject({ isSystem: true, order: 5 });
    expect(await device.transactions.count()).toBe(2);
  });

  it('queues the repair as automatic writes, so any real edit elsewhere beats it', async () => {
    await device.transactions.add({ id: 't2', amount: 2, bucketId: 'gone', date: day });
    await device.syncOutbox.clear();
    await device.syncVersions.put({ key: 'transactions:t2', at: 5000 });
    await repairAfterPull(device);
    expect((await device.syncOutbox.get('buckets:unsorted'))!.at).toBe(1);
    expect((await device.syncOutbox.get('transactions:t2'))!.at).toBe(5001);
  });

  it('reuses an Unsorted bucket that already exists', async () => {
    await device.buckets.add({ ...bucket('unsorted', 9), isSystem: true });
    await device.transactions.add({ id: 't2', amount: 2, bucketId: 'gone', date: day });
    await repairAfterPull(device);
    expect(await device.buckets.count()).toBe(1);
    expect((await device.transactions.get('t2'))!.bucketId).toBe('unsorted');
  });

  it('does nothing when every transaction has its bucket', async () => {
    await device.buckets.add(bucket('b1'));
    await device.transactions.add({ id: 't1', amount: 1, bucketId: 'b1', date: day });
    await device.syncOutbox.clear();
    expect(await repairAfterPull(device)).toBe(false);
    expect(await device.syncOutbox.count()).toBe(0);
  });
});

describe('repairAfterPull: sold shares', () => {
  it('raises soldShares to the total of the sell records', async () => {
    await device.investmentLots.add(lot('l1', 10, 2));
    await device.investmentSells.bulkAdd([sell('s1', 'l1', 2), sell('s2', 'l1', 3)]);
    expect(await repairAfterPull(device)).toBe(true);
    expect((await device.investmentLots.get('l1'))!.soldShares).toBe(5);
  });

  it('never lowers it, so a lot sold before sell records existed keeps its count', async () => {
    await device.investmentLots.bulkAdd([lot('l1', 10, 6), lot('l2', 10, 4)]);
    await device.investmentSells.add(sell('s1', 'l1', 2));
    expect(await repairAfterPull(device)).toBe(false);
    expect((await device.investmentLots.get('l1'))!.soldShares).toBe(6);
    expect((await device.investmentLots.get('l2'))!.soldShares).toBe(4);
  });

  it('caps at the shares the lot holds when two devices oversold it', async () => {
    await device.investmentLots.add(lot('l1', 10, 6));
    await device.investmentSells.bulkAdd([sell('s1', 'l1', 6), sell('s2', 'l1', 6)]);
    await repairAfterPull(device);
    expect((await device.investmentLots.get('l1'))!.soldShares).toBe(10);
    expect(await device.investmentSells.count()).toBe(2);
  });

  it('ignores floating-point noise', async () => {
    await device.investmentLots.add(lot('l1', 1, 0.3));
    await device.investmentSells.bulkAdd([sell('s1', 'l1', 0.1), sell('s2', 'l1', 0.2)]);
    expect(await repairAfterPull(device)).toBe(false);
  });
});
