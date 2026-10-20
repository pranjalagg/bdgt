import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '$lib/db';
import { setCaptureEnabled } from '$lib/sync/capture';
import { processRecurring } from '$lib/stores/recurringStore';
import { loadCurrency } from '$lib/stores/currencyStore';
import { resetRealDb } from '../../helpers/realDb';

beforeEach(async () => {
  await resetRealDb();
  setCaptureEnabled(true);
});

afterEach(() => setCaptureEnabled(false));

describe('automatic writes are stamped as automatic', () => {
  it('recurring occurrences get their stable id and a stamp of 1, and the due date is one past its version', async () => {
    await db.recurringTransactions.add({ id: 'r1', amount: 500, bucketId: 'b1', frequency: 'monthly', nextDueDate: new Date(2026, 0, 15), isActive: true });
    await db.syncOutbox.clear();
    await db.syncVersions.put({ key: 'recurringTransactions:r1', at: 7000 });

    const added = await processRecurring();

    expect(added).toBeGreaterThan(0);
    const occurrence = await db.syncOutbox.get('transactions:r1:2026-01-15');
    expect(occurrence).toMatchObject({ op: 'upsert', at: 1 });
    expect((await db.syncOutbox.get('recurringTransactions:r1'))!.at).toBe(7001);
  });

  it('the detected currency is saved as an automatic write', async () => {
    await loadCurrency();
    const entry = await db.syncOutbox.get('settings:baseCurrency');
    expect(entry).toMatchObject({ op: 'upsert', at: 1 });
  });
});
