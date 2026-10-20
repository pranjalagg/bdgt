# Cloud Sync Groundwork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the local data for sync without adding sync itself. Month records are split into per-allocation and per-note rows (Dexie v11 and v12) with backups unchanged, recurring occurrences get stable ids, and real-Dexie tests become possible.

**Architecture:**
- Two new Dexie tables replace `monthSnapshots`: `allocations` (one row per month per bucket) and `monthNotes` (one row per note).
- Pure helpers in `src/lib/utils/monthRecords.ts` convert between whole month records, which the app keeps using in memory, and these rows. The derived budget stores don't change.
- Export rebuilds month records and import splits them, so the backup format stays version 1.
- `processRecurring` gives each occurrence the id `recurringId:YYYY-MM-DD` and never overwrites an occurrence that already exists.

**Tech Stack:** SvelteKit 5 (Svelte 4 component syntax), TypeScript, Dexie 4, Vitest 4 (jsdom), `fake-indexeddb` (new, tests only).

**Spec:** `docs/superpowers/specs/2026-10-20-cloud-sync-design.md`, sections "Local database (Dexie v11)", "Domain changes" (recurring occurrences) and "Rollout" (pull request 1). Plan 2 (sync) follows after this one merges.

## Global Constraints

- **No data lost in the migration.** Every transaction, income, bucket, recurring item, goal, investment record and setting is untouched, and every allocation and month note is carried over.
- **Backup format unchanged.** Export `version` stays `1` with a `monthSnapshots` section of `{ month, incomeTotal, allocations, spent, rollovers, notes? }`. Old backups import, and new exports open in older app versions.
- **Your real backups are read-only.** Work on copies in the scratchpad.
- **Commits:** `git commit --no-gpg-sign`, with no Co-Authored-By or AI attribution lines (the user's rule overrides any reminder).
- **Branch:** `feat/cloud-sync`. Run `git branch --show-current` before each commit, because another session switched this repo's branch once before.
- **Commands:** tests `npx vitest run`; types `npm run check`; build `npm run build`.

## Rulings made while planning

- **Two items move from groundwork to plan 2.** The default-bucket seeding rule depends on sign-in state, and the hidden sync tables serve the capture middleware; neither exists until plan 2. Cost if wrong: none; both land with the code that uses them.
- **Two Dexie versions.** v11 adds the new tables and copies data while the old table still exists; v12 drops `monthSnapshots`. Splitting removes any doubt about reading a table in the same version that deletes it. Cost: one extra schema block.
- **Empty month records are not migrated** (no allocations, no notes; produced by adding then deleting a month's only note). Their only effect was to stretch the rollover date range back to a month with no activity. Your latest backup has none.
- **Stale month fields are dropped.** `incomeTotal`, `spent` and `rollovers` are never read. Your backup holds stale `spent` maps for 2026-06, 2026-07 and 2026-08 that no longer match the transactions. A pre-upgrade backup keeps them.
- **Non-finite allocation values are dropped** during the split. They could only produce NaN balances.
- **An occurrence id that already exists is skipped, never overwritten,** so an edited occurrence survives a re-run, and the due date still advances.
- **`fake-indexeddb` is pinned at exactly `6.2.5`.** `6.2.6` was published 2026-10-16, four days ago, and too new to trust for supply-chain safety.

## Review Focus

Each is pinned by a test in the task named in brackets.

- A month with notes but no allocations still gets a month record, so it keeps anchoring the rollover range exactly as before. [Task 2, Task 4]
- Real data shows identical budget numbers before and after the migration. [Task 8]
- Deleting a month's last note, when the month has no allocations, removes the month now and after a reload alike, so the session and the next load agree. [Task 2, Task 4]
- A hand-edited backup with a repeated month or a repeated note id imports without a constraint error. [Task 5]
- Recurring catch-up when an occurrence id already exists: no constraint error, the existing record is unchanged, and the due date advances. [Task 7]
- A new export has the exact old month-record shape. [Task 5]

## File Structure

| File | Responsibility |
|------|----------------|
| `tests/helpers/realDb.ts` (create) | Reset the real Dexie database between tests (fake IndexedDB) |
| `src/lib/types.ts` (modify) | `AllocationRow`, `MonthNoteRow` |
| `src/lib/utils/monthRecords.ts` (create) | Split and compose month records; in-memory month updates |
| `src/lib/db/index.ts` (modify) | v11 (new tables plus copy), v12 (drop `monthSnapshots`) |
| `src/lib/stores/budgetStore.ts` (modify) | Load, allocations and notes on the new tables |
| `src/lib/utils/export.ts` (modify) | Export composes, import splits, reset clears the new tables |
| `src/lib/utils/dates.ts` (modify) | `getLocalDateKey` |
| `src/lib/stores/recurringStore.ts` (modify) | `occurrenceId`; skip existing occurrences |

---

### Task 1: Real Dexie in tests

**Files:**
- Create: `tests/helpers/realDb.ts`
- Test: `tests/lib/db/realDb.test.ts`
- Modify: `package.json`, `package-lock.json` (dev dependency)

**Interfaces:**
- Consumes: `db` from `$lib/db`.
- Produces: `resetRealDb(): Promise<void>` (closes `db`, deletes `BudgetDB`, reopens at the latest version). Real-database test files start with `import 'fake-indexeddb/auto';` as their first import.

- [ ] **Step 1: Write the failing test**

`tests/lib/db/realDb.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '$lib/db';
import { resetRealDb } from '../../helpers/realDb';

describe('real Dexie database in tests', () => {
  beforeEach(resetRealDb);

  it('stores and reads back a record with its Date intact', async () => {
    await db.transactions.add({ id: 't1', amount: 500, bucketId: 'b1', date: new Date(2026, 9, 20) });
    const t = await db.transactions.get('t1');
    expect(t?.date).toBeInstanceOf(Date);
    expect(t?.date.getDate()).toBe(20);
  });

  it('starts each test from an empty database', async () => {
    expect(await db.transactions.count()).toBe(0);
  });
});
```

`tests/helpers/realDb.ts`:

```ts
import Dexie from 'dexie';
import { db } from '$lib/db';

// Each real-database test starts from an empty BudgetDB at the latest schema.
export async function resetRealDb(): Promise<void> {
  db.close();
  await Dexie.delete('BudgetDB');
  await db.open();
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/lib/db/realDb.test.ts`
Expected: FAIL, `Failed to resolve import "fake-indexeddb/auto"`.

- [ ] **Step 3: Install the pinned dev dependency**

Run: `npm install --save-dev --save-exact fake-indexeddb@6.2.5`
Expected: `package.json` devDependencies gains `"fake-indexeddb": "6.2.5"`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/lib/db/realDb.test.ts && npx vitest run && npm run check`
Expected: 2 new tests PASS; full suite PASS; 0 errors.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync
git add package.json package-lock.json tests/helpers/realDb.ts tests/lib/db/realDb.test.ts
git commit --no-gpg-sign -m "test: run the real Dexie database in tests with fake-indexeddb"
```

---

### Task 2: Month record helpers

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/utils/monthRecords.ts`
- Test: `tests/lib/utils/monthRecords.test.ts`

**Interfaces:**
- Consumes: `normalizeMonthNotes` from `./monthNotes`; `MonthNote`, `MonthSnapshot` types.
- Produces:
  - `interface AllocationRow { id: string; month: string; bucketId: string; amount: number }`
  - `interface MonthNoteRow extends MonthNote { month: string }`
  - `allocationId(month: string, bucketId: string): string` (returns `` `${month}:${bucketId}` ``)
  - `allocationRow(month: string, bucketId: string, amount: number): AllocationRow`
  - `splitSnapshots(snapshots: unknown[]): { allocations: AllocationRow[]; notes: MonthNoteRow[] }`
  - `composeSnapshots(allocations: AllocationRow[], notes: MonthNoteRow[]): MonthSnapshot[]`
  - `updateMonth(snapshots: MonthSnapshot[], month: string, change: (s: MonthSnapshot) => MonthSnapshot): MonthSnapshot[]`
  - `replaceNote(snapshots: MonthSnapshot[], id: string, changes: Pick<MonthNote, 'text' | 'effect'>): MonthSnapshot[]`
  - `removeNote(snapshots: MonthSnapshot[], id: string): MonthSnapshot[]`

- [ ] **Step 1: Write the failing tests**

`tests/lib/utils/monthRecords.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  allocationId,
  allocationRow,
  splitSnapshots,
  composeSnapshots,
  updateMonth,
  replaceNote,
  removeNote,
} from '$lib/utils/monthRecords';
import type { MonthSnapshot } from '$lib/types';

const month = (m: string, over: Partial<MonthSnapshot> = {}): MonthSnapshot => ({
  month: m, incomeTotal: 0, allocations: {}, spent: {}, rollovers: {}, ...over,
});
const note = (id: string, createdAt: number, text = id) => ({ id, text, effect: 'none' as const, createdAt });

describe('allocation rows', () => {
  it('ids an allocation by month and bucket', () => {
    expect(allocationId('2026-09', 'b1')).toBe('2026-09:b1');
    expect(allocationRow('2026-09', 'b1', 500)).toEqual({ id: '2026-09:b1', month: '2026-09', bucketId: 'b1', amount: 500 });
  });
});

describe('splitSnapshots', () => {
  it('turns each allocation and note into its own row', () => {
    const { allocations, notes } = splitSnapshots([
      month('2026-09', { allocations: { b1: 50000, b2: 0 }, notes: [note('n1', 5, 'Trip')] }),
    ]);
    expect(allocations).toEqual([
      { id: '2026-09:b1', month: '2026-09', bucketId: 'b1', amount: 50000 },
      { id: '2026-09:b2', month: '2026-09', bucketId: 'b2', amount: 0 },
    ]);
    expect(notes).toEqual([{ id: 'n1', text: 'Trip', effect: 'none', createdAt: 5, month: '2026-09' }]);
  });

  it('ignores the never-read incomeTotal, spent and rollovers', () => {
    const { allocations, notes } = splitSnapshots([
      month('2026-06', { incomeTotal: 736817, spent: { b1: 1234 }, rollovers: { b1: 9 } }),
    ]);
    expect(allocations).toEqual([]);
    expect(notes).toEqual([]);
  });

  it('drops a non-finite allocation and malformed notes, keeping the rest', () => {
    const { allocations, notes } = splitSnapshots([
      month('2026-09', {
        allocations: { ok: 100, nan: Number.NaN, inf: Infinity, str: '5' as unknown as number },
        notes: [note('n1', 1), { text: 'no id' } as never, note('n2', 2, '   ')],
      }),
    ]);
    expect(allocations.map((a) => a.bucketId)).toEqual(['ok']);
    expect(notes.map((n) => n.id)).toEqual(['n1']);
  });

  it('skips records without a month and non-objects', () => {
    expect(splitSnapshots([null, 5, { allocations: { b1: 1 } }])).toEqual({ allocations: [], notes: [] });
  });
});

describe('composeSnapshots', () => {
  it('rebuilds one month record per month, in month order, with the old shape', () => {
    const snapshots = composeSnapshots(
      [allocationRow('2026-10', 'b1', 60000), allocationRow('2026-09', 'b1', 50000), allocationRow('2026-09', 'b2', 1)],
      [{ ...note('n2', 9), month: '2026-09' }, { ...note('n1', 5), month: '2026-09' }]
    );
    expect(snapshots).toEqual([
      month('2026-09', { allocations: { b1: 50000, b2: 1 }, notes: [note('n1', 5), note('n2', 9)] }),
      month('2026-10', { allocations: { b1: 60000 } }),
    ]);
    expect(snapshots[1]).not.toHaveProperty('notes');
  });

  it('keeps a month that has only notes, so it still anchors the rollover range', () => {
    expect(composeSnapshots([], [{ ...note('n1', 1), month: '2026-02' }])).toEqual([
      month('2026-02', { notes: [note('n1', 1)] }),
    ]);
  });

  it('round-trips clean month records through split and compose', () => {
    const original = [
      month('2026-08', { notes: [note('a', 1)] }),
      month('2026-09', { allocations: { b1: 1, b2: 2 }, notes: [note('b', 2), note('c', 3)] }),
    ];
    const { allocations, notes } = splitSnapshots(original);
    expect(composeSnapshots(allocations, notes)).toEqual(original);
  });
});

describe('updateMonth', () => {
  it('creates the month when it has no record yet', () => {
    const next = updateMonth([], '2026-03', (s) => ({ ...s, allocations: { b1: 5 } }));
    expect(next).toEqual([month('2026-03', { allocations: { b1: 5 } })]);
  });

  it('replaces only the named month', () => {
    const before = [month('2026-02', { allocations: { b1: 1 } }), month('2026-03', { allocations: { b1: 2 } })];
    const next = updateMonth(before, '2026-03', (s) => ({ ...s, allocations: { ...s.allocations, b2: 3 } }));
    expect(next).toEqual([month('2026-02', { allocations: { b1: 1 } }), month('2026-03', { allocations: { b1: 2, b2: 3 } })]);
  });

  it('removes a month left with no allocations and no notes, as a reload would', () => {
    const before = [month('2026-03', { notes: [note('n1', 1)] })];
    expect(updateMonth(before, '2026-03', (s) => ({ ...s, notes: [] }))).toEqual([]);
  });

  it('adds nothing for a no-op change on a month without a record', () => {
    expect(updateMonth([], '2026-03', (s) => s)).toEqual([]);
  });
});

describe('replaceNote and removeNote', () => {
  const before = [
    month('2026-02', { allocations: { b1: 1 }, notes: [note('n1', 1)] }),
    month('2026-03', { notes: [note('n2', 2), note('n3', 3)] }),
  ];

  it('edits the named note wherever it is', () => {
    const next = replaceNote(before, 'n3', { text: 'Bonus', effect: 'up' });
    expect(next[1].notes).toEqual([note('n2', 2), { id: 'n3', text: 'Bonus', effect: 'up', createdAt: 3 }]);
    expect(next[0]).toBe(before[0]);
  });

  it('removes the named note and keeps a month that still has allocations', () => {
    const next = removeNote(before, 'n1');
    expect(next[0]).toEqual(month('2026-02', { allocations: { b1: 1 }, notes: [] }));
  });

  it('removes a month whose last note went and which has no allocations', () => {
    const once = removeNote(before, 'n2');
    expect(removeNote(once, 'n3').map((s) => s.month)).toEqual(['2026-02']);
  });

  it('leaves everything alone for an unknown id', () => {
    expect(replaceNote(before, 'nope', { text: 'x', effect: 'none' })).toBe(before);
    expect(removeNote(before, 'nope')).toBe(before);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/utils/monthRecords.test.ts`
Expected: FAIL, module `$lib/utils/monthRecords` not found.

- [ ] **Step 3: Add the types**

In `src/lib/types.ts`, directly after `interface MonthSnapshot { ... }`:

```ts
// One explicit assignment: `amount` cents for one bucket in one month. Month
// records are stored as these rows (and MonthNoteRow) so each can sync on
// its own; the app still works with whole MonthSnapshots in memory.
export interface AllocationRow {
  id: string; // `${month}:${bucketId}`
  month: string; // YYYY-MM
  bucketId: string;
  amount: number; // cents
}

export interface MonthNoteRow extends MonthNote {
  month: string; // YYYY-MM
}
```

- [ ] **Step 4: Implement the helpers**

`src/lib/utils/monthRecords.ts`:

```ts
import { normalizeMonthNotes } from './monthNotes';
import type { AllocationRow, MonthNote, MonthNoteRow, MonthSnapshot } from '$lib/types';

// Month records used to be one row per month holding every allocation and
// note. Sync needs finer rows (two devices assigning different buckets in
// the same month must not overwrite each other), so they are stored as one
// row per allocation and one per note. The app keeps whole month records in
// memory; these helpers convert between the two shapes.

export function allocationId(month: string, bucketId: string): string {
  return `${month}:${bucketId}`;
}

export function allocationRow(month: string, bucketId: string, amount: number): AllocationRow {
  return { id: allocationId(month, bucketId), month, bucketId, amount };
}

// From stored or imported month records. Only allocations and notes carry
// meaning: incomeTotal, spent and rollovers were never read (and are stale
// in some older records). A non-finite allocation is dropped, and a month
// with neither allocations nor notes produces no rows.
export function splitSnapshots(snapshots: unknown[]): { allocations: AllocationRow[]; notes: MonthNoteRow[] } {
  const allocations: AllocationRow[] = [];
  const notes: MonthNoteRow[] = [];
  for (const raw of snapshots) {
    if (!raw || typeof raw !== 'object') continue;
    const { month, allocations: rawAllocations, notes: rawNotes } = raw as Record<string, unknown>;
    if (typeof month !== 'string') continue;
    if (rawAllocations && typeof rawAllocations === 'object') {
      for (const [bucketId, amount] of Object.entries(rawAllocations as Record<string, unknown>)) {
        if (typeof amount === 'number' && Number.isFinite(amount)) {
          allocations.push(allocationRow(month, bucketId, amount));
        }
      }
    }
    for (const note of normalizeMonthNotes(rawNotes)) notes.push({ ...note, month });
  }
  return { allocations, notes };
}

function blankMonth(month: string): MonthSnapshot {
  return { month, incomeTotal: 0, allocations: {}, spent: {}, rollovers: {} };
}

function isEmptyMonth(s: MonthSnapshot): boolean {
  return Object.keys(s.allocations).length === 0 && (s.notes?.length ?? 0) === 0;
}

// Back to whole month records: one per month that has an allocation or a
// note, in month order, notes in entry order.
export function composeSnapshots(allocations: AllocationRow[], notes: MonthNoteRow[]): MonthSnapshot[] {
  const byMonth = new Map<string, MonthSnapshot>();
  const monthOf = (m: string): MonthSnapshot => {
    let s = byMonth.get(m);
    if (!s) {
      s = blankMonth(m);
      byMonth.set(m, s);
    }
    return s;
  };
  for (const a of allocations) monthOf(a.month).allocations[a.bucketId] = a.amount;
  for (const { month, ...note } of notes) (monthOf(month).notes ??= []).push(note);
  for (const s of byMonth.values()) {
    s.notes?.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

// Applies `change` to one month (a blank one when it has no record yet). A
// month left with no allocations and no notes is removed, which is what
// composeSnapshots produces on the next load.
export function updateMonth(
  snapshots: MonthSnapshot[],
  month: string,
  change: (s: MonthSnapshot) => MonthSnapshot
): MonthSnapshot[] {
  const idx = snapshots.findIndex((s) => s.month === month);
  const next = change(idx >= 0 ? snapshots[idx] : blankMonth(month));
  if (isEmptyMonth(next)) return snapshots.filter((s) => s.month !== month);
  if (idx < 0) return [...snapshots, next];
  const copy = [...snapshots];
  copy[idx] = next;
  return copy;
}

function monthOfNote(snapshots: MonthSnapshot[], id: string): string | undefined {
  return snapshots.find((s) => s.notes?.some((n) => n.id === id))?.month;
}

export function replaceNote(
  snapshots: MonthSnapshot[],
  id: string,
  changes: Pick<MonthNote, 'text' | 'effect'>
): MonthSnapshot[] {
  const month = monthOfNote(snapshots, id);
  if (month === undefined) return snapshots;
  return updateMonth(snapshots, month, (s) => ({
    ...s,
    notes: s.notes?.map((n) => (n.id === id ? { ...n, ...changes } : n)),
  }));
}

export function removeNote(snapshots: MonthSnapshot[], id: string): MonthSnapshot[] {
  const month = monthOfNote(snapshots, id);
  if (month === undefined) return snapshots;
  return updateMonth(snapshots, month, (s) => ({ ...s, notes: s.notes?.filter((n) => n.id !== id) }));
}
```

- [ ] **Step 5: Run tests and type check**

Run: `npx vitest run tests/lib/utils/monthRecords.test.ts && npx vitest run && npm run check`
Expected: all PASS, 0 errors.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync
git add src/lib/types.ts src/lib/utils/monthRecords.ts tests/lib/utils/monthRecords.test.ts
git commit --no-gpg-sign -m "feat(data): helpers to split month records into allocation and note rows"
```

---

### Task 3: Dexie v11, new tables and the copy

**Files:**
- Modify: `src/lib/db/index.ts`
- Test: `tests/lib/db/monthSplitMigration.test.ts`

**Interfaces:**
- Consumes: `splitSnapshots` (Task 2); `AllocationRow`, `MonthNoteRow` types.
- Produces: `db.allocations: Table<AllocationRow, string>` (indexes `month`, `bucketId`), `db.monthNotes: Table<MonthNoteRow, string>` (index `month`). `db.monthSnapshots` still exists until Task 6.

- [ ] **Step 1: Write the failing test**

`tests/lib/db/monthSplitMigration.test.ts`:

```ts
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '$lib/db';

// The v10 schema exactly as shipped, to build a database the way an
// existing user has it before opening it with the current app.
const V10 = {
  buckets: 'id, name, order',
  transactions: 'id, bucketId, date, recurringId',
  recurringTransactions: 'id, bucketId, nextDueDate, isActive',
  incomes: 'id, date',
  monthSnapshots: 'month',
  savingsGoals: 'id, bucketId',
  investmentLots: 'id, symbol, purchaseDate',
  investmentSells: 'id, lotId, sellDate',
  investmentPrices: 'symbol',
  settings: 'key',
};

async function seedV10(seed: (old: Dexie) => Promise<void>): Promise<void> {
  db.close();
  await Dexie.delete('BudgetDB');
  const old = new Dexie('BudgetDB');
  old.version(10).stores(V10);
  await old.open();
  await seed(old);
  old.close();
}

describe('month record split migration', () => {
  beforeEach(async () => {
    db.close();
    await Dexie.delete('BudgetDB');
  });

  it('copies every allocation and note into their own rows and keeps all other data', async () => {
    await seedV10(async (old) => {
      await old.table('monthSnapshots').bulkAdd([
        {
          month: '2026-06', incomeTotal: 0, allocations: { b1: 50000, b2: 0 }, spent: { b1: 999 }, rollovers: {},
          notes: [{ id: 'n1', text: 'Family visit', effect: 'down', createdAt: 5 }],
        },
        { month: '2026-07', incomeTotal: 0, allocations: {}, spent: {}, rollovers: {}, notes: [{ id: 'n2', text: 'Bonus', effect: 'up', createdAt: 6 }] },
        { month: '2025-01', incomeTotal: 0, allocations: {}, spent: {}, rollovers: {}, notes: [] },
        { month: '2026-08', incomeTotal: 0, allocations: { bad: Number.NaN, b1: 1 }, spent: {}, rollovers: {} },
      ]);
      await old.table('transactions').add({ id: 't1', amount: 500, bucketId: 'b1', date: new Date(2026, 5, 3) });
      await old.table('settings').bulkAdd([{ key: 'baseCurrency', value: 'USD' }, { key: 'currencyConfirmed', value: true }]);
    });

    await db.open();

    expect((await db.allocations.toArray()).sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: '2026-06:b1', month: '2026-06', bucketId: 'b1', amount: 50000 },
      { id: '2026-06:b2', month: '2026-06', bucketId: 'b2', amount: 0 },
      { id: '2026-08:b1', month: '2026-08', bucketId: 'b1', amount: 1 },
    ]);
    expect((await db.monthNotes.toArray()).sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: 'n1', month: '2026-06', text: 'Family visit', effect: 'down', createdAt: 5 },
      { id: 'n2', month: '2026-07', text: 'Bonus', effect: 'up', createdAt: 6 },
    ]);
    expect(await db.transactions.count()).toBe(1);
    expect((await db.transactions.get('t1'))?.date).toBeInstanceOf(Date);
    expect(await db.settings.count()).toBe(2);
  });

  it('opens a brand-new database with empty month tables', async () => {
    await db.open();
    expect(await db.allocations.count()).toBe(0);
    expect(await db.monthNotes.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/lib/db/monthSplitMigration.test.ts`
Expected: FAIL (`db.allocations` is undefined, or a type error about missing `allocations`).

- [ ] **Step 3: Implement v11**

In `src/lib/db/index.ts`:

1. Add the import next to the existing ones:

```ts
import { splitSnapshots } from '$lib/utils/monthRecords';
```

2. Add `AllocationRow, MonthNoteRow` to the `import type { ... } from '$lib/types';` list.

3. Add after the `settings!: Table<SettingRow, string>;` field:

```ts
  allocations!: Table<AllocationRow, string>;
  monthNotes!: Table<MonthNoteRow, string>;
```

4. Add after the `this.version(10)...` block (inside the constructor):

```ts
    // v11: month records split into one row per bucket allocation and one
    // per note, so each can sync on its own. The old table is copied here
    // and dropped in v12, once nothing reads it.
    this.version(11).stores({
      buckets: 'id, name, order',
      transactions: 'id, bucketId, date, recurringId',
      recurringTransactions: 'id, bucketId, nextDueDate, isActive',
      incomes: 'id, date',
      monthSnapshots: 'month',
      savingsGoals: 'id, bucketId',
      investmentLots: 'id, symbol, purchaseDate',
      investmentSells: 'id, lotId, sellDate',
      investmentPrices: 'symbol',
      settings: 'key',
      allocations: 'id, month, bucketId',
      monthNotes: 'id, month'
    }).upgrade(async tx => {
      const { allocations, notes } = splitSnapshots(await tx.table('monthSnapshots').toArray());
      await tx.table('allocations').bulkPut(allocations);
      await tx.table('monthNotes').bulkPut(notes);
    });
```

- [ ] **Step 4: Run tests and type check**

Run: `npx vitest run tests/lib/db/monthSplitMigration.test.ts && npx vitest run && npm run check`
Expected: all PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync
git add src/lib/db/index.ts tests/lib/db/monthSplitMigration.test.ts
git commit --no-gpg-sign -m "feat(data): copy month records into allocation and note tables (db v11)"
```

---

### Task 4: Store reads and writes the new tables

**Files:**
- Modify: `src/lib/stores/budgetStore.ts`
- Modify: `tests/lib/stores/budgetStore.test.ts`
- Test: `tests/lib/stores/monthRecordsDb.test.ts`

**Interfaces:**
- Consumes: `allocationRow`, `composeSnapshots`, `updateMonth`, `replaceNote`, `removeNote` (Task 2); `db.allocations`, `db.monthNotes` (Task 3).
- Produces: unchanged public API (`loadData`, `setAllocation`, `setAllocations`, `addMonthNote`, `updateMonthNote`, `deleteMonthNote`, `monthSnapshots` store with the same shape). After this task nothing in the store touches `db.monthSnapshots`.

- [ ] **Step 1: Update the mocked store tests (RED)**

In `tests/lib/stores/budgetStore.test.ts`:

1. In the `vi.mock('$lib/db', ...)` factory, replace the whole `monthSnapshots: { get, put, toArray }` entry with:

```ts
    allocations: {
      bulkPut: vi.fn().mockResolvedValue(undefined),
      toArray: vi.fn().mockResolvedValue([]),
    },
    monthNotes: {
      add: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(1),
      delete: vi.fn().mockResolvedValue(undefined),
      toArray: vi.fn().mockResolvedValue([]),
    },
```

2. Add `addMonthNote, updateMonthNote, deleteMonthNote` to the import list from `$lib/stores/budgetStore`.

3. Replace every remaining `expect(db.monthSnapshots.put).not.toHaveBeenCalled();` with `expect(db.allocations.bulkPut).not.toHaveBeenCalled();`, and delete the line `vi.mocked(db.monthSnapshots.get).mockResolvedValue(undefined as never);` and the comment lines above it in the `carryForwardAllocations` `beforeEach`.

4. Replace the tests `'writes every bucket in one snapshot put'` and `'merges into allocations already set for the month'` with:

```ts
  it('writes one row per bucket in a single bulkPut', async () => {
    await setAllocations({ b1: 50000, b2: 25000 });

    expect(db.allocations.bulkPut).toHaveBeenCalledTimes(1);
    expect(db.allocations.bulkPut).toHaveBeenCalledWith([
      { id: '2026-03:b1', month: '2026-03', bucketId: 'b1', amount: 50000 },
      { id: '2026-03:b2', month: '2026-03', bucketId: 'b2', amount: 25000 },
    ]);
    expect(get(monthSnapshots)[0].allocations).toEqual({ b1: 50000, b2: 25000 });
  });

  it('merges into allocations already set for the month, writing only the changed bucket', async () => {
    monthSnapshots.set([
      { month: '2026-03', incomeTotal: 0, allocations: { b1: 10000, keep: 700 }, spent: {}, rollovers: {} },
    ]);

    await setAllocations({ b1: 50000 });

    expect(db.allocations.bulkPut).toHaveBeenCalledWith([
      { id: '2026-03:b1', month: '2026-03', bucketId: 'b1', amount: 50000 },
    ]);
    expect(get(monthSnapshots)[0].allocations).toEqual({ b1: 50000, keep: 700 });
  });
```

5. In `describe('carryForwardAllocations')`, replace the bodies' assertions that read `vi.mocked(db.monthSnapshots.put).mock.calls[0][0]`:

```ts
  it('copies the previous month\'s allocations into the current month', async () => {
    monthSnapshots.set([
      { month: '2026-02', incomeTotal: 0, allocations: { b1: 50000, b2: 25000 }, spent: {}, rollovers: {} },
    ]);

    const count = await carryForwardAllocations();

    expect(count).toBe(2);
    expect(db.allocations.bulkPut).toHaveBeenCalledWith([
      { id: '2026-03:b1', month: '2026-03', bucketId: 'b1', amount: 50000 },
      { id: '2026-03:b2', month: '2026-03', bucketId: 'b2', amount: 25000 },
    ]);
  });
```

```ts
  it('skips allocations for buckets that no longer exist', async () => {
    monthSnapshots.set([
      { month: '2026-02', incomeTotal: 0, allocations: { b1: 50000, deleted: 9999 }, spent: {}, rollovers: {} },
    ]);

    const count = await carryForwardAllocations();

    expect(count).toBe(1);
    expect(db.allocations.bulkPut).toHaveBeenCalledWith([
      { id: '2026-03:b1', month: '2026-03', bucketId: 'b1', amount: 50000 },
    ]);
  });
```

6. Append:

```ts
describe('month notes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentMonthKey.set('2026-03');
    monthSnapshots.set([]);
  });

  it('adds a note as its own row and shows it on the month', async () => {
    await addMonthNote('  Family visit ', 'down');

    const row = vi.mocked(db.monthNotes.add).mock.calls[0][0] as { month: string; text: string; effect: string };
    expect(row).toMatchObject({ month: '2026-03', text: 'Family visit', effect: 'down' });
    expect(get(monthSnapshots)[0].notes?.map((n) => n.text)).toEqual(['Family visit']);
  });

  it('edits only the note it names', async () => {
    monthSnapshots.set([{
      month: '2026-03', incomeTotal: 0, allocations: {}, spent: {}, rollovers: {},
      notes: [{ id: 'n1', text: 'A', effect: 'none', createdAt: 1 }, { id: 'n2', text: 'B', effect: 'none', createdAt: 2 }],
    }]);

    await updateMonthNote('n2', 'Bonus', 'up');

    expect(db.monthNotes.update).toHaveBeenCalledWith('n2', { text: 'Bonus', effect: 'up' });
    expect(get(monthSnapshots)[0].notes).toEqual([
      { id: 'n1', text: 'A', effect: 'none', createdAt: 1 },
      { id: 'n2', text: 'Bonus', effect: 'up', createdAt: 2 },
    ]);
  });

  it('drops a month left with no notes and no allocations', async () => {
    monthSnapshots.set([{
      month: '2026-03', incomeTotal: 0, allocations: {}, spent: {}, rollovers: {},
      notes: [{ id: 'n1', text: 'A', effect: 'none', createdAt: 1 }],
    }]);

    await deleteMonthNote('n1');

    expect(db.monthNotes.delete).toHaveBeenCalledWith('n1');
    expect(get(monthSnapshots)).toEqual([]);
  });

  it('rejects an empty note without writing', async () => {
    await expect(addMonthNote('   ', 'none')).rejects.toThrow(/empty/i);
    expect(db.monthNotes.add).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write the real-database store test**

`tests/lib/stores/monthRecordsDb.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { db } from '$lib/db';
import { loadData, monthSnapshots, setAllocation, setAllocations, addMonthNote, deleteMonthNote } from '$lib/stores/budgetStore';
import { currentMonthKey } from '$lib/stores/uiStore';
import { resetRealDb } from '../../helpers/realDb';

describe('month records in the real database', () => {
  beforeEach(async () => {
    await resetRealDb();
    currentMonthKey.set('2026-03');
    monthSnapshots.set([]);
  });

  it('persists allocations and notes as rows and rebuilds the month on load', async () => {
    await setAllocations({ b1: 50000 });
    await setAllocation('b2', 25000);
    await addMonthNote('Trip', 'down');

    expect(await db.allocations.count()).toBe(2);
    expect(await db.monthNotes.count()).toBe(1);

    monthSnapshots.set([]);
    await loadData();

    const march = get(monthSnapshots).find((s) => s.month === '2026-03');
    expect(march?.allocations).toEqual({ b1: 50000, b2: 25000 });
    expect(march?.notes?.map((n) => n.text)).toEqual(['Trip']);
  });

  it('forgets a month once its only note is deleted, before and after a reload', async () => {
    await addMonthNote('Trip', 'down');
    const id = get(monthSnapshots)[0].notes![0].id;

    await deleteMonthNote(id);
    expect(get(monthSnapshots)).toEqual([]);

    await loadData();
    expect(get(monthSnapshots)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run tests/lib/stores/budgetStore.test.ts tests/lib/stores/monthRecordsDb.test.ts`
Expected: FAIL. The mocked tests fail on `db.allocations.bulkPut` not being called. The real-database tests fail because rows are still written to `monthSnapshots`, so `db.allocations.count()` is 0.

- [ ] **Step 4: Implement**

In `src/lib/stores/budgetStore.ts`:

1. Add to the imports:

```ts
import { allocationRow, composeSnapshots, updateMonth, replaceNote, removeNote } from '$lib/utils/monthRecords';
```

2. In `loadData`, replace the `Promise.all` destructuring and the `db.monthSnapshots.toArray(),` entry:

```ts
  const [loadedBuckets, loadedTransactions, loadedIncomes, loadedAllocations, loadedNotes] = await Promise.all([
    db.buckets.orderBy('order').toArray(),
    db.transactions.toArray(),
    db.incomes.toArray(),
    db.allocations.toArray(),
    db.monthNotes.toArray(),
  ]);
```

and replace `monthSnapshots.set(loadedSnapshots);` with:

```ts
  monthSnapshots.set(composeSnapshots(loadedAllocations, loadedNotes));
```

3. Replace the whole of `setAllocation` and `setAllocations` (from the comment `// Records an explicit allocation for one bucket` through the end of `setAllocations`) with:

```ts
// Records an explicit allocation for one bucket in the current month,
// overriding the bucket's standing amount.
export async function setAllocation(bucketId: string, amount: number): Promise<void> {
  assertNonNegativeCents(amount, 'allocation');
  await writeAllocations(get(currentMonthKey), { [bucketId]: amount });
}

// Assigns several buckets at once — the "close the gap" gesture, where a
// user pushes the unassigned remainder across buckets in one go. One write
// for the whole batch, so a half-applied assignment can't happen;
// validation runs on everything before anything is written.
export async function setAllocations(allocations: Record<string, number>): Promise<void> {
  for (const [bucketId, amount] of Object.entries(allocations)) {
    assertNonNegativeCents(amount, `allocation for ${bucketId}`);
  }
  await writeAllocations(get(currentMonthKey), allocations);
}

// One row per bucket per month (see monthRecords.ts), so assignments to
// different buckets never overwrite each other.
async function writeAllocations(month: string, allocations: Record<string, number>): Promise<void> {
  await db.allocations.bulkPut(
    Object.entries(allocations).map(([bucketId, amount]) => allocationRow(month, bucketId, amount))
  );
  monthSnapshots.update((all) =>
    updateMonth(all, month, (s) => ({ ...s, allocations: { ...s.allocations, ...allocations } }))
  );
}
```

4. Replace everything from the comment `// Month notes live on the month's snapshot, so they ride along with` through the end of `deleteMonthNote` (this removes `mutateNotes`) with:

```ts
// Month notes are one row each (monthNotes table), so editing one never
// rewrites the others.
export async function addMonthNote(text: string, effect: MonthNoteEffect): Promise<void> {
  const cleaned = cleanNoteText(text);
  if (cleaned === null) throw new Error('Note cannot be empty');
  const month = get(currentMonthKey);
  const note: MonthNote = { id: crypto.randomUUID(), text: cleaned, effect, createdAt: Date.now() };
  await db.monthNotes.add({ ...note, month });
  monthSnapshots.update((all) =>
    updateMonth(all, month, (s) => ({ ...s, notes: [...normalizeMonthNotes(s.notes), note] }))
  );
}

export async function updateMonthNote(id: string, text: string, effect: MonthNoteEffect): Promise<void> {
  const cleaned = cleanNoteText(text);
  if (cleaned === null) throw new Error('Note cannot be empty');
  await db.monthNotes.update(id, { text: cleaned, effect });
  monthSnapshots.update((all) => replaceNote(all, id, { text: cleaned, effect }));
}

export async function deleteMonthNote(id: string): Promise<void> {
  await db.monthNotes.delete(id);
  monthSnapshots.update((all) => removeNote(all, id));
}
```

5. If `MonthSnapshot` is now unused in the `import type` line, keep it: `writable<MonthSnapshot[]>` still uses it. Run the type check to confirm no unused-import errors.

- [ ] **Step 5: Run tests and type check**

Run: `npx vitest run && npm run check`
Expected: all PASS, 0 errors.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync
git add src/lib/stores/budgetStore.ts tests/lib/stores/budgetStore.test.ts tests/lib/stores/monthRecordsDb.test.ts
git commit --no-gpg-sign -m "feat(data): store allocations and month notes as their own rows"
```

---

### Task 5: Backups compose and split month records

**Files:**
- Modify: `src/lib/utils/export.ts`
- Test: `tests/lib/utils/exportRoundTrip.test.ts`

**Interfaces:**
- Consumes: `composeSnapshots`, `splitSnapshots` (Task 2); `db.allocations`, `db.monthNotes` (Task 3).
- Produces: `exportToJson()` writes `monthSnapshots` composed from the two tables; `importFromJson()` clears and fills `allocations` and `monthNotes`; `resetAllData()` clears them. `parseImport` is unchanged.

- [ ] **Step 1: Write the failing test**

`tests/lib/utils/exportRoundTrip.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '$lib/db';
import { exportToJson, importFromJson, resetAllData } from '$lib/utils/export';
import { allocationRow } from '$lib/utils/monthRecords';
import { resetRealDb } from '../../helpers/realDb';

const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));

function backup(monthSnapshots: unknown[]): string {
  return JSON.stringify({
    version: 1,
    exportedAt: '2026-10-20T00:00:00.000Z',
    data: {
      buckets: [], transactions: [], recurringTransactions: [], incomes: [],
      monthSnapshots, savingsGoals: [], investmentLots: [], investmentSells: [], investmentPrices: [],
    },
  });
}

describe('backups with split month records', () => {
  beforeEach(resetRealDb);

  it('exports month records in the old shape, rebuilt from the rows', async () => {
    await db.allocations.bulkPut([allocationRow('2026-09', 'b1', 50000), allocationRow('2026-10', 'b1', 60000)]);
    await db.monthNotes.bulkPut([{ id: 'n1', month: '2026-09', text: 'Trip', effect: 'down', createdAt: 5 }]);

    const parsed = JSON.parse(await exportToJson());

    expect(parsed.version).toBe(1);
    expect(parsed.data.monthSnapshots).toEqual([
      {
        month: '2026-09', incomeTotal: 0, allocations: { b1: 50000 }, spent: {}, rollovers: {},
        notes: [{ id: 'n1', text: 'Trip', effect: 'down', createdAt: 5 }],
      },
      { month: '2026-10', incomeTotal: 0, allocations: { b1: 60000 }, spent: {}, rollovers: {} },
    ]);
  });

  it('round-trips through export, reset and import', async () => {
    await db.allocations.bulkPut([allocationRow('2026-09', 'b1', 50000), allocationRow('2026-09', 'b2', 0)]);
    await db.monthNotes.bulkPut([{ id: 'n1', month: '2026-08', text: 'Trip', effect: 'down', createdAt: 5 }]);
    const json = await exportToJson();

    await resetAllData();
    expect(await db.allocations.count()).toBe(0);
    expect(await db.monthNotes.count()).toBe(0);

    await importFromJson(json);
    expect(byId(await db.allocations.toArray())).toEqual([
      allocationRow('2026-09', 'b1', 50000),
      allocationRow('2026-09', 'b2', 0),
    ]);
    expect(await db.monthNotes.toArray()).toEqual([
      { id: 'n1', month: '2026-08', text: 'Trip', effect: 'down', createdAt: 5 },
    ]);
  });

  it('splits an older backup, dropping stale figures and empty months', async () => {
    await importFromJson(backup([
      { month: '2026-06', incomeTotal: 0, allocations: { b1: 1 }, spent: { b1: 999 }, rollovers: {} },
      { month: '2025-01', incomeTotal: 0, allocations: {}, spent: {}, rollovers: {}, notes: [] },
    ]));

    expect(await db.allocations.toArray()).toEqual([allocationRow('2026-06', 'b1', 1)]);
    expect(await db.monthNotes.count()).toBe(0);
  });

  it('imports a hand-edited backup with a repeated month and a repeated note id without failing', async () => {
    await importFromJson(backup([
      { month: '2026-06', incomeTotal: 0, allocations: { b1: 1 }, spent: {}, rollovers: {}, notes: [{ id: 'n1', text: 'A', effect: 'none', createdAt: 1 }] },
      { month: '2026-06', incomeTotal: 0, allocations: { b1: 2 }, spent: {}, rollovers: {}, notes: [{ id: 'n1', text: 'B', effect: 'none', createdAt: 2 }] },
    ]));

    expect(await db.allocations.toArray()).toEqual([allocationRow('2026-06', 'b1', 2)]);
    expect((await db.monthNotes.toArray()).map((n) => n.text)).toEqual(['B']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/lib/utils/exportRoundTrip.test.ts`
Expected: FAIL. Export reads the old `monthSnapshots` table (empty), import writes it, and the new tables stay empty.

- [ ] **Step 3: Implement**

In `src/lib/utils/export.ts`:

1. Add the import:

```ts
import { composeSnapshots, splitSnapshots } from './monthRecords';
```

2. In `exportToJson`, replace the `Promise.all` destructuring with:

```ts
  const [buckets, transactions, recurringTransactions, incomes, allocations, monthNotes, savingsGoals, investmentLots, investmentSells, investmentPrices] = await Promise.all([
    db.buckets.toArray(),
    db.transactions.toArray(),
    db.recurringTransactions.toArray(),
    db.incomes.toArray(),
    db.allocations.toArray(),
    db.monthNotes.toArray(),
    db.savingsGoals.toArray(),
    db.investmentLots.toArray(),
    db.investmentSells.toArray(),
    db.investmentPrices.toArray(),
  ]);
  // Backups keep the whole-month shape so older versions can read them.
  const monthSnapshots = composeSnapshots(allocations, monthNotes);
```

(the `data: { buckets, transactions, recurringTransactions, incomes, monthSnapshots, ... }` line stays as is).

3. Replace the `const COLLECTIONS = [ ... ] as const;` block with:

```ts
// Backup sections copied one-to-one into the table of the same name.
const PLAIN_TABLES = [
  'buckets',
  'transactions',
  'recurringTransactions',
  'incomes',
  'savingsGoals',
  'investmentLots',
  'investmentSells',
  'investmentPrices',
] as const;

// Every section a backup carries. Month records are split into the
// allocations and monthNotes tables on import and rebuilt on export.
const COLLECTIONS = [...PLAIN_TABLES, 'monthSnapshots'] as const;

function localTables() {
  return [...PLAIN_TABLES, 'allocations', 'monthNotes'].map((name) => db.table(name)).concat(db.settings);
}
```

4. Replace `importFromJson` and `resetAllData` with:

```ts
export async function importFromJson(json: string): Promise<void> {
  const { data } = parseImport(json);
  const { allocations, notes } = splitSnapshots(data.monthSnapshots);
  const tables = localTables();

  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()));
    for (const name of PLAIN_TABLES) {
      await db.table(name).bulkAdd((data as unknown as Record<string, unknown[]>)[name]);
    }
    // bulkPut: a hand-edited backup can repeat a month or a note id.
    await db.allocations.bulkPut(allocations);
    await db.monthNotes.bulkPut(notes);
    await db.settings.bulkAdd(settingsToRows(data.settings));
  });
}

export async function resetAllData(): Promise<void> {
  const tables = localTables();
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()));
  });
}
```

- [ ] **Step 4: Run tests and type check**

Run: `npx vitest run && npm run check`
Expected: all PASS (including the existing `parseImport` tests), 0 errors.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync
git add src/lib/utils/export.ts tests/lib/utils/exportRoundTrip.test.ts
git commit --no-gpg-sign -m "feat(data): backups rebuild and split month records"
```

---

### Task 6: Drop the old month table (v12)

**Files:**
- Modify: `src/lib/db/index.ts`
- Modify: `tests/lib/db/monthSplitMigration.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `db.verno === 12`; no `monthSnapshots` table or property.

- [ ] **Step 1: Add the failing assertions**

In `tests/lib/db/monthSplitMigration.test.ts`, at the end of the first test (`'copies every allocation and note ...'`) add:

```ts
    expect(db.verno).toBe(12);
    expect(db.tables.map((t) => t.name)).not.toContain('monthSnapshots');
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/lib/db/monthSplitMigration.test.ts`
Expected: FAIL, `expected 11 to be 12`.

- [ ] **Step 3: Implement**

In `src/lib/db/index.ts`:

1. After the v11 block add:

```ts
    // v12: the month table's contents now live in allocations and monthNotes.
    this.version(12).stores({
      buckets: 'id, name, order',
      transactions: 'id, bucketId, date, recurringId',
      recurringTransactions: 'id, bucketId, nextDueDate, isActive',
      incomes: 'id, date',
      monthSnapshots: null,
      savingsGoals: 'id, bucketId',
      investmentLots: 'id, symbol, purchaseDate',
      investmentSells: 'id, lotId, sellDate',
      investmentPrices: 'symbol',
      settings: 'key',
      allocations: 'id, month, bucketId',
      monthNotes: 'id, month'
    });
```

2. Delete the field `monthSnapshots!: Table<MonthSnapshot, string>;` and remove `MonthSnapshot` from the `import type { ... } from '$lib/types';` list.

- [ ] **Step 4: Run tests, type check and grep**

Run: `npx vitest run && npm run check && grep -rn "db.monthSnapshots" src || echo "no references"`
Expected: all PASS, 0 errors, `no references`.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync
git add src/lib/db/index.ts tests/lib/db/monthSplitMigration.test.ts
git commit --no-gpg-sign -m "feat(data): drop the old month table (db v12)"
```

---

### Task 7: Stable recurring occurrence ids

**Files:**
- Modify: `src/lib/utils/dates.ts`
- Modify: `src/lib/stores/recurringStore.ts`
- Test: `tests/lib/utils/dates.test.ts`, `tests/lib/stores/recurring.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `getLocalDateKey(date: Date): string` (local `YYYY-MM-DD`); `occurrenceId(recurringId: string, date: Date): string` (`` `${recurringId}:${getLocalDateKey(date)}` ``). `processRecurring()` returns the number of occurrences actually added.

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/utils/dates.test.ts` (add `getLocalDateKey` to its `$lib/utils/dates` import):

```ts
describe('getLocalDateKey', () => {
  it('is the local calendar day, zero-padded', () => {
    expect(getLocalDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('never shifts to the UTC day late in the evening', () => {
    expect(getLocalDateKey(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });
});
```

In `tests/lib/stores/recurring.test.ts`:

1. In the `vi.mock('$lib/db', ...)` factory change the `transactions` entry to:

```ts
    transactions: { bulkAdd: vi.fn().mockResolvedValue(undefined), bulkGet: vi.fn().mockResolvedValue([]) },
```

2. Change the first import line to `import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';`, the store import to `import { dueOccurrences, processRecurring, occurrenceId } from '$lib/stores/recurringStore';`, and add `import type { Transaction } from '$lib/types';`.

3. In the existing `describe('processRecurring')` `beforeEach`, add `vi.mocked(db.transactions.bulkGet).mockResolvedValue([]);`.

4. Append:

```ts
describe('occurrenceId', () => {
  it('is the recurring id plus the local day', () => {
    expect(occurrenceId('r1', new Date(2026, 0, 5, 23, 30))).toBe('r1:2026-01-05');
  });
});

describe('processRecurring with stable ids', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.transactions.bulkGet).mockResolvedValue([]);
    txState.recurring = [];
    transactions.set([]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 20, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives each occurrence its stable id, so another device makes the same record', async () => {
    txState.recurring = [
      { id: 'r1', amount: 500, bucketId: 'b1', frequency: 'monthly', nextDueDate: new Date(2026, 0, 15), isActive: true },
    ];

    await processRecurring();

    const added = vi.mocked(db.transactions.bulkAdd).mock.calls[0][0] as Transaction[];
    expect(added.map((t) => t.id)).toEqual(['r1:2026-01-15', 'r1:2026-02-15', 'r1:2026-03-15']);
  });

  it('skips an occurrence that already exists, never overwriting it, and still advances the due date', async () => {
    txState.recurring = [
      { id: 'r1', amount: 500, bucketId: 'b1', frequency: 'monthly', nextDueDate: new Date(2026, 2, 15), isActive: true },
    ];
    vi.mocked(db.transactions.bulkGet).mockResolvedValue([
      { id: 'r1:2026-03-15', amount: 999, bucketId: 'b1', date: new Date(2026, 2, 15) },
    ] as never);

    const count = await processRecurring();

    expect(count).toBe(0);
    expect(db.transactions.bulkAdd).not.toHaveBeenCalled();
    expect(db.recurringTransactions.update).toHaveBeenCalledWith('r1', { nextDueDate: new Date(2026, 3, 15) });
    expect(get(transactions)).toHaveLength(0);
  });

  it('adds only the missing occurrences when some exist', async () => {
    txState.recurring = [
      { id: 'r1', amount: 500, bucketId: 'b1', frequency: 'monthly', nextDueDate: new Date(2026, 1, 15), isActive: true },
    ];
    vi.mocked(db.transactions.bulkGet).mockResolvedValue([
      { id: 'r1:2026-02-15', amount: 500, bucketId: 'b1', date: new Date(2026, 1, 15) },
      undefined,
    ] as never);

    const count = await processRecurring();

    expect(count).toBe(1);
    const added = vi.mocked(db.transactions.bulkAdd).mock.calls[0][0] as Transaction[];
    expect(added.map((t) => t.id)).toEqual(['r1:2026-03-15']);
    expect(get(transactions).map((t) => t.id)).toEqual(['r1:2026-03-15']);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/utils/dates.test.ts tests/lib/stores/recurring.test.ts`
Expected: FAIL (`getLocalDateKey` and `occurrenceId` are not exported; ids are random UUIDs).

- [ ] **Step 3: Implement**

In `src/lib/utils/dates.ts`, after `parseLocalDate`:

```ts
// Local calendar day as YYYY-MM-DD. Not toISOString, which gives the UTC
// day and shifts it for anyone away from Greenwich.
export function getLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
```

In `src/lib/stores/recurringStore.ts`:

1. Change the dates import to `import { reviveDateFields, getLocalDateKey } from '$lib/utils/dates';`.

2. Add before `planRecurringBatch`:

```ts
// The same occurrence always gets the same id, so a device catching up on
// an occurrence another device already generated produces the same record
// instead of a duplicate.
export function occurrenceId(recurringId: string, date: Date): string {
  return `${recurringId}:${getLocalDateKey(date)}`;
}
```

3. In `planRecurringBatch`, change `id: crypto.randomUUID(),` to `id: occurrenceId(recurring.id, occurrence),`.

4. Replace the body of `processRecurring` from `const { newTransactions, dueUpdates } = planRecurringBatch(due, now);` to the end of the function with:

```ts
  const { newTransactions, dueUpdates } = planRecurringBatch(due, now);
  if (newTransactions.length === 0) return 0;

  // An occurrence that already exists (generated earlier, possibly edited
  // since) is kept as it is; only missing ones are added. The due dates
  // still advance.
  let added: Transaction[] = [];
  await db.transaction('rw', [db.transactions, db.recurringTransactions], async () => {
    const existing = await db.transactions.bulkGet(newTransactions.map((t) => t.id));
    added = newTransactions.filter((_, i) => !existing[i]);
    if (added.length > 0) await db.transactions.bulkAdd(added);
    for (const { id, nextDueDate } of dueUpdates) {
      await db.recurringTransactions.update(id, { nextDueDate });
    }
  });

  transactions.update((t) => [...t, ...added]);
  await loadRecurring();

  return added.length;
```

- [ ] **Step 4: Run tests and type check**

Run: `npx vitest run && npm run check`
Expected: all PASS (existing recurring tests unchanged), 0 errors.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync
git add src/lib/utils/dates.ts src/lib/stores/recurringStore.ts tests/lib/utils/dates.test.ts tests/lib/stores/recurring.test.ts
git commit --no-gpg-sign -m "feat(recurring): stable occurrence ids; never overwrite an existing occurrence"
```

---

### Task 8: Verify with real data in the browser

**Files:** none unless a bug is found. A bug gets a test where the code is pure or uses the real database, a fix, and its own commit. Playwright output goes under the scratchpad and is deleted afterwards.

- [ ] **Step 1: Full checks**

Run: `npx vitest run && npm run check && npm run build`
Expected: all PASS, 0 errors, build succeeds.

- [ ] **Step 2: Prepare a copy of the real backup**

Copy `~/Downloads/bdgt/budget-backup-2026-10-20.json` to the scratchpad as `real.json`. Never open the original for writing.

- [ ] **Step 3: Baseline on main (v10)**

`git checkout main`, `npm run dev -- --port 5199`. In a fresh Playwright context (`timezoneId: 'America/New_York'`, `locale: 'en-US'`):
- confirm USD in the modal, then import `real.json` in Settings;
- record the dashboard text for October 2026 and for July 2026 (navigate months), covering every bucket's name, assigned, spent and left figures, the summary cards, and the month notes;
- record the Activity transaction count;
- export JSON as `before.json`.

Stop the server.

- [ ] **Step 4: Same profile on the branch (v12)**

`git checkout feat/cloud-sync` (confirm with `git branch --show-current`), `npm run dev -- --port 5199`, and reload the same context. Then check:
- `indexedDB.databases()` shows `BudgetDB` at version `120`;
- the October and July dashboard text is identical to Step 3, figure for figure;
- the notes are identical;
- the Activity count is identical;
- export `after.json`, then compare it with `before.json` using a small Python script run with `python3 -I`:
  - every section other than `monthSnapshots` is equal;
  - each month's `allocations` and `notes` are equal;
  - only the stale `spent` values (2026-06, 2026-07, 2026-08) differ.

- [ ] **Step 5: Behaviour on the branch**

- Add a month note in July 2026, edit it, reload: shown once, edited. Delete it, reload: gone.
- In an empty past month (one with no allocations), add a note and then delete it. Reload, and check that the October numbers equal Step 3, so no phantom month crept in.
- Assign money to one bucket for October in the Assign panel, save, reload: kept. Use "Copy last month's assignments" in a new month: copies.
- Import `after.json` into a second fresh context on the branch: the October dashboard text equals Step 4.

- [ ] **Step 6: Clean up**

Stop the dev server, delete the scratchpad copies and any Playwright output, and confirm `git status --short` shows only `.claude/settings.local.json`.

- [ ] **Step 7: Commit any fixes**

```bash
git branch --show-current   # must print feat/cloud-sync
git add -A src tests
git commit --no-gpg-sign -m "fix(data): <what was found>"
```

Skip this step if nothing needed fixing.
