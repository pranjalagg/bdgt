import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '$lib/db';
import { resetRealDb } from '../../helpers/realDb';

describe('real Dexie database in tests', () => {
  beforeEach(resetRealDb);

  it('stores and reads back a record with its Date intact', async () => {
    await db.transactions.add({ id: 't1', amount: 500, bucketId: 'b1', date: new Date(2026, 9, 20) });
    const t = await db.transactions.get('t1');
    expect(t?.date).toBeInstanceOf(Date);
    expect(t?.date.getDate()).toBe(20);
  });

  it('starts each test from an empty database', async () => {
    expect(await db.transactions.count()).toBe(0);
  });
});
