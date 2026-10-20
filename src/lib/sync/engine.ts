import { pullAll } from './pull';
import { pushPending } from './push';
import { repairAfterPull } from './repairs';
import { SyncError, type AccountState } from './transport';
import type { SyncContext } from './types';

// The migration level of the Supabase database this app version needs.
export const REQUIRED_SCHEMA_VERSION = 1;

export type SyncFailure = {
  status: 'offline' | 'auth' | 'notAllowed' | 'schema';
  message: string;
};

export type SyncOutcome = { status: 'ok'; changed: boolean; pushed: number; parked: number } | SyncFailure;

const STATUS_BY_KIND = {
  network: 'offline',
  auth: 'auth',
  notAllowed: 'notAllowed',
  schema: 'schema',
  rejected: 'offline', // a refused pull is unexpected; treat as a failed attempt
} as const;

export function toSyncFailure(e: unknown): SyncFailure {
  if (e instanceof SyncError) return { status: STATUS_BY_KIND[e.kind], message: e.message };
  throw e;
}

// Asks the server whether this account may sync and whether the database is
// new enough for this version of the app.
export async function checkAccount(ctx: SyncContext): Promise<{ status: 'ok'; state: AccountState } | SyncFailure> {
  try {
    const state = await ctx.transport.accountState();
    if (!state.allowed) return { status: 'notAllowed', message: "Sync isn't enabled for this account" };
    if (state.schemaVersion < REQUIRED_SCHEMA_VERSION) {
      return {
        status: 'schema',
        message: `Database needs update ${REQUIRED_SCHEMA_VERSION} (it is at ${state.schemaVersion})`,
      };
    }
    return { status: 'ok', state };
  } catch (e) {
    return toSyncFailure(e);
  }
}

const MAX_ROUNDS = 3;

// One sync cycle: pull, repair if the pull changed anything, push. A row the
// server skipped (it held a newer edit) needs another pull, so go round again.
export async function syncOnce(ctx: SyncContext): Promise<SyncOutcome> {
  try {
    let changed = false;
    let pushed = 0;
    let parked = 0;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const pulled = await pullAll(ctx);
      if (pulled.changed) {
        changed = true;
        await repairAfterPull(ctx.db);
      }
      const push = await pushPending(ctx);
      pushed += push.sent;
      parked += push.parked;
      if (push.skipped === 0) break;
    }
    return { status: 'ok', changed, pushed, parked };
  } catch (e) {
    return toSyncFailure(e);
  }
}
