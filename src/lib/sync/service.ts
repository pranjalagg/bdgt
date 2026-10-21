import { writable, type Readable } from 'svelte/store';
import { syncOnce, type SyncFailure, type SyncOutcome } from './engine';
import { syncCounts } from './parked';
import { OFF_STATUS, needsAttention, type SyncState, type SyncStatus } from './status';
import type { SyncContext } from './types';

// Runs sync cycles for a device that is linked to an account: when to run,
// how often to retry, and what to tell the person. It does not decide who is
// signed in (see app.ts); it only keeps a linked device synced.

export { OFF_STATUS, needsAttention, type SyncState, type SyncStatus };

export const BUSY = Symbol('another tab is syncing');

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface SyncServiceOptions {
  ctx: SyncContext;
  // The pull changed local data: the app's stores need reloading.
  onChanged: () => void | Promise<void>;
  timers?: Timers;
  // Runs one cycle exclusively across tabs; BUSY means another tab has it.
  lock?: <T>(fn: () => Promise<T>) => Promise<T | typeof BUSY>;
  // Background timers do nothing while the tab is hidden.
  isVisible?: () => boolean;
  now?: () => number;
  debounceMs?: number; // after a write
  intervalMs?: number; // between cycles while all is well
  backoffMs?: number[]; // between retries while offline, growing
}

export class SyncService {
  private store = writable<SyncStatus>({ ...OFF_STATUS });
  readonly status: Readable<SyncStatus> = { subscribe: this.store.subscribe };

  private active = false;
  private running: Promise<void> | null = null;
  private again = false;
  private failures = 0;
  private timer: unknown = null;
  private debounce: unknown = null;
  private current: SyncStatus = { ...OFF_STATUS };

  private readonly timers: Timers;
  private readonly lock: NonNullable<SyncServiceOptions['lock']>;
  private readonly isVisible: () => boolean;
  private readonly now: () => number;
  private readonly debounceMs: number;
  private readonly intervalMs: number;
  private readonly backoffMs: number[];

  constructor(private options: SyncServiceOptions) {
    this.timers = options.timers ?? realTimers;
    this.lock = options.lock ?? (async (fn) => fn());
    this.isVisible = options.isVisible ?? (() => true);
    this.now = options.now ?? Date.now;
    this.debounceMs = options.debounceMs ?? 2_000;
    this.intervalMs = options.intervalMs ?? 300_000;
    this.backoffMs = options.backoffMs ?? [5_000, 15_000, 45_000, 120_000, 300_000];
  }

  private patch(change: Partial<SyncStatus>): void {
    this.current = { ...this.current, ...change };
    this.store.set(this.current);
  }

  private clearTimers(): void {
    if (this.timer !== null) this.timers.clear(this.timer);
    if (this.debounce !== null) this.timers.clear(this.debounce);
    this.timer = null;
    this.debounce = null;
  }

  private arm(ms: number): void {
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = this.timers.set(() => {
      this.timer = null;
      if (!this.active) return;
      if (!this.isVisible()) this.arm(ms); // look again later
      else void this.syncNow();
    }, ms);
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.failures = 0;
    this.patch({ state: 'idle', message: '' });
    void this.syncNow();
  }

  stop(): void {
    this.active = false;
    this.again = false;
    this.clearTimers();
    this.current = { ...OFF_STATUS };
    this.store.set(this.current);
  }

  // A write was committed: sync soon, once, however many writes came together.
  requestSync(): void {
    if (!this.active) return;
    if (this.debounce !== null) this.timers.clear(this.debounce);
    this.debounce = this.timers.set(() => {
      this.debounce = null;
      void this.syncNow();
    }, this.debounceMs);
  }

  // Runs a cycle now. One at a time: a request made while one is running is
  // folded into a single follow-up run.
  syncNow(): Promise<void> {
    if (!this.active) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.cycle().finally(() => {
      this.running = null;
      if (this.again && this.active) {
        this.again = false;
        void this.syncNow();
      } else {
        this.again = false;
      }
    });
    return this.running;
  }

  // Resolves once no cycle is running and none is waiting to follow.
  async whenIdle(): Promise<void> {
    while (this.running) await this.running;
  }

  // Shows a problem that happened outside a cycle (for example while
  // signing in), without scheduling anything: until the device is linked the
  // caller decides when to try again, and the service must not sync on its own.
  report(failure: SyncFailure): void {
    this.active = true;
    this.apply({ ...failure }, false);
  }

  // The session came back (token refreshed, signed in again): sync again.
  resume(): void {
    if (this.current.state === 'auth') {
      this.active = true;
      this.failures = 0;
      void this.syncNow();
    }
  }

  async refreshCounts(): Promise<void> {
    this.patch(await syncCounts(this.options.ctx.db));
  }

  private apply(outcome: SyncOutcome, schedule = true): void {
    if (outcome.status === 'ok') {
      this.failures = 0;
      this.patch({ state: 'idle', lastSyncedAt: this.now(), message: '' });
      if (schedule) this.arm(this.intervalMs);
      return;
    }
    this.patch({ state: outcome.status, message: outcome.message });
    if (!schedule) return;
    if (outcome.status === 'offline') {
      this.failures += 1;
      this.arm(this.backoffMs[Math.min(this.failures - 1, this.backoffMs.length - 1)]);
    } else if (outcome.status === 'schema') {
      this.arm(this.intervalMs); // the database may be upgraded meanwhile
    }
    // auth and notAllowed wait for the person: sign in again, or get invited.
  }

  private async cycle(): Promise<void> {
    this.clearTimers();
    const before = this.current.state;
    this.patch({ state: 'syncing' });

    let outcome: SyncOutcome | typeof BUSY;
    try {
      outcome = await this.lock(() => syncOnce(this.options.ctx));
    } catch (e) {
      console.error('Sync failed unexpectedly', e);
      outcome = { status: 'offline', message: 'Something went wrong while syncing' };
    }
    if (!this.active) return;

    if (outcome === BUSY) {
      this.patch({ state: before === 'syncing' ? 'idle' : before });
      this.arm(this.backoffMs[0]);
      return;
    }

    try {
      await this.refreshCounts();
    } catch (e) {
      console.error('Could not count waiting changes', e);
    }
    this.apply(outcome);
    if (outcome.status === 'ok' && outcome.changed) {
      try {
        await this.options.onChanged();
      } catch (e) {
        console.error('Could not reload after sync', e);
      }
    }
  }
}
