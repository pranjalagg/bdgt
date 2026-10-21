import { DEFAULT_BUCKETS, SEEDED_KEY, type BudgetDatabase } from '$lib/db';
import { setCaptureEnabled } from './capture';
import { editStamp } from './clock';
import { checkAccount, syncOnce, toSyncFailure, type SyncFailure, type SyncOutcome } from './engine';
import { pullAll } from './pull';
import { COLLECTIONS, collectionByTable, fromRow } from './registry';
import { repairAfterPull } from './repairs';
import { INITIAL_SYNC_PENDING, LINKED_ACCOUNT, getState, setState } from './state';
import { resetTransaction } from './transactions';
import type { AccountState, PulledRow } from './transport';
import type { SyncContext } from './types';

// What happens the first time a device signs in to an account. The device
// and the account each hold nothing, only the untouched default buckets, or
// real data; the table in decideFirstSignIn says what to do for each pair.

export type Side = 'empty' | 'defaults' | 'data';
export type FirstSignInPlan = 'upload' | 'download' | 'conflict' | 'start';

type BucketLike = object;

const signature = (bucket: BucketLike) => {
  const b = bucket as Record<string, unknown>;
  return JSON.stringify([b.name, b.color, b.order, b.isDefault === true, b.allocationType, b.fixedAmount, b.percentageAmount, b.isSavings === true, b.isEveryday === true, b.isSystem === true]);
};

const DEFAULT_SIGNATURES = DEFAULT_BUCKETS.map((b) => signature(b)).sort();

// Exactly the default buckets, none renamed or edited, none missing or extra.
// Ids and dates differ per install and are ignored.
export function matchesDefaultBuckets(buckets: BucketLike[]): boolean {
  if (buckets.length !== DEFAULT_SIGNATURES.length) return false;
  const have = buckets.map(signature).sort();
  return have.every((s, i) => s === DEFAULT_SIGNATURES[i]);
}

export function classifySide(buckets: BucketLike[], hasOtherRecords: boolean): Side {
  if (hasOtherRecords) return 'data';
  if (buckets.length === 0) return 'empty';
  return matchesDefaultBuckets(buckets) ? 'defaults' : 'data';
}

// Settings do not count: every device has some.
export async function summarizeDevice(db: BudgetDatabase): Promise<Side> {
  const buckets = await db.buckets.toArray();
  let others = 0;
  for (const def of COLLECTIONS) {
    if (def.table === 'buckets' || def.table === 'settings') continue;
    others += await db.table(def.table).count();
  }
  return classifySide(buckets, others > 0);
}

export function summarizeAccount(state: AccountState): Side {
  const def = collectionByTable('buckets')!;
  return classifySide(state.buckets.map((row) => fromRow(def, row)), state.hasOtherRows);
}

export function decideFirstSignIn(device: Side, account: Side): FirstSignInPlan {
  if (device === 'data' && account === 'data') return 'conflict';
  if (device === 'data') return 'upload';
  if (account === 'data') return 'download';
  if (device === 'empty' && account === 'empty') return 'start';
  return account === 'defaults' ? 'download' : 'upload';
}

// Queues every record on the device for upload, without changing any data.
export async function requeueAll(db: BudgetDatabase): Promise<number> {
  let count = 0;
  const tables = COLLECTIONS.map((c) => db.table(c.table));
  await db.transaction('rw', [...tables, db.syncOutbox, db.syncVersions], async () => {
    for (const def of COLLECTIONS) {
      const ids = (await db.table(def.table).toCollection().primaryKeys()).map(String);
      if (ids.length === 0) continue;
      const keys = ids.map((id) => `${def.table}:${id}`);
      const versions = await db.syncVersions.bulkGet(keys);
      const stamps = keys.map((_, i) => editStamp(versions[i]?.at));
      await db.syncOutbox.bulkPut(ids.map((id, i) => ({ key: keys[i], table: def.table, id, op: 'upsert' as const, at: stamps[i] })));
      await db.syncVersions.bulkPut(keys.map((key, i) => ({ key, at: stamps[i] })));
      count += ids.length;
    }
  });
  return count;
}

// Wipes the device's budget data and all sync bookkeeping. Not a deletion
// to sync: nothing is queued.
export async function clearLocalData(db: BudgetDatabase): Promise<void> {
  // captureRaw is not synced but belongs to this device's data all the same.
  const tables = [...COLLECTIONS.map((c) => db.table(c.table)), db.captureRaw, db.syncOutbox, db.syncVersions, db.syncState];
  await resetTransaction(db, tables, async () => {
    await Promise.all(tables.map((t) => t.clear()));
  });
}

