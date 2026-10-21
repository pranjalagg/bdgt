import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { get } from 'svelte/store';
import { makeDevice, dropDevice } from '../../helpers/devices';
import { FakeServer } from '../../helpers/fakeServer';
import { SyncApp, type AuthClient } from '$lib/sync/app';
import { SyncService, type Timers } from '$lib/sync/service';
import { collectionByTable, toRow } from '$lib/sync/registry';
import { getState, setState, LINKED_ACCOUNT } from '$lib/sync/state';
import { resetClockForTests } from '$lib/sync/clock';
import { setCaptureEnabled } from '$lib/sync/capture';
import type { BudgetDatabase } from '$lib/db';

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
  fireAll() {
    const due = [...this.tasks.values()];
    this.tasks.clear();
    for (const t of due) t.fn();
  }
}

type Session = { user: { id: string; email?: string } } | null;
const SESSION: Session = { user: { id: 'u1', email: 'me@example.com' } };

function fakeClient(session: Session) {
  const handlers: ((event: string, session: Session) => void)[] = [];
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session } })),
      signInWithOAuth: vi.fn(async () => ({ error: null as { message: string } | null })),
      signOut: vi.fn(async () => ({ error: null })),
      onAuthStateChange: vi.fn((cb: (event: string, session: Session) => void) => {
        handlers.push(cb);
        return { data: { subscription: { unsubscribe() {} } } };
      }),
    },
    emit: (event: string, s: Session) => handlers.forEach((h) => h(event, s)),
  };
}

let device: BudgetDatabase;
let server: FakeServer;
let timers: ManualTimers;
let client: ReturnType<typeof fakeClient>;
let saveFile: Mock<(text: string, filename: string) => void>;
let reload: Mock<() => Promise<void>>;
let reloadPage: Mock<() => void>;
let makeServiceCalls: number;
let getClient: Mock<() => Promise<typeof client>>;
let clearStoredSession: Mock<() => void>;
let broadcast: Mock<(kind: 'linked' | 'unlinked') => void>;

const day = new Date(2026, 9, 20);
const bucket = (id: string, name = id) => ({ id, name, color: '#000', order: 0, isDefault: false, allocationType: 'fixed' as const, fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: true, createdAt: new Date(2026, 0, 1) });

async function serverHasBucket(id: string, name: string) {
  const def = collectionByTable('buckets')!;
  await server.upsert('buckets', [{ ...toRow(def, bucket(id, name)), updated_at: new Date(1000).toISOString(), deleted_at: null }]);
}

function makeApp(over: { enabled?: boolean; hint?: boolean } = {}) {
  getClient = vi.fn(async () => client);
  return new SyncApp<typeof client>({
    db: device,
    enabled: over.enabled ?? true,
    hasSessionHint: () => over.hint ?? true,
    getClient: getClient as never,
    makeTransport: () => server,
    makeService: (ctx) => {
      makeServiceCalls++;
      return new SyncService({ ctx, onChanged: () => void reload(), timers, now: () => 1_000 });
    },
    reload: reload as never,
    exportBackup: async () => '{"backup":true}',
    saveFile: saveFile as never,
    redirectTo: () => 'https://example.com/bdgt/settings',
    reloadPage: reloadPage as never,
    clearStoredSession: clearStoredSession as never,
    broadcast: broadcast as never,
    setTimer: (fn, ms) => timers.set(fn, ms),
    clearTimer: (h) => timers.clear(h),
    today: () => '2026-10-21',
    retryMs: 30_000,
  });
}

// Waits for something asynchronous to become true, instead of guessing a delay.
async function eventually(check: () => Promise<boolean> | boolean, tries = 200): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('condition never became true');
}

async function started(app: ReturnType<typeof makeApp>) {
  await app.init();
  await app.syncService?.whenIdle();
}

