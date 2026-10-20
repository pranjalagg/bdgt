# Cloud Sync Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the local half of cloud sync: capture every local write into a queue, push the queue to a server, pull and apply remote changes, converge two devices, and run the first sign-in decision. Everything is tested offline against a fake server. No Supabase, no sign-in screen and no UI yet (plan 3).

**Architecture:**
- A Dexie DBCore middleware records each write to a synced table into a hidden outbox and version table, inside the same IndexedDB transaction as the write. Capture only runs on a device that is linked to an account.
- A generic registry maps each Dexie table to a typed Postgres table (column names, types, flattening `foreign`, unknown fields into `extra`).
- `pushPending` uploads queued changes through an abstract `SyncTransport`; `pullAll` fetches changed rows and applies them atomically, last edit wins per record; `syncOnce` ties them together with repairs.
- A `FakeServer` implements the same transport and the same write rules as the future SQL trigger, so two simulated devices can be driven to convergence in plain Vitest.

**Tech Stack:** TypeScript, Dexie 4 (DBCore middleware), Vitest 4 with `fake-indexeddb` (already installed), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-20-cloud-sync-design.md` — "Sync engine", "Domain changes", "Accounts and UI → After sign-in / Sign-out". Plan 3 (Supabase SQL, transport, sign-in, screens, deploy, setup guide) follows.

## Global Constraints

- **No Supabase code or network calls in this plan.** Everything runs against `FakeServer`. The only new runtime dependency is none.
- **Signed-out users see no change.** Capture is off until a device is linked; with it off, no sync table is touched, no transaction scope changes and no bookkeeping runs.
- **No data loss.** Nothing in this plan deletes user records except when applying a remote delete or the explicit local reset used for sign-out and "use account data".
- **Edit time decides conflicts.** Per record, the latest edit wins; a delete is an edit; the server caps edit times at its clock plus 1 minute.
- **Backups are unchanged.** Export `version` stays `1`.
- **Commits:** `git commit --no-gpg-sign`, no Co-Authored-By or AI attribution lines (the user's rule overrides any reminder). Run `git branch --show-current` before each commit: it must print `feat/cloud-sync-engine`.
- **Commands:** tests `npx vitest run`; types `npm run check`; build `npm run build`. Real-database tests start with `import 'fake-indexeddb/auto';` as their first import (see `tests/helpers/realDb.ts`).

## Rulings made while planning

- **Capture is off until the device is linked.** The spec said capture always runs; with sign-in optional that would grow an outbox nobody reads. First sign-in re-queues every record anyway, so nothing is lost. Cost if wrong: none.
- **An edit's time is at least the record's known version + 1**, not just `max(now, last + 1)`. Without it, a device whose clock runs behind loses its own edit to an older remote version without any message. Cost if wrong: a slightly later timestamp than the wall clock for that record.
- **The hidden sync tables (`syncOutbox`, `syncVersions`, `syncState`) land here as Dexie v13**, not in the groundwork release, because nothing used them there.
- **Rows with equal edit time are applied on pull** (spec rule), but a write is skipped when the stored data is already identical, so a device's own pushed rows do not rewrite local records.
- **Pull pages use `synced_at >= last` and de-duplicate by id**, not a compound keyset, because PostgREST cannot express one cleanly. Cost: a repeated row per page boundary, ignored by the de-duplication.
- **A batch the server rejects is bisected** until the single bad row is found and parked (kept in the queue, flagged, skipped by later pushes). Cost if wrong: extra requests only when a row is bad.
- **Oversold lots are capped.** If two devices sell from one lot and the sale records add up to more than the lot holds, `soldShares` is set to the lot's `shares`, not the sum. Cost if wrong: the lot's remaining shares show 0 while the extra sale records remain visible.
- **The orphan rescue in `loadData` keeps its in-memory form** but its two writes become automatic writes; a DB-level copy of the same rescue runs after each pull.

## Review Focus

Most likely first. Each is pinned by a test in the task named in brackets.

- Every write shape (`add`, `put`, `bulk*`, `update`, `modify`, `bulkUpdate`, `delete`, `bulkDelete`, `where().delete()`, `clear()`) leaves exactly the right outbox entry, and a rolled-back transaction leaves none. [Task 4]
- A device with a slow clock cannot have its own edit silently lose to an older remote version. [Task 4, Task 10]
- A change pulled from the server is never pushed back, and a device's own pushed rows do not rewrite local data. [Task 7, Task 10]
- A pull is all-or-nothing: a failure partway applies nothing and leaves the cursors where they were. [Task 7, Task 10]
- One bad row never blocks the rest of a push batch. [Task 6]
- First sign-in never uploads one account's data into another, and never replaces device data without the backup path. [Task 11]
- With capture off (signed out) a write touches no sync table at all. [Task 4, Task 13]

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/sync/types.ts` (create) | Row types for the hidden tables, `SyncContext` |
| `src/lib/sync/state.ts` (create) | `syncState` key/value helpers, keys, `isInitialSyncPending` |
| `src/lib/sync/registry.ts` (create) | Collections, field mapping, `toRow` / `fromRow` / `rowsMatch` |
| `src/lib/sync/clock.ts` (create) | Edit-time stamping |
| `src/lib/sync/capture.ts` (create) | DBCore capture middleware, write kinds, enabled flag |
| `src/lib/sync/transactions.ts` (create) | `autoTransaction`, `remoteTransaction`, `resetTransaction` |
| `src/lib/sync/transport.ts` (create) | `SyncTransport`, `SyncError`, row types |
| `src/lib/sync/push.ts` (create) | `pushPending` |
| `src/lib/sync/pull.ts` (create) | `pullAll` |
| `src/lib/sync/repairs.ts` (create) | `repairAfterPull` (orphans, sold shares) |
| `src/lib/sync/engine.ts` (create) | `syncOnce`, `checkAccount` |
| `src/lib/sync/firstSignIn.ts` (create) | Sides, decision table, `requeueAll`, `clearLocalData`, `runFirstSignIn` |
| `src/lib/db/index.ts` (modify) | v13 tables, constructor name, capture install, seeding gate, `SEEDED_KEY` export |
| `src/lib/stores/recurringStore.ts`, `src/lib/stores/budgetStore.ts`, `src/lib/stores/currencyStore.ts` (modify) | Automatic writes use `autoTransaction` |
| `tests/helpers/devices.ts`, `tests/helpers/fakeServer.ts` (create) | Simulated devices and server |

---

### Task 1: Hidden sync tables (Dexie v13) and state helpers

**Files:**
- Create: `src/lib/sync/types.ts`, `src/lib/sync/state.ts`
- Modify: `src/lib/db/index.ts`
- Test: `tests/lib/sync/state.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface SyncOutboxEntry { key: string; table: string; id: string; op: 'upsert' | 'delete'; at: number; parked?: boolean; error?: string }` (key is `table:id`)
  - `interface SyncVersion { key: string; at: number }`, `interface SyncStateRow { key: string; value: unknown }`
  - `interface SyncContext { db: BudgetDatabase; transport: SyncTransport }`
  - `getState<T>(db, key): Promise<T | undefined>`, `setState(db, key, value): Promise<void>`, `LINKED_ACCOUNT = 'linkedAccount'`, `INITIAL_SYNC_PENDING = 'initialSyncPending'`, `cursorKey(remote: string): string`, `isInitialSyncPending(db): Promise<boolean>`
  - `class BudgetDatabase` is exported with `constructor(name = 'BudgetDB')`; tables `syncOutbox`, `syncVersions`, `syncState`.

- [ ] **Step 1: Write the failing test**

`tests/lib/sync/state.test.ts`:

```ts
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
  it('opens at version 13 with the three sync tables', () => {
    expect(device.verno).toBe(13);
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/lib/sync/state.test.ts`
Expected: FAIL, `BudgetDatabase` is not exported (or module `$lib/sync/state` not found).

- [ ] **Step 3: Implement**

`src/lib/sync/types.ts`:

```ts
import type { BudgetDatabase } from '$lib/db';
import type { SyncTransport } from './transport';

// A change waiting to be uploaded. One entry per record (key `table:id`),
// so repeated edits of one record collapse into the latest.
export interface SyncOutboxEntry {
  key: string;
  table: string; // Dexie table name
  id: string;
  op: 'upsert' | 'delete';
  at: number; // edit time, ms since epoch
  parked?: boolean; // the server rejected this row; kept but not retried automatically
  error?: string;
}

// The edit time of the version of a record this device holds.
export interface SyncVersion {
  key: string; // `table:id`
  at: number;
}

export interface SyncStateRow {
  key: string;
  value: unknown;
}

export interface SyncContext {
  db: BudgetDatabase;
  transport: SyncTransport;
}
```

`src/lib/sync/state.ts`:

```ts
import type Dexie from 'dexie';

export const LINKED_ACCOUNT = 'linkedAccount';
export const INITIAL_SYNC_PENDING = 'initialSyncPending';

export function cursorKey(remote: string): string {
  return `cursor:${remote}`;
}

export async function getState<T>(db: Dexie, key: string): Promise<T | undefined> {
  const row = await db.table('syncState').get(key);
  return row?.value as T | undefined;
}

export async function setState(db: Dexie, key: string, value: unknown): Promise<void> {
  await db.table('syncState').put({ key, value });
}

// True from the moment a device starts signing in until its first sync has
// finished: default buckets must not be created in that window or they would
// duplicate the account's.
export async function isInitialSyncPending(db: Dexie): Promise<boolean> {
  return (await getState<boolean>(db, INITIAL_SYNC_PENDING)) === true;
}
```

In `src/lib/sync/transport.ts` create a placeholder so `types.ts` compiles now (completed in Task 5):

```ts
export interface SyncTransport {}
```

In `src/lib/db/index.ts`:

1. Add `import type { SyncOutboxEntry, SyncVersion, SyncStateRow } from '$lib/sync/types';` next to the other imports.
2. Change `class BudgetDatabase extends Dexie {` to `export class BudgetDatabase extends Dexie {` and `constructor() {` / `super('BudgetDB');` to:

```ts
  constructor(name = 'BudgetDB') {
    super(name);
```

3. Add after the `monthNotes!` field:

```ts
  syncOutbox!: Table<SyncOutboxEntry, string>;
  syncVersions!: Table<SyncVersion, string>;
  syncState!: Table<SyncStateRow, string>;
```

4. After the v12 block add:

```ts
    // v13: hidden bookkeeping for cloud sync (never exported). The outbox
    // holds changes waiting to upload, versions the edit time of each synced
    // record, state small key/value facts such as the linked account.
    this.version(13).stores({
      buckets: 'id, name, order',
      transactions: 'id, bucketId, date, recurringId',
      recurringTransactions: 'id, bucketId, nextDueDate, isActive',
      incomes: 'id, date',
      savingsGoals: 'id, bucketId',
      investmentLots: 'id, symbol, purchaseDate',
      investmentSells: 'id, lotId, sellDate',
      investmentPrices: 'symbol',
      settings: 'key',
      allocations: 'id, month, bucketId',
      monthNotes: 'id, month',
      syncOutbox: 'key',
      syncVersions: 'key',
      syncState: 'key'
    });
```

- [ ] **Step 4: Update the version assertion in the migration test**

In `tests/lib/db/monthSplitMigration.test.ts` change `expect(db.verno).toBe(12);` to `expect(db.verno).toBe(13);`.

- [ ] **Step 5: Run tests and type check**

Run: `npx vitest run && npm run check`
Expected: all PASS, 0 errors.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync-engine
git add src/lib/sync/types.ts src/lib/sync/state.ts src/lib/sync/transport.ts src/lib/db/index.ts tests/lib/sync/state.test.ts tests/lib/db/monthSplitMigration.test.ts
git commit --no-gpg-sign -m "feat(sync): hidden sync tables (db v13) and state helpers"
```

---

### Task 2: Registry and row mapping

**Files:**
- Create: `src/lib/sync/registry.ts`
- Test: `tests/lib/sync/registry.test.ts`

**Interfaces:**
- Consumes: `getLocalDateKey` from `$lib/utils/dates`.
- Produces:
  - `type Row = Record<string, unknown>`; `interface FieldDef { prop: string; col: string; type: FieldType }`; `interface CollectionDef { table; remote; keyProp; fields }`
  - `COLLECTIONS: CollectionDef[]` in push order; `SYNC_TABLES: string[]` (`syncOutbox`, `syncVersions`, `syncState`)
  - `collectionByTable(name): CollectionDef | undefined`, `isSyncedTable(name): boolean`
  - `toRow(def, record): Row` (`id`, one column per field, `extra`), `fromRow(def, row): Record<string, unknown>`, `rowsMatch(def, a: Row, b: Row): boolean`

- [ ] **Step 1: Write the failing tests**

`tests/lib/sync/registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { COLLECTIONS, SYNC_TABLES, collectionByTable, isSyncedTable, toRow, fromRow, rowsMatch } from '$lib/sync/registry';

const def = (table: string) => collectionByTable(table)!;

describe('registry', () => {
  it('lists the eleven synced collections in dependency order', () => {
    expect(COLLECTIONS.map((c) => c.table)).toEqual([
      'settings', 'buckets', 'allocations', 'monthNotes', 'recurringTransactions', 'transactions',
      'incomes', 'savingsGoals', 'investmentLots', 'investmentSells', 'investmentPrices',
    ]);
  });

  it('names the Postgres tables in snake_case', () => {
    expect(COLLECTIONS.map((c) => c.remote)).toEqual([
      'settings', 'buckets', 'allocations', 'month_notes', 'recurring_transactions', 'transactions',
      'incomes', 'savings_goals', 'investment_lots', 'investment_sells', 'investment_prices',
    ]);
  });

  it('knows which tables sync and which are bookkeeping', () => {
    expect(isSyncedTable('transactions')).toBe(true);
    expect(isSyncedTable('syncOutbox')).toBe(false);
    expect(isSyncedTable('nope')).toBe(false);
    expect(SYNC_TABLES).toEqual(['syncOutbox', 'syncVersions', 'syncState']);
  });
});

describe('toRow / fromRow round trips', () => {
  const day = new Date(2026, 9, 20); // local midnight
  const cases: [string, Record<string, unknown>][] = [
    ['settings', { key: 'baseCurrency', value: 'INR' }],
    ['settings', { key: 'currencyConfirmed', value: true }],
    ['buckets', { id: 'b1', name: 'Rent', color: '#6366f1', order: 0, isDefault: true, allocationType: 'fixed', fixedAmount: 200000, percentageAmount: 0, isSavings: false, isEveryday: false, createdAt: new Date('2026-10-01T12:00:00.000Z') }],
    ['buckets', { id: 'unsorted', name: 'Unsorted', color: '#b0bec5', order: 11, isDefault: false, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: false, createdAt: new Date('2026-10-02T00:00:00.000Z'), isSystem: true }],
    ['allocations', { id: '2026-10:b1', month: '2026-10', bucketId: 'b1', amount: 50000 }],
    ['monthNotes', { id: 'n1', month: '2026-10', text: 'India Tix', effect: 'down', createdAt: 1790000000000 }],
    ['recurringTransactions', { id: 'r1', amount: 1500, bucketId: 'b1', frequency: 'monthly', dayOfMonth: 8, nextDueDate: day, note: 'Gym', isActive: true }],
    ['transactions', { id: 't1', amount: 5935, bucketId: 'b1', date: day, note: 'Flight', recurringId: 'r1', createdAt: 1790000000123 }],
    ['transactions', { id: 't2', amount: 5935, bucketId: 'b1', date: day, foreign: { amount: 500000, currency: 'INR', rate: 84.25, base: 'USD' } }],
    ['incomes', { id: 'i1', amount: 700000, date: day, note: 'Pay', isRecurring: true, type: 'fixed' }],
    ['savingsGoals', { id: 'g1', name: 'Trip', bucketId: 'b1', targetAmount: 300000, targetDate: day, monthlyContribution: 25000, createdAt: new Date('2026-09-01T00:00:00.000Z'), startingBalance: 1000 }],
    ['investmentLots', { id: 'l1', symbol: 'VTI', shares: 2.5, pricePerShare: 25000, purchaseDate: day, note: 'first', soldShares: 0.5 }],
    ['investmentSells', { id: 's1', lotId: 'l1', shares: 0.5, pricePerShare: 26000, sellDate: day }],
    ['investmentPrices', { symbol: 'VTI', pricePerShare: 26500, updatedAt: new Date('2026-10-05T00:00:00.000Z') }],
  ];

  it.each(cases)('%s record survives a round trip', (table, record) => {
    const d = def(table);
    expect(fromRow(d, toRow(d, record))).toEqual(record);
  });

  it('survives a JSON round trip too, as it will over the network', () => {
    for (const [table, record] of cases) {
      const d = def(table);
      const wire = JSON.parse(JSON.stringify(toRow(d, record)));
      expect(fromRow(d, wire), table).toEqual(record);
    }
  });
});

