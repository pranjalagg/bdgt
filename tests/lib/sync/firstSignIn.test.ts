import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeDevice, dropDevice } from '../../helpers/devices';
import { FakeServer } from '../../helpers/fakeServer';
import { DEFAULT_BUCKETS, SEEDED_KEY } from '$lib/db';
import { collectionByTable, toRow } from '$lib/sync/registry';
import { getState, setState, LINKED_ACCOUNT, INITIAL_SYNC_PENDING } from '$lib/sync/state';
import { isCaptureEnabled, setCaptureEnabled } from '$lib/sync/capture';
import { resetClockForTests } from '$lib/sync/clock';
import { stubLocalStorage } from '../../helpers/localStorage';
import {
  classifySide, matchesDefaultBuckets, decideFirstSignIn, summarizeDevice, summarizeAccount,
  requeueAll, clearLocalData, pendingChanges, runFirstSignIn, signOutLocal, type Side,
} from '$lib/sync/firstSignIn';
import type { BudgetDatabase } from '$lib/db';

let device: BudgetDatabase;
let server: FakeServer;
const ctx = () => ({ db: device, transport: server });
const day = new Date(2026, 9, 20);
const defaults = () => DEFAULT_BUCKETS.map((b, i) => ({ ...b, id: `d${i}`, createdAt: new Date(2026, 0, 1) }));
const myBucket = { id: 'mine', name: 'Mine', color: '#000', order: 0, isDefault: false, allocationType: 'fixed' as const, fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: true, createdAt: new Date(2026, 0, 1) };
const tx = (id: string) => ({ id, amount: 100, bucketId: 'mine', date: day });

async function serverHas(table: string, record: Record<string, unknown>, atMs = 1000) {
  const def = collectionByTable(table)!;
  await server.upsert(def.remote, [{ ...toRow(def, record), updated_at: new Date(atMs).toISOString(), deleted_at: null }]);
}
const serverDefaults = async () => { for (const b of defaults()) await serverHas('buckets', b); };

beforeEach(async () => {
  resetClockForTests();
  stubLocalStorage();
  device = await makeDevice('first-test');
  server = new FakeServer(() => 5_000_000_000_000);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await dropDevice(device);
});

describe('what counts as untouched defaults', () => {
  it('accepts exactly the eleven default buckets, whatever their ids and dates', () => {
    expect(matchesDefaultBuckets(defaults())).toBe(true);
  });

  it('rejects a renamed, missing or extra bucket', () => {
    const d = defaults();
    expect(matchesDefaultBuckets([{ ...d[0], name: 'Mortgage' }, ...d.slice(1)])).toBe(false);
    expect(matchesDefaultBuckets(d.slice(1))).toBe(false);
    expect(matchesDefaultBuckets([...d, { ...d[0], id: 'x', name: 'Extra' }])).toBe(false);
    expect(matchesDefaultBuckets([{ ...d[0], fixedAmount: 100 }, ...d.slice(1)])).toBe(false);
  });

  it('classifies a side', () => {
    expect(classifySide([], false)).toBe('empty');
    expect(classifySide(defaults(), false)).toBe('defaults');
    expect(classifySide([], true)).toBe('data');
    expect(classifySide(defaults(), true)).toBe('data');
    expect(classifySide([myBucket], false)).toBe('data');
  });
});

describe('decideFirstSignIn', () => {
  const cases: [Side, Side, string][] = [
    ['empty', 'empty', 'start'], ['empty', 'defaults', 'download'], ['empty', 'data', 'download'],
    ['defaults', 'empty', 'upload'], ['defaults', 'defaults', 'download'], ['defaults', 'data', 'download'],
    ['data', 'empty', 'upload'], ['data', 'defaults', 'upload'], ['data', 'data', 'conflict'],
  ];
  it.each(cases)('device %s, account %s -> %s', (device, account, plan) => {
    expect(decideFirstSignIn(device, account)).toBe(plan);
  });
});