beforeEach(async () => {
  resetClockForTests();
  device = await makeDevice('app-test');
  server = new FakeServer(() => 5_000_000_000_000);
  timers = new ManualTimers();
  client = fakeClient(SESSION);
  saveFile = vi.fn();
  reload = vi.fn(async () => {});
  reloadPage = vi.fn();
  clearStoredSession = vi.fn();
  broadcast = vi.fn();
  makeServiceCalls = 0;
  setCaptureEnabled(false); // a device that is not linked does not capture
});

afterEach(() => dropDevice(device));

describe('start-up', () => {
  it('does nothing at all when the build has no Supabase project', async () => {
    const app = makeApp({ enabled: false });
    await app.init();
    expect(getClient).not.toHaveBeenCalled();
  });

  it('does not load the library for a device that is not linked and has no sign-in under way', async () => {
    const app = makeApp({ hint: false });
    await app.init();
    expect(getClient).not.toHaveBeenCalled();
    expect(get(app.account)).toBeNull();
  });

  it('loads it when a sign-in redirect is under way, and stays quiet if there is no session', async () => {
    client = fakeClient(null);
    const app = makeApp();
    await app.init();
    expect(getClient).toHaveBeenCalled();
    expect(get(app.account)).toBeNull();
    expect(app.syncService).toBeNull();
  });

  it('keeps a linked device synced from its stored session, reloading what the pull changed', async () => {
    await setState(device, LINKED_ACCOUNT, 'u1');
    await serverHasBucket('theirs', 'Theirs');
    const app = makeApp({ hint: false });
    await started(app);
    expect(get(app.status)).toMatchObject({ state: 'idle' });
    expect(await device.buckets.get('theirs')).toBeTruthy();
    expect(reload).toHaveBeenCalled();
  });

  it('shows "sign in again" for a linked device whose session is gone, and keeps capturing', async () => {
    await setState(device, LINKED_ACCOUNT, 'u1');
    client = fakeClient(null);
    const app = makeApp({ hint: false });
    await app.init();
    expect(get(app.status)).toMatchObject({ state: 'auth' });
    await device.buckets.add(bucket('b1'));
    expect(await device.syncOutbox.get('buckets:b1')).toBeTruthy();
  });
});

