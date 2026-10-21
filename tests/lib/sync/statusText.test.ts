import { describe, it, expect } from 'vitest';
import { describeSync, relativeTime } from '$lib/sync/statusText';
import { OFF_STATUS, needsAttention, type SyncStatus } from '$lib/sync/status';

const s = (over: Partial<SyncStatus>): SyncStatus => ({ ...OFF_STATUS, state: 'idle', ...over });
const NOW = 1_000_000_000;

describe('relativeTime', () => {
  it.each([
    [0, 'just now'], [30_000, 'just now'], [60_000, '1 min ago'], [150_000, '3 min ago'],
    [3_600_000, '1 h ago'], [5 * 3_600_000, '5 h ago'], [86_400_000, '1 d ago'], [3 * 86_400_000, '3 d ago'],
  ])('%i ms ago reads "%s"', (ago, text) => {
    expect(relativeTime(NOW - ago, NOW)).toBe(text);
  });

  it('never reads a time in the future as negative', () => {
    expect(relativeTime(NOW + 5_000, NOW)).toBe('just now');
  });
});

describe('describeSync', () => {
  it('says nothing when sync is off', () => {
    expect(describeSync(OFF_STATUS, NOW)).toEqual({ label: '', tone: 'quiet' });
  });

  it('shows when it last synced', () => {
    expect(describeSync(s({ lastSyncedAt: NOW - 120_000 }), NOW)).toEqual({ label: 'Synced · 2 min ago', tone: 'ok' });
    expect(describeSync(s({ lastSyncedAt: null }), NOW)).toEqual({ label: 'Connected', tone: 'ok' });
  });

  it('shows work in progress and changes waiting', () => {
    expect(describeSync(s({ state: 'syncing' }), NOW)).toEqual({ label: 'Syncing…', tone: 'quiet' });
    expect(describeSync(s({ waiting: 3 }), NOW)).toEqual({ label: '3 waiting', tone: 'quiet' });
  });

  it('shows offline with how much is waiting', () => {
    expect(describeSync(s({ state: 'offline', waiting: 3 }), NOW)).toEqual({ label: 'Offline · 3 waiting', tone: 'warn' });
    expect(describeSync(s({ state: 'offline' }), NOW)).toEqual({ label: 'Offline', tone: 'warn' });
  });

  it('puts changes the server refused ahead of everything that is fine', () => {
    expect(describeSync(s({ parked: 1, waiting: 4 }), NOW)).toEqual({ label: "1 change couldn't sync", tone: 'bad' });
    expect(describeSync(s({ parked: 2 }), NOW)).toEqual({ label: "2 changes couldn't sync", tone: 'bad' });
  });

  it('asks the person to act on a lost session, a missing invite or an old database', () => {
    expect(describeSync(s({ state: 'auth' }), NOW)).toEqual({ label: 'Sign in again', tone: 'bad' });
    expect(describeSync(s({ state: 'notAllowed' }), NOW)).toEqual({ label: "Sync isn't enabled for this account", tone: 'bad' });
    expect(describeSync(s({ state: 'schema' }), NOW)).toEqual({ label: 'Database needs update', tone: 'bad' });
  });
});

describe('needsAttention', () => {
  it('is quiet when all is well, offline or syncing', () => {
    for (const state of ['off', 'idle', 'syncing', 'offline'] as const) expect(needsAttention({ ...OFF_STATUS, state })).toBe(false);
  });

  it('flags a lost session, a missing invite, an old database and parked changes', () => {
    for (const state of ['auth', 'notAllowed', 'schema'] as const) expect(needsAttention({ ...OFF_STATUS, state })).toBe(true);
    expect(needsAttention({ ...OFF_STATUS, state: 'idle', parked: 2 })).toBe(true);
  });
});