describe('summaries', () => {
  it('summarizes the device', async () => {
    expect(await summarizeDevice(device)).toBe('empty');
    await device.buckets.bulkAdd(defaults());
    expect(await summarizeDevice(device)).toBe('defaults');
    await device.transactions.add({ id: 't', amount: 1, bucketId: 'd0', date: day });
    expect(await summarizeDevice(device)).toBe('data');
  });

  it('does not count settings as data', async () => {
    await device.settings.put({ key: 'baseCurrency', value: 'INR' });
    expect(await summarizeDevice(device)).toBe('empty');
  });

  it('summarizes the account', async () => {
    expect(summarizeAccount(await server.accountState())).toBe('empty');
    await serverDefaults();
    expect(summarizeAccount(await server.accountState())).toBe('defaults');
    await serverHas('transactions', tx('t1'));
    expect(summarizeAccount(await server.accountState())).toBe('data');
  });
});

describe('requeueAll, clearLocalData, signOutLocal', () => {
  it('queues every record, with a version, without changing any data', async () => {
    setCaptureEnabled(false);
    await device.buckets.add(myBucket);
    await device.transactions.bulkAdd([tx('a'), tx('b')]);
    await device.settings.put({ key: 'baseCurrency', value: 'USD' });
    setCaptureEnabled(true);

    expect(await requeueAll(device)).toBe(4);

    expect((await device.syncOutbox.toArray()).map((e) => e.key).sort()).toEqual(['buckets:mine', 'settings:baseCurrency', 'transactions:a', 'transactions:b']);
    expect(await device.syncVersions.count()).toBe(4);
    expect(await device.transactions.count()).toBe(2);
    expect(await pendingChanges(device)).toBe(4);
  });

  it('wipes data and bookkeeping without queuing deletes', async () => {
    await device.buckets.add(myBucket);
    await setState(device, LINKED_ACCOUNT, 'u1');
    await clearLocalData(device);
    expect(await device.buckets.count()).toBe(0);
    expect(await device.syncOutbox.count()).toBe(0);
    expect(await device.syncVersions.count()).toBe(0);
    expect(await getState(device, LINKED_ACCOUNT)).toBeUndefined();
  });

  it('signing out switches capture off and lets default buckets be created again', async () => {
    localStorage.setItem(SEEDED_KEY, 'true');
    await device.buckets.add(myBucket);
    await signOutLocal(device);
    expect(isCaptureEnabled()).toBe(false);
    expect(await device.buckets.count()).toBe(0);
    expect(localStorage.getItem(SEEDED_KEY)).toBeNull();
  });
});

