import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { makeDevice, dropDevice } from '../../helpers/devices';
import { FakeServer } from '../../helpers/fakeServer';
import { SyncService, BUSY, type Timers } from '$lib/sync/service';
import { needsAttention, OFF_STATUS, type SyncStatus } from '$lib/sync/status';
import { resetClockForTests } from '$lib/sync/clock';
import { SyncError } from '$lib/sync/transport';
import { collectionByTable, toRow } from '$lib/sync/registry';
import type { BudgetDatabase } from '$lib/db';

// Timers the test fires by hand, so nothing waits on a real clock.
class ManualTimers implements Timers {
  tasks = new Map<number, { fn: () => void; ms: number }>();
  private next = 1;
  set(fn: () => void, ms: number) {
    const id = this.next++;
    this.tasks.set(id, { fn, ms });
    return id;
  }
  clear(handle: unknown) {
    this.tasks.delete(handle as number);
  }
  get delays() {
    return [...this.tasks.values()].map((t) => t.ms);
  }
  fireAll() {
    const due = [...this.tasks.entries()];
    this.tasks.clear();
    for (const [, t] of due) t.fn();
  }
}

let device: BudgetDatabase;
let server: FakeServer;
let timers: ManualTimers;
let changed: number;
const day = new Date(2026, 9, 20);
const tx = (id: string) => ({ id, amount: 100, bucketId: 'b1', date: day });
const bucket = { id: 'b1', name: 'b1', color: '#000', order: 0, isDefault: false, allocationType: 'fixed' as const, fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: true, createdAt: new Date(2026, 0, 1) };

function make(over: Partial<ConstructorParameters<typeof SyncService>[0]> = {}) {
  return new SyncService({
    ctx: { db: device, transport: server },
    onChanged: () => void changed++,
    timers,
    now: () => 1_000,
    ...over,
  });
}
const status = (s: SyncService): SyncStatus => get(s.status);
const settle = (s: SyncService) => s.whenIdle();

beforeEach(async () => {
  resetClockForTests();
  device = await makeDevice('service-test');
  server = new FakeServer(() => 5_000_000_000_000);
  timers = new ManualTimers();
  changed = 0;
});

afterEach(() => dropDevice(device));