describe('toRow', () => {
  it('uses the key property as id, even when it is called key or symbol', () => {
    expect(toRow(def('settings'), { key: 'baseCurrency', value: 'USD' }).id).toBe('baseCurrency');
    expect(toRow(def('investmentPrices'), { symbol: 'VTI', pricePerShare: 1, updatedAt: new Date(0) }).id).toBe('VTI');
  });

  it('maps renamed columns and cents/bool/int types straight through', () => {
    const row = toRow(def('buckets'), { id: 'b1', name: 'X', color: '#000', order: 3, isDefault: false, allocationType: 'percentage', fixedAmount: 0, percentageAmount: 12.5, isSavings: true, isEveryday: false, createdAt: new Date('2026-01-01T00:00:00.000Z') });
    expect(row).toMatchObject({ id: 'b1', sort_order: 3, allocation_type: 'percentage', percentage: 12.5, is_savings: true, fixed_amount_cents: 0, created_at: '2026-01-01T00:00:00.000Z' });
  });

  it('writes a date as the local calendar day, never the UTC day', () => {
    const lateEvening = new Date(2026, 11, 31, 23, 59);
    expect(toRow(def('transactions'), { id: 't', amount: 1, bucketId: 'b', date: lateEvening }).date).toBe('2026-12-31');
  });

  it('flattens foreign into four columns, and leaves them null without it', () => {
    const withForeign = toRow(def('transactions'), { id: 't', amount: 1, bucketId: 'b', date: new Date(2026, 0, 1), foreign: { amount: 10, currency: 'EUR', rate: 0.9, base: 'USD' } });
    expect(withForeign).toMatchObject({ foreign_amount_minor: 10, foreign_currency: 'EUR', foreign_rate: 0.9, foreign_base: 'USD' });
    const without = toRow(def('transactions'), { id: 't', amount: 1, bucketId: 'b', date: new Date(2026, 0, 1) });
    expect(without).toMatchObject({ foreign_amount_minor: null, foreign_currency: null, foreign_rate: null, foreign_base: null });
  });

  it('sends optional fields as null', () => {
    const row = toRow(def('transactions'), { id: 't', amount: 1, bucketId: 'b', date: new Date(2026, 0, 1) });
    expect(row).toMatchObject({ note: null, recurring_id: null, created_at: null });
  });

  it('puts fields it does not know into extra, and nothing else', () => {
    const row = toRow(def('transactions'), { id: 't', amount: 1, bucketId: 'b', date: new Date(2026, 0, 1), futureField: { a: 1 }, other: 'x' });
    expect(row.extra).toEqual({ futureField: { a: 1 }, other: 'x' });
    expect(toRow(def('transactions'), { id: 't', amount: 1, bucketId: 'b', date: new Date(2026, 0, 1) }).extra).toEqual({});
  });

  it('turns an invalid date into null instead of throwing', () => {
    expect(toRow(def('transactions'), { id: 't', amount: 1, bucketId: 'b', date: new Date('nope') }).date).toBeNull();
  });
});

describe('fromRow', () => {
  it('restores unknown fields from extra without letting them override mapped ones', () => {
    const record = fromRow(def('transactions'), { id: 't', date: '2026-01-05', amount_cents: 7, bucket_id: 'b', extra: { futureField: 1, amount: 999, id: 'evil' } });
    expect(record).toMatchObject({ id: 't', amount: 7, futureField: 1 });
  });

  it('omits optional fields that are null, and foreign when all four columns are null', () => {
    const record = fromRow(def('transactions'), { id: 't', date: '2026-01-05', amount_cents: 7, bucket_id: 'b', note: null, foreign_amount_minor: null, foreign_currency: null, foreign_rate: null, foreign_base: null, extra: {} });
    expect('note' in record).toBe(false);
    expect('foreign' in record).toBe(false);
  });

  it('reads a date column as local midnight', () => {
    const record = fromRow(def('transactions'), { id: 't', date: '2026-03-08', amount_cents: 1, bucket_id: 'b', extra: {} });
    const d = record.date as Date;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 2, 8, 0]);
  });

  it('accepts a missing or malformed extra', () => {
    expect(fromRow(def('allocations'), { id: 'a', month: '2026-01', bucket_id: 'b', amount_cents: 1 })).toEqual({ id: 'a', month: '2026-01', bucketId: 'b', amount: 1 });
    expect(fromRow(def('allocations'), { id: 'a', month: '2026-01', bucket_id: 'b', amount_cents: 1, extra: 'nope' })).toEqual({ id: 'a', month: '2026-01', bucketId: 'b', amount: 1 });
  });

  it('turns numeric strings from the wire into numbers', () => {
    const record = fromRow(def('investmentLots'), { id: 'l', symbol: 'V', shares: '2.5', price_per_share_cents: '25000', purchase_date: '2026-01-01', sold_shares: '0', extra: {} });
    expect(record).toMatchObject({ shares: 2.5, pricePerShare: 25000, soldShares: 0 });
  });
});