describe('first sign-in', () => {
  it('links a device with data to an empty account and starts syncing', async () => {
    await device.buckets.add(bucket('b1'));
    const app = makeApp();
    await started(app);
    expect(get(app.account)).toEqual({ id: 'u1', email: 'me@example.com' });
    expect(server.live('buckets').map((r) => r.id)).toEqual(['b1']);
    expect(await getState(device, LINKED_ACCOUNT)).toBe('u1');
    expect(get(app.status)).toMatchObject({ state: 'idle', waiting: 0 });
  });

  it('asks before replacing a device when both sides hold data, and changes nothing', async () => {
    await device.buckets.add(bucket('mine'));
    await serverHasBucket('theirs', 'Theirs');
    const app = makeApp();
    await app.init();
    expect(get(app.prompt)).toEqual({ kind: 'conflict' });
    expect((await device.buckets.toArray()).map((b) => b.id)).toEqual(['mine']);
    expect(await getState(device, LINKED_ACCOUNT)).toBeUndefined();
    expect(app.syncService).toBeNull();
  });

  it('saves a backup of the device first, then uses the account\'s data, when the person chooses to', async () => {
    await device.buckets.add(bucket('mine'));
    await serverHasBucket('theirs', 'Theirs');
    const app = makeApp();
    await app.init();
    await app.resolvePrompt('useAccount');
    await app.syncService?.whenIdle();
    expect(saveFile).toHaveBeenCalledTimes(1);
    expect(saveFile).toHaveBeenCalledWith('{"backup":true}', 'budget-backup-before-sync-2026-10-21.json');
    expect((await device.buckets.toArray()).map((b) => b.id)).toEqual(['theirs']);
    expect(get(app.prompt)).toBeNull();
    expect(reload).toHaveBeenCalled();
    expect(await getState(device, LINKED_ACCOUNT)).toBe('u1');
  });

  it('keeps the device and signs out of the account when the person cancels', async () => {
    await device.buckets.add(bucket('mine'));
    await serverHasBucket('theirs', 'Theirs');
    const app = makeApp();
    await app.init();
    await app.resolvePrompt('cancel');
    expect(client.auth.signOut).toHaveBeenCalled();
    expect(saveFile).not.toHaveBeenCalled();
    expect((await device.buckets.toArray()).map((b) => b.id)).toEqual(['mine']);
    expect(get(app.account)).toBeNull();
    expect(get(app.prompt)).toBeNull();
  });

  it('shows an account that is not invited, without linking the device', async () => {
    server.allowed = false;
    await device.buckets.add(bucket('mine'));
    const app = makeApp();
    await app.init();
    expect(get(app.status)).toMatchObject({ state: 'notAllowed' });
    expect(await getState(device, LINKED_ACCOUNT)).toBeUndefined();
    expect(get(app.account)).toEqual({ id: 'u1', email: 'me@example.com' }); // still signed in, so they can sign out
  });

  it('retries a first sign-in that failed because the network was down', async () => {
    server.offline = true;
    await device.buckets.add(bucket('b1'));
    const app = makeApp();
    await app.init();
    expect(get(app.status)).toMatchObject({ state: 'offline' });
    expect([...timers.tasks.values()].map((t) => t.ms)).toEqual([30_000]);
    server.offline = false;
    timers.fireAll();
    await eventually(() => get(app.status)?.state === 'idle');
    await app.syncService?.whenIdle();
    expect(await getState(device, LINKED_ACCOUNT)).toBe('u1');
    expect(server.live('buckets')).toHaveLength(1);
    expect(get(app.status)).toMatchObject({ state: 'idle' });
  });

  it('waits and tries again while the database is out of date', async () => {
    server.schemaVersion = 0;
    const app = makeApp();
    await app.init();
    expect(get(app.status)).toMatchObject({ state: 'schema' });
    expect([...timers.tasks.values()].map((t) => t.ms)).toEqual([300_000]);
    expect(await getState(device, LINKED_ACCOUNT)).toBeUndefined();
    server.schemaVersion = 1;
    timers.fireAll();
    await eventually(() => get(app.status)?.state === 'idle');
    await app.syncService?.whenIdle();
    expect(await getState(device, LINKED_ACCOUNT)).toBe('u1');
  });

  it('runs the first sign-in once when the same sign-in is announced twice', async () => {
    const app = makeApp();
    await started(app);
    const before = makeServiceCalls;
    client.emit('SIGNED_IN', SESSION);
    client.emit('SIGNED_IN', SESSION);
    await new Promise((r) => setTimeout(r, 20));
    expect(makeServiceCalls).toBe(before);
  });
});

describe('the session', () => {
  it('shows "sign in again" when the session ends by itself, and resumes when it returns', async () => {
    const app = makeApp();
    await started(app);
    client.emit('SIGNED_OUT', null);
    expect(get(app.status)).toMatchObject({ state: 'auth' });
    client.emit('TOKEN_REFRESHED', SESSION);
    await app.syncService?.whenIdle();
    expect(get(app.status)).toMatchObject({ state: 'idle' });
  });

  it('asks Google to sign in, returning to the settings page', async () => {
    const app = makeApp({ hint: false });
    await app.signIn();
    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'https://example.com/bdgt/settings' } });
  });

  it('shows why sign-in could not start', async () => {
    client.auth.signInWithOAuth.mockResolvedValueOnce({ error: { message: 'provider is not enabled' } });
    const app = makeApp({ hint: false });
    await app.signIn();
    expect(get(app.error)).toBe('provider is not enabled');
  });
});