describe('SyncService', () => {
  it('is off until started, and syncing does nothing then', async () => {
    const s = make();
    expect(status(s)).toEqual(OFF_STATUS);
    await s.syncNow();
    expect(server.upsertCalls).toEqual([]);
  });

  it('syncs when started and shows up to date', async () => {
    await device.buckets.add(bucket);
    const s = make();
    s.start();
    await settle(s);
    expect(status(s)).toMatchObject({ state: 'idle', lastSyncedAt: 1_000, waiting: 0, parked: 0, message: '' });
    expect(server.live('buckets')).toHaveLength(1);
  });

  it('syncs again after the interval while all is well', async () => {
    const s = make({ intervalMs: 300_000 });
    s.start();
    await settle(s);
    expect(timers.delays).toEqual([300_000]);
  });

  it('turns a burst of writes into one sync after the pause', async () => {
    const s = make({ debounceMs: 2_000 });
    s.start();
    await settle(s);
    timers.tasks.clear();
    await device.buckets.add(bucket);
    s.requestSync();
    s.requestSync();
    s.requestSync();
    expect(timers.delays).toEqual([2_000]);
    timers.fireAll();
    await settle(s);
    expect(server.upsertCalls.filter((c) => c.remote === 'buckets')).toHaveLength(1);
  });

  it('runs one cycle at a time and folds requests made meanwhile into one follow-up', async () => {
    const s = make();
    s.start();
    await settle(s);
    const original = server.pull.bind(server);
    let pulls = 0;
    server.pull = async (...args) => {
      if (args[0] === 'settings') pulls++;
      await new Promise((r) => setTimeout(r, 5));
      return original(...args);
    };
    await Promise.all([s.syncNow(), s.syncNow(), s.syncNow()]);
    await settle(s);
    expect(pulls).toBe(2); // the one that ran, and one follow-up
  });

  it('tells the app when the pull changed local data, and not otherwise', async () => {
    const s = make();
    s.start();
    await settle(s);
    expect(changed).toBe(0);
    const def = collectionByTable('buckets')!;
    await server.upsert('buckets', [{ ...toRow(def, bucket), updated_at: new Date(1000).toISOString(), deleted_at: null }]);
    await s.syncNow();
    await settle(s);
    expect(changed).toBe(1);
  });

  it('keeps the queue, shows offline, and retries with growing gaps', async () => {
    await device.buckets.add(bucket);
    server.offline = true;
    const s = make({ backoffMs: [5_000, 15_000, 45_000] });
    s.start();
    await settle(s);
    expect(status(s)).toMatchObject({ state: 'offline', waiting: 1 });
    expect(timers.delays).toEqual([5_000]);
    timers.fireAll();
    await settle(s);
    expect(timers.delays).toEqual([15_000]);
    timers.fireAll();
    await settle(s);
    timers.fireAll();
    await settle(s);
    expect(timers.delays).toEqual([45_000]); // capped at the last gap
    server.offline = false;
    timers.fireAll();
    await settle(s);
    expect(status(s)).toMatchObject({ state: 'idle', waiting: 0 });
    expect(timers.delays).toEqual([300_000]); // back to the normal interval
  });

  it('stops retrying for an account that is not invited, and says so', async () => {
    server.allowed = false;
    const s = make();
    s.start();
    await settle(s);
    expect(status(s)).toMatchObject({ state: 'notAllowed' });
    expect(timers.delays).toEqual([]);
  });

  it('shows a problem reported from outside a cycle without scheduling any sync of its own', async () => {
    const s = make();
    s.report({ status: 'offline', message: 'no network' });
    expect(status(s)).toMatchObject({ state: 'offline', message: 'no network' });
    s.report({ status: 'schema', message: 'Database needs update 1' });
    expect(status(s)).toMatchObject({ state: 'schema', message: 'Database needs update 1' });
    expect(timers.tasks.size).toBe(0);
    expect(server.upsertCalls).toEqual([]);
  });

  it('keeps checking an out-of-date database at the normal interval when a cycle finds it', async () => {
    const s = make();
    s.start();
    await settle(s);
    timers.tasks.clear();
    // A table request failing with a schema problem reaches the cycle as a schema outcome.
    server.pull = async () => {
      throw new SyncError('schema', 'column not found');
    };
    await s.syncNow();
    await settle(s);
    expect(status(s)).toMatchObject({ state: 'schema', message: 'column not found' });
    expect(timers.delays).toEqual([300_000]);
  });

  it('waits for the person after a lost session, then resumes', async () => {
    const s = make();
    s.start();
    await settle(s);
    s.report({ status: 'auth', message: 'JWT expired' });
    expect(status(s)).toMatchObject({ state: 'auth', message: 'JWT expired' });
    await device.buckets.add(bucket);
    s.resume();
    await settle(s);
    expect(status(s)).toMatchObject({ state: 'idle' });
    expect(server.live('buckets')).toHaveLength(1);
  });

  it('counts rows the server refused as parked', async () => {
    await device.transactions.bulkAdd([tx('a'), tx('bad')]);
    server.rejectIds.add('bad');
    const s = make();
    s.start();
    await settle(s);
    expect(status(s)).toMatchObject({ state: 'idle', waiting: 0, parked: 1 });
    expect(needsAttention(status(s))).toBe(true);
  });

  it('skips a cycle quietly when another tab is syncing, and tries again soon', async () => {
    const s = make({ lock: async () => BUSY, backoffMs: [5_000] });
    s.start();
    await settle(s);
    expect(status(s).state).toBe('idle');
    expect(server.upsertCalls).toEqual([]);
    expect(timers.delays).toEqual([5_000]);
  });

  it('waits for the tab to be visible before a background cycle', async () => {
    let visible = false;
    const s = make({ isVisible: () => visible, intervalMs: 300_000 });
    s.start();
    await settle(s);
    const before = server.upsertCalls.length;
    timers.fireAll(); // hidden: looks again later, does not sync
    await settle(s);
    expect(timers.delays).toEqual([300_000]);
    visible = true;
    await device.buckets.add(bucket);
    timers.fireAll();
    await settle(s);
    expect(server.upsertCalls.length).toBeGreaterThan(before);
  });

  it('treats an unexpected error as a failed attempt, not a crash', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = make({ lock: async () => { throw new Error('boom'); } });
    s.start();
    await settle(s);
    expect(status(s).state).toBe('offline');
    spy.mockRestore();
  });

  it('goes quiet when stopped: no timers, status off', async () => {
    const s = make();
    s.start();
    await settle(s);
    s.requestSync();
    s.stop();
    expect(timers.tasks.size).toBe(0);
    expect(status(s)).toEqual(OFF_STATUS);
    await s.syncNow();
    expect(timers.tasks.size).toBe(0);
  });
});
