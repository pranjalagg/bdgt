import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BudgetDatabase } from '$lib/db';
import { getState, setState, isInitialSyncPending, cursorKey, INITIAL_SYNC_PENDING } from '$lib/sync/state';

let device: BudgetDatabase;

beforeEach(async () => {
  device = new BudgetDatabase('state-test');
  await device.open();
});

afterEach(async () => {
  device.close();
  await Dexie.delete('state-test');
});

describe('hidden sync tables', () => {
  it('opens at version 14 with the three sync tables', () => {
    expect(device.verno).toBe(14);
    expect(device.tables.map((t) => t.name)).toEqual(expect.arrayContaining(['syncOutbox', 'syncVersions', 'syncState']));
  });

  it('keeps every existing table, so nothing else moved', () => {
    expect(device.tables.map((t) => t.name)).toEqual(
      expect.arrayContaining(['buckets', 'transactions', 'recurringTransactions', 'incomes', 'savingsGoals', 'investmentLots', 'investmentSells', 'investmentPrices', 'settings', 'allocations', 'monthNotes'])
    );
  });
});

describe('sync state helpers', () => {
  it('reads undefined for a missing key and what was written for a present one', async () => {
    expect(await getState<string>(device, 'linkedAccount')).toBeUndefined();
    await setState(device, 'linkedAccount', 'user-1');
    expect(await getState<string>(device, 'linkedAccount')).toBe('user-1');
  });

  it('names the cursor of a remote table', () => {
    expect(cursorKey('transactions')).toBe('cursor:transactions');
  });

  it('reports the first sync as pending only when it was marked so', async () => {
    expect(await isInitialSyncPending(device)).toBe(false);
    await setState(device, INITIAL_SYNC_PENDING, true);
    expect(await isInitialSyncPending(device)).toBe(true);
    await setState(device, INITIAL_SYNC_PENDING, false);
    expect(await isInitialSyncPending(device)).toBe(false);
  });
});