describe('signing out', () => {
  it('uploads what is waiting and reports what could not go', async () => {
    const app = makeApp();
    await started(app);
    expect(await app.requestSignOut()).toEqual({ pending: 0, linked: true });
    server.offline = true;
    await device.buckets.add(bucket('late'));
    expect(await app.requestSignOut()).toEqual({ pending: 1, linked: true });
  });

  it('clears this device, ends the session, stops syncing and reloads the page', async () => {
    await device.buckets.add(bucket('b1'));
    const app = makeApp();
    await started(app);
    await app.confirmSignOut({ downloadBackup: false });
    expect(client.auth.signOut).toHaveBeenCalled();
    expect(await device.buckets.count()).toBe(0);
    expect(await getState(device, LINKED_ACCOUNT)).toBeUndefined();
    expect(reloadPage).toHaveBeenCalled();
    expect(saveFile).not.toHaveBeenCalled();
    expect(server.live('buckets')).toHaveLength(1); // the account keeps it
  });

  it('saves a backup first when asked to', async () => {
    const app = makeApp();
    await started(app);
    await app.confirmSignOut({ downloadBackup: true });
    expect(saveFile).toHaveBeenCalledWith('{"backup":true}', 'budget-backup-2026-10-21.json');
  });

  it('does not treat its own sign-out as a lost session', async () => {
    const app = makeApp();
    await started(app);
    const pending = app.confirmSignOut({ downloadBackup: false });
    client.emit('SIGNED_OUT', null);
    await pending;
    expect(get(app.status)?.state).not.toBe('auth');
  });
});

describe('signing out of a device that is not linked', () => {
  it('keeps the data, however the person got there: not invited', async () => {
    server.allowed = false;
    await device.buckets.add(bucket('mine'));
    const app = makeApp();
    await app.init();
    expect(await app.requestSignOut()).toEqual({ pending: 0, linked: false });
    await app.confirmSignOut({ downloadBackup: false });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect((await device.buckets.toArray()).map((b) => b.id)).toEqual(['mine']);
    expect(reloadPage).not.toHaveBeenCalled();
    expect(get(app.account)).toBeNull();
    expect(get(app.status)).toBeNull();
  });

  it('keeps the data when the first-sign-in question is still open', async () => {
    await device.buckets.add(bucket('mine'));
    await serverHasBucket('theirs', 'Theirs');
    const app = makeApp();
    await app.init();
    expect(get(app.prompt)).toEqual({ kind: 'conflict' });
    await app.confirmSignOut({ downloadBackup: false });
    expect((await device.buckets.toArray()).map((b) => b.id)).toEqual(['mine']);
    expect(get(app.prompt)).toBeNull();
    expect(server.live('buckets').map((r) => r.id)).toEqual(['theirs']);
  });
});

describe('a device that is not linked never syncs on its own', () => {
  it('does not pull the account into the device when the network returns after a failed first sign-in', async () => {
    server.offline = true;
    await device.buckets.add(bucket('mine'));
    await serverHasBucket('theirs', 'Theirs').catch(() => {});
    server.offline = false;
    await serverHasBucket('theirs', 'Theirs');
    server.offline = true;
    const app = makeApp();
    await app.init();
    expect(get(app.status)).toMatchObject({ state: 'offline' });
    server.offline = false;
    await app.syncService?.syncNow(); // the 'online' / focus / Sync now triggers
    await app.syncService?.whenIdle();
    expect((await device.buckets.toArray()).map((b) => b.id)).toEqual(['mine']);
    expect(await getState(device, LINKED_ACCOUNT)).toBeUndefined();
    expect(get(app.status)).toMatchObject({ state: 'offline' });
  });

  it('does not sync a not-invited account either', async () => {
    server.allowed = false;
    const app = makeApp();
    await app.init();
    server.allowed = true; // invited later, or the focus trigger meets real row-level security
    await app.syncService?.syncNow();
    await app.syncService?.whenIdle();
    expect(get(app.status)).toMatchObject({ state: 'notAllowed' });
    expect(server.upsertCalls).toEqual([]);
  });
});