// Forgets the link, queue, versions and cursors, keeping the budget data.
async function forgetSyncState(db: BudgetDatabase): Promise<void> {
  const tables = [db.syncOutbox, db.syncVersions, db.syncState];
  await resetTransaction(db, tables, async () => {
    await Promise.all(tables.map((t) => t.clear()));
  });
}

export function pendingChanges(db: BudgetDatabase): Promise<number> {
  return db.syncOutbox.count();
}

// Back to a fresh local-only device. The "defaults seeded" flag goes too, so
// the default buckets are created again.
export async function signOutLocal(db: BudgetDatabase): Promise<void> {
  setCaptureEnabled(false);
  await clearLocalData(db);
  try {
    localStorage.removeItem(SEEDED_KEY);
  } catch {
    // localStorage unavailable (private mode)
  }
}

// The account's untouched default buckets would sit beside the device's own;
// tombstone them, then queue everything the device holds.
async function replaceAccountWithDevice(ctx: SyncContext, accountBuckets: PulledRow[]): Promise<void> {
  if (accountBuckets.length > 0) {
    const stamp = Math.max(Date.now(), ...accountBuckets.map((r) => Date.parse(r.updated_at))) + 1;
    const at = new Date(stamp).toISOString();
    await ctx.transport.upsert('buckets', accountBuckets.map((r) => ({ id: r.id, updated_at: at, deleted_at: at })));
  }
  await requeueAll(ctx.db);
}

async function replaceDeviceWithAccount(ctx: SyncContext): Promise<void> {
  await clearLocalData(ctx.db);
  await setState(ctx.db, INITIAL_SYNC_PENDING, true); // clearing removed it
  await pullAll(ctx);
  await repairAfterPull(ctx.db);
}

export type FirstSignInResult =
  | { status: 'done'; plan: FirstSignInPlan; sync: SyncOutcome }
  | { status: 'needsChoice'; reason: 'conflict' | 'otherAccount' }
  | { status: 'cancelled' }
  | SyncFailure;

// `choice` answers a needsChoice: 'useAccount' replaces this device's data
// with the account's (the caller saves a backup of the device first),
// 'cancel' changes nothing.
export async function runFirstSignIn(
  ctx: SyncContext,
  userId: string,
  choice?: 'useAccount' | 'cancel'
): Promise<FirstSignInResult> {
  const { db } = ctx;
  try {
    const linked = await getState<string>(db, LINKED_ACCOUNT);
    if (linked === userId) {
      // The database may have moved on since this device last synced.
      const account = await checkAccount(ctx);
      if (account.status !== 'ok') return account;
      setCaptureEnabled(true);
      return { status: 'done', plan: 'start', sync: await syncOnce(ctx) };
    }

    const account = await checkAccount(ctx);
    if (account.status !== 'ok') return account;

    const deviceSide = await summarizeDevice(db);
    let plan = decideFirstSignIn(deviceSide, summarizeAccount(account.state));
    const otherAccount = linked !== undefined && deviceSide === 'data';
    if (plan === 'conflict' || otherAccount) {
      if (choice === undefined) return { status: 'needsChoice', reason: otherAccount ? 'otherAccount' : 'conflict' };
      if (choice === 'cancel') return { status: 'cancelled' };
      plan = 'download';
    }

    // Another account's queue, cursors and versions must not carry over
    // (the data itself is either replaced below or is only untouched defaults).
    if (linked !== undefined && plan !== 'download') await forgetSyncState(db);

    setCaptureEnabled(true);
    await setState(db, INITIAL_SYNC_PENDING, true);
    try {
      if (plan === 'upload') {
        await replaceAccountWithDevice(ctx, account.state.buckets);
      } else if (plan === 'download') {
        await replaceDeviceWithAccount(ctx);
      }
      // Linked as soon as the data is in place, so an interrupted upload resumes
      // from its queue instead of being mistaken for a conflict.
      await setState(db, LINKED_ACCOUNT, userId);
    } finally {
      // Never left pending after a failure: that would block default buckets.
      await setState(db, INITIAL_SYNC_PENDING, false);
    }
    return { status: 'done', plan, sync: await syncOnce(ctx) };
  } catch (e) {
    return toSyncFailure(e);
  }
}