describe('rowsMatch', () => {
  it('ignores sync columns and key order, and sees real differences', () => {
    const d = def('allocations');
    const a = { id: 'a', month: '2026-01', bucket_id: 'b', amount_cents: 1, extra: {}, updated_at: 'x', synced_at: 'y', deleted_at: null, user_id: 'u' };
    const b = { extra: {}, amount_cents: 1, bucket_id: 'b', month: '2026-01', id: 'a' };
    expect(rowsMatch(d, a, b)).toBe(true);
    expect(rowsMatch(d, a, { ...b, amount_cents: 2 })).toBe(false);
    expect(rowsMatch(d, a, { ...b, extra: { z: 1 } })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/sync/registry.test.ts`
Expected: FAIL, module `$lib/sync/registry` not found.

- [ ] **Step 3: Implement**

`src/lib/sync/registry.ts`:

```ts
import { getLocalDateKey } from '$lib/utils/dates';

// Which Dexie tables sync, and how each record maps to a Postgres row.
// Declarative on purpose: push, pull and the first-sign-in code are generic
// over this list, so adding a field is one line here plus a SQL migration.

export type Row = Record<string, unknown>;

export type FieldType = 'text' | 'int' | 'numeric' | 'bool' | 'cents' | 'date' | 'timestamp' | 'epochMs' | 'json';

export interface FieldDef {
  prop: string; // record property; a dotted path ('foreign.amount') flattens a nested object
  col: string; // Postgres column
  type: FieldType;
}

export interface CollectionDef {
  table: string; // Dexie table
  remote: string; // Postgres table
  keyProp: string; // record property holding the id
  fields: FieldDef[];
}

const f = (prop: string, col: string, type: FieldType): FieldDef => ({ prop, col, type });

// Push order: a table's dependencies come first.
export const COLLECTIONS: CollectionDef[] = [
  { table: 'settings', remote: 'settings', keyProp: 'key', fields: [f('value', 'value', 'json')] },
  {
    table: 'buckets', remote: 'buckets', keyProp: 'id',
    fields: [
      f('name', 'name', 'text'), f('color', 'color', 'text'), f('order', 'sort_order', 'int'),
      f('isDefault', 'is_default', 'bool'), f('allocationType', 'allocation_type', 'text'),
      f('fixedAmount', 'fixed_amount_cents', 'cents'), f('percentageAmount', 'percentage', 'numeric'),
      f('isSavings', 'is_savings', 'bool'), f('isEveryday', 'is_everyday', 'bool'),
      f('isSystem', 'is_system', 'bool'), f('createdAt', 'created_at', 'timestamp'),
    ],
  },
  {
    table: 'allocations', remote: 'allocations', keyProp: 'id',
    fields: [f('month', 'month', 'text'), f('bucketId', 'bucket_id', 'text'), f('amount', 'amount_cents', 'cents')],
  },
  {
    table: 'monthNotes', remote: 'month_notes', keyProp: 'id',
    fields: [f('month', 'month', 'text'), f('text', 'text', 'text'), f('effect', 'effect', 'text'), f('createdAt', 'created_at', 'epochMs')],
  },
  {
    table: 'recurringTransactions', remote: 'recurring_transactions', keyProp: 'id',
    fields: [
      f('bucketId', 'bucket_id', 'text'), f('amount', 'amount_cents', 'cents'), f('frequency', 'frequency', 'text'),
      f('dayOfMonth', 'day_of_month', 'int'), f('nextDueDate', 'next_due_date', 'date'),
      f('note', 'note', 'text'), f('isActive', 'is_active', 'bool'),
    ],
  },
  {
    table: 'transactions', remote: 'transactions', keyProp: 'id',
    fields: [
      f('bucketId', 'bucket_id', 'text'), f('date', 'date', 'date'), f('amount', 'amount_cents', 'cents'),
      f('note', 'note', 'text'), f('recurringId', 'recurring_id', 'text'), f('createdAt', 'created_at', 'epochMs'),
      f('foreign.amount', 'foreign_amount_minor', 'cents'), f('foreign.currency', 'foreign_currency', 'text'),
      f('foreign.rate', 'foreign_rate', 'numeric'), f('foreign.base', 'foreign_base', 'text'),
    ],
  },
  {
    table: 'incomes', remote: 'incomes', keyProp: 'id',
    fields: [
      f('date', 'date', 'date'), f('amount', 'amount_cents', 'cents'), f('note', 'note', 'text'),
      f('isRecurring', 'is_recurring', 'bool'), f('type', 'type', 'text'),
    ],
  },
  {
    table: 'savingsGoals', remote: 'savings_goals', keyProp: 'id',
    fields: [
      f('name', 'name', 'text'), f('bucketId', 'bucket_id', 'text'), f('targetAmount', 'target_amount_cents', 'cents'),
      f('targetDate', 'target_date', 'date'), f('monthlyContribution', 'monthly_contribution_cents', 'cents'),
      f('startingBalance', 'starting_balance_cents', 'cents'), f('createdAt', 'created_at', 'timestamp'),
    ],
  },
  {
    table: 'investmentLots', remote: 'investment_lots', keyProp: 'id',
    fields: [
      f('symbol', 'symbol', 'text'), f('shares', 'shares', 'numeric'), f('pricePerShare', 'price_per_share_cents', 'cents'),
      f('purchaseDate', 'purchase_date', 'date'), f('note', 'note', 'text'), f('soldShares', 'sold_shares', 'numeric'),
    ],
  },
  {
    table: 'investmentSells', remote: 'investment_sells', keyProp: 'id',
    fields: [
      f('lotId', 'lot_id', 'text'), f('shares', 'shares', 'numeric'), f('pricePerShare', 'price_per_share_cents', 'cents'),
      f('sellDate', 'sell_date', 'date'), f('note', 'note', 'text'),
    ],
  },
  {
    table: 'investmentPrices', remote: 'investment_prices', keyProp: 'symbol',
    fields: [
      f('symbol', 'symbol', 'text'), f('pricePerShare', 'price_per_share_cents', 'cents'),
      f('updatedAt', 'price_updated_at', 'timestamp'),
    ],
  },
];

// Bookkeeping tables: never synced, never captured.
export const SYNC_TABLES = ['syncOutbox', 'syncVersions', 'syncState'];

const BY_TABLE = new Map(COLLECTIONS.map((c) => [c.table, c]));

export function collectionByTable(name: string): CollectionDef | undefined {
  return BY_TABLE.get(name);
}

export function isSyncedTable(name: string): boolean {
  return BY_TABLE.has(name);
}

function getPath(record: Record<string, unknown>, path: string): unknown {
  let cur: unknown = record;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function setPath(record: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur = record;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]];
    cur = (typeof next === 'object' && next !== null ? next : (cur[parts[i]] = {})) as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function encode(type: FieldType, value: unknown): unknown {
  if (value === undefined || value === null) return null;
  switch (type) {
    case 'date': {
      const d = new Date(value as Date | string);
      return Number.isNaN(d.getTime()) ? null : getLocalDateKey(d);
    }
    case 'timestamp': {
      const d = new Date(value as Date | string);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    case 'epochMs':
      return typeof value === 'number' && Number.isFinite(value) ? new Date(value).toISOString() : null;
    default:
      return value;
  }
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})/;

function decode(type: FieldType, value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  switch (type) {
    case 'date': {
      const m = typeof value === 'string' ? DATE_ONLY.exec(value) : null;
      return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
    }
    case 'timestamp': {
      const d = new Date(value as string);
      return Number.isNaN(d.getTime()) ? undefined : d;
    }
    case 'epochMs': {
      const ms = typeof value === 'string' ? Date.parse(value) : NaN;
      return Number.isNaN(ms) ? undefined : ms;
    }
    case 'int':
    case 'numeric':
    case 'cents': {
      if (typeof value === 'string') {
        const n = Number(value);
        return Number.isNaN(n) ? undefined : n;
      }
      return value;
    }
    default:
      return value;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// The row for a record: id, one column per mapped field, and everything the
// mapping does not know in `extra`, so a forgotten migration never drops data.
export function toRow(def: CollectionDef, record: Record<string, unknown>): Row {
  const row: Row = { id: String(record[def.keyProp]) };
  const claimed = new Set<string>([def.keyProp]);
  for (const field of def.fields) {
    claimed.add(field.prop.split('.')[0]);
    row[field.col] = encode(field.type, getPath(record, field.prop));
  }
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (!claimed.has(k) && v !== undefined) extra[k] = v;
  }
  row.extra = extra;
  return row;
}

export function fromRow(def: CollectionDef, row: Row): Record<string, unknown> {
  const record: Record<string, unknown> = isPlainObject(row.extra) ? { ...row.extra } : {};
  for (const field of def.fields) {
    const value = decode(field.type, row[field.col]);
    if (value !== undefined) setPath(record, field.prop, value);
  }
  record[def.keyProp] = row.id;
  return record;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

// Same record data, ignoring sync columns (updated_at, synced_at, deleted_at,
// user_id) and key order.
export function rowsMatch(def: CollectionDef, a: Row, b: Row): boolean {
  const pick = (row: Row) => {
    const out: Row = { id: row.id, extra: isPlainObject(row.extra) ? row.extra : {} };
    for (const field of def.fields) out[field.col] = row[field.col] ?? null;
    return canonical(out);
  };
  return pick(a) === pick(b);
}
```

- [ ] **Step 4: Run tests and type check**

Run: `npx vitest run tests/lib/sync/registry.test.ts && npx vitest run && npm run check`
Expected: all PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync-engine
git add src/lib/sync/registry.ts tests/lib/sync/registry.test.ts
git commit --no-gpg-sign -m "feat(sync): registry and row mapping for every synced collection"
```

---

### Task 3: Edit-time stamping

**Files:**
- Create: `src/lib/sync/clock.ts`
- Test: `tests/lib/sync/clock.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `editStamp(currentVersion: number | undefined): number` — a person's edit: strictly increasing on this device and at least `currentVersion + 1`.
  - `autoStamp(currentVersion: number | undefined): number` — an automatic write: `currentVersion + 1`, or `1` for a record with no version.
  - `resetClockForTests(): void`

- [ ] **Step 1: Write the failing tests**

`tests/lib/sync/clock.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { editStamp, autoStamp, resetClockForTests } from '$lib/sync/clock';

beforeEach(() => {
  resetClockForTests();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-20T12:00:00.000Z'));
});

afterEach(() => vi.useRealTimers());

describe('editStamp', () => {
  it('is the current time for a record this device has not seen', () => {
    expect(editStamp(undefined)).toBe(Date.parse('2026-10-20T12:00:00.000Z'));
  });

  it('keeps increasing when the clock does not move', () => {
    const a = editStamp(undefined);
    const b = editStamp(undefined);
    const c = editStamp(undefined);
    expect([b - a, c - b]).toEqual([1, 1]);
  });

  it('never goes backwards when the clock does', () => {
    const a = editStamp(undefined);
    vi.setSystemTime(new Date('2026-10-20T11:00:00.000Z'));
    expect(editStamp(undefined)).toBe(a + 1);
  });

  it('is newer than the version this device already holds, even if its clock is behind', () => {
    const farFuture = Date.parse('2027-01-01T00:00:00.000Z');
    expect(editStamp(farFuture)).toBe(farFuture + 1);
  });

  it('ignores an old version when the clock is ahead of it', () => {
    expect(editStamp(5)).toBe(Date.parse('2026-10-20T12:00:00.000Z'));
  });
});

describe('autoStamp', () => {
  it('is 1 ms after the epoch for a record with no version, so any real edit beats it', () => {
    expect(autoStamp(undefined)).toBe(1);
  });

  it('is exactly one more than the version it replaces', () => {
    expect(autoStamp(1790000000000)).toBe(1790000000001);
  });

  it('is the same on every device for the same input, so repeated automatic writes converge', () => {
    expect(autoStamp(undefined)).toBe(autoStamp(undefined));
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/sync/clock.test.ts`
Expected: FAIL, module `$lib/sync/clock` not found.

- [ ] **Step 3: Implement**

`src/lib/sync/clock.ts`:

```ts
// Edit times decide which of two edits to a record wins, so they must be
// strictly increasing on a device and never older than what it already holds.

let last = 0;

// A person's edit. At least the wall clock, one past the last stamp this
// device issued, and one past the version of the record it replaces (a slow
// clock must not make an edit lose to a version it has already seen).
export function editStamp(currentVersion: number | undefined): number {
  const stamp = Math.max(Date.now(), last + 1, (currentVersion ?? 0) + 1);
  last = stamp;
  return stamp;
}

// An automatic write (recurring items, default buckets, repairs). Minimally
// newer than what it replaces, or 1 ms after the epoch for a new record, so
// any person's edit made anywhere beats it, and two devices that make the
// same automatic write produce the same stamp.
export function autoStamp(currentVersion: number | undefined): number {
  return currentVersion === undefined ? 1 : currentVersion + 1;
}

export function resetClockForTests(): void {
  last = 0;
}
```

- [ ] **Step 4: Run tests and type check**

Run: `npx vitest run tests/lib/sync/clock.test.ts && npx vitest run && npm run check`
Expected: all PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync-engine
git add src/lib/sync/clock.ts tests/lib/sync/clock.test.ts
git commit --no-gpg-sign -m "feat(sync): edit-time stamping"
```

---
### Task 4: Capture middleware

**Files:**
- Create: `src/lib/sync/capture.ts`, `src/lib/sync/transactions.ts`
- Modify: `src/lib/db/index.ts` (install the middleware)
- Test: `tests/lib/sync/capture.test.ts`, `tests/lib/db/monthSplitMigration.test.ts`

**Interfaces:**
- Consumes: `isSyncedTable` (Task 2), `editStamp` / `autoStamp` (Task 3), `SyncOutboxEntry` / `SyncVersion` (Task 1).
- Produces:
  - `type WriteKind = 'edit' | 'auto' | 'remote' | 'reset'`
  - `setCaptureEnabled(value: boolean): void`, `isCaptureEnabled(): boolean`
  - `markTransaction(kind: WriteKind): void`, `currentWriteKind(): WriteKind`
  - `installSyncCapture(db: Dexie): void`
  - `autoTransaction<T>(db, tables, fn)`, `remoteTransaction<T>(db, tables, fn)`, `resetTransaction<T>(db, tables, fn)` — a read-write Dexie transaction whose writes are captured as automatic writes, not captured at all because they came from the server, or not captured because the device is being reset.

How it works: while capture is enabled, every read-write transaction that includes a synced table is widened to include `syncOutbox` and `syncVersions`. Each add, put, delete or range delete on a synced table then writes one outbox entry and one version row per record, in the same IndexedDB transaction, so a rollback removes them too. Upgrade transactions are skipped.

- [ ] **Step 1: Write the failing tests**

`tests/lib/sync/capture.test.ts`:

```ts
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BudgetDatabase } from '$lib/db';
import { setCaptureEnabled } from '$lib/sync/capture';
import { autoTransaction, remoteTransaction, resetTransaction } from '$lib/sync/transactions';
import { resetClockForTests } from '$lib/sync/clock';

let device: BudgetDatabase;
const t = () => device.table('transactions');
const rec = (id: string, over: Record<string, unknown> = {}) => ({ id, amount: 100, bucketId: 'b1', date: new Date(2026, 9, 20), ...over });
const queue = async () => (await device.syncOutbox.toArray()).map((e) => `${e.key}|${e.op}`).sort();

beforeEach(async () => {
  resetClockForTests();
  device = new BudgetDatabase('capture-test');
  await device.open();
  setCaptureEnabled(true);
});

afterEach(async () => {
  setCaptureEnabled(false);
  device.close();
  await Dexie.delete('capture-test');
});

describe('capture: writes become queue entries', () => {
  it('records an add with a matching version', async () => {
    await t().add(rec('1'));
    expect(await queue()).toEqual(['transactions:1|upsert']);
    const entry = await device.syncOutbox.get('transactions:1');
    expect((await device.syncVersions.get('transactions:1'))?.at).toBe(entry?.at);
    expect(entry).toMatchObject({ table: 'transactions', id: '1' });
  });

  it('records put, bulkAdd and bulkPut', async () => {
    await t().put(rec('1'));
    await t().bulkAdd([rec('2'), rec('3')]);
    await t().bulkPut([rec('3', { amount: 5 }), rec('4')]);
    expect(await queue()).toEqual(['transactions:1|upsert', 'transactions:2|upsert', 'transactions:3|upsert', 'transactions:4|upsert']);
  });

  it('records update, modify and bulkUpdate', async () => {
    await t().bulkAdd([rec('1'), rec('2'), rec('3')]);
    await device.syncOutbox.clear();
    await t().update('1', { amount: 5 });
    await t().where('bucketId').equals('b1').modify({ note: 'x' });
    await t().bulkUpdate([{ key: '2', changes: { amount: 9 } }]);
    expect(await queue()).toEqual(['transactions:1|upsert', 'transactions:2|upsert', 'transactions:3|upsert']);
  });

  it('records delete, bulkDelete, where().delete() and clear as deletes', async () => {
    await t().bulkAdd([rec('1'), rec('2'), rec('3', { bucketId: 'b2' }), rec('4'), rec('5')]);
    await device.syncOutbox.clear();
    await t().delete('1');
    await t().bulkDelete(['2']);
    await t().where('bucketId').equals('b2').delete();
    expect(await queue()).toEqual(['transactions:1|delete', 'transactions:2|delete', 'transactions:3|delete']);
    await device.syncOutbox.clear();
    await t().clear();
    expect(await queue()).toEqual(['transactions:4|delete', 'transactions:5|delete']);
  });

  it('keeps one entry per record: the latest operation wins', async () => {
    await t().add(rec('1'));
    await t().delete('1');
    expect(await queue()).toEqual(['transactions:1|delete']);
    await t().add(rec('1'));
    expect(await queue()).toEqual(['transactions:1|upsert']);
  });

  it('captures every synced table touched in one explicit transaction, and ignores bookkeeping tables', async () => {
    await device.transaction('rw', device.transactions, device.buckets, device.syncState, async () => {
      await device.buckets.add({ id: 'b1', name: 'X', color: '#000', order: 0, isDefault: false, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: true, createdAt: new Date(2026, 0, 1) });
      await t().add(rec('1'));
      await device.syncState.put({ key: 'k', value: 1 });
    });
    expect(await queue()).toEqual(['buckets:b1|upsert', 'transactions:1|upsert']);
    expect(await device.syncState.get('k')).toBeTruthy();
  });

  it('records settings, whose key property is called key', async () => {
    await device.settings.put({ key: 'baseCurrency', value: 'INR' });
    expect(await queue()).toEqual(['settings:baseCurrency|upsert']);
  });

  it('leaves nothing behind when the transaction rolls back', async () => {
    await expect(
      device.transaction('rw', device.transactions, async () => {
        await t().add(rec('1'));
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(await t().count()).toBe(0);
    expect(await device.syncOutbox.count()).toBe(0);
    expect(await device.syncVersions.count()).toBe(0);
  });
});

describe('capture: off until the device is linked', () => {
  it('touches no sync table while disabled', async () => {
    setCaptureEnabled(false);
    await t().add(rec('1'));
    await t().delete('1');
    expect(await device.syncOutbox.count()).toBe(0);
    expect(await device.syncVersions.count()).toBe(0);
  });

  it('does not fail a transaction that started before capture was switched on', async () => {
    setCaptureEnabled(false);
    await device.transaction('rw', device.transactions, async () => {
      setCaptureEnabled(true);
      await t().add(rec('1'));
    });
    expect(await t().count()).toBe(1);
    expect(await device.syncOutbox.count()).toBe(0);
  });
});

describe('capture: edit and automatic stamps', () => {
  it('stamps later edits later', async () => {
    await t().add(rec('a'));
    await t().add(rec('b'));
    const a = (await device.syncOutbox.get('transactions:a'))!.at;
    const b = (await device.syncOutbox.get('transactions:b'))!.at;
    expect(b).toBeGreaterThan(a);
  });

  it('stamps an edit newer than the version already held, even when the clock is behind', async () => {
    const future = Date.now() + 10 * 86400_000;
    await device.syncVersions.put({ key: 'transactions:x', at: future });
    await t().put(rec('x'));
    expect((await device.syncOutbox.get('transactions:x'))!.at).toBe(future + 1);
    expect((await device.syncVersions.get('transactions:x'))!.at).toBe(future + 1);
  });

  it('stamps an automatic write 1 for a new record and version + 1 for a known one', async () => {
    await autoTransaction(device, [device.transactions], () => t().put(rec('n')));
    expect((await device.syncOutbox.get('transactions:n'))!.at).toBe(1);
    await autoTransaction(device, [device.transactions], () => t().put(rec('n', { amount: 2 })));
    expect((await device.syncOutbox.get('transactions:n'))!.at).toBe(2);
  });

  it('marks only the transaction it was called for as automatic', async () => {
    await autoTransaction(device, [device.transactions], () => t().put(rec('auto')));
    await t().put(rec('person'));
    expect((await device.syncOutbox.get('transactions:auto'))!.at).toBe(1);
    expect((await device.syncOutbox.get('transactions:person'))!.at).toBeGreaterThan(1_000_000);
  });
});

describe('capture: writes that must not be queued', () => {
  it('skips writes that came from the server', async () => {
    await remoteTransaction(device, [device.transactions], () => t().put(rec('r')));
    expect(await device.syncOutbox.count()).toBe(0);
    expect(await device.syncVersions.count()).toBe(0);
    expect(await t().count()).toBe(1);
  });

  it('skips a local reset', async () => {
    await t().add(rec('1'));
    await device.syncOutbox.clear();
    await resetTransaction(device, [device.transactions], () => t().clear());
    expect(await device.syncOutbox.count()).toBe(0);
  });
});
```

In `tests/lib/db/monthSplitMigration.test.ts` add the import `import { setCaptureEnabled } from '$lib/sync/capture';` and, inside `describe('month record split migration', ...)`, this test:

```ts
  it('does not queue sync entries for migration writes, even with capture on', async () => {
    await seedV10(async (old) => {
      await old.table('monthSnapshots').add({ month: '2026-06', incomeTotal: 0, allocations: { b1: 5 }, spent: {}, rollovers: {} });
    });
    setCaptureEnabled(true);
    try {
      await db.open();
      expect(await db.allocations.count()).toBe(1);
      expect(await db.syncOutbox.count()).toBe(0);
    } finally {
      setCaptureEnabled(false);
    }
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/sync/capture.test.ts`
Expected: FAIL, module `$lib/sync/capture` not found.

- [ ] **Step 3: Implement the helpers**

`src/lib/sync/transactions.ts`:

```ts
import type Dexie from 'dexie';
import type { Table } from 'dexie';
import { markTransaction, type WriteKind } from './capture';

function run<T>(kind: WriteKind, db: Dexie, tables: Table[], fn: () => Promise<T>): Promise<T> {
  return db.transaction('rw', tables, async () => {
    markTransaction(kind);
    return fn();
  });
}

// Writes the app makes on its own (default buckets, recurring items,
// repairs). Stamped minimally newer than what they replace so any person's
// edit beats them.
export function autoTransaction<T>(db: Dexie, tables: Table[], fn: () => Promise<T>): Promise<T> {
  return run('auto', db, tables, fn);
}

// Applying what the server sent: never queued for upload again.
export function remoteTransaction<T>(db: Dexie, tables: Table[], fn: () => Promise<T>): Promise<T> {
  return run('remote', db, tables, fn);
}

// Wiping this device (sign-out, "use account data"): not a deletion to sync.
export function resetTransaction<T>(db: Dexie, tables: Table[], fn: () => Promise<T>): Promise<T> {
  return run('reset', db, tables, fn);
}
```

`src/lib/sync/capture.ts`:

```ts
import Dexie, { type DBCore, type DBCoreMutateRequest, type DBCoreTable, type DBCoreTransaction } from 'dexie';
import { autoStamp, editStamp } from './clock';
import { isSyncedTable } from './registry';

// Records every write to a synced table so it can be uploaded later. Hooked
// in at Dexie's lowest level (DBCore) so no store code has to change: the
// queue entry is written in the same IndexedDB transaction as the data, so
// either both exist or neither does.

export type WriteKind = 'edit' | 'auto' | 'remote' | 'reset';

const kinds = new WeakMap<object, WriteKind>();
let enabled = false;

// Off until a device is linked to an account; signed-out use is unchanged.
export function setCaptureEnabled(value: boolean): void {
  enabled = value;
}

export function isCaptureEnabled(): boolean {
  return enabled;
}

// Tags the Dexie transaction the caller is in. Untagged writes are edits.
export function markTransaction(kind: WriteKind): void {
  const trans = Dexie.currentTransaction;
  if (trans) kinds.set(trans, kind);
}

export function currentWriteKind(): WriteKind {
  const trans = Dexie.currentTransaction;
  return (trans && kinds.get(trans)) || 'edit';
}

async function record(
  down: DBCore,
  trans: DBCoreTransaction,
  table: string,
  ids: string[],
  op: 'upsert' | 'delete',
  kind: WriteKind
): Promise<void> {
  const keys = ids.map((id) => `${table}:${id}`);
  const versions = await down.table('syncVersions').getMany({ trans, keys });
  const stamps = keys.map((_, i) => (kind === 'auto' ? autoStamp(versions[i]?.at) : editStamp(versions[i]?.at)));
  await down.table('syncOutbox').mutate({
    trans,
    type: 'put',
    values: ids.map((id, i) => ({ key: keys[i], table, id, op, at: stamps[i] })),
  });
  await down.table('syncVersions').mutate({
    trans,
    type: 'put',
    values: keys.map((key, i) => ({ key, at: stamps[i] })),
  });
}

async function capturedMutate(down: DBCore, table: DBCoreTable, name: string, req: DBCoreMutateRequest) {
  const idb = req.trans as unknown as IDBTransaction;
  const kind = currentWriteKind();
  const capture =
    enabled &&
    kind !== 'remote' &&
    kind !== 'reset' &&
    idb.mode !== 'versionchange' && // upgrades run before the sync tables may exist
    idb.objectStoreNames.contains('syncOutbox'); // the transaction started before capture was on
  if (!capture) return table.mutate(req);

  let keys: unknown[] = [];
  let op: 'upsert' | 'delete' = 'upsert';
  if (req.type === 'deleteRange') {
    op = 'delete';
    keys = (await table.query({ trans: req.trans, values: false, query: { index: table.schema.primaryKey, range: req.range } })).result;
  }

  const res = await table.mutate(req);

  if (req.type === 'add' || req.type === 'put') {
    keys = (res.results ?? []).filter((_key: unknown, i: number) => !(i in res.failures));
  } else if (req.type === 'delete') {
    op = 'delete';
    keys = req.keys;
  }
  if (keys.length > 0) await record(down, req.trans, name, keys.map(String), op, kind);
  return res;
}

export function installSyncCapture(db: Dexie): void {
  db.use({
    stack: 'dbcore',
    name: 'bdgt-sync-capture',
    create(down: DBCore): DBCore {
      return {
        ...down,
        transaction(stores, mode, options) {
          const widened =
            enabled && mode === 'readwrite' && stores.some(isSyncedTable)
              ? [...new Set([...stores, 'syncOutbox', 'syncVersions'])]
              : stores;
          return down.transaction(widened, mode, options);
        },
        table(name) {
          const table = down.table(name);
          if (!isSyncedTable(name)) return table;
          return { ...table, mutate: (req) => capturedMutate(down, table, name, req) };
        },
      };
    },
  });
}
```

In `src/lib/db/index.ts` add `import { installSyncCapture } from '$lib/sync/capture';` and, as the last statement inside the constructor (after the v13 block):

```ts
    installSyncCapture(this);
```

- [ ] **Step 4: Run tests and type check**

Run: `npx vitest run tests/lib/sync/capture.test.ts tests/lib/db/monthSplitMigration.test.ts && npx vitest run && npm run check`
Expected: all PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync-engine
git add src/lib/sync/capture.ts src/lib/sync/transactions.ts src/lib/db/index.ts tests/lib/sync/capture.test.ts tests/lib/db/monthSplitMigration.test.ts
git commit --no-gpg-sign -m "feat(sync): capture every synced write into a queue, inside the same transaction"
```

---

### Task 5: Transport interface, fake server and simulated devices

**Files:**
- Modify: `src/lib/sync/transport.ts`
- Create: `tests/helpers/fakeServer.ts`, `tests/helpers/devices.ts`
- Test: `tests/lib/sync/fakeServer.test.ts`

**Interfaces:**
- Consumes: `Row` (Task 2), `BudgetDatabase` (Task 1).
- Produces:
  - In `transport.ts`: `type SyncErrorKind = 'network' | 'auth' | 'notAllowed' | 'schema' | 'rejected'`, `class SyncError extends Error { kind }`, `interface PulledRow extends Row { id; updated_at: string; deleted_at: string | null; synced_at: string }`, `interface StoredStamp { id; updated_at: string }`, `interface AccountState { allowed; schemaVersion; buckets: PulledRow[]; hasOtherRows }`, and `interface SyncTransport { accountState(); upsert(remote, rows): Promise<StoredStamp[]>; pull(remote, since: string | null, limit): Promise<PulledRow[]> }`.
  - `class FakeServer implements SyncTransport` for one user, with the same write rules as the future SQL trigger; test controls `offline`, `allowed`, `schemaVersion`, `rejectIds`, `failNextPull(remote)`, `live(remote)`, `all(remote)`.
  - `makeDevice(name): Promise<BudgetDatabase>` (capture enabled), `dropDevice(device)`.

The server rules the fake reproduces (the SQL in plan 3 must match): an upsert whose `updated_at` is older than the stored row is skipped and not returned; otherwise the row is merged over the stored one, `updated_at` is capped at the server clock plus 1 minute, and `synced_at` is set to a strictly increasing value. Deletes are rows with `deleted_at` set.

- [ ] **Step 1: Write the failing tests**

`tests/lib/sync/fakeServer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { FakeServer } from '../../helpers/fakeServer';
import { SyncError } from '$lib/sync/transport';

const at = (ms: number) => new Date(ms).toISOString();
const row = (id: string, updatedMs: number, over: Record<string, unknown> = {}) => ({ id, amount_cents: 1, updated_at: at(updatedMs), deleted_at: null, extra: {}, ...over });

describe('FakeServer write rules', () => {
  it('stores rows and returns their stamps', async () => {
    const server = new FakeServer(() => 2_000_000);
    const stored = await server.upsert('transactions', [row('a', 1000)]);
    expect(stored).toEqual([{ id: 'a', updated_at: at(1000) }]);
    expect(server.live('transactions').map((r) => r.id)).toEqual(['a']);
  });

  it('skips an update older than the stored row, and returns nothing for it', async () => {
    const server = new FakeServer(() => 2_000_000);
    await server.upsert('transactions', [row('a', 5000, { amount_cents: 5 })]);
    const stored = await server.upsert('transactions', [row('a', 4000, { amount_cents: 4 })]);
    expect(stored).toEqual([]);
    expect(server.live('transactions')[0].amount_cents).toBe(5);
  });

  it('applies an update with the same or a newer time', async () => {
    const server = new FakeServer(() => 2_000_000);
    await server.upsert('transactions', [row('a', 5000, { amount_cents: 5 })]);
    expect(await server.upsert('transactions', [row('a', 5000, { amount_cents: 6 })])).toHaveLength(1);
    expect(await server.upsert('transactions', [row('a', 6000, { amount_cents: 7 })])).toHaveLength(1);
    expect(server.live('transactions')[0].amount_cents).toBe(7);
  });

  it('caps a time in the future at the server clock plus one minute', async () => {
    const server = new FakeServer(() => 1_000_000);
    const stored = await server.upsert('transactions', [row('a', 99_000_000)]);
    expect(Date.parse(stored[0].updated_at)).toBe(1_060_000);
  });

  it('keeps a deleted row as a tombstone that a stale save cannot revive', async () => {
    const server = new FakeServer(() => 2_000_000);
    await server.upsert('transactions', [row('a', 1000)]);
    await server.upsert('transactions', [{ id: 'a', updated_at: at(3000), deleted_at: at(3000) }]);
    expect(server.live('transactions')).toEqual([]);
    expect(server.all('transactions')).toHaveLength(1);
    expect(await server.upsert('transactions', [row('a', 2000)])).toEqual([]);
    expect(await server.upsert('transactions', [row('a', 4000)])).toHaveLength(1);
    expect(server.live('transactions')).toHaveLength(1);
  });

  it('merges a delete over the stored columns', async () => {
    const server = new FakeServer(() => 2_000_000);
    await server.upsert('transactions', [row('a', 1000, { amount_cents: 9 })]);
    await server.upsert('transactions', [{ id: 'a', updated_at: at(2000), deleted_at: at(2000) }]);
    expect(server.all('transactions')[0].amount_cents).toBe(9);
  });

  it('gives every write a strictly later synced_at', async () => {
    const server = new FakeServer(() => 2_000_000);
    await server.upsert('transactions', [row('a', 1), row('b', 1)]);
    const [a, b] = server.all('transactions');
    expect(String(b.synced_at) > String(a.synced_at)).toBe(true);
  });
});

describe('FakeServer pull', () => {
  async function seeded() {
    const server = new FakeServer(() => 2_000_000);
    for (const id of ['a', 'b', 'c', 'd']) await server.upsert('transactions', [row(id, 1000)]);
    return server;
  }

  it('returns rows in write order and honours the limit', async () => {
    const server = await seeded();
    expect((await server.pull('transactions', null, 3)).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns rows at or after since', async () => {
    const server = await seeded();
    const all = await server.pull('transactions', null, 10);
    const since = all[2].synced_at;
    expect((await server.pull('transactions', since, 10)).map((r) => r.id)).toEqual(['c', 'd']);
  });

  it('includes tombstones', async () => {
    const server = await seeded();
    await server.upsert('transactions', [{ id: 'a', updated_at: at(2000), deleted_at: at(2000) }]);
    const rows = await server.pull('transactions', null, 10);
    expect(rows.find((r) => r.id === 'a')?.deleted_at).toBe(at(2000));
  });
});

describe('FakeServer failures and account state', () => {
  it('throws a network error while offline', async () => {
    const server = new FakeServer();
    server.offline = true;
    await expect(server.upsert('transactions', [row('a', 1)])).rejects.toMatchObject({ kind: 'network' });
    await expect(server.pull('transactions', null, 5)).rejects.toBeInstanceOf(SyncError);
    await expect(server.accountState()).rejects.toMatchObject({ kind: 'network' });
  });

  it('rejects a whole batch that contains a rejected id, storing nothing from it', async () => {
    const server = new FakeServer(() => 2_000_000);
    server.rejectIds.add('bad');
    await expect(server.upsert('transactions', [row('ok', 1), row('bad', 1)])).rejects.toMatchObject({ kind: 'rejected' });
    expect(server.all('transactions')).toEqual([]);
  });

  it('refuses writes and reads for an account that is not allowed, but reports it', async () => {
    const server = new FakeServer();
    server.allowed = false;
    await expect(server.upsert('transactions', [row('a', 1)])).rejects.toMatchObject({ kind: 'notAllowed' });
    await expect(server.pull('transactions', null, 5)).rejects.toMatchObject({ kind: 'notAllowed' });
    expect(await server.accountState()).toMatchObject({ allowed: false, buckets: [], hasOtherRows: false });
  });

  it('fails one pull of a named table once', async () => {
    const server = new FakeServer();
    server.failNextPull('buckets');
    await expect(server.pull('buckets', null, 5)).rejects.toMatchObject({ kind: 'network' });
    await expect(server.pull('buckets', null, 5)).resolves.toEqual([]);
  });

  it('reports live buckets and whether any other table holds rows', async () => {
    const server = new FakeServer(() => 2_000_000);
    await server.upsert('buckets', [row('b1', 1000, { name: 'Rent' })]);
    let state = await server.accountState();
    expect(state).toMatchObject({ allowed: true, schemaVersion: 1, hasOtherRows: false });
    expect(state.buckets.map((b) => b.id)).toEqual(['b1']);
    await server.upsert('settings', [row('baseCurrency', 1000)]);
    expect((await server.accountState()).hasOtherRows).toBe(false);
    await server.upsert('transactions', [row('t1', 1000)]);
    state = await server.accountState();
    expect(state.hasOtherRows).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/lib/sync/fakeServer.test.ts`
Expected: FAIL, module `tests/helpers/fakeServer` not found.

- [ ] **Step 3: Implement**

`src/lib/sync/transport.ts` (replaces the Task 1 placeholder):

```ts
import type { Row } from './registry';

export type { Row };

export type SyncErrorKind = 'network' | 'auth' | 'notAllowed' | 'schema' | 'rejected';

// Everything a transport can go wrong with, in terms the engine understands.
export class SyncError extends Error {
  constructor(readonly kind: SyncErrorKind, message: string) {
    super(message);
    this.name = 'SyncError';
  }
}

// A row as the server returns it: the mapped columns plus the sync columns.
export interface PulledRow extends Row {
  id: string;
  updated_at: string; // ISO; when the edit was made
  deleted_at: string | null;
  synced_at: string; // ISO; when the server stored it (drives pulls)
}

export interface StoredStamp {
  id: string;
  updated_at: string;
}

export interface AccountState {
  allowed: boolean; // the account's email is on the invite list
  schemaVersion: number; // migration level of the database
  buckets: PulledRow[]; // the account's live bucket rows (only when allowed)
  hasOtherRows: boolean; // any live row in any other table (only when allowed)
}

export interface SyncTransport {
  accountState(): Promise<AccountState>;
  // Rows to upsert, all with the same columns. Resolves with the rows the
  // server actually stored; a row it skipped because it held a newer edit is
  // absent. Rejects with SyncError('rejected') if the server refuses the batch.
  upsert(remote: string, rows: Row[]): Promise<StoredStamp[]>;
  // Rows with synced_at at or after `since` (everything when null), oldest
  // first, at most `limit`.
  pull(remote: string, since: string | null, limit: number): Promise<PulledRow[]>;
}
```

`tests/helpers/fakeServer.ts`:

```ts
import { SyncError, type AccountState, type PulledRow, type Row, type StoredStamp, type SyncTransport } from '$lib/sync/transport';

const BASE = Date.UTC(2026, 0, 1);

// One user's slice of the future Postgres database, with the same write
// rules as the SQL trigger: skip older updates, merge newer ones, cap future
// edit times at the server clock + 1 minute, stamp synced_at strictly
// increasing.
export class FakeServer implements SyncTransport {
  offline = false;
  allowed = true;
  schemaVersion = 1;
  rejectIds = new Set<string>();
  upsertCalls: { remote: string; rows: Row[] }[] = [];
  private tables = new Map<string, Map<string, Row>>();
  private failPull = new Set<string>();
  private tick = 0;

  constructor(private now: () => number = Date.now) {}

  failNextPull(remote: string): void {
    this.failPull.add(remote);
  }

  private table(remote: string): Map<string, Row> {
    let t = this.tables.get(remote);
    if (!t) {
      t = new Map();
      this.tables.set(remote, t);
    }
    return t;
  }

  private guard(): void {
    if (this.offline) throw new SyncError('network', 'offline');
    if (!this.allowed) throw new SyncError('notAllowed', 'this account is not on the invite list');
  }

  private nextSyncedAt(): string {
    this.tick += 1;
    // Microsecond precision, like Postgres.
    return new Date(BASE + this.tick).toISOString().replace('Z', '000+00:00');
  }

  all(remote: string): Row[] {
    return [...this.table(remote).values()];
  }

  live(remote: string): Row[] {
    return this.all(remote).filter((r) => !r.deleted_at);
  }

  async accountState(): Promise<AccountState> {
    if (this.offline) throw new SyncError('network', 'offline');
    if (!this.allowed) return { allowed: false, schemaVersion: this.schemaVersion, buckets: [], hasOtherRows: false };
    const buckets = this.live('buckets') as PulledRow[];
    // Settings do not count: every account has them, and an account with only settings is still empty.
    const hasOtherRows = [...this.tables.keys()].some((name) => name !== 'buckets' && name !== 'settings' && this.live(name).length > 0);
    return { allowed: true, schemaVersion: this.schemaVersion, buckets, hasOtherRows };
  }

  async upsert(remote: string, rows: Row[]): Promise<StoredStamp[]> {
    this.guard();
    this.upsertCalls.push({ remote, rows });
    for (const row of rows) {
      if (this.rejectIds.has(String(row.id))) throw new SyncError('rejected', `row ${row.id} rejected`);
    }
    const table = this.table(remote);
    const stored: StoredStamp[] = [];
    for (const row of rows) {
      const id = String(row.id);
      const updatedMs = Math.min(Date.parse(String(row.updated_at)), this.now() + 60_000);
      const existing = table.get(id);
      if (existing && updatedMs < Date.parse(String(existing.updated_at))) continue;
      const next: Row = { ...(existing ?? {}), ...row, updated_at: new Date(updatedMs).toISOString(), synced_at: this.nextSyncedAt() };
      table.set(id, next);
      stored.push({ id, updated_at: next.updated_at as string });
    }
    return stored;
  }

  async pull(remote: string, since: string | null, limit: number): Promise<PulledRow[]> {
    this.guard();
    if (this.failPull.delete(remote)) throw new SyncError('network', 'pull failed');
    const from = since === null ? -Infinity : Date.parse(since);
    return (this.all(remote) as PulledRow[])
      .filter((r) => Date.parse(r.synced_at) >= from)
      .sort((a, b) => Date.parse(a.synced_at) - Date.parse(b.synced_at) || a.id.localeCompare(b.id))
      .slice(0, limit);
  }
}
```

`tests/helpers/devices.ts`:

```ts
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { BudgetDatabase } from '$lib/db';
import { setCaptureEnabled } from '$lib/sync/capture';

// A simulated device: its own database, with capture on as it is for a
// signed-in device. (Capture is one switch per process, which is fine
// because every simulated device is signed in.)
export async function makeDevice(name: string): Promise<BudgetDatabase> {
  const device = new BudgetDatabase(name);
  await device.open();
  setCaptureEnabled(true);
  return device;
}

export async function dropDevice(device: BudgetDatabase): Promise<void> {
  setCaptureEnabled(false);
  device.close();
  await Dexie.delete(device.name);
}
```

- [ ] **Step 4: Run tests and type check**

Run: `npx vitest run tests/lib/sync/fakeServer.test.ts && npx vitest run && npm run check`
Expected: all PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync-engine
git add src/lib/sync/transport.ts tests/helpers/fakeServer.ts tests/helpers/devices.ts tests/lib/sync/fakeServer.test.ts
git commit --no-gpg-sign -m "feat(sync): transport interface and a fake server with the real write rules"
```

---

### Task 6: Push

**Files:**
- Create: `src/lib/sync/push.ts`
- Test: `tests/lib/sync/push.test.ts`

**Interfaces:**
- Consumes: `COLLECTIONS`, `toRow` (Task 2); `SyncContext`, `SyncOutboxEntry` (Task 1); `SyncTransport`, `SyncError`, `StoredStamp` (Task 5).
- Produces: `pushPending(ctx: SyncContext, batchSize = 500): Promise<PushResult>` and `interface PushResult { sent: number; skipped: number; parked: number }`.

Behavior: queue entries that are not parked go up in batches per collection, in registry order. A save reads the record's current value; if the record is gone the entry is sent as a delete. Saves and deletes go in separate requests. Afterwards, each entry still unchanged since it was read is removed, and its version becomes the time the server stored (or stays as it was if the server skipped the row). An entry edited again during the upload stays queued. A batch the server rejects is split until the bad row is found and parked.

- [ ] **Step 1: Write the failing tests**

`tests/lib/sync/push.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeDevice, dropDevice } from '../../helpers/devices';
import { FakeServer } from '../../helpers/fakeServer';
import { pushPending } from '$lib/sync/push';
import { resetClockForTests } from '$lib/sync/clock';
import type { BudgetDatabase } from '$lib/db';

let device: BudgetDatabase;
let server: FakeServer;
const ctx = () => ({ db: device, transport: server });
const tx = (id: string, over: Record<string, unknown> = {}) => ({ id, amount: 100, bucketId: 'b1', date: new Date(2026, 9, 20), ...over });
const queued = async () => (await device.syncOutbox.toArray()).map((e) => e.key).sort();

beforeEach(async () => {
  resetClockForTests();
  device = await makeDevice('push-test');
  server = new FakeServer();
});

afterEach(() => dropDevice(device));

describe('pushPending', () => {
  it('uploads a saved record as a row stamped with its edit time, and clears the queue', async () => {
    await device.transactions.add(tx('t1', { note: 'Flight' }));
    const entry = (await device.syncOutbox.get('transactions:t1'))!;

    const result = await pushPending(ctx());

    expect(result).toEqual({ sent: 1, skipped: 0, parked: 0 });
    const [stored] = server.live('transactions');
    expect(stored).toMatchObject({ id: 't1', amount_cents: 100, bucket_id: 'b1', date: '2026-10-20', note: 'Flight', deleted_at: null });
    expect(Date.parse(String(stored.updated_at))).toBe(entry.at);
    expect(await queued()).toEqual([]);
  });

  it('records the time the server stored as the version', async () => {
    await device.transactions.add(tx('t1'));
    await pushPending(ctx());
    const stored = server.live('transactions')[0];
    expect((await device.syncVersions.get('transactions:t1'))!.at).toBe(Date.parse(String(stored.updated_at)));
  });

  it('uploads a deleted record as a tombstone', async () => {
    await device.transactions.add(tx('t1'));
    await pushPending(ctx());
    await device.transactions.delete('t1');
    await pushPending(ctx());
    expect(server.live('transactions')).toEqual([]);
    expect(server.all('transactions')[0].deleted_at).toBeTruthy();
  });

  it('sends a save whose record has vanished as a delete', async () => {
    await device.transactions.add(tx('t1'));
    await device.transactions.delete('t1');
    await device.syncOutbox.put({ key: 'transactions:t1', table: 'transactions', id: 't1', op: 'upsert', at: 5 });
    await pushPending(ctx());
    expect(server.all('transactions')[0].deleted_at).toBeTruthy();
  });

  it('sends saves and deletes in separate requests, dependencies first', async () => {
    await device.buckets.add({ id: 'b1', name: 'X', color: '#000', order: 0, isDefault: false, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: true, createdAt: new Date(2026, 0, 1) });
    await device.transactions.bulkAdd([tx('t1'), tx('t2')]);
    await device.transactions.delete('t2');
    await pushPending(ctx());
    expect(server.upsertCalls.map((c) => `${c.remote}:${c.rows.length}`)).toEqual(['buckets:1', 'transactions:1', 'transactions:1']);
    expect(server.upsertCalls[1].rows[0].deleted_at).toBeNull();
    expect(server.upsertCalls[2].rows[0].deleted_at).toBeTruthy();
  });

  it('splits a large queue into batches', async () => {
    await device.transactions.bulkAdd([tx('1'), tx('2'), tx('3'), tx('4'), tx('5')]);
    await pushPending(ctx(), 2);
    expect(server.upsertCalls.map((c) => c.rows.length)).toEqual([2, 2, 1]);
    expect(await queued()).toEqual([]);
  });

  it('does nothing when the queue is empty', async () => {
    expect(await pushPending(ctx())).toEqual({ sent: 0, skipped: 0, parked: 0 });
    expect(server.upsertCalls).toEqual([]);
  });

  it('drops an entry the server skipped because it held a newer edit, leaving the version alone', async () => {
    await device.transactions.add(tx('t1'));
    const mine = (await device.syncOutbox.get('transactions:t1'))!.at;
    await server.upsert('transactions', [{ id: 't1', updated_at: new Date(mine + 5000).toISOString(), deleted_at: null, amount_cents: 7, extra: {} }]);

    const result = await pushPending(ctx());

    expect(result).toEqual({ sent: 0, skipped: 1, parked: 0 });
    expect(await queued()).toEqual([]);
    expect((await device.syncVersions.get('transactions:t1'))!.at).toBe(mine);
    expect(server.live('transactions')[0].amount_cents).toBe(7);
  });

  it('keeps an entry that was edited again while the upload was in flight', async () => {
    await device.transactions.add(tx('t1'));
    const original = server.upsert.bind(server);
    server.upsert = async (remote, rows) => {
      await device.transactions.put(tx('t1', { amount: 999 }));
      return original(remote, rows);
    };

    await pushPending(ctx());

    const entry = (await device.syncOutbox.get('transactions:t1'))!;
    const version = (await device.syncVersions.get('transactions:t1'))!;
    expect(entry.at).toBe(version.at);
    expect(server.live('transactions')[0].amount_cents).toBe(100);
    server.upsert = original;
    await pushPending(ctx());
    expect(server.live('transactions')[0].amount_cents).toBe(999);
    expect(await queued()).toEqual([]);
  });

  it('keeps the queue and rethrows when the network fails', async () => {
    await device.transactions.add(tx('t1'));
    server.offline = true;
    await expect(pushPending(ctx())).rejects.toMatchObject({ kind: 'network' });
    expect(await queued()).toEqual(['transactions:t1']);
  });
});

describe('pushPending with a row the server refuses', () => {
  it('uploads the good rows, parks only the bad one and records why', async () => {
    await device.transactions.bulkAdd([tx('a'), tx('b'), tx('bad'), tx('d'), tx('e')]);
    server.rejectIds.add('bad');

    const result = await pushPending(ctx());

    expect(result).toEqual({ sent: 4, skipped: 0, parked: 1 });
    expect(server.live('transactions').map((r) => r.id).sort()).toEqual(['a', 'b', 'd', 'e']);
    const parked = (await device.syncOutbox.get('transactions:bad'))!;
    expect(parked.parked).toBe(true);
    expect(parked.error).toMatch(/rejected/);
    expect(await queued()).toEqual(['transactions:bad']);
  });

  it('leaves a parked entry alone on later pushes', async () => {
    await device.transactions.add(tx('bad'));
    server.rejectIds.add('bad');
    await pushPending(ctx());
    server.upsertCalls.length = 0;
    expect(await pushPending(ctx())).toEqual({ sent: 0, skipped: 0, parked: 0 });
    expect(server.upsertCalls).toEqual([]);
  });

  it('retries a parked record once it is edited again', async () => {
    await device.transactions.add(tx('bad'));
    server.rejectIds.add('bad');
    await pushPending(ctx());
    server.rejectIds.clear();
    await device.transactions.put(tx('bad', { amount: 5 }));
    expect((await device.syncOutbox.get('transactions:bad'))!.parked).toBeUndefined();
    expect(await pushPending(ctx())).toMatchObject({ sent: 1 });
    expect(server.live('transactions')[0].amount_cents).toBe(5);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/sync/push.test.ts`
Expected: FAIL, module `$lib/sync/push` not found.

- [ ] **Step 3: Implement**

`src/lib/sync/push.ts`:

```ts
import { COLLECTIONS, toRow, type CollectionDef, type Row } from './registry';
import { SyncError, type StoredStamp, type SyncTransport } from './transport';
import type { SyncContext, SyncOutboxEntry } from './types';

export interface PushResult {
  sent: number; // stored by the server
  skipped: number; // the server held a newer edit
  parked: number; // the server refused the row
}

const iso = (ms: number) => new Date(ms).toISOString();

interface BatchOutcome {
  stored: StoredStamp[];
  rejected: { id: string; message: string }[];
}

// A refused batch is split until the single bad row is found, so one bad row
// never blocks the rest.
async function sendBatch(transport: SyncTransport, remote: string, rows: Row[]): Promise<BatchOutcome> {
  try {
    return { stored: await transport.upsert(remote, rows), rejected: [] };
  } catch (e) {
    if (!(e instanceof SyncError) || e.kind !== 'rejected') throw e;
    if (rows.length === 1) return { stored: [], rejected: [{ id: String(rows[0].id), message: e.message }] };
    const mid = rows.length >> 1;
    const first = await sendBatch(transport, remote, rows.slice(0, mid));
    const second = await sendBatch(transport, remote, rows.slice(mid));
    return { stored: [...first.stored, ...second.stored], rejected: [...first.rejected, ...second.rejected] };
  }
}

async function pushChunk(ctx: SyncContext, def: CollectionDef, entries: SyncOutboxEntry[]): Promise<PushResult> {
  const { db, transport } = ctx;
  const table = db.table(def.table);

  const upserts = entries.filter((e) => e.op === 'upsert');
  const found = await table.bulkGet(upserts.map((e) => e.id));
  const recordById = new Map(upserts.map((e, i) => [e.id, found[i] as Record<string, unknown> | undefined]));

  const saves: Row[] = [];
  const deletes: Row[] = [];
  for (const entry of entries) {
    const record = entry.op === 'upsert' ? recordById.get(entry.id) : undefined;
    if (record) saves.push({ ...toRow(def, record), updated_at: iso(entry.at), deleted_at: null });
    else deletes.push({ id: entry.id, updated_at: iso(entry.at), deleted_at: iso(entry.at) });
  }

  const stored = new Map<string, number>();
  const rejected = new Map<string, string>();
  // Separate requests: a bulk upsert needs the same columns in every row.
  for (const rows of [saves, deletes]) {
    if (rows.length === 0) continue;
    const outcome = await sendBatch(transport, def.remote, rows);
    for (const s of outcome.stored) stored.set(s.id, Date.parse(s.updated_at));
    for (const r of outcome.rejected) rejected.set(r.id, r.message);
  }

  const result: PushResult = { sent: 0, skipped: 0, parked: 0 };
  await db.transaction('rw', [db.syncOutbox, db.syncVersions], async () => {
    for (const entry of entries) {
      const current = await db.syncOutbox.get(entry.key);
      // Edited again since it was read: leave the newer entry queued.
      if (!current || current.at !== entry.at) continue;
      if (rejected.has(entry.id)) {
        await db.syncOutbox.put({ ...current, parked: true, error: rejected.get(entry.id) });
        result.parked++;
        continue;
      }
      await db.syncOutbox.delete(entry.key);
      const at = stored.get(entry.id);
      if (at === undefined) {
        result.skipped++; // the server holds a newer edit; the next pull brings it
        continue;
      }
      await db.syncVersions.put({ key: entry.key, at });
      result.sent++;
    }
  });
  return result;
}

export async function pushPending(ctx: SyncContext, batchSize = 500): Promise<PushResult> {
  const total: PushResult = { sent: 0, skipped: 0, parked: 0 };
  const waiting = (await ctx.db.syncOutbox.toArray()).filter((e) => !e.parked);
  for (const def of COLLECTIONS) {
    const entries = waiting.filter((e) => e.table === def.table).sort((a, b) => a.key.localeCompare(b.key));
    for (let i = 0; i < entries.length; i += batchSize) {
      const part = await pushChunk(ctx, def, entries.slice(i, i + batchSize));
      total.sent += part.sent;
      total.skipped += part.skipped;
      total.parked += part.parked;
    }
  }
  return total;
}
```

- [ ] **Step 4: Run tests and type check**

Run: `npx vitest run tests/lib/sync/push.test.ts && npx vitest run && npm run check`
Expected: all PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync-engine
git add src/lib/sync/push.ts tests/lib/sync/push.test.ts
git commit --no-gpg-sign -m "feat(sync): push queued changes in batches, isolating rows the server refuses"
```

---
### Task 7: Pull and apply

**Files:**
- Create: `src/lib/sync/pull.ts`
- Test: `tests/lib/sync/pull.test.ts`

**Interfaces:**
- Consumes: `COLLECTIONS`, `fromRow`, `toRow`, `rowsMatch` (Task 2); `getState`, `setState`, `cursorKey` (Task 1); `remoteTransaction` (Task 4); `PulledRow` (Task 5).
- Produces: `pullAll(ctx: SyncContext, pageSize = 1000): Promise<PullResult>` and `interface PullResult { changed: boolean; rows: number }`.

Behavior: for every collection, fetch the rows changed since the saved cursor minus a 1-minute overlap (everything the first time), paging until a page brings nothing new. Only after every collection has been fetched, apply all rows in one read-write transaction marked as coming from the server: a remote row older than the local version is skipped; otherwise a save writes the record (unless the stored data is already identical), a delete removes it, the version becomes the row's edit time, and a queued local change that is not newer than the row is dropped. Cursors advance in the same transaction. A failure anywhere applies nothing.

- [ ] **Step 1: Write the failing tests**

`tests/lib/sync/pull.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeDevice, dropDevice } from '../../helpers/devices';
import { FakeServer } from '../../helpers/fakeServer';
import { pullAll } from '$lib/sync/pull';
import { pushPending } from '$lib/sync/push';
import { collectionByTable, toRow } from '$lib/sync/registry';
import { getState } from '$lib/sync/state';
import { resetClockForTests } from '$lib/sync/clock';
import type { BudgetDatabase } from '$lib/db';

let device: BudgetDatabase;
let server: FakeServer;
const ctx = () => ({ db: device, transport: server });
const day = new Date(2026, 9, 20);
const iso = (ms: number) => new Date(ms).toISOString();

// A row as another device would have pushed it.
async function remote(table: string, record: Record<string, unknown>, atMs: number, deleted = false) {
  const def = collectionByTable(table)!;
  const base = deleted ? { id: String(record[def.keyProp]) } : toRow(def, record);
  await server.upsert(def.remote, [{ ...base, updated_at: iso(atMs), deleted_at: deleted ? iso(atMs) : null }]);
}
const tx = (id: string, over: Record<string, unknown> = {}) => ({ id, amount: 100, bucketId: 'b1', date: day, ...over });

beforeEach(async () => {
  resetClockForTests();
  device = await makeDevice('pull-test');
  server = new FakeServer(() => 5_000_000_000_000);
});

afterEach(() => dropDevice(device));

describe('pullAll: applying rows', () => {
  it('writes remote records, records their versions and never queues them for upload', async () => {
    await remote('transactions', tx('t1', { note: 'Flight' }), 1000);

    const result = await pullAll(ctx());

    expect(result).toMatchObject({ changed: true, rows: 1 });
    expect(await device.transactions.get('t1')).toMatchObject({ id: 't1', amount: 100, bucketId: 'b1', note: 'Flight' });
    expect((await device.syncVersions.get('transactions:t1'))!.at).toBe(1000);
    expect(await device.syncOutbox.count()).toBe(0);
  });

  it('applies several tables in one pull', async () => {
    await remote('buckets', { id: 'b1', name: 'Rent', color: '#000', order: 0, isDefault: false, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: true, createdAt: new Date('2026-01-01T00:00:00.000Z') }, 1000);
    await remote('allocations', { id: '2026-10:b1', month: '2026-10', bucketId: 'b1', amount: 5000 }, 1000);
    await remote('settings', { key: 'baseCurrency', value: 'INR' }, 1000);
    await pullAll(ctx());
    expect((await device.buckets.get('b1'))?.name).toBe('Rent');
    expect((await device.allocations.get('2026-10:b1'))?.amount).toBe(5000);
    expect((await device.settings.get('baseCurrency'))?.value).toBe('INR');
  });

  it('removes a record the server deleted, and remembers the version', async () => {
    await device.transactions.add(tx('t1'));
    await device.syncOutbox.clear();
    await remote('transactions', { id: 't1' }, Date.now() + 10_000, true);
    const result = await pullAll(ctx());
    expect(result.changed).toBe(true);
    expect(await device.transactions.get('t1')).toBeUndefined();
    expect((await device.syncVersions.get('transactions:t1'))!.at).toBeGreaterThan(Date.now());
  });

  it('remembers a tombstone for a record it never held, so an older save cannot bring it back', async () => {
    await remote('transactions', { id: 'ghost' }, 5000, true);
    const result = await pullAll(ctx());
    expect(result.changed).toBe(false);
    expect((await device.syncVersions.get('transactions:ghost'))!.at).toBe(5000);
  });

  it('skips a remote row older than the local version', async () => {
    await device.transactions.add(tx('t1', { amount: 111 }));
    const mine = (await device.syncVersions.get('transactions:t1'))!.at;
    await remote('transactions', tx('t1', { amount: 5 }), mine - 1000);
    await pullAll(ctx());
    expect((await device.transactions.get('t1'))!.amount).toBe(111);
    expect(await device.syncOutbox.get('transactions:t1')).toBeTruthy();
    expect((await device.syncVersions.get('transactions:t1'))!.at).toBe(mine);
  });

  it('applies a remote row with exactly the local edit time, so devices that tie converge on the server', async () => {
    await device.transactions.add(tx('t1', { amount: 111 }));
    const mine = (await device.syncVersions.get('transactions:t1'))!.at;
    await remote('transactions', tx('t1', { amount: 5 }), mine);
    await pullAll(ctx());
    expect((await device.transactions.get('t1'))!.amount).toBe(5);
  });

  it('drops a queued change that the remote row is not older than, and keeps a newer one', async () => {
    await device.transactions.bulkAdd([tx('old'), tx('new')]);
    const oldAt = (await device.syncOutbox.get('transactions:old'))!.at;
    const newAt = (await device.syncOutbox.get('transactions:new'))!.at;
    await remote('transactions', tx('old', { amount: 7 }), oldAt + 10);
    await remote('transactions', tx('new', { amount: 8 }), newAt - 10);
    await pullAll(ctx());
    expect(await device.syncOutbox.get('transactions:old')).toBeUndefined();
    expect(await device.syncOutbox.get('transactions:new')).toBeTruthy();
    expect((await device.transactions.get('old'))!.amount).toBe(7);
    expect((await device.transactions.get('new'))!.amount).toBe(100);
  });

  it('does not rewrite a record whose data is already identical', async () => {
    const withTime = new Date(2026, 9, 20, 15, 30);
    await device.transactions.add(tx('t1', { date: withTime }));
    await pushPending(ctx());
    const result = await pullAll(ctx());
    expect(result.changed).toBe(false);
    expect((await device.transactions.get('t1'))!.date.getHours()).toBe(15);
  });
});

describe('pullAll: cursors and pages', () => {
  it('saves a cursor per table and fetches from just before it next time', async () => {
    await remote('transactions', tx('t1'), 1000);
    await pullAll(ctx());
    const cursor = (await getState<string>(device, 'cursor:transactions'))!;
    expect(cursor).toBeTruthy();

    const seen: (string | null)[] = [];
    const original = server.pull.bind(server);
    server.pull = (table, since, limit) => {
      if (table === 'transactions') seen.push(since);
      return original(table, since, limit);
    };
    const again = await pullAll(ctx());
    expect(again.changed).toBe(false);
    expect(Date.parse(seen[0]!)).toBe(Date.parse(cursor.replace(/(\.\d{3})\d+/, '$1')) - 60_000);
  });

  it('pages through more rows than one page holds', async () => {
    for (const id of ['1', '2', '3', '4', '5']) await remote('transactions', tx(id), 1000);
    await pullAll(ctx(), 2);
    expect(await device.transactions.count()).toBe(5);
  });

  it('applies nothing and moves no cursor when any table fails to fetch', async () => {
    await remote('buckets', { id: 'b1', name: 'Rent', color: '#000', order: 0, isDefault: false, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: true, createdAt: new Date('2026-01-01T00:00:00.000Z') }, 1000);
    await remote('transactions', tx('t1'), 1000);
    server.failNextPull('transactions');

    await expect(pullAll(ctx())).rejects.toMatchObject({ kind: 'network' });

    expect(await device.buckets.count()).toBe(0);
    expect(await device.transactions.count()).toBe(0);
    expect(await getState(device, 'cursor:buckets')).toBeUndefined();

    await pullAll(ctx());
    expect(await device.buckets.count()).toBe(1);
    expect(await device.transactions.count()).toBe(1);
  });

  it('reports no change when the server has nothing new', async () => {
    expect(await pullAll(ctx())).toEqual({ changed: false, rows: 0 });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/sync/pull.test.ts`
Expected: FAIL, module `$lib/sync/pull` not found.

- [ ] **Step 3: Implement**

`src/lib/sync/pull.ts`:

```ts
import { COLLECTIONS, fromRow, rowsMatch, toRow, type CollectionDef } from './registry';
import { cursorKey, getState, setState } from './state';
import { remoteTransaction } from './transactions';
import type { PulledRow } from './transport';
import type { SyncContext } from './types';

// A write can commit out of synced_at order (a slower statement finishes
// after a faster one that started later), so each pull starts a little
// before the saved cursor. Re-applying a row is harmless.
const OVERLAP_MS = 60_000;

export interface PullResult {
  changed: boolean;
  rows: number;
}

function sinceFor(cursor: string | undefined): string | null {
  if (!cursor) return null;
  const ms = Date.parse(cursor.replace(/(\.\d{3})\d+/, '$1')); // JS dates keep milliseconds
  return Number.isNaN(ms) ? null : new Date(ms - OVERLAP_MS).toISOString();
}

interface Fetched {
  def: CollectionDef;
  rows: PulledRow[];
  cursor: string | undefined;
}

async function fetchTable(ctx: SyncContext, def: CollectionDef, pageSize: number): Promise<Fetched> {
  const saved = await getState<string>(ctx.db, cursorKey(def.remote));
  let since = sinceFor(saved);
  const byId = new Map<string, PulledRow>();
  for (;;) {
    const page = await ctx.transport.pull(def.remote, since, pageSize);
    let fresh = 0;
    for (const row of page) {
      const previous = byId.get(row.id);
      if (!previous || row.synced_at > previous.synced_at) {
        byId.set(row.id, row);
        fresh++;
      }
    }
    // The next page starts at the last row's time, so that row comes again:
    // stop when a page brings nothing we have not seen.
    if (page.length < pageSize || fresh === 0) break;
    since = page[page.length - 1].synced_at;
  }
  const rows = [...byId.values()];
  const cursor = rows.reduce<string | undefined>((max, r) => (max === undefined || r.synced_at > max ? r.synced_at : max), saved);
  return { def, rows, cursor };
}

export async function pullAll(ctx: SyncContext, pageSize = 1000): Promise<PullResult> {
  const { db } = ctx;

  // Fetch everything first: if any request fails, nothing has been applied.
  const fetched: Fetched[] = [];
  for (const def of COLLECTIONS) fetched.push(await fetchTable(ctx, def, pageSize));

  let changed = false;
  const tables = [...COLLECTIONS.map((c) => db.table(c.table)), db.syncOutbox, db.syncVersions, db.syncState];
  await remoteTransaction(db, tables, async () => {
    for (const { def, rows, cursor } of fetched) {
      if (rows.length > 0) {
        const table = db.table(def.table);
        const keys = rows.map((r) => `${def.table}:${r.id}`);
        const [versions, current, queued] = await Promise.all([
          db.syncVersions.bulkGet(keys),
          table.bulkGet(rows.map((r) => r.id)),
          db.syncOutbox.bulkGet(keys),
        ]);

        const puts: Record<string, unknown>[] = [];
        const deletes: string[] = [];
        const newVersions: { key: string; at: number }[] = [];
        const drop: string[] = [];
        rows.forEach((row, i) => {
          const remoteAt = Date.parse(row.updated_at);
          const localAt = versions[i]?.at;
          if (localAt !== undefined && remoteAt < localAt) return; // this device holds a newer edit
          if (row.deleted_at) {
            if (current[i] !== undefined) deletes.push(row.id);
          } else if (current[i] === undefined || !rowsMatch(def, toRow(def, current[i]), row)) {
            puts.push(fromRow(def, row));
          }
          newVersions.push({ key: keys[i], at: remoteAt });
          if (queued[i] && queued[i]!.at <= remoteAt) drop.push(keys[i]);
        });

        if (puts.length > 0) await table.bulkPut(puts);
        if (deletes.length > 0) await table.bulkDelete(deletes);
        if (newVersions.length > 0) await db.syncVersions.bulkPut(newVersions);
        if (drop.length > 0) await db.syncOutbox.bulkDelete(drop);
        if (puts.length > 0 || deletes.length > 0) changed = true;
      }
      if (cursor) await setState(db, cursorKey(def.remote), cursor);
    }
  });

  return { changed, rows: fetched.reduce((n, f) => n + f.rows.length, 0) };
}
```

- [ ] **Step 4: Run tests and type check**

Run: `npx vitest run tests/lib/sync/pull.test.ts && npx vitest run && npm run check`
Expected: all PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync-engine
git add src/lib/sync/pull.ts tests/lib/sync/pull.test.ts
git commit --no-gpg-sign -m "feat(sync): pull changes and apply them atomically, newest edit wins"
```

---

### Task 8: Repairs, the seeding gate, and automatic writes

**Files:**
- Create: `src/lib/sync/repairs.ts`
- Modify: `src/lib/db/index.ts`, `src/lib/stores/recurringStore.ts`, `src/lib/stores/budgetStore.ts`, `src/lib/stores/currencyStore.ts`
- Test: `tests/lib/sync/repairs.test.ts`, `tests/lib/db/seedGate.test.ts`, `tests/lib/stores/autoWrites.test.ts`

**Interfaces:**
- Consumes: `autoTransaction` (Task 4), `isInitialSyncPending` (Task 1), `findOrphans`, `makeUnsortedBucket`, `UNSORTED_BUCKET_ID` from `$lib/utils/unsorted`.
- Produces:
  - `repairAfterPull(db: BudgetDatabase): Promise<boolean>` — in one automatic transaction: files transactions whose bucket is missing under Unsorted (creating it if needed), and raises each lot's `soldShares` to the total of its sell records (never lowers it, never above `shares`). Returns whether anything changed.
  - `initializeDefaultBuckets` waits while a first sync is pending. `SEEDED_KEY` is exported from `$lib/db`.
  - The app's automatic writes (default buckets, recurring items, the load-time orphan rescue, the persisted detected currency) run in `autoTransaction`.

- [ ] **Step 1: Write the failing tests**

`tests/lib/sync/repairs.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeDevice, dropDevice } from '../../helpers/devices';
import { repairAfterPull } from '$lib/sync/repairs';
import { resetClockForTests } from '$lib/sync/clock';
import type { BudgetDatabase } from '$lib/db';

let device: BudgetDatabase;
const day = new Date(2026, 9, 20);
const bucket = (id: string, order = 0) => ({ id, name: id, color: '#000', order, isDefault: false, allocationType: 'fixed' as const, fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: true, createdAt: new Date(2026, 0, 1) });
const lot = (id: string, shares: number, soldShares: number) => ({ id, symbol: 'VTI', shares, pricePerShare: 1000, purchaseDate: day, soldShares });
const sell = (id: string, lotId: string, shares: number) => ({ id, lotId, shares, pricePerShare: 1100, sellDate: day });

beforeEach(async () => {
  resetClockForTests();
  device = await makeDevice('repairs-test');
});

afterEach(() => dropDevice(device));

describe('repairAfterPull: orphaned transactions', () => {
  it('files them under a new Unsorted bucket and deletes nothing', async () => {
    await device.buckets.add(bucket('b1', 4));
    await device.transactions.bulkAdd([
      { id: 't1', amount: 1, bucketId: 'b1', date: day },
      { id: 't2', amount: 2, bucketId: 'gone', date: day },
    ]);
    await device.syncOutbox.clear();
    await device.syncVersions.clear();

    expect(await repairAfterPull(device)).toBe(true);

    expect((await device.transactions.get('t2'))!.bucketId).toBe('unsorted');
    expect((await device.transactions.get('t1'))!.bucketId).toBe('b1');
    const unsorted = await device.buckets.get('unsorted');
    expect(unsorted).toMatchObject({ isSystem: true, order: 5 });
    expect(await device.transactions.count()).toBe(2);
  });

  it('queues the repair as automatic writes, so any real edit elsewhere beats it', async () => {
    await device.transactions.add({ id: 't2', amount: 2, bucketId: 'gone', date: day });
    await device.syncOutbox.clear();
    await device.syncVersions.put({ key: 'transactions:t2', at: 5000 });
    await repairAfterPull(device);
    expect((await device.syncOutbox.get('buckets:unsorted'))!.at).toBe(1);
    expect((await device.syncOutbox.get('transactions:t2'))!.at).toBe(5001);
  });

  it('reuses an Unsorted bucket that already exists', async () => {
    await device.buckets.add({ ...bucket('unsorted', 9), isSystem: true });
    await device.transactions.add({ id: 't2', amount: 2, bucketId: 'gone', date: day });
    await repairAfterPull(device);
    expect(await device.buckets.count()).toBe(1);
    expect((await device.transactions.get('t2'))!.bucketId).toBe('unsorted');
  });

  it('does nothing when every transaction has its bucket', async () => {
    await device.buckets.add(bucket('b1'));
    await device.transactions.add({ id: 't1', amount: 1, bucketId: 'b1', date: day });
    await device.syncOutbox.clear();
    expect(await repairAfterPull(device)).toBe(false);
    expect(await device.syncOutbox.count()).toBe(0);
  });
});

describe('repairAfterPull: sold shares', () => {
  it('raises soldShares to the total of the sell records', async () => {
    await device.investmentLots.add(lot('l1', 10, 2));
    await device.investmentSells.bulkAdd([sell('s1', 'l1', 2), sell('s2', 'l1', 3)]);
    expect(await repairAfterPull(device)).toBe(true);
    expect((await device.investmentLots.get('l1'))!.soldShares).toBe(5);
  });

  it('never lowers it, so a lot sold before sell records existed keeps its count', async () => {
    await device.investmentLots.bulkAdd([lot('l1', 10, 6), lot('l2', 10, 4)]);
    await device.investmentSells.add(sell('s1', 'l1', 2));
    expect(await repairAfterPull(device)).toBe(false);
    expect((await device.investmentLots.get('l1'))!.soldShares).toBe(6);
    expect((await device.investmentLots.get('l2'))!.soldShares).toBe(4);
  });

  it('caps at the shares the lot holds when two devices oversold it', async () => {
    await device.investmentLots.add(lot('l1', 10, 6));
    await device.investmentSells.bulkAdd([sell('s1', 'l1', 6), sell('s2', 'l1', 6)]);
    await repairAfterPull(device);
    expect((await device.investmentLots.get('l1'))!.soldShares).toBe(10);
    expect(await device.investmentSells.count()).toBe(2);
  });

  it('ignores floating-point noise', async () => {
    await device.investmentLots.add(lot('l1', 1, 0.3));
    await device.investmentSells.bulkAdd([sell('s1', 'l1', 0.1), sell('s2', 'l1', 0.2)]);
    expect(await repairAfterPull(device)).toBe(false);
  });
});
```

`tests/lib/db/seedGate.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, initializeDefaultBuckets, SEEDED_KEY } from '$lib/db';
import { setState, INITIAL_SYNC_PENDING } from '$lib/sync/state';
import { setCaptureEnabled } from '$lib/sync/capture';
import { resetRealDb } from '../../helpers/realDb';

beforeEach(async () => {
  await resetRealDb();
  localStorage.clear();
  setCaptureEnabled(false);
});

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
```

`tests/lib/stores/autoWrites.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '$lib/db';
import { setCaptureEnabled } from '$lib/sync/capture';
import { processRecurring } from '$lib/stores/recurringStore';
import { loadCurrency } from '$lib/stores/currencyStore';
import { resetRealDb } from '../../helpers/realDb';

beforeEach(async () => {
  await resetRealDb();
  setCaptureEnabled(true);
});

afterEach(() => setCaptureEnabled(false));

describe('automatic writes are stamped as automatic', () => {
  it('recurring occurrences get their stable id and a stamp of 1, and the due date is one past its version', async () => {
    await db.recurringTransactions.add({ id: 'r1', amount: 500, bucketId: 'b1', frequency: 'monthly', nextDueDate: new Date(2026, 0, 15), isActive: true });
    await db.syncOutbox.clear();
    await db.syncVersions.put({ key: 'recurringTransactions:r1', at: 7000 });

    const added = await processRecurring();

    expect(added).toBeGreaterThan(0);
    const occurrence = await db.syncOutbox.get('transactions:r1:2026-01-15');
    expect(occurrence).toMatchObject({ op: 'upsert', at: 1 });
    expect((await db.syncOutbox.get('recurringTransactions:r1'))!.at).toBe(7001);
  });

  it('the detected currency is saved as an automatic write', async () => {
    await loadCurrency();
    const entry = await db.syncOutbox.get('settings:baseCurrency');
    expect(entry).toMatchObject({ op: 'upsert', at: 1 });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/sync/repairs.test.ts tests/lib/db/seedGate.test.ts tests/lib/stores/autoWrites.test.ts`
Expected: FAIL (repairs module missing; `SEEDED_KEY` not exported; defaults seeded while pending; stamps not 1).

- [ ] **Step 3: Implement**

`src/lib/sync/repairs.ts`:

```ts
import type { BudgetDatabase } from '$lib/db';
import { UNSORTED_BUCKET_ID, findOrphans, makeUnsortedBucket } from '$lib/utils/unsorted';
import { autoTransaction } from './transactions';

// Two devices can make edits that are each fine alone but inconsistent
// together. After a pull, put the data back in a consistent shape with
// automatic writes (stamped so a real edit elsewhere always wins).
export async function repairAfterPull(db: BudgetDatabase): Promise<boolean> {
  let changed = false;
  await autoTransaction(db, [db.buckets, db.transactions, db.investmentLots, db.investmentSells], async () => {
    const [buckets, transactions, lots, sells] = await Promise.all([
      db.buckets.toArray(),
      db.transactions.toArray(),
      db.investmentLots.toArray(),
      db.investmentSells.toArray(),
    ]);

    // A transaction whose bucket was deleted elsewhere: file it under
    // Unsorted instead of letting it vanish from every view.
    const orphans = findOrphans(transactions, buckets.map((b) => b.id));
    if (orphans.length > 0) {
      if (!buckets.some((b) => b.id === UNSORTED_BUCKET_ID)) {
        await db.buckets.add(makeUnsortedBucket(Math.max(-1, ...buckets.map((b) => b.order)) + 1));
      }
      await db.transactions.bulkUpdate(orphans.map((t) => ({ key: t.id, changes: { bucketId: UNSORTED_BUCKET_ID } })));
      changed = true;
    }

    // Two devices selling from one lot each raise soldShares from the same
    // starting point. The sell records are the truth: raise the count to
    // their total, never lower it (lots sold before sell records existed keep
    // theirs) and never above what the lot holds.
    const soldByLot = new Map<string, number>();
    for (const s of sells) soldByLot.set(s.lotId, (soldByLot.get(s.lotId) ?? 0) + s.shares);
    for (const lot of lots) {
      const sold = soldByLot.get(lot.id);
      if (sold !== undefined && sold - lot.soldShares > 1e-9) {
        await db.investmentLots.update(lot.id, { soldShares: Math.min(sold, lot.shares) });
        changed = true;
      }
    }
  });
  return changed;
}
```

In `src/lib/db/index.ts`:

1. Add `import { autoTransaction } from '$lib/sync/transactions';` and `import { isInitialSyncPending } from '$lib/sync/state';`.
2. Change `const SEEDED_KEY = ...` to `export const SEEDED_KEY = ...`.
3. Replace the body of `initializeDefaultBuckets` with:

```ts
export async function initializeDefaultBuckets(): Promise<void> {
  // A device that is signing in must wait for the account's buckets before
  // creating its own, or the two sets would sit side by side.
  if (await isInitialSyncPending(db)) return;

  const alreadySeeded =
    typeof localStorage !== 'undefined' && localStorage.getItem(SEEDED_KEY) === 'true';
  const count = await db.buckets.count();

  if (shouldSeedDefaults(count, alreadySeeded)) {
    const now = new Date();
    const bucketsWithIds = DEFAULT_BUCKETS.map((b) => ({
      ...b,
      id: crypto.randomUUID(),
      createdAt: now,
    }));
    await autoTransaction(db, [db.buckets], () => db.buckets.bulkAdd(bucketsWithIds));
  }

  try {
    localStorage.setItem(SEEDED_KEY, 'true');
  } catch {
    // localStorage unavailable (private mode) — falls back to old behavior
  }
}
```

In `src/lib/stores/recurringStore.ts` add `import { autoTransaction } from '$lib/sync/transactions';` and change `await db.transaction('rw', [db.transactions, db.recurringTransactions], async () => {` to `await autoTransaction(db, [db.transactions, db.recurringTransactions], async () => {`.

In `src/lib/stores/budgetStore.ts` add `import { autoTransaction } from '$lib/sync/transactions';` and replace the orphan-rescue block inside `loadData`:

```ts
  if (orphans.length > 0) {
    if (!allBuckets.some((b) => b.id === UNSORTED_BUCKET_ID)) {
      const unsorted = makeUnsortedBucket(Math.max(-1, ...allBuckets.map((b) => b.order)) + 1);
      await db.buckets.add(unsorted);
      allBuckets = [...allBuckets, unsorted];
    }
    await db.transactions.bulkUpdate(
      orphans.map((t) => ({ key: t.id, changes: { bucketId: UNSORTED_BUCKET_ID } }))
    );
```

with:

```ts
  if (orphans.length > 0) {
    await autoTransaction(db, [db.buckets, db.transactions], async () => {
      if (!allBuckets.some((b) => b.id === UNSORTED_BUCKET_ID)) {
        const unsorted = makeUnsortedBucket(Math.max(-1, ...allBuckets.map((b) => b.order)) + 1);
        await db.buckets.add(unsorted);
        allBuckets = [...allBuckets, unsorted];
      }
      await db.transactions.bulkUpdate(
        orphans.map((t) => ({ key: t.id, changes: { bucketId: UNSORTED_BUCKET_ID } }))
      );
    });
```

(the lines after it that build `orphanIds` and remap `allTransactions` stay as they are).

In `src/lib/stores/currencyStore.ts` add `import { autoTransaction } from '$lib/sync/transactions';` and change `if (!stored) await db.settings.bulkPut(settingsToRows(settings));` to:

```ts
  if (!stored) await autoTransaction(db, [db.settings], () => db.settings.bulkPut(settingsToRows(settings)));
```

- [ ] **Step 4: Run tests and type check**

Run: `npx vitest run && npm run check`
Expected: all PASS (the existing mocked store tests included), 0 errors.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync-engine
git add src tests
git commit --no-gpg-sign -m "feat(sync): repairs after a pull, a seeding gate for the first sync, and automatic writes"
```

---

### Task 9: The sync cycle

**Files:**
- Create: `src/lib/sync/engine.ts`
- Test: `tests/lib/sync/engine.test.ts`

**Interfaces:**
- Consumes: `pullAll` (Task 7), `pushPending` (Task 6), `repairAfterPull` (Task 8), `SyncError`, `AccountState` (Task 5).
- Produces:
  - `REQUIRED_SCHEMA_VERSION = 1`
  - `type SyncFailure = { status: 'offline' | 'auth' | 'notAllowed' | 'schema'; message: string }`
  - `toSyncFailure(e): SyncFailure` — maps a `SyncError` to a status (any other error is rethrown).
  - `checkAccount(ctx): Promise<{ status: 'ok'; state: AccountState } | SyncFailure>` — asks the server whether this account may sync and whether the database is new enough.
  - `syncOnce(ctx): Promise<{ status: 'ok'; changed: boolean; pushed: number; parked: number } | SyncFailure>` — pull, repair if the pull changed anything, push; if the server skipped any pushed row (it held a newer edit), pull again, up to 3 rounds. `changed` tells the caller to reload its stores.

- [ ] **Step 1: Write the failing tests**

`tests/lib/sync/engine.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeDevice, dropDevice } from '../../helpers/devices';
import { FakeServer } from '../../helpers/fakeServer';
import { syncOnce, checkAccount, REQUIRED_SCHEMA_VERSION } from '$lib/sync/engine';
import { collectionByTable, toRow } from '$lib/sync/registry';
import { resetClockForTests } from '$lib/sync/clock';
import type { BudgetDatabase } from '$lib/db';

let device: BudgetDatabase;
let server: FakeServer;
const ctx = () => ({ db: device, transport: server });
const day = new Date(2026, 9, 20);
const tx = (id: string, over: Record<string, unknown> = {}) => ({ id, amount: 100, bucketId: 'b1', date: day, ...over });
const bucket = (id: string) => ({ id, name: id, color: '#000', order: 0, isDefault: false, allocationType: 'fixed' as const, fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: true, createdAt: new Date(2026, 0, 1) });

async function remote(table: string, record: Record<string, unknown>, atMs: number) {
  const def = collectionByTable(table)!;
  await server.upsert(def.remote, [{ ...toRow(def, record), updated_at: new Date(atMs).toISOString(), deleted_at: null }]);
}

beforeEach(async () => {
  resetClockForTests();
  device = await makeDevice('engine-test');
  server = new FakeServer(() => 5_000_000_000_000);
});

afterEach(() => dropDevice(device));

describe('checkAccount', () => {
  it('passes for an invited account on a current database', async () => {
    const result = await checkAccount(ctx());
    expect(result.status).toBe('ok');
  });

  it('reports an account that is not invited', async () => {
    server.allowed = false;
    expect(await checkAccount(ctx())).toMatchObject({ status: 'notAllowed' });
  });

  it('reports a database older than the app expects', async () => {
    server.schemaVersion = REQUIRED_SCHEMA_VERSION - 1;
    expect(await checkAccount(ctx())).toMatchObject({ status: 'schema' });
  });

  it('reports being offline', async () => {
    server.offline = true;
    expect(await checkAccount(ctx())).toMatchObject({ status: 'offline' });
  });
});

describe('syncOnce', () => {
  it('pushes local changes and pulls remote ones in one cycle', async () => {
    await device.buckets.add(bucket('b1'));
    await device.transactions.add(tx('mine'));
    await remote('transactions', tx('theirs'), 1000);

    const result = await syncOnce(ctx());

    expect(result).toEqual({ status: 'ok', changed: true, pushed: 2, parked: 0 }); // the bucket and the transaction
    expect(await device.transactions.get('theirs')).toBeTruthy();
    expect(server.live('transactions').map((r) => r.id).sort()).toEqual(['mine', 'theirs']);
    expect(await device.syncOutbox.count()).toBe(0);
  });

  it('reports no change when there is nothing to do', async () => {
    expect(await syncOnce(ctx())).toEqual({ status: 'ok', changed: false, pushed: 0, parked: 0 });
  });

  it('keeps the queue and reports offline when the network is down', async () => {
    await device.transactions.add(tx('mine'));
    server.offline = true;
    expect(await syncOnce(ctx())).toMatchObject({ status: 'offline' });
    expect(await device.syncOutbox.count()).toBe(1);
    server.offline = false;
    expect(await syncOnce(ctx())).toMatchObject({ status: 'ok', pushed: 1 });
  });

  it('reports an account that is not invited', async () => {
    server.allowed = false;
    expect(await syncOnce(ctx())).toMatchObject({ status: 'notAllowed' });
  });

  it('pulls again when the server skipped a push because it held a newer edit', async () => {
    await device.buckets.add(bucket('b1'));
    await device.transactions.add(tx('t1', { amount: 1 }));
    const original = server.upsert.bind(server);
    let injected = false;
    server.upsert = async (remoteTable, rows) => {
      if (!injected && remoteTable === 'transactions') {
        injected = true;
        await remote('transactions', tx('t1', { amount: 99 }), Date.now() + 60_000);
      }
      return original(remoteTable, rows);
    };

    const result = await syncOnce(ctx());

    expect(result).toMatchObject({ status: 'ok', changed: true });
    expect((await device.transactions.get('t1'))!.amount).toBe(99);
    expect(await device.syncOutbox.count()).toBe(0);
  });

  it('repairs after a pull and uploads the repair in the same cycle', async () => {
    await remote('transactions', tx('t1', { bucketId: 'gone' }), 1000);

    await syncOnce(ctx());

    expect((await device.transactions.get('t1'))!.bucketId).toBe('unsorted');
    expect(server.live('buckets').map((r) => r.id)).toEqual(['unsorted']);
    expect(server.live('transactions')[0].bucket_id).toBe('unsorted');
    expect(await device.syncOutbox.count()).toBe(0);
  });

  it('does not repair, or re-upload, a bucket that does exist', async () => {
    await remote('buckets', bucket('b1'), 1000);
    await remote('transactions', tx('t1'), 1000);
    const callsBefore = server.upsertCalls.length;
    await syncOnce(ctx());
    expect(await device.buckets.get('unsorted')).toBeUndefined();
    expect(server.upsertCalls.length).toBe(callsBefore);
  });

  it('counts a row the server refuses as parked and still reports ok', async () => {
    await device.transactions.bulkAdd([tx('a'), tx('bad')]);
    server.rejectIds.add('bad');
    expect(await syncOnce(ctx())).toMatchObject({ status: 'ok', pushed: 1, parked: 1 });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/sync/engine.test.ts`
Expected: FAIL, module `$lib/sync/engine` not found.

- [ ] **Step 3: Implement**

`src/lib/sync/engine.ts`:

```ts
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
```

- [ ] **Step 4: Run tests and type check**

Run: `npx vitest run tests/lib/sync/engine.test.ts && npx vitest run && npm run check`
Expected: all PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync-engine
git add src/lib/sync/engine.ts tests/lib/sync/engine.test.ts
git commit --no-gpg-sign -m "feat(sync): the sync cycle and account check"
```

---
### Task 10: Two devices converge

**Files:**
- Test: `tests/lib/sync/convergence.test.ts`
- Modify (only if a test shows a bug): the module the failure points at, with its own test first.

**Interfaces:**
- Consumes: everything from Tasks 1–9.
- Produces: confidence that two simulated devices sharing one `FakeServer` end in identical data in every scenario below. No new production code is expected; a failure here is a bug in an earlier task.

- [ ] **Step 1: Write the scenario tests**

`tests/lib/sync/convergence.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeDevice, dropDevice } from '../../helpers/devices';
import { FakeServer } from '../../helpers/fakeServer';
import { syncOnce } from '$lib/sync/engine';
import { COLLECTIONS, collectionByTable, toRow } from '$lib/sync/registry';
import { autoTransaction } from '$lib/sync/transactions';
import { resetClockForTests } from '$lib/sync/clock';
import type { BudgetDatabase } from '$lib/db';

let A: BudgetDatabase;
let B: BudgetDatabase;
let server: FakeServer;
const day = new Date(2026, 9, 20);
const sync = (d: BudgetDatabase) => syncOnce({ db: d, transport: server });
const bucket = (id: string) => ({ id, name: id, color: '#000', order: 0, isDefault: false, allocationType: 'fixed' as const, fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: true, createdAt: new Date(2026, 0, 1) });
const tx = (id: string, over: Record<string, unknown> = {}) => ({ id, amount: 100, bucketId: 'b1', date: day, ...over });

// A few rounds of A then B: enough for any change to reach the other device
// and for repairs to settle.
async function settle() {
  for (let i = 0; i < 3; i++) {
    await sync(A);
    await sync(B);
  }
}

async function state(d: BudgetDatabase) {
  const out: Record<string, string[]> = {};
  for (const def of COLLECTIONS) {
    out[def.table] = (await d.table(def.table).toArray()).map((r) => JSON.stringify(toRow(def, r as Record<string, unknown>))).sort();
  }
  return out;
}

beforeEach(async () => {
  resetClockForTests();
  A = await makeDevice('device-a');
  B = await makeDevice('device-b');
  server = new FakeServer(() => 5_000_000_000_000);
});

afterEach(async () => {
  await dropDevice(A);
  await dropDevice(B);
});

describe('two devices', () => {
  it('spreads new records from one device to the other', async () => {
    await A.buckets.add(bucket('b1'));
    await A.transactions.add(tx('t1', { note: 'Flight' }));
    await settle();
    expect(await B.transactions.get('t1')).toMatchObject({ amount: 100, bucketId: 'b1', note: 'Flight' });
    expect(await state(A)).toEqual(await state(B));
    expect(await A.syncOutbox.count()).toBe(0);
    expect(await B.syncOutbox.count()).toBe(0);
  });

  it('does not rewrite a device\'s own records when its pushed rows come back', async () => {
    await A.buckets.add(bucket('b1'));
    await A.transactions.add(tx('t1', { date: new Date(2026, 9, 20, 15, 30) }));
    await sync(A);
    const second = await sync(A);
    expect(second).toMatchObject({ status: 'ok', changed: false, pushed: 0 });
    expect((await A.transactions.get('t1'))!.date.getHours()).toBe(15);
  });

  it('converges on the later edit when both devices edit the same record', async () => {
    await A.buckets.add(bucket('b1'));
    await A.transactions.add(tx('t1'));
    await settle();
    await A.transactions.update('t1', { amount: 1 });
    await B.transactions.update('t1', { amount: 2 }); // later in time
    await settle();
    expect((await A.transactions.get('t1'))!.amount).toBe(2);
    expect(server.live('transactions')[0].amount_cents).toBe(2);
    expect(await state(A)).toEqual(await state(B));
  });

  it('keeps an edit made after a delete', async () => {
    await A.buckets.add(bucket('b1'));
    await A.transactions.add(tx('t1'));
    await settle();
    await A.transactions.delete('t1');
    await B.transactions.update('t1', { amount: 5 });
    await settle();
    expect((await A.transactions.get('t1'))!.amount).toBe(5);
    expect(await state(A)).toEqual(await state(B));
  });

  it('keeps a delete made after an edit', async () => {
    await A.buckets.add(bucket('b1'));
    await A.transactions.add(tx('t1'));
    await settle();
    await B.transactions.update('t1', { amount: 5 });
    await A.transactions.delete('t1');
    await settle();
    expect(await B.transactions.get('t1')).toBeUndefined();
    expect(server.live('transactions')).toEqual([]);
    expect(await state(A)).toEqual(await state(B));
  });

  it('lets a device edit a record whose latest version came from a clock ahead of its own', async () => {
    await A.buckets.add(bucket('b1'));
    await sync(A);
    const ahead = Date.now() + 3_600_000;
    const def = collectionByTable('transactions')!;
    await server.upsert('transactions', [{ ...toRow(def, tx('t1')), updated_at: new Date(ahead).toISOString(), deleted_at: null }]);
    await sync(A);

    await A.transactions.update('t1', { amount: 42 });

    expect((await A.syncOutbox.get('transactions:t1'))!.at).toBe(ahead + 1);
    await settle();
    expect(server.live('transactions')[0].amount_cents).toBe(42);
    expect((await B.transactions.get('t1'))!.amount).toBe(42);
  });

  it('merges assignments to different buckets in the same month', async () => {
    await A.allocations.put({ id: '2026-10:b1', month: '2026-10', bucketId: 'b1', amount: 100 });
    await B.allocations.put({ id: '2026-10:b2', month: '2026-10', bucketId: 'b2', amount: 200 });
    await settle();
    for (const d of [A, B]) expect((await d.allocations.toArray()).map((a) => a.id).sort()).toEqual(['2026-10:b1', '2026-10:b2']);
    expect(await state(A)).toEqual(await state(B));
  });

  it('makes one record when both devices generate the same recurring occurrence, and keeps a real edit', async () => {
    await A.buckets.add(bucket('b1'));
    await settle();
    const occurrence = (amount: number) => ({ id: 'r1:2026-10-08', amount, bucketId: 'b1', date: new Date(2026, 9, 8), recurringId: 'r1' });
    await autoTransaction(A, [A.transactions], () => A.transactions.put(occurrence(500)));
    await autoTransaction(B, [B.transactions], () => B.transactions.put(occurrence(500)));
    await A.transactions.update('r1:2026-10-08', { amount: 600 });
    await settle();
    expect(server.live('transactions')).toHaveLength(1);
    expect((await B.transactions.get('r1:2026-10-08'))!.amount).toBe(600);
    expect(await state(A)).toEqual(await state(B));
    expect(await B.syncOutbox.count()).toBe(0);
  });

  it('files a transaction under Unsorted when its bucket was deleted on the other device', async () => {
    await A.buckets.add(bucket('b1'));
    await settle();
    await A.buckets.delete('b1');
    await B.transactions.add(tx('t9'));
    await settle();
    for (const d of [A, B]) {
      expect(await d.buckets.get('b1')).toBeUndefined();
      expect(await d.buckets.get('unsorted')).toBeTruthy();
      expect((await d.transactions.get('t9'))!.bucketId).toBe('unsorted');
    }
    expect(await state(A)).toEqual(await state(B));
  });

  it('adds up sold shares when both devices sell from the same lot', async () => {
    const lot = { id: 'l1', symbol: 'VTI', shares: 10, pricePerShare: 1000, purchaseDate: day, soldShares: 0 };
    const sell = (id: string, shares: number) => ({ id, lotId: 'l1', shares, pricePerShare: 1100, sellDate: day });
    await A.investmentLots.add(lot);
    await settle();
    await A.investmentSells.add(sell('s1', 3));
    await A.investmentLots.update('l1', { soldShares: 3 });
    await B.investmentSells.add(sell('s2', 4));
    await B.investmentLots.update('l1', { soldShares: 4 });
    await settle();
    for (const d of [A, B]) {
      expect((await d.investmentLots.get('l1'))!.soldShares).toBe(7);
      expect(await d.investmentSells.count()).toBe(2);
    }
    expect(await state(A)).toEqual(await state(B));
  });

  it('delivers changes made offline once the connection is back', async () => {
    await A.buckets.add(bucket('b1'));
    await settle();
    server.offline = true;
    await A.transactions.add(tx('t1'));
    expect(await sync(A)).toMatchObject({ status: 'offline' });
    expect(await A.syncOutbox.count()).toBe(1);
    server.offline = false;
    await settle();
    expect(await B.transactions.get('t1')).toBeTruthy();
    expect(await A.syncOutbox.count()).toBe(0);
  });

  it('applies nothing from a pull that failed halfway, and recovers', async () => {
    await A.buckets.add(bucket('b1'));
    await A.transactions.add(tx('t1'));
    await sync(A);
    server.failNextPull('transactions');
    expect(await sync(B)).toMatchObject({ status: 'offline' });
    expect(await B.buckets.count()).toBe(0);
    expect(await B.transactions.count()).toBe(0);
    await settle();
    expect(await B.transactions.get('t1')).toBeTruthy();
    expect(await state(A)).toEqual(await state(B));
  });
});
```

- [ ] **Step 2: Run the scenarios**

Run: `npx vitest run tests/lib/sync/convergence.test.ts`
Expected: PASS (12 tests). These scenarios exercise code from earlier tasks, so they pass without new production code. If one fails, that is a bug in an earlier task: find the cause with the failing assertion, write a focused test in that task's test file that fails the same way, fix it there, and rerun.

- [ ] **Step 3: Run the whole suite and type check**

Run: `npx vitest run && npm run check`
Expected: all PASS, 0 errors.

- [ ] **Step 4: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync-engine
git add tests/lib/sync/convergence.test.ts
git commit --no-gpg-sign -m "test(sync): two simulated devices converge in every scenario"
```

---

### Task 11: First sign-in

**Files:**
- Create: `src/lib/sync/firstSignIn.ts`
- Test: `tests/lib/sync/firstSignIn.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_BUCKETS`, `SEEDED_KEY` from `$lib/db`; `COLLECTIONS`, `collectionByTable`, `fromRow` (Task 2); `editStamp` (Task 3); `setCaptureEnabled` (Task 4); `resetTransaction` (Task 4); `pullAll`, `syncOnce`, `checkAccount`, `toSyncFailure`, `repairAfterPull`; state helpers (Task 1).
- Produces (all in `firstSignIn.ts`):
  - `type Side = 'empty' | 'defaults' | 'data'`; `type FirstSignInPlan = 'upload' | 'download' | 'conflict' | 'start'`
  - `matchesDefaultBuckets(buckets)`, `classifySide(buckets, hasOtherRecords)`, `summarizeDevice(db): Promise<Side>`, `summarizeAccount(state): Side`, `decideFirstSignIn(device, account): FirstSignInPlan`
  - `requeueAll(db): Promise<number>`, `clearLocalData(db): Promise<void>`, `pendingChanges(db): Promise<number>`
  - `runFirstSignIn(ctx, userId, choice?): Promise<FirstSignInResult>` where `FirstSignInResult = { status: 'done'; plan; sync: SyncOutcome } | { status: 'needsChoice'; reason: 'conflict' | 'otherAccount' } | { status: 'cancelled' } | SyncFailure`
  - `signOutLocal(db): Promise<void>` — switches capture off, wipes this device's budget data and sync bookkeeping, and removes the "defaults seeded" flag so default buckets are created again.
The decision table (device vs account):

| Device \ Account | empty | defaults | data |
|---|---|---|---|
| empty | start | download | download |
| defaults | upload | download | download |
| data | upload | upload | conflict |

"defaults" means exactly the 11 untouched default buckets and nothing else. A conflict (or a device still holding another account's data) needs the caller's choice: `'useAccount'` replaces the device's data with the account's (the caller saves a backup first), `'cancel'` changes nothing.

- [ ] **Step 1: Write the failing tests**

`tests/lib/sync/firstSignIn.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeDevice, dropDevice } from '../../helpers/devices';
import { FakeServer } from '../../helpers/fakeServer';
import { DEFAULT_BUCKETS, SEEDED_KEY } from '$lib/db';
import { collectionByTable, toRow } from '$lib/sync/registry';
import { getState, setState, LINKED_ACCOUNT, INITIAL_SYNC_PENDING } from '$lib/sync/state';
import { isCaptureEnabled, setCaptureEnabled } from '$lib/sync/capture';
import { resetClockForTests } from '$lib/sync/clock';
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
  localStorage.clear();
  device = await makeDevice('first-test');
  server = new FakeServer(() => 5_000_000_000_000);
});

afterEach(() => dropDevice(device));

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
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/sync/firstSignIn.test.ts`
Expected: FAIL, module `$lib/sync/firstSignIn` not found.

- [ ] **Step 3: Implement**

`src/lib/sync/firstSignIn.ts`:

```ts
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

type BucketLike = Record<string, unknown>;

const signature = (b: BucketLike) =>
  JSON.stringify([b.name, b.color, b.order, b.isDefault === true, b.allocationType, b.fixedAmount, b.percentageAmount, b.isSavings === true, b.isEveryday === true, b.isSystem === true]);

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
  const tables = [...COLLECTIONS.map((c) => db.table(c.table)), db.syncOutbox, db.syncVersions, db.syncState];
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

    setCaptureEnabled(true);
    await setState(db, INITIAL_SYNC_PENDING, true);
    if (plan === 'upload') {
      await replaceAccountWithDevice(ctx, account.state.buckets);
    } else if (plan === 'download') {
      await replaceDeviceWithAccount(ctx);
    }
    // Linked as soon as the data is in place, so an interrupted upload resumes
    // from its queue instead of being mistaken for a conflict.
    await setState(db, LINKED_ACCOUNT, userId);
    await setState(db, INITIAL_SYNC_PENDING, false);
    return { status: 'done', plan, sync: await syncOnce(ctx) };
  } catch (e) {
    return toSyncFailure(e);
  }
}
```

- [ ] **Step 4: Run tests and type check**

Run: `npx vitest run tests/lib/sync/firstSignIn.test.ts && npx vitest run && npm run check`
Expected: all PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync-engine
git add src/lib/sync/firstSignIn.ts tests/lib/sync/firstSignIn.test.ts
git commit --no-gpg-sign -m "feat(sync): first sign-in decisions, upload, download and local sign-out"
```

---

### Task 12: Import and Reset while linked

**Files:**
- Test: `tests/lib/sync/importReset.test.ts`

**Interfaces:**
- Consumes: `importFromJson`, `resetAllData`, `exportToJson` from `$lib/utils/export`; capture (Task 4); `pushPending` (Task 6).
- Produces: confidence only. Import and Reset already flow through capture, because both are ordinary writes inside one Dexie transaction; this task pins that. A failure means a write path bypasses capture: fix it where it is found.

- [ ] **Step 1: Write the tests**

`tests/lib/sync/importReset.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '$lib/db';
import { setCaptureEnabled } from '$lib/sync/capture';
import { pushPending } from '$lib/sync/push';
import { exportToJson, importFromJson, resetAllData } from '$lib/utils/export';
import { resetClockForTests } from '$lib/sync/clock';
import { FakeServer } from '../../helpers/fakeServer';
import { resetRealDb } from '../../helpers/realDb';

const day = new Date(2026, 9, 20);
const bucket = (id: string) => ({ id, name: id, color: '#000', order: 0, isDefault: false, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: true, createdAt: '2026-01-01T00:00:00.000Z' });
const tx = (id: string) => ({ id, amount: 100, bucketId: 'b1', date: '2026-10-20T12:00:00.000Z' });
const backup = (data: Record<string, unknown[]>) =>
  JSON.stringify({
    version: 1, exportedAt: '2026-10-20T00:00:00.000Z',
    data: { buckets: [], transactions: [], recurringTransactions: [], incomes: [], monthSnapshots: [], savingsGoals: [], investmentLots: [], investmentSells: [], investmentPrices: [], ...data },
  });
const queue = async () => (await db.syncOutbox.toArray()).map((e) => `${e.key}|${e.op}`).sort();

beforeEach(async () => {
  resetClockForTests();
  await resetRealDb();
  await db.buckets.add({ ...bucket('b1'), createdAt: new Date(2026, 0, 1) } as never);
  await db.transactions.bulkAdd([{ id: 't1', amount: 1, bucketId: 'b1', date: day }, { id: 't2', amount: 2, bucketId: 'b1', date: day }]);
  setCaptureEnabled(true);
  await db.syncOutbox.clear();
  await db.syncVersions.clear();
});

afterEach(() => setCaptureEnabled(false));

describe('import while linked', () => {
  it('queues deletes for records the backup drops and saves for the ones it holds', async () => {
    await importFromJson(backup({ buckets: [bucket('b1')], transactions: [tx('t2'), tx('t3')] }));
    const q = await queue();
    expect(q).toEqual(expect.arrayContaining(['buckets:b1|upsert', 'transactions:t1|delete', 'transactions:t2|upsert', 'transactions:t3|upsert']));
  });

  it('brings the account to exactly the imported data', async () => {
    const server = new FakeServer(() => 5_000_000_000_000);
    const ctx = { db, transport: server };
    await pushPending(ctx); // nothing yet: the queue was cleared
    await db.syncOutbox.clear();
    // The account already holds the old data.
    await importFromJson(backup({ buckets: [bucket('b1')], transactions: [tx('t1'), tx('t2')] }));
    await pushPending(ctx);
    await importFromJson(backup({ buckets: [bucket('b1')], transactions: [tx('t2'), tx('t3')] }));
    await pushPending(ctx);
    expect(server.live('transactions').map((r) => r.id).sort()).toEqual(['t2', 't3']);
    expect(server.live('buckets').map((r) => r.id)).toEqual(['b1']);
  });
});

describe('reset while linked', () => {
  it('queues a delete for every record', async () => {
    await resetAllData();
    expect(await queue()).toEqual(['buckets:b1|delete', 'transactions:t1|delete', 'transactions:t2|delete']);
    expect(await db.transactions.count()).toBe(0);
  });
});

describe('backups', () => {
  it('do not contain any sync bookkeeping', async () => {
    await db.transactions.put({ id: 't9', amount: 9, bucketId: 'b1', date: day });
    const exported = JSON.parse(await exportToJson());
    expect(Object.keys(exported.data).sort()).toEqual(
      ['buckets', 'incomes', 'investmentLots', 'investmentPrices', 'investmentSells', 'monthSnapshots', 'recurringTransactions', 'savingsGoals', 'settings', 'transactions'].sort()
    );
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/lib/sync/importReset.test.ts`
Expected: PASS (4 tests). These pin behavior that already holds; if one fails, a write path bypasses capture. Find it with the failing assertion, write a focused test next to the capture tests, and fix it there.

- [ ] **Step 3: Run the whole suite and type check**

Run: `npx vitest run && npm run check`
Expected: all PASS, 0 errors.

- [ ] **Step 4: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync-engine
git add tests/lib/sync/importReset.test.ts
git commit --no-gpg-sign -m "test(sync): import and reset reach the account through capture"
```

---

### Task 13: Verify nothing changed for signed-out use

**Files:** none unless a bug is found (then: a test, a fix, its own commit). Playwright output goes under the scratchpad and is deleted afterwards.

- [ ] **Step 1: Full checks**

Run: `npx vitest run && npm run check && npm run build`
Expected: all PASS, 0 errors, build succeeds.

- [ ] **Step 2: Baseline on main (database v12)**

Copy `~/Downloads/bdgt/budget-backup-2026-10-20.json` to the scratchpad as `real.json` (never open the original for writing). `git checkout main`, `npm run dev -- --port 5199`. In a fresh Playwright context (`timezoneId: 'America/New_York'`, `locale: 'en-US'`): confirm USD in the modal if shown, import `real.json` in Settings, then record, for October through April 2026 (the "Previous month" button), a hash and length of the dashboard text (`body.innerText` with whitespace collapsed), as in the groundwork check. Stop the server.

- [ ] **Step 3: Same profile on the branch (database v13)**

`git checkout feat/cloud-sync-engine` (confirm with `git branch --show-current`), `npm run dev -- --port 5199`, reload the same context, and check:
- `indexedDB.databases()` lists `BudgetDB` at version `130`.
- The seven monthly hashes equal the baseline, figure for figure.
- The object stores include `syncOutbox`, `syncVersions` and `syncState`, and all three are empty.
- Add a transaction, edit a note, delete a month note, and assign money in the Assign panel; reload. `syncOutbox` and `syncVersions` stay empty (capture is off), and there are no console errors.

- [ ] **Step 4: Clean up**

Stop the dev server, delete the scratchpad copies and any Playwright output, and confirm `git status --short` shows only `.claude/settings.local.json`.

- [ ] **Step 5: Commit any fixes**

```bash
git branch --show-current   # must print feat/cloud-sync-engine
git add -A src tests
git commit --no-gpg-sign -m "fix(sync): <what was found>"
```

Skip this step if nothing needed fixing.

---

## Handoff to plan 3

What plan 3 (Supabase wiring) builds on, and what it must honor:

- **Transport.** Implement `SyncTransport` (`accountState`, `upsert`, `pull`) over supabase-js and the SQL migrations. The SQL must reproduce `FakeServer`'s rules exactly: skip an update whose `updated_at` is older than the stored row (return it from neither), merge a newer or equal one, cap `updated_at` at the server clock plus 1 minute, set `synced_at` with `clock_timestamp()`, never change a row's owner. `accountState` returns `hasOtherRows` counting live rows in every table except `buckets` and `settings`.
- **Startup.** If `syncState.linkedAccount` is set, call `setCaptureEnabled(true)` before the first store load, then `checkAccount` and `syncOnce`. Without a link, do nothing: signed-out behavior must stay exactly as today.
- **Sign-in.** After Google returns a session, call `runFirstSignIn(ctx, user.id)`; on `needsChoice`, show the dialog, save `exportToJson()` as a download when the person picks "Use account data", then call it again with the choice.
- **Sign-out.** Push waiting changes; if `pendingChanges(db) > 0` warn first; then `signOutLocal(db)` and reload the stores.
- **Status.** Map `SyncOutcome` / `SyncFailure` statuses to the messages in the spec's failure table; `pendingChanges` and the parked entries (`syncOutbox` rows with `parked`) feed the Settings screen.
- **Import and Reset** need no code change; only their confirmation text changes when signed in.
- **Also required of the transport (found in review).**
  - Normalize every timestamp it returns to UTC with a fixed fractional width (for example `2026-10-20T12:34:56.123456+00:00`); the engine compares `synced_at` as strings and trims to milliseconds before `Date.parse`.
  - Map PostgREST "unknown column / schema cache" errors to `SyncError('schema')`, never `'rejected'`: a rejected batch is split down to single rows and every row ends up parked.
  - Run `checkAccount` at app start and on each sign-in, not only on first sign-in.
  - Hold the sync lock around `signOutLocal` so an in-flight `syncOnce` cannot refill a signed-out device.
  - `pendingChanges` counts parked and waiting entries together; the status screen needs the parked ones separately (`syncOutbox` rows with `parked`).