describe('signing out of a linked device', () => {
  it('ends only this device\'s session, so the person\'s other devices stay signed in', async () => {
    const app = makeApp();
    await started(app);
    await app.confirmSignOut({ downloadBackup: false });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('also uses the local scope when the person cancels the first-sign-in question', async () => {
    await device.buckets.add(bucket('mine'));
    await serverHasBucket('theirs', 'Theirs');
    const app = makeApp();
    await app.init();
    await app.resolvePrompt('cancel');
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('removes the stored session itself when ending it fails, so the person is not signed back in', async () => {
    client.auth.signOut.mockResolvedValueOnce({ error: { message: 'JWT expired' } } as never);
    const app = makeApp();
    await started(app);
    await app.confirmSignOut({ downloadBackup: false });
    expect(clearStoredSession).toHaveBeenCalled();
    expect(await device.buckets.count()).toBe(0);
    expect(reloadPage).toHaveBeenCalled();
  });

  it('removes it too when ending the session throws', async () => {
    client.auth.signOut.mockRejectedValueOnce(new Error('offline'));
    const app = makeApp();
    await started(app);
    await app.confirmSignOut({ downloadBackup: false });
    expect(clearStoredSession).toHaveBeenCalled();
    expect(reloadPage).toHaveBeenCalled();
  });

  it('waits for a sync that is already running before it clears the device', async () => {
    const app = makeApp();
    await started(app);
    const original = server.pull.bind(server);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    server.pull = async (...args) => {
      await gate;
      return original(...args);
    };
    void app.syncService?.syncNow();
    await new Promise((r) => setTimeout(r, 5));
    await serverHasBucket('late', 'Late'); // arrives while the cycle is in flight
    const signingOut = app.confirmSignOut({ downloadBackup: false });
    await new Promise((r) => setTimeout(r, 5));
    expect(reloadPage).not.toHaveBeenCalled(); // still waiting for the cycle
    release();
    await signingOut;
    expect(await device.buckets.count()).toBe(0); // cleared after the cycle, not under it
    expect(reloadPage).toHaveBeenCalled();
  });

  it('tells the other tabs the device was unlinked', async () => {
    const app = makeApp();
    await started(app);
    await app.confirmSignOut({ downloadBackup: false });
    expect(broadcast).toHaveBeenCalledWith('unlinked');
  });
});

describe('other tabs', () => {
  it('are told when this tab links the device for the first time, and only then', async () => {
    await device.buckets.add(bucket('b1'));
    const app = makeApp();
    await started(app);
    expect(broadcast).toHaveBeenCalledWith('linked');
    broadcast.mockClear();
    const again = makeApp();
    await started(again); // already linked: opening the app must not make every other tab reload
    expect(broadcast).not.toHaveBeenCalled();
  });
});

describe('the linked flag', () => {
  it('is true for a linked device even when it starts offline, so Import and Reset warn about the account', async () => {
    await setState(device, LINKED_ACCOUNT, 'u1');
    server.offline = true;
    const app = makeApp({ hint: false });
    await app.init();
    expect(get(app.linked)).toBe(true);
    expect(get(app.status)).toMatchObject({ state: 'offline' });
  });

  it('is true for a linked device whose session is gone', async () => {
    await setState(device, LINKED_ACCOUNT, 'u1');
    client = fakeClient(null);
    const app = makeApp({ hint: false });
    await app.init();
    expect(get(app.linked)).toBe(true);
  });
});

describe('cancelling the first-sign-in question', () => {
  it('stops any retry that was waiting', async () => {
    server.offline = true;
    await device.buckets.add(bucket('mine'));
    const app = makeApp();
    await app.init();
    expect(timers.tasks.size).toBeGreaterThan(0);
    await app.confirmSignOut({ downloadBackup: false });
    expect(timers.tasks.size).toBe(0);
  });
});
