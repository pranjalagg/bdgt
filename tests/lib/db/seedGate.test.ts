import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db, initializeDefaultBuckets, SEEDED_KEY } from '$lib/db';
import { setState, INITIAL_SYNC_PENDING } from '$lib/sync/state';
import { setCaptureEnabled } from '$lib/sync/capture';
import { resetRealDb } from '../../helpers/realDb';
import { stubLocalStorage } from '../../helpers/localStorage';

beforeEach(async () => {
  await resetRealDb();
  stubLocalStorage();
  setCaptureEnabled(false);
});

afterEach(() => vi.unstubAllGlobals());

describe('default buckets and the first sync', () => {
  it('creates the defaults on a normal first run', async () => {
    await initializeDefaultBuckets();
    expect(await db.buckets.count()).toBe(11);
    expect(localStorage.getItem(SEEDED_KEY)).toBe('true');
  });

  it('waits while the first sync is pending, leaving the seeded flag unset', async () => {
    await setState(db, INITIAL_SYNC_PENDING, true);
    await initializeDefaultBuckets();
    expect(await db.buckets.count()).toBe(0);
    expect(localStorage.getItem(SEEDED_KEY)).toBeNull();
  });

  it('creates them once the first sync is done and the account turned out to be empty', async () => {
    await setState(db, INITIAL_SYNC_PENDING, true);
    await initializeDefaultBuckets();
    await setState(db, INITIAL_SYNC_PENDING, false);
    await initializeDefaultBuckets();
    expect(await db.buckets.count()).toBe(11);
  });

  it('queues the defaults as automatic writes when the device is linked', async () => {
    setCaptureEnabled(true);
    try {
      await initializeDefaultBuckets();
      const entries = await db.syncOutbox.toArray();
      expect(entries).toHaveLength(11);
      expect(entries.every((e) => e.at === 1 && e.op === 'upsert')).toBe(true);
    } finally {
      setCaptureEnabled(false);
    }
  });
});