describe('runFirstSignIn', () => {
  it('uploads the device when the account is empty', async () => {
    await device.buckets.add(myBucket);
    await device.transactions.add(tx('t1'));

    const result = await runFirstSignIn(ctx(), 'u1');

    expect(result).toMatchObject({ status: 'done', plan: 'upload', sync: { status: 'ok' } });
    expect(server.live('buckets').map((r) => r.id)).toEqual(['mine']);
    expect(server.live('transactions').map((r) => r.id)).toEqual(['t1']);
    expect(await getState(device, LINKED_ACCOUNT)).toBe('u1');
    expect(await getState(device, INITIAL_SYNC_PENDING)).toBe(false);
    expect(await pendingChanges(device)).toBe(0);
  });

  it('uploads untouched default buckets to an empty account', async () => {
    await device.buckets.bulkAdd(defaults());
    await runFirstSignIn(ctx(), 'u1');
    expect(server.live('buckets')).toHaveLength(11);
  });

  it('replaces the account\'s untouched defaults with the device\'s data, so no bucket appears twice', async () => {
    await serverDefaults();
    await device.buckets.add(myBucket);
    await device.transactions.add(tx('t1'));

    const result = await runFirstSignIn(ctx(), 'u1');

    expect(result).toMatchObject({ status: 'done', plan: 'upload' });
    expect(server.live('buckets').map((r) => r.id)).toEqual(['mine']);
    expect(server.all('buckets')).toHaveLength(12);
  });

  it('downloads the account into an empty device and creates no default buckets of its own', async () => {
    await serverHas('buckets', myBucket);
    await serverHas('transactions', tx('t1'));

    const result = await runFirstSignIn(ctx(), 'u1');

    expect(result).toMatchObject({ status: 'done', plan: 'download' });
    expect((await device.buckets.toArray()).map((b) => b.id)).toEqual(['mine']);
    expect(await device.transactions.get('t1')).toBeTruthy();
    expect(await pendingChanges(device)).toBe(0);
    expect(await getState(device, LINKED_ACCOUNT)).toBe('u1');
  });

  it('replaces the device\'s untouched defaults with the account\'s data', async () => {
    await device.buckets.bulkAdd(defaults());
    await serverHas('buckets', myBucket);
    await runFirstSignIn(ctx(), 'u1');
    expect((await device.buckets.toArray()).map((b) => b.id)).toEqual(['mine']);
    expect(server.live('buckets')).toHaveLength(1);
  });

  it('just links when both sides are empty', async () => {
    const result = await runFirstSignIn(ctx(), 'u1');
    expect(result).toMatchObject({ status: 'done', plan: 'start' });
    expect(await getState(device, LINKED_ACCOUNT)).toBe('u1');
    expect(await getState(device, INITIAL_SYNC_PENDING)).toBe(false);
  });

  it('asks before replacing a device that holds data when the account holds data too, and changes nothing', async () => {
    await device.buckets.add(myBucket);
    await serverHas('buckets', { ...myBucket, id: 'theirs', name: 'Theirs' });

    const result = await runFirstSignIn(ctx(), 'u1');

    expect(result).toEqual({ status: 'needsChoice', reason: 'conflict' });
    expect((await device.buckets.toArray()).map((b) => b.id)).toEqual(['mine']);
    expect(await getState(device, LINKED_ACCOUNT)).toBeUndefined();
    expect(server.live('buckets').map((r) => r.id)).toEqual(['theirs']);
  });

  it('replaces the device with the account when the person chooses to', async () => {
    await device.buckets.add(myBucket);
    await serverHas('buckets', { ...myBucket, id: 'theirs', name: 'Theirs' });
    const result = await runFirstSignIn(ctx(), 'u1', 'useAccount');
    expect(result).toMatchObject({ status: 'done', plan: 'download' });
    expect((await device.buckets.toArray()).map((b) => b.id)).toEqual(['theirs']);
    expect(server.live('buckets').map((r) => r.id)).toEqual(['theirs']);
  });

  it('changes nothing when the person cancels', async () => {
    await device.buckets.add(myBucket);
    await serverHas('buckets', { ...myBucket, id: 'theirs' });
    expect(await runFirstSignIn(ctx(), 'u1', 'cancel')).toEqual({ status: 'cancelled' });
    expect((await device.buckets.toArray()).map((b) => b.id)).toEqual(['mine']);
  });

  it('refuses to upload one account\'s data into another', async () => {
    await device.buckets.add(myBucket);
    await setState(device, LINKED_ACCOUNT, 'someone-else');
    const result = await runFirstSignIn(ctx(), 'u1');
    expect(result).toEqual({ status: 'needsChoice', reason: 'otherAccount' });
    expect(server.all('buckets')).toEqual([]);
  });

  it('only syncs when this device is already linked to the account', async () => {
    await setState(device, LINKED_ACCOUNT, 'u1');
    await device.buckets.add(myBucket);
    const result = await runFirstSignIn(ctx(), 'u1');
    expect(result).toMatchObject({ status: 'done', plan: 'start', sync: { status: 'ok' } });
    expect(server.live('buckets').map((r) => r.id)).toEqual(['mine']);
  });

  it('reports an account that is not invited and changes nothing', async () => {
    server.allowed = false;
    await device.buckets.add(myBucket);
    expect(await runFirstSignIn(ctx(), 'u1')).toMatchObject({ status: 'notAllowed' });
    expect(await device.buckets.count()).toBe(1);
    expect(await getState(device, LINKED_ACCOUNT)).toBeUndefined();
  });

  it('can be run again after a download was interrupted', async () => {
    await serverHas('buckets', myBucket);
    server.failNextPull('buckets');
    expect(await runFirstSignIn(ctx(), 'u1')).toMatchObject({ status: 'offline' });
    expect(await getState(device, LINKED_ACCOUNT)).toBeUndefined();
    expect(await runFirstSignIn(ctx(), 'u1')).toMatchObject({ status: 'done', plan: 'download' });
    expect((await device.buckets.toArray()).map((b) => b.id)).toEqual(['mine']);
  });
});
