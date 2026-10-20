import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '$lib/db';
import { setCaptureEnabled } from '$lib/sync/capture';
import { pushPending } from '$lib/sync/push';
import { exportToJson, importFromJson, resetAllData } from '$lib/utils/export';
import { resetClockForTests } from '$lib/sync/clock';
import { FakeServer } from '../../helpers/fakeServer';
import { resetRealDb } from '../../helpers/realDb';

const day = new Date(2026, 9, 20);
const bucket = (id: string) => ({ id, name: id, color: '#000', order: 0, isDefault: false, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: true, createdAt: '2026-01-01T00:00:00.000Z' });
const tx = (id: string) => ({ id, amount: 100, bucketId: 'b1', date: '2026-10-20T12:00:00.000Z' });
const backup = (data: Record<string, unknown[]>) =>
  JSON.stringify({
    version: 1, exportedAt: '2026-10-20T00:00:00.000Z',
    data: { buckets: [], transactions: [], recurringTransactions: [], incomes: [], monthSnapshots: [], savingsGoals: [], investmentLots: [], investmentSells: [], investmentPrices: [], ...data },
  });
const queue = async () => (await db.syncOutbox.toArray()).map((e) => `${e.key}|${e.op}`).sort();

beforeEach(async () => {
  resetClockForTests();
  await resetRealDb();
  await db.buckets.add({ ...bucket('b1'), createdAt: new Date(2026, 0, 1) } as never);
  await db.transactions.bulkAdd([{ id: 't1', amount: 1, bucketId: 'b1', date: day }, { id: 't2', amount: 2, bucketId: 'b1', date: day }]);
  setCaptureEnabled(true);
  await db.syncOutbox.clear();
  await db.syncVersions.clear();
});

afterEach(() => setCaptureEnabled(false));

describe('import while linked', () => {
  it('queues deletes for records the backup drops and saves for the ones it holds', async () => {
    await importFromJson(backup({ buckets: [bucket('b1')], transactions: [tx('t2'), tx('t3')] }));
    const q = await queue();
    expect(q).toEqual(expect.arrayContaining(['buckets:b1|upsert', 'transactions:t1|delete', 'transactions:t2|upsert', 'transactions:t3|upsert']));
  });

  it('brings the account to exactly the imported data', async () => {
    const server = new FakeServer(() => 5_000_000_000_000);
    const ctx = { db, transport: server };
    await pushPending(ctx); // nothing yet: the queue was cleared
    await db.syncOutbox.clear();
    // The account already holds the old data.
    await importFromJson(backup({ buckets: [bucket('b1')], transactions: [tx('t1'), tx('t2')] }));
    await pushPending(ctx);
    await importFromJson(backup({ buckets: [bucket('b1')], transactions: [tx('t2'), tx('t3')] }));
    await pushPending(ctx);
    expect(server.live('transactions').map((r) => r.id).sort()).toEqual(['t2', 't3']);
    expect(server.live('buckets').map((r) => r.id)).toEqual(['b1']);
  });
});

describe('reset while linked', () => {
  it('queues a delete for every record', async () => {
    await resetAllData();
    expect(await queue()).toEqual(['buckets:b1|delete', 'transactions:t1|delete', 'transactions:t2|delete']);
    expect(await db.transactions.count()).toBe(0);
  });
});

describe('backups', () => {
  it('do not contain any sync bookkeeping', async () => {
    await db.transactions.put({ id: 't9', amount: 9, bucketId: 'b1', date: day });
    const exported = JSON.parse(await exportToJson());
    expect(Object.keys(exported.data).sort()).toEqual(
      ['buckets', 'incomes', 'investmentLots', 'investmentPrices', 'investmentSells', 'monthSnapshots', 'recurringTransactions', 'savingsGoals', 'settings', 'transactions'].sort()
    );
  });
});
