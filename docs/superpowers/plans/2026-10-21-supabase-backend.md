# Supabase Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and test the server half of cloud sync: the Postgres schema, write rules, access rules and analytics views for Supabase, plus the `SupabaseTransport` the sync engine talks through, all proven against a real Postgres in the test suite. Nothing in the app changes: no sign-in, no screens, no network calls (plan 4).

**Architecture:**
- Two SQL migrations in `supabase/migrations/`: typed tables with one trigger and three row-level-security policies each, an invite list, and an account-check function; then an `analytics` view schema closed to the app.
- The tests run those same files in PGlite (Postgres compiled to WebAssembly) with Supabase's roles and `auth` helpers, so every rule is tested on real SQL.
- `SupabaseTransport` implements the engine's `SyncTransport` over supabase-js and maps PostgREST errors to the engine's error kinds.
- A small PostgREST stand-in lets the real engine, through the real transport, run its two-device scenarios against the real SQL.

**Tech Stack:** PostgreSQL (Supabase), `@electric-sql/pglite` (dev), `@supabase/supabase-js`, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-20-cloud-sync-design.md` — "Supabase schema", "Sync engine → Statuses and failures", "Setup and configuration". The engine this plugs into is `docs/superpowers/plans/2026-10-21-cloud-sync-engine.md` (merged). Plan 4 (sign-in, sync service, screens, deploy) follows.

## Global Constraints

- **The app does not change.** No file under `src/` other than `src/lib/sync/supabaseTransport.ts` is added or edited, and nothing imports it yet. Signed-out and signed-in-less use is untouched.
- **Never use the secret key or `service_role` key in the app.** Only the publishable key (`sb_publishable_…`) is ever used client-side.
- **Explicit privileges.** Supabase is moving to opt-in grants for the Data API. Every migration `revoke`s from `anon` and `authenticated` and then grants exactly what is needed, so it behaves the same under either default.
- **Migrations are never edited once applied;** a change is a new file. Tables are created without `if not exists` on purpose.
- **Dependencies pinned to exact versions at least two weeks old:** `@electric-sql/pglite@0.5.8` (not 0.5.10, published 2026-10-14) and `@supabase/supabase-js@2.117.2` (not 2.118.0, published 2026-10-15).
- **Commits:** `git commit --no-gpg-sign`, no Co-Authored-By or AI attribution lines (the user's rule overrides any reminder). Run `git branch --show-current` before each commit: it must print `feat/cloud-sync-supabase`.
- **Commands:** tests `npx vitest run`; types `npm run check`; build `npm run build`.

## Rulings made while planning

- **Real Postgres in the tests, not a hand-written model.** PGlite runs the migrations unchanged, with the same trigger, policies and constraints as the real project. The old plan to write SQL test scripts for the dashboard is replaced by these automated tests plus a read-only setup check (`supabase/tests/verify_setup.sql`) for the dashboard: simulating other users there needs inserts into `auth.users`, which differ between Supabase versions. Cost if wrong: the dashboard check proves configuration, not behavior; behavior is proven here on the same SQL.
- **Helper functions live in a `private` schema** that the API does not expose; only the two RPC functions the app calls are in `public`.
- **`synced_at` may tie.** Rows written in one statement can share a timestamp when the clock is coarse (PGlite's is one millisecond). Pull tolerates ties (it re-reads from the last time and de-duplicates), so the SQL does not try to guarantee uniqueness. Cost if wrong: none.
- **Unknown server errors are retried, not parked.** Only constraint and data errors (SQLSTATE classes 21, 22, 23, `P0001`, HTTP 400/409/422) are "rejected". Anything unrecognised becomes a network-style failure so a person's data is never parked for a reason nobody understood.
- **The transport normalizes timestamps** (`updated_at`, `deleted_at`, `synced_at`) to UTC with milliseconds and a `Z`, because Postgres writes them in several forms and the engine compares them as strings and parses them with `Date.parse`. This resolves the string-comparison concern from the engine review.
- **`price_per_share_cents` is `bigint`.** A fractional value (possible only from a hand-edited backup) is refused by Postgres and the engine parks that one row.
- **A purely local `hasOtherRows`.** The account check ignores `settings` rows when deciding whether an account holds data, matching `summarizeDevice`.

## Review Focus

Most likely first. Each is pinned by a test in the task named in brackets.

- An update older than the stored row is skipped and not returned; an equal or newer one applies; a future edit time is capped. [Task 1, Task 5]
- A person can never read or write another person's rows, nor anyone's rows when not on the invite list or once removed from it. [Task 1]
- Signed-out visitors and signed-in users have no access to the invite list, the helper schema or the analytics views, whatever the project's default privileges are. [Task 1, Task 2, Task 3]
- A bad row is refused by a constraint and the engine parks only that row. [Task 1, Task 5]
- The registry and the SQL agree on every column and type, and every collection round-trips through the real database exactly. [Task 1]
- A missing session is reported as `auth`, no invite as `notAllowed`, an out-of-date database as `schema`, and an unreachable server as `network`, so a queue is never parked for the wrong reason. [Task 4, Task 5]
- Postgres timestamps in every format reach the engine in one fixed form. [Task 4]
- Nothing in the app imports the transport, and the production bundle does not contain it. [Task 7]

## File Structure

| File | Responsibility |
|------|----------------|
| `supabase/migrations/20261021000000_sync_core.sql` (create) | Tables, write trigger, policies, grants, invite list, account check |
| `supabase/migrations/20261021000100_analytics.sql` (create) | The `analytics` views |
| `supabase/tests/verify_setup.sql` (create) | Read-only setup check to run in the dashboard |
| `supabase/README.md`, `docs/sync-setup.md` (create) | How the SQL is organised; the person's setup guide |
| `src/lib/sync/supabaseTransport.ts` (create) | `SupabaseTransport`, `mapPostgrestError`, `normalizeTimestamp` |
| `tests/helpers/supabaseSql.ts`, `tests/helpers/postgrestOverPglite.ts` (create) | Supabase-like test database; PostgREST stand-in |
| `tests/sql/*.test.ts`, `tests/lib/sync/supabaseTransport.test.ts`, `tests/docs/syncSetup.test.ts` (create) | The tests |

---

### Task 1: A Supabase-like test database and the core migration

**Files:**
- Modify: `package.json`, `package-lock.json` (dev dependency)
- Create: `tests/helpers/supabaseSql.ts`, `tests/sql/syncCore.test.ts`, `supabase/migrations/20261021000000_sync_core.sql`

**Interfaces:**
- Consumes: `COLLECTIONS`, `collectionByTable`, `toRow`, `fromRow` from `$lib/sync/registry`.
- Produces: `createSupabaseDb(): Promise<PGlite>`, `resetData(pg)`, `addUser(pg, user, invited = true)`, `asOwner(pg)`, `asAnon(pg)`, `asUser(pg, user)`, and `USER_A`, `USER_B`, `USER_C` (C is signed in but never invited). The migration creates the 11 synced tables, `public.allowed_users`, `private.sync_is_allowed()`, `private.sync_write()`, `public.sync_account_state()` and `public.sync_schema_version()`.

- [ ] **Step 1: Install PGlite, pinned**

Run: `npm install --save-dev --save-exact @electric-sql/pglite@0.5.8`
Expected: `package.json` devDependencies gains `"@electric-sql/pglite": "0.5.8"`.

- [ ] **Step 2: Write the test database helper**

`tests/helpers/supabaseSql.ts`:

```ts
import { PGlite } from '@electric-sql/pglite';

// A real Postgres (PGlite) set up the way a Supabase project is: the roles
// and the `auth` helpers Supabase provides, then the project's own
// migrations applied in order. Tests switch between the project owner, an
// anonymous caller and a signed-in user the way PostgREST does, with
// `set role` and the `request.jwt.claims` setting.

const migrations = import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export interface TestUser {
  id: string;
  email: string;
}

export const USER_A: TestUser = { id: '11111111-1111-1111-1111-111111111111', email: 'a@example.com' };
export const USER_B: TestUser = { id: '22222222-2222-2222-2222-222222222222', email: 'b@example.com' };
export const USER_C: TestUser = { id: '33333333-3333-3333-3333-333333333333', email: 'c@example.com' };

// What Supabase provides before any migration runs. The default privileges
// reproduce an existing project, where every new table in `public` is
// reachable by the API roles; the migrations must not depend on that.
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;

  create schema auth;
  create table auth.users (id uuid primary key, email text, created_at timestamptz not null default now());
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
  $$;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;

  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

export async function createSupabaseDb(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(SUPABASE_STUB);
  for (const path of Object.keys(migrations).sort()) {
    await pg.exec(migrations[path]);
  }
  return pg;
}

// Empties every table the tests write to, as the owner.
export async function resetData(pg: PGlite): Promise<void> {
  await asOwner(pg);
  await pg.exec(`
    truncate public.settings, public.buckets, public.allocations, public.month_notes,
      public.recurring_transactions, public.transactions, public.incomes, public.savings_goals,
      public.investment_lots, public.investment_sells, public.investment_prices,
      public.allowed_users, auth.users cascade;
  `);
}

export async function addUser(pg: PGlite, user: TestUser, invited = true): Promise<void> {
  await asOwner(pg);
  await pg.query('insert into auth.users (id, email) values ($1, $2)', [user.id, user.email]);
  if (invited) await pg.query('insert into public.allowed_users (email) values ($1)', [user.email]);
}

export async function asOwner(pg: PGlite): Promise<void> {
  await pg.exec(`reset role; select set_config('request.jwt.claims', '', false);`);
}

export async function asAnon(pg: PGlite): Promise<void> {
  await pg.exec(`set role anon; select set_config('request.jwt.claims', '', false);`);
}

export async function asUser(pg: PGlite, user: TestUser): Promise<void> {
  const claims = JSON.stringify({ sub: user.id, email: user.email, role: 'authenticated' });
  await pg.exec(`set role authenticated;`);
  await pg.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
}
```

- [ ] **Step 3: Write the failing tests**

`tests/sql/syncCore.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { COLLECTIONS, collectionByTable, toRow, fromRow } from '$lib/sync/registry';
import { createSupabaseDb, resetData, addUser, asOwner, asAnon, asUser, USER_A, USER_B, USER_C } from '../helpers/supabaseSql';

let pg: PGlite;

beforeAll(async () => {
  pg = await createSupabaseDb();
});

beforeEach(async () => {
  await resetData(pg);
  await addUser(pg, USER_A);
  await addUser(pg, USER_B);
  await addUser(pg, USER_C, false); // signed in but not invited
});

const at = (iso: string) => iso;

// The statement PostgREST runs for supabase-js's .upsert(rows, {onConflict}):
// insert from the payload, merge on conflict, return what was stored.
async function upsert(remote: string, rows: Record<string, unknown>[]) {
  const cols = Object.keys(rows[0]);
  const list = cols.map((c) => `"${c}"`).join(', ');
  const set = cols.filter((c) => c !== 'id').map((c) => `"${c}" = excluded."${c}"`).join(', ');
  return pg.query<{ id: string; updated_at: string }>(
    `insert into public."${remote}" (${list})
     select ${list} from json_populate_recordset(null::public."${remote}", $1::json)
     on conflict (user_id, id) do update set ${set}
     returning id, updated_at`,
    [JSON.stringify(rows)]
  );
}

const alloc = (id: string, updated: string, amount = 1, extra: Record<string, unknown> = {}) =>
  ({ id, month: '2026-10', bucket_id: 'b1', amount_cents: amount, updated_at: updated, deleted_at: null, ...extra });

describe('the schema matches the app', () => {
  const PG_TYPE: Record<string, string> = {
    text: 'text', int: 'integer', numeric: 'numeric', bool: 'boolean', cents: 'bigint',
    date: 'date', timestamp: 'timestamp with time zone', epochMs: 'timestamp with time zone', json: 'jsonb',
  };

  it('has every synced table, with every mapped column in the right type', async () => {
    await asOwner(pg);
    for (const def of COLLECTIONS) {
      const { rows } = await pg.query<{ column_name: string; data_type: string }>(
        `select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = $1`,
        [def.remote]
      );
      const have = new Map(rows.map((r) => [r.column_name, r.data_type]));
      for (const field of def.fields) {
        expect(have.get(field.col), `${def.remote}.${field.col}`).toBe(PG_TYPE[field.type]);
      }
      for (const col of ['user_id', 'id', 'updated_at', 'synced_at', 'deleted_at', 'extra']) {
        expect(have.has(col), `${def.remote}.${col}`).toBe(true);
      }
    }
  });

  it('stores and returns a record of every collection exactly as the app wrote it', async () => {
    const day = new Date(2026, 9, 20);
    const samples: [string, Record<string, unknown>][] = [
      ['settings', { key: 'baseCurrency', value: 'INR' }],
      ['settings', { key: 'currencyConfirmed', value: true }],
      ['buckets', { id: 'b1', name: 'Rent', color: '#6366f1', order: 0, isDefault: true, allocationType: 'fixed', fixedAmount: 200000, percentageAmount: 0, isSavings: false, isEveryday: false, createdAt: new Date('2026-10-01T12:00:00.000Z'), isSystem: true }],
      ['allocations', { id: '2026-10:b1', month: '2026-10', bucketId: 'b1', amount: 50000 }],
      ['monthNotes', { id: 'n1', month: '2026-10', text: 'India Tix', effect: 'down', createdAt: 1790000000000 }],
      ['recurringTransactions', { id: 'r1', amount: 1500, bucketId: 'b1', frequency: 'monthly', dayOfMonth: 8, nextDueDate: day, note: 'Gym', isActive: true }],
      ['transactions', { id: 't1', amount: 5935, bucketId: 'b1', date: day, note: 'Flight', recurringId: 'r1', createdAt: 1790000000123, foreign: { amount: 500000, currency: 'INR', rate: 84.25, base: 'USD' }, futureField: { a: 1 } }],
      ['incomes', { id: 'i1', amount: 700000, date: day, note: 'Pay', isRecurring: true, type: 'fixed' }],
      ['savingsGoals', { id: 'g1', name: 'Trip', bucketId: 'b1', targetAmount: 300000, targetDate: day, monthlyContribution: 25000, createdAt: new Date('2026-09-01T00:00:00.000Z'), startingBalance: 1000 }],
      ['investmentLots', { id: 'l1', symbol: 'VTI', shares: 2.5, pricePerShare: 25000, purchaseDate: day, note: 'first', soldShares: 0.5 }],
      ['investmentSells', { id: 's1', lotId: 'l1', shares: 0.5, pricePerShare: 26000, sellDate: day }],
      ['investmentPrices', { symbol: 'VTI', pricePerShare: 26500, updatedAt: new Date('2026-10-05T00:00:00.000Z') }],
    ];
    await asUser(pg, USER_A);
    for (const [table, record] of samples) {
      const def = collectionByTable(table)!;
      const row = { ...toRow(def, record), updated_at: '2026-10-20T12:00:00.000Z', deleted_at: null };
      expect((await upsert(def.remote, [row])).rows, table).toHaveLength(1);
      // Read it back the way PostgREST renders a row: as JSON.
      const back = await pg.query<{ r: Record<string, unknown> }>(`select to_jsonb(t) - 'user_id' as r from public."${def.remote}" t where id = $1`, [String(record[def.keyProp])]);
      expect(fromRow(def, back.rows[0].r), table).toEqual(record);
    }
  });
});

describe('write rules', () => {
  beforeEach(() => asUser(pg, USER_A));

  it('stores a row and returns its id and time', async () => {
    const r = await upsert('allocations', [alloc('a', at('2026-01-02T00:00:00Z'))]);
    expect(r.rows.map((x) => x.id)).toEqual(['a']);
  });

  it('skips an update older than the stored row, and does not return it', async () => {
    await upsert('allocations', [alloc('a', at('2026-01-02T00:00:00Z'), 5)]);
    const older = await upsert('allocations', [alloc('a', at('2026-01-01T00:00:00Z'), 4)]);
    expect(older.rows).toEqual([]);
    expect((await pg.query<{ amount_cents: string }>(`select amount_cents from public.allocations where id = 'a'`)).rows[0].amount_cents).toBe(5);
  });

  it('applies an update with the same time or a newer one', async () => {
    await upsert('allocations', [alloc('a', at('2026-01-02T00:00:00Z'), 5)]);
    expect((await upsert('allocations', [alloc('a', at('2026-01-02T00:00:00Z'), 6)])).rows).toHaveLength(1);
    expect((await upsert('allocations', [alloc('a', at('2026-01-03T00:00:00Z'), 7)])).rows).toHaveLength(1);
    expect((await pg.query<{ amount_cents: string }>(`select amount_cents from public.allocations where id = 'a'`)).rows[0].amount_cents).toBe(7);
  });

  it('returns only the rows it stored when a batch mixes new, newer and older', async () => {
    await upsert('allocations', [alloc('a', at('2026-01-05T00:00:00Z'))]);
    const r = await upsert('allocations', [alloc('a', at('2026-01-01T00:00:00Z')), alloc('b', at('2026-01-01T00:00:00Z'))]);
    expect(r.rows.map((x) => x.id)).toEqual(['b']);
  });

  it('caps an edit time in the future at the server clock plus one minute', async () => {
    const r = await upsert('allocations', [alloc('a', at('2999-01-01T00:00:00Z'))]);
    const stored = Date.parse(r.rows[0].updated_at);
    expect(stored).toBeLessThanOrEqual(Date.now() + 61_000);
    expect(stored).toBeGreaterThan(Date.now());
  });

  it('keeps a deleted row as a tombstone that an older save cannot revive but a newer one can', async () => {
    await upsert('allocations', [alloc('a', at('2026-01-01T00:00:00Z'))]);
    await upsert('allocations', [{ id: 'a', updated_at: at('2026-01-03T00:00:00Z'), deleted_at: at('2026-01-03T00:00:00Z') }]);
    expect((await pg.query(`select 1 from public.allocations where id = 'a' and deleted_at is not null`)).rows).toHaveLength(1);
    expect((await upsert('allocations', [alloc('a', at('2026-01-02T00:00:00Z'))])).rows).toEqual([]);
    expect((await upsert('allocations', [alloc('a', at('2026-01-04T00:00:00Z'))])).rows).toHaveLength(1);
    expect((await pg.query(`select 1 from public.allocations where id = 'a' and deleted_at is null`)).rows).toHaveLength(1);
  });

  it('lets a delete carry only its keys, even for an id it has never seen', async () => {
    const r = await upsert('allocations', [{ id: 'ghost', updated_at: at('2026-01-03T00:00:00Z'), deleted_at: at('2026-01-03T00:00:00Z') }]);
    expect(r.rows).toHaveLength(1);
  });

  it('merges a delete over the stored columns instead of blanking them', async () => {
    await upsert('allocations', [alloc('a', at('2026-01-01T00:00:00Z'), 9)]);
    await upsert('allocations', [{ id: 'a', updated_at: at('2026-01-02T00:00:00Z'), deleted_at: at('2026-01-02T00:00:00Z') }]);
    expect((await pg.query<{ amount_cents: string }>(`select amount_cents from public.allocations where id = 'a'`)).rows[0].amount_cents).toBe(9);
  });

  it('stamps synced_at with the time of the write, never earlier than the row before it', async () => {
    await upsert('allocations', [alloc('a', at('2026-01-01T00:00:00Z')), alloc('b', at('2026-01-01T00:00:00Z'))]);
    // Compared inside Postgres, which keeps microseconds. Rows written in one
    // statement may tie (a clock has finite resolution); pulling copes with ties.
    const { rows } = await pg.query<{ ordered: boolean; recent: boolean }>(
      `select (select synced_at from public.allocations where id = 'b') >= (select synced_at from public.allocations where id = 'a') as ordered,
              (select min(synced_at) from public.allocations) > now() - interval '1 minute' as recent`
    );
    expect(rows[0]).toEqual({ ordered: true, recent: true });
  });

  it('never lets a row change owner', async () => {
    await upsert('allocations', [alloc('a', at('2026-01-01T00:00:00Z'))]);
    await asOwner(pg);
    await pg.query(`update public.allocations set user_id = $1, updated_at = '2026-01-02T00:00:00Z' where id = 'a'`, [USER_B.id]);
    expect((await pg.query<{ user_id: string }>(`select user_id from public.allocations where id = 'a'`)).rows[0].user_id).toBe(USER_A.id);
  });

  it('keeps fields it does not know in extra', async () => {
    await upsert('allocations', [alloc('a', at('2026-01-01T00:00:00Z'), 1, { extra: { futureField: 1 } })]);
    expect((await pg.query<{ extra: unknown }>(`select extra from public.allocations where id = 'a'`)).rows[0].extra).toEqual({ futureField: 1 });
  });
});

describe('constraints', () => {
  beforeEach(() => asUser(pg, USER_A));
  const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code);

  it('rejects a live row that is missing a required column', async () => {
    expect(await code(upsert('allocations', [{ id: 'a', month: '2026-10', updated_at: at('2026-01-01T00:00:00Z'), deleted_at: null }]))).toBe('23514');
  });

  it('rejects an invalid month, bucket allocation type, frequency and effect', async () => {
    expect(await code(upsert('allocations', [alloc('a', at('2026-01-01T00:00:00Z'), 1, { month: '2026-13' })]))).toBe('23514');
    expect(await code(upsert('month_notes', [{ id: 'n', month: '2026-10', text: 'x', effect: 'sideways', created_at: '2026-01-01T00:00:00Z', updated_at: at('2026-01-01T00:00:00Z'), deleted_at: null }]))).toBe('23514');
    expect(await code(upsert('recurring_transactions', [{ id: 'r', bucket_id: 'b', amount_cents: 1, frequency: 'yearly', next_due_date: '2026-01-01', is_active: true, updated_at: at('2026-01-01T00:00:00Z'), deleted_at: null }]))).toBe('23514');
  });

  it('requires the four foreign-currency columns together', async () => {
    const base = { id: 't', bucket_id: 'b', date: '2026-10-20', amount_cents: 1, updated_at: at('2026-01-01T00:00:00Z'), deleted_at: null };
    expect(await code(upsert('transactions', [{ ...base, foreign_currency: 'INR' }]))).toBe('23514');
    expect(await code(upsert('transactions', [{ ...base, foreign_amount_minor: 5, foreign_currency: 'INR', foreign_rate: 84.25, foreign_base: 'USD' }]))).toBe('ok');
  });

  it('refuses a batch containing a bad row and stores none of it', async () => {
    expect(await code(upsert('allocations', [alloc('good', at('2026-01-01T00:00:00Z')), alloc('bad', at('2026-01-01T00:00:00Z'), 1, { month: 'nope' })]))).toBe('23514');
    expect((await pg.query(`select 1 from public.allocations`)).rows).toEqual([]);
  });
});

describe('who can see and change what', () => {
  it('keeps each person\'s rows private', async () => {
    await asUser(pg, USER_A);
    await upsert('allocations', [alloc('a', at('2026-01-01T00:00:00Z'), 11)]);
    await asUser(pg, USER_B);
    expect((await pg.query(`select * from public.allocations`)).rows).toEqual([]);
    // B writing the same id makes B's own row; A's is untouched.
    expect((await upsert('allocations', [alloc('a', at('2026-02-01T00:00:00Z'), 22)])).rows).toHaveLength(1);
    expect((await pg.query(`update public.allocations set amount_cents = 0 where user_id = $1`, [USER_A.id])).affectedRows).toBe(0);
    await asUser(pg, USER_A);
    expect((await pg.query<{ amount_cents: string }>(`select amount_cents from public.allocations`)).rows[0].amount_cents).toBe(11);
  });

  it('does not let someone insert a row for another person', async () => {
    await asUser(pg, USER_A);
    await expect(pg.query(`insert into public.allocations (user_id, id, month, bucket_id, amount_cents, updated_at) values ($1, 'x', '2026-10', 'b', 1, now())`, [USER_B.id])).rejects.toMatchObject({ code: '42501' });
  });

  it('shows nothing and refuses writes to someone who is not on the invite list', async () => {
    await asUser(pg, USER_C);
    expect((await pg.query(`select * from public.allocations`)).rows).toEqual([]);
    await expect(upsert('allocations', [alloc('a', at('2026-01-01T00:00:00Z'))])).rejects.toMatchObject({ code: '42501' });
  });

  it('stops syncing someone as soon as they are removed from the invite list', async () => {
    await asUser(pg, USER_A);
    await upsert('allocations', [alloc('a', at('2026-01-01T00:00:00Z'))]);
    await asOwner(pg);
    await pg.query(`delete from public.allowed_users where email = $1`, [USER_A.email]);
    await asUser(pg, USER_A);
    expect((await pg.query(`select * from public.allocations`)).rows).toEqual([]);
  });

  it('matches the invite list by email, ignoring case', async () => {
    await asOwner(pg);
    await pg.query(`delete from public.allowed_users`);
    await pg.query(`insert into public.allowed_users (email) values ('a@example.com')`);
    await asUser(pg, { ...USER_A, email: 'A@Example.com' });
    expect((await upsert('allocations', [alloc('a', at('2026-01-01T00:00:00Z'))])).rows).toHaveLength(1);
  });

  it('gives anonymous callers and signed-in users no direct access to the invite list or the tables', async () => {
    await asAnon(pg);
    for (const table of ['allocations', 'allowed_users']) {
      await expect(pg.query(`select * from public.${table}`), table).rejects.toMatchObject({ code: '42501' });
    }
    await asUser(pg, USER_A);
    await expect(pg.query(`select * from public.allowed_users`)).rejects.toMatchObject({ code: '42501' });
    await expect(pg.query(`delete from public.allocations`)).rejects.toMatchObject({ code: '42501' });
  });

  it('does not expose the helper schema functions beyond what policies need', async () => {
    await asAnon(pg);
    await expect(pg.query(`select private.sync_is_allowed()`)).rejects.toMatchObject({ code: '42501' });
  });
});

describe('sync_account_state', () => {
  const state = async () => (await pg.query<{ s: Record<string, unknown> }>(`select public.sync_account_state() as s`)).rows[0].s;
  const bucket = (id: string, over: Record<string, unknown> = {}) => ({
    id, name: id, color: '#000', sort_order: 0, is_default: true, allocation_type: 'fixed', fixed_amount_cents: 0,
    percentage: 0, is_savings: false, is_everyday: true, created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z', deleted_at: null, ...over,
  });

  it('says an account that is not invited may not sync, and shows nothing', async () => {
    await asUser(pg, USER_C);
    expect(await state()).toEqual({ allowed: false, schemaVersion: 1, buckets: [], hasOtherRows: false });
  });

  it('reports an empty invited account', async () => {
    await asUser(pg, USER_A);
    expect(await state()).toEqual({ allowed: true, schemaVersion: 1, buckets: [], hasOtherRows: false });
  });

  it('lists only the caller\'s live buckets, in the shape the app reads', async () => {
    await asUser(pg, USER_A);
    await upsert('buckets', [bucket('b1'), bucket('b2')]);
    await upsert('buckets', [{ id: 'b2', updated_at: '2026-01-02T00:00:00Z', deleted_at: '2026-01-02T00:00:00Z' }]);
    await asUser(pg, USER_B);
    await upsert('buckets', [bucket('other')]);
    await asUser(pg, USER_A);
    const s = await state();
    const buckets = s.buckets as Record<string, unknown>[];
    expect(buckets.map((b) => b.id)).toEqual(['b1']);
    expect(buckets[0]).toMatchObject({ name: 'b1', sort_order: 0, is_default: true, allocation_type: 'fixed' });
    expect(buckets[0]).not.toHaveProperty('user_id');
    expect(buckets[0]).toHaveProperty('updated_at');
  });

  it('does not count settings or deleted rows as other data, but counts live ones', async () => {
    await asUser(pg, USER_A);
    await upsert('settings', [{ id: 'baseCurrency', value: 'USD', updated_at: '2026-01-01T00:00:00Z', deleted_at: null }]);
    expect((await state()).hasOtherRows).toBe(false);
    await upsert('allocations', [alloc('a', at('2026-01-01T00:00:00Z'))]);
    expect((await state()).hasOtherRows).toBe(true);
    await upsert('allocations', [{ id: 'a', updated_at: '2026-01-02T00:00:00Z', deleted_at: '2026-01-02T00:00:00Z' }]);
    expect((await state()).hasOtherRows).toBe(false);
  });

  it('refuses a caller who is not signed in', async () => {
    await asOwner(pg);
    await expect(state()).rejects.toMatchObject({ code: '28000' });
    await asAnon(pg);
    await expect(state()).rejects.toMatchObject({ code: '42501' });
  });

  it('reports the migration level', async () => {
    await asUser(pg, USER_A);
    expect((await pg.query<{ v: number }>(`select public.sync_schema_version() as v`)).rows[0].v).toBe(1);
  });
});
```

- [ ] **Step 4: Run to verify they fail**

Run: `npx vitest run tests/sql/syncCore.test.ts`
Expected: FAIL. No migration exists yet, so every test errors with `relation "public.…" does not exist` (or `schema "private" does not exist`).

- [ ] **Step 5: Write the migration**

`supabase/migrations/20261021000000_sync_core.sql`:

```sql
-- Cloud sync: the typed tables the app syncs to, the write rules that keep
-- devices consistent, and the access rules that keep each person's rows
-- private. Safe to read top to bottom; every table follows the same shape.

-- Migration level the app checks before it syncs (the app needs >= 1).
create or replace function public.sync_schema_version() returns integer
language sql immutable
set search_path = ''
as $$ select 1 $$;

-- Helper functions live in a schema the API does not expose.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- The invite list. Nobody can read or change it through the API; maintain it
-- in the dashboard (Table editor or SQL editor).
create table public.allowed_users (
  email text primary key check (email = lower(email)),
  note text,
  added_at timestamptz not null default now()
);
alter table public.allowed_users enable row level security;
revoke all on public.allowed_users from anon, authenticated;

-- True when the signed-in Google account's email is on the invite list.
create or replace function private.sync_is_allowed() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.allowed_users
    where email = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  )
$$;
revoke all on function private.sync_is_allowed() from public;
grant execute on function private.sync_is_allowed() to authenticated;

-- Write rules shared by every synced table:
--  * an edit time in the future is capped at the server clock + 1 minute, so
--    a device with a wrong clock cannot win every conflict forever;
--  * an update older than the stored row is skipped (the row is not returned
--    by an upsert's RETURNING), so a late upload never undoes a newer edit;
--  * a row never changes owner;
--  * synced_at is stamped on every write and drives pulls.
create or replace function private.sync_write() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := least(new.updated_at, now() + interval '1 minute');
  if tg_op = 'UPDATE' then
    if new.updated_at < old.updated_at then
      return null;
    end if;
    new.user_id := old.user_id;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end
$$;
revoke all on function private.sync_write() from public;

-- Sync columns every table carries (written out per table below):
--   user_id    owner, defaults to the signed-in user
--   updated_at when the edit was made (decides conflicts)
--   synced_at  when the server stored it (drives pulls)
--   deleted_at soft delete, so other devices learn of a delete
--   extra      fields the app has but this schema does not know yet
-- A deleted row only needs its keys, so each table's check applies to live rows.

create table public.settings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  value jsonb,
  updated_at timestamptz not null,
  synced_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  extra jsonb not null default '{}'::jsonb,
  primary key (user_id, id),
  constraint live_row_complete check (deleted_at is not null or value is not null)
);

create table public.buckets (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  name text,
  color text,
  sort_order integer,
  is_default boolean,
  allocation_type text,
  fixed_amount_cents bigint,
  percentage numeric,
  is_savings boolean,
  is_everyday boolean,
  is_system boolean,
  created_at timestamptz,
  updated_at timestamptz not null,
  synced_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  extra jsonb not null default '{}'::jsonb,
  primary key (user_id, id),
  constraint live_row_complete check (deleted_at is not null or (
    name is not null and color is not null and sort_order is not null and is_default is not null
    and allocation_type is not null and fixed_amount_cents is not null and percentage is not null
    and is_savings is not null and is_everyday is not null and created_at is not null)),
  constraint allocation_type_valid check (allocation_type is null or allocation_type in ('fixed', 'percentage', 'hybrid'))
);

create table public.allocations (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  month text,
  bucket_id text,
  amount_cents bigint,
  updated_at timestamptz not null,
  synced_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  extra jsonb not null default '{}'::jsonb,
  primary key (user_id, id),
  constraint live_row_complete check (deleted_at is not null or (month is not null and bucket_id is not null and amount_cents is not null)),
  constraint month_valid check (month is null or month ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

create table public.month_notes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  month text,
  text text,
  effect text,
  created_at timestamptz,
  updated_at timestamptz not null,
  synced_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  extra jsonb not null default '{}'::jsonb,
  primary key (user_id, id),
  constraint live_row_complete check (deleted_at is not null or (month is not null and text is not null and effect is not null and created_at is not null)),
  constraint month_valid check (month is null or month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  constraint effect_valid check (effect is null or effect in ('up', 'down', 'none'))
);

create table public.recurring_transactions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  bucket_id text,
  amount_cents bigint,
  frequency text,
  day_of_month integer,
  next_due_date date,
  note text,
  is_active boolean,
  updated_at timestamptz not null,
  synced_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  extra jsonb not null default '{}'::jsonb,
  primary key (user_id, id),
  constraint live_row_complete check (deleted_at is not null or (
    bucket_id is not null and amount_cents is not null and frequency is not null
    and next_due_date is not null and is_active is not null)),
  constraint frequency_valid check (frequency is null or frequency in ('weekly', 'biweekly', 'monthly'))
);

create table public.transactions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  bucket_id text,
  date date,
  amount_cents bigint,
  note text,
  recurring_id text,
  created_at timestamptz,
  foreign_amount_minor bigint,
  foreign_currency text,
  foreign_rate numeric,
  foreign_base text,
  updated_at timestamptz not null,
  synced_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  extra jsonb not null default '{}'::jsonb,
  primary key (user_id, id),
  constraint live_row_complete check (deleted_at is not null or (bucket_id is not null and date is not null and amount_cents is not null)),
  constraint foreign_all_or_none check (
    (foreign_amount_minor is null) = (foreign_currency is null)
    and (foreign_currency is null) = (foreign_rate is null)
    and (foreign_rate is null) = (foreign_base is null))
);

create table public.incomes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  date date,
  amount_cents bigint,
  note text,
  is_recurring boolean,
  type text,
  updated_at timestamptz not null,
  synced_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  extra jsonb not null default '{}'::jsonb,
  primary key (user_id, id),
  constraint live_row_complete check (deleted_at is not null or (date is not null and amount_cents is not null and is_recurring is not null and type is not null)),
  constraint type_valid check (type is null or type in ('fixed', 'one-time'))
);

create table public.savings_goals (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  name text,
  bucket_id text,
  target_amount_cents bigint,
  target_date date,
  monthly_contribution_cents bigint,
  starting_balance_cents bigint,
  created_at timestamptz,
  updated_at timestamptz not null,
  synced_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  extra jsonb not null default '{}'::jsonb,
  primary key (user_id, id),
  constraint live_row_complete check (deleted_at is not null or (
    name is not null and bucket_id is not null and target_amount_cents is not null
    and starting_balance_cents is not null and created_at is not null))
);

create table public.investment_lots (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  symbol text,
  shares numeric,
  price_per_share_cents bigint,
  purchase_date date,
  note text,
  sold_shares numeric,
  updated_at timestamptz not null,
  synced_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  extra jsonb not null default '{}'::jsonb,
  primary key (user_id, id),
  constraint live_row_complete check (deleted_at is not null or (
    symbol is not null and shares is not null and price_per_share_cents is not null
    and purchase_date is not null and sold_shares is not null))
);

create table public.investment_sells (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  lot_id text,
  shares numeric,
  price_per_share_cents bigint,
  sell_date date,
  note text,
  updated_at timestamptz not null,
  synced_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  extra jsonb not null default '{}'::jsonb,
  primary key (user_id, id),
  constraint live_row_complete check (deleted_at is not null or (
    lot_id is not null and shares is not null and price_per_share_cents is not null and sell_date is not null))
);

create table public.investment_prices (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  symbol text,
  price_per_share_cents bigint,
  price_updated_at timestamptz,
  updated_at timestamptz not null,
  synced_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  extra jsonb not null default '{}'::jsonb,
  primary key (user_id, id),
  constraint live_row_complete check (deleted_at is not null or (symbol is not null and price_per_share_cents is not null and price_updated_at is not null))
);

-- Write rules, pull index and access rules, identical for every synced table.
do $$
declare
  t text;
begin
  foreach t in array array[
    'settings', 'buckets', 'allocations', 'month_notes', 'recurring_transactions', 'transactions',
    'incomes', 'savings_goals', 'investment_lots', 'investment_sells', 'investment_prices'
  ]
  loop
    execute format('create trigger sync_write before insert or update on public.%I for each row execute function private.sync_write()', t);
    execute format('create index %I on public.%I (user_id, synced_at, id)', t || '_pull_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    -- (select ...) lets Postgres evaluate the check once per statement, not per row.
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()) and (select private.sync_is_allowed()))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()) and (select private.sync_is_allowed()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid()) and (select private.sync_is_allowed())) with check (user_id = (select auth.uid()) and (select private.sync_is_allowed()))', t || '_update', t);
  end loop;
end
$$;

-- What the app asks once after signing in: may this account sync, is the
-- database new enough, and what is already stored (used to decide between
-- uploading, downloading and asking).
create or replace function public.sync_account_state() returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if not private.sync_is_allowed() then
    return jsonb_build_object('allowed', false, 'schemaVersion', public.sync_schema_version(), 'buckets', '[]'::jsonb, 'hasOtherRows', false);
  end if;
  return jsonb_build_object(
    'allowed', true,
    'schemaVersion', public.sync_schema_version(),
    'buckets', coalesce((select jsonb_agg(to_jsonb(b) - 'user_id') from public.buckets b where b.user_id = uid and b.deleted_at is null), '[]'::jsonb),
    -- Settings do not count: every account has them.
    'hasOtherRows',
      exists (select 1 from public.allocations where user_id = uid and deleted_at is null)
      or exists (select 1 from public.month_notes where user_id = uid and deleted_at is null)
      or exists (select 1 from public.recurring_transactions where user_id = uid and deleted_at is null)
      or exists (select 1 from public.transactions where user_id = uid and deleted_at is null)
      or exists (select 1 from public.incomes where user_id = uid and deleted_at is null)
      or exists (select 1 from public.savings_goals where user_id = uid and deleted_at is null)
      or exists (select 1 from public.investment_lots where user_id = uid and deleted_at is null)
      or exists (select 1 from public.investment_sells where user_id = uid and deleted_at is null)
      or exists (select 1 from public.investment_prices where user_id = uid and deleted_at is null)
  );
end
$$;
revoke all on function public.sync_account_state() from public, anon;
grant execute on function public.sync_account_state() to authenticated;
revoke all on function public.sync_schema_version() from public, anon;
grant execute on function public.sync_schema_version() to authenticated;
```

- [ ] **Step 6: Run the tests and the whole suite**

Run: `npx vitest run tests/sql/syncCore.test.ts && npx vitest run && npm run check`
Expected: 30 new tests PASS, the whole suite PASS, 0 type errors.

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync-supabase
git add package.json package-lock.json tests/helpers/supabaseSql.ts tests/sql/syncCore.test.ts supabase/migrations/20261021000000_sync_core.sql
git commit --no-gpg-sign -m "feat(supabase): synced tables, write rules and access rules, tested on a real Postgres"
```

---

### Task 2: Analytics views

**Files:**
- Create: `tests/sql/analytics.test.ts`, `supabase/migrations/20261021000100_analytics.sql`

**Interfaces:**
- Consumes: the Task 1 helper and tables.
- Produces: schema `analytics`: one view per synced table, plus `transactions_enriched`, `monthly_bucket_spend`, `monthly_cashflow`, `user_settings` and `users`. Closed to `anon` and `authenticated`.

- [ ] **Step 1: Write the failing tests**

`tests/sql/analytics.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createSupabaseDb, resetData, addUser, asOwner, asAnon, asUser, USER_A, USER_B } from '../helpers/supabaseSql';

let pg: PGlite;

beforeAll(async () => {
  pg = await createSupabaseDb();
});

const bucket = (id: string, name: string, savings = false) =>
  `('${id}', '${name}', '#000', 0, false, 'fixed', 0, 0, ${savings}, ${!savings}, '2026-01-01Z', '2026-01-01Z')`;

// Seed as the owner, so the writes skip the app's access rules and the test
// can place rows for two users directly.
beforeEach(async () => {
  await resetData(pg);
  await addUser(pg, USER_A);
  await addUser(pg, USER_B);
  const a = USER_A.id;
  await pg.exec(`
    insert into public.buckets (user_id, id, name, color, sort_order, is_default, allocation_type, fixed_amount_cents, percentage, is_savings, is_everyday, created_at, updated_at)
      values ${['groc:Groceries', 'rent:Rent'].map((x) => bucket(x.split(':')[0], x.split(':')[1]).replace('(', `('${a}', `)).join(', ')},
             ${bucket('inv', 'Investments', true).replace('(', `('${a}', `)};
    insert into public.incomes (user_id, id, date, amount_cents, is_recurring, type, updated_at) values
      ('${a}', 'i1', '2026-10-01', 100000, true, 'fixed', now()),
      ('${a}', 'i2', '2026-09-15', 50000, false, 'one-time', now());
    insert into public.transactions (user_id, id, bucket_id, date, amount_cents, note, updated_at) values
      ('${a}', 't1', 'groc', '2026-10-05', 20000, 'a', now()),
      ('${a}', 't2', 'groc', '2026-10-09', 10000, 'b', now()),
      ('${a}', 't3', 'inv', '2026-10-10', 20000, 'c', now()),
      ('${a}', 't4', 'gone', '2026-10-11', 5000, 'bucket deleted', now()),
      ('${a}', 't5', 'groc', '2026-08-02', 7000, 'spend with no income', now());
    insert into public.transactions (user_id, id, bucket_id, date, amount_cents, updated_at, deleted_at) values
      ('${a}', 'dead', 'groc', '2026-10-12', 99999, now(), now());
    insert into public.transactions (user_id, id, bucket_id, date, amount_cents, updated_at) values
      ('${USER_B.id}', 'b1', 'x', '2026-10-05', 1, now());
    insert into public.settings (user_id, id, value, updated_at) values
      ('${a}', 'baseCurrency', '"INR"', now()), ('${a}', 'currencyConfirmed', 'true', now());
  `);
});

const rows = async (sql: string) => (await pg.query<Record<string, unknown>>(sql)).rows;

describe('analytics views', () => {
  it('show live rows only, with amounts in currency units next to cents', async () => {
    const t = await rows(`select id, amount_cents, amount from analytics.transactions where user_id = '${USER_A.id}' order by id`);
    expect(t.map((r) => r.id)).toEqual(['t1', 't2', 't3', 't4', 't5']);
    expect(t[0]).toMatchObject({ amount_cents: 20000 });
    expect(Number(t[0].amount)).toBe(200);
  });

  it('hide the sync columns', async () => {
    const cols = await rows(`select column_name from information_schema.columns where table_schema = 'analytics' and table_name = 'transactions'`);
    const names = cols.map((c) => c.column_name);
    for (const hidden of ['updated_at', 'synced_at', 'deleted_at', 'extra']) expect(names).not.toContain(hidden);
    expect(names).toEqual(expect.arrayContaining(['user_id', 'id', 'amount_cents', 'amount']));
  });

  it('join each transaction to its bucket and month', async () => {
    const t = await rows(`select id, month, bucket_name, is_savings from analytics.transactions_enriched where user_id = '${USER_A.id}' order by id`);
    expect(t.find((r) => r.id === 't1')).toMatchObject({ month: '2026-10', bucket_name: 'Groceries', is_savings: false });
    expect(t.find((r) => r.id === 't3')).toMatchObject({ bucket_name: 'Investments', is_savings: true });
    expect(t.find((r) => r.id === 't4')).toMatchObject({ bucket_name: null, is_savings: false }); // bucket deleted
  });

  it('total what was spent per bucket per month', async () => {
    const s = await rows(`select month, bucket_name, spent_cents, transaction_count from analytics.monthly_bucket_spend where user_id = '${USER_A.id}' and bucket_name = 'Groceries' order by month`);
    // sum() and count() arrive as strings from the driver.
    expect(s.map((r) => [r.month, Number(r.spent_cents), Number(r.transaction_count)])).toEqual([
      ['2026-08', 7000, 1],
      ['2026-10', 30000, 2],
    ]);
  });

  it('work out income, spending, money set aside and savings rate per month', async () => {
    const m = await rows(`select month, income_cents, spent_cents, set_aside_cents, net_cents, savings_rate from analytics.monthly_cashflow where user_id = '${USER_A.id}' order by month`);
    expect(m.map((r) => r.month)).toEqual(['2026-08', '2026-09', '2026-10']);
    // October: income 1000.00; spent = groceries 300.00 + the orphaned 50.00; 200.00 went to a savings bucket.
    const cents = (r: Record<string, unknown>) => ({ income: Number(r.income_cents), spent: Number(r.spent_cents), setAside: Number(r.set_aside_cents), net: Number(r.net_cents) });
    expect(cents(m[2])).toEqual({ income: 100000, spent: 35000, setAside: 20000, net: 65000 });
    expect(Number(m[2].savings_rate)).toBe(0.65);
    // A month with income and no spending, and a month with spending and no income.
    expect(cents(m[1])).toMatchObject({ income: 50000, spent: 0 });
    expect(Number(m[1].savings_rate)).toBe(1);
    expect(cents(m[0])).toMatchObject({ income: 0, spent: 7000 });
    expect(m[0].savings_rate).toBeNull();
  });

  it('keep each user\'s numbers apart', async () => {
    const m = await rows(`select month from analytics.monthly_cashflow where user_id = '${USER_B.id}'`);
    expect(m).toEqual([{ month: '2026-10' }]);
  });

  it('turn the settings into one row per user', async () => {
    const s = await rows(`select base_currency, currency_confirmed from analytics.user_settings where user_id = '${USER_A.id}'`);
    expect(s).toEqual([{ base_currency: 'INR', currency_confirmed: true }]);
  });

  it('list users with their emails', async () => {
    const u = await rows(`select email from analytics.users order by email`);
    expect(u).toEqual([{ email: USER_A.email }, { email: USER_B.email }]);
  });

  it('cannot be read through the API roles', async () => {
    await asAnon(pg);
    await expect(pg.query(`select * from analytics.transactions`)).rejects.toMatchObject({ code: '42501' });
    await asUser(pg, USER_A);
    await expect(pg.query(`select * from analytics.transactions`)).rejects.toMatchObject({ code: '42501' });
    await expect(pg.query(`select * from analytics.users`)).rejects.toMatchObject({ code: '42501' });
    await asOwner(pg);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/sql/analytics.test.ts`
Expected: FAIL, `schema "analytics" does not exist` / `relation "analytics.…" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261021000100_analytics.sql`:

```sql
-- Views for studying the data in the SQL editor or copying to a warehouse
-- (BigQuery, Metabase, ...). They show live rows only, drop the sync
-- columns and add amounts in currency units next to cents.
--
-- The `analytics` schema is not exposed through the API and the app's roles
-- have no access to it: only the project owner (dashboard, SQL editor, a
-- service connection) can read it, and it sees every user's rows.

create schema if not exists analytics;
revoke all on schema analytics from public, anon, authenticated;

create view analytics.users as
  select id as user_id, email, created_at from auth.users;

create view analytics.settings as
  select user_id, id as key, value from public.settings where deleted_at is null;

create view analytics.user_settings as
  select
    user_id,
    max(value #>> '{}') filter (where id = 'baseCurrency') as base_currency,
    (max(value #>> '{}') filter (where id = 'currencyConfirmed'))::boolean as currency_confirmed
  from public.settings
  where deleted_at is null
  group by user_id;

create view analytics.buckets as
  select user_id, id, name, color, sort_order, is_default, allocation_type,
         fixed_amount_cents, fixed_amount_cents / 100.0 as fixed_amount,
         percentage, is_savings, is_everyday, coalesce(is_system, false) as is_system, created_at
  from public.buckets where deleted_at is null;

create view analytics.allocations as
  select user_id, id, month, bucket_id, amount_cents, amount_cents / 100.0 as amount
  from public.allocations where deleted_at is null;

create view analytics.month_notes as
  select user_id, id, month, text, effect, created_at
  from public.month_notes where deleted_at is null;

create view analytics.recurring_transactions as
  select user_id, id, bucket_id, amount_cents, amount_cents / 100.0 as amount, frequency,
         day_of_month, next_due_date, note, is_active
  from public.recurring_transactions where deleted_at is null;

create view analytics.transactions as
  select user_id, id, bucket_id, date, amount_cents, amount_cents / 100.0 as amount, note,
         recurring_id, created_at,
         foreign_amount_minor, foreign_amount_minor / 100.0 as foreign_amount,
         foreign_currency, foreign_rate, foreign_base
  from public.transactions where deleted_at is null;

create view analytics.incomes as
  select user_id, id, date, amount_cents, amount_cents / 100.0 as amount, note, is_recurring, type
  from public.incomes where deleted_at is null;

create view analytics.savings_goals as
  select user_id, id, name, bucket_id, target_amount_cents, target_amount_cents / 100.0 as target_amount,
         target_date, monthly_contribution_cents, monthly_contribution_cents / 100.0 as monthly_contribution,
         starting_balance_cents, starting_balance_cents / 100.0 as starting_balance, created_at
  from public.savings_goals where deleted_at is null;

create view analytics.investment_lots as
  select user_id, id, symbol, shares, price_per_share_cents, price_per_share_cents / 100.0 as price_per_share,
         purchase_date, note, sold_shares
  from public.investment_lots where deleted_at is null;

create view analytics.investment_sells as
  select user_id, id, lot_id, shares, price_per_share_cents, price_per_share_cents / 100.0 as price_per_share,
         sell_date, note
  from public.investment_sells where deleted_at is null;

create view analytics.investment_prices as
  select user_id, id as symbol, price_per_share_cents, price_per_share_cents / 100.0 as price_per_share,
         price_updated_at
  from public.investment_prices where deleted_at is null;

-- Each transaction with its bucket and month.
create view analytics.transactions_enriched as
  select t.user_id, t.id, t.date, to_char(t.date, 'YYYY-MM') as month,
         t.amount_cents, t.amount_cents / 100.0 as amount, t.note,
         t.bucket_id, b.name as bucket_name, coalesce(b.is_savings, false) as is_savings,
         coalesce(b.is_everyday, false) as is_everyday,
         t.recurring_id, t.foreign_amount_minor, t.foreign_currency, t.foreign_rate, t.foreign_base
  from public.transactions t
  left join public.buckets b on b.user_id = t.user_id and b.id = t.bucket_id and b.deleted_at is null
  where t.deleted_at is null;

-- What was spent in each bucket each month.
create view analytics.monthly_bucket_spend as
  select user_id, month, bucket_id, bucket_name, is_savings,
         sum(amount_cents) as spent_cents, sum(amount_cents) / 100.0 as spent,
         count(*) as transaction_count
  from analytics.transactions_enriched
  group by user_id, month, bucket_id, bucket_name, is_savings;

-- Income, spending and savings rate per month. As in the app, money moved
-- into a savings bucket counts as saved, not spent.
create view analytics.monthly_cashflow as
  with income as (
    select user_id, to_char(date, 'YYYY-MM') as month, sum(amount_cents) as income_cents
    from public.incomes where deleted_at is null group by 1, 2
  ),
  spend as (
    select user_id, month,
           sum(amount_cents) filter (where not is_savings) as spent_cents,
           sum(amount_cents) filter (where is_savings) as set_aside_cents
    from analytics.transactions_enriched group by 1, 2
  ),
  months as (
    select user_id, month from income union select user_id, month from spend
  )
  select m.user_id, m.month,
         coalesce(i.income_cents, 0) as income_cents,
         coalesce(s.spent_cents, 0) as spent_cents,
         coalesce(s.set_aside_cents, 0) as set_aside_cents,
         coalesce(i.income_cents, 0) - coalesce(s.spent_cents, 0) as net_cents,
         coalesce(i.income_cents, 0) / 100.0 as income,
         coalesce(s.spent_cents, 0) / 100.0 as spent,
         coalesce(s.set_aside_cents, 0) / 100.0 as set_aside,
         (coalesce(i.income_cents, 0) - coalesce(s.spent_cents, 0)) / 100.0 as net,
         case when coalesce(i.income_cents, 0) > 0
              then round((coalesce(i.income_cents, 0) - coalesce(s.spent_cents, 0))::numeric / i.income_cents, 4)
         end as savings_rate
  from months m
  left join income i on i.user_id = m.user_id and i.month = m.month
  left join spend s on s.user_id = m.user_id and s.month = m.month;
```

- [ ] **Step 4: Run the tests and the whole suite**

Run: `npx vitest run tests/sql && npx vitest run && npm run check`
Expected: 9 new tests PASS (39 in `tests/sql`), the suite PASS, 0 type errors.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync-supabase
git add tests/sql/analytics.test.ts supabase/migrations/20261021000100_analytics.sql
git commit --no-gpg-sign -m "feat(supabase): analytics views for studying the data"
```

---

### Task 3: A setup check for the dashboard

**Files:**
- Create: `tests/sql/verifySetup.test.ts`, `supabase/tests/verify_setup.sql`

**Interfaces:**
- Consumes: the migrations (Tasks 1–2) and the Task 1 helper.
- Produces: `supabase/tests/verify_setup.sql`, a single read-only `select name, ok` with 11 rows that the person runs in the SQL editor; every row must be `true`.

- [ ] **Step 1: Write the failing tests**

`tests/sql/verifySetup.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createSupabaseDb, resetData, addUser, asOwner, USER_A } from '../helpers/supabaseSql';

// supabase/tests/verify_setup.sql is what the person runs in the dashboard
// after applying the migrations. It has to pass on a database built from the
// same migrations here, and has to fail when the setup is wrong.
const script = Object.values(import.meta.glob('/supabase/tests/verify_setup.sql', { query: '?raw', import: 'default', eager: true }))[0] as string;

let pg: PGlite;

beforeAll(async () => {
  pg = await createSupabaseDb();
});

beforeEach(async () => {
  await resetData(pg);
  await addUser(pg, USER_A);
});

const run = async () => {
  await asOwner(pg);
  return (await pg.query<{ name: string; ok: boolean }>(script)).rows;
};

describe('verify_setup.sql', () => {
  it('passes every check on a correctly set up project that has an invited email', async () => {
    const rows = await run();
    expect(rows).toHaveLength(11);
    expect(rows.filter((r) => !r.ok).map((r) => r.name)).toEqual([]);
  });

  it('flags the missing invite as the only problem on an otherwise correct project', async () => {
    await asOwner(pg);
    await pg.exec('delete from public.allowed_users');
    const failing = (await run()).filter((r) => !r.ok);
    expect(failing.map((r) => r.name)).toEqual(['the invite list has at least one email (add yours before signing in)']);
  });

  it('catches tables left open to signed-out visitors', async () => {
    await asOwner(pg);
    await pg.exec('grant select on public.transactions to anon');
    const failing = (await run()).filter((r) => !r.ok).map((r) => r.name);
    expect(failing).toEqual(['signed-out visitors have no access to any table']);
    await pg.exec('revoke select on public.transactions from anon');
  });

  it('catches row level security switched off', async () => {
    await asOwner(pg);
    await pg.exec('alter table public.incomes disable row level security');
    const failing = (await run()).filter((r) => !r.ok).map((r) => r.name);
    expect(failing).toContain('row level security is on for all 11 synced tables and the invite list');
    await pg.exec('alter table public.incomes enable row level security');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/sql/verifySetup.test.ts`
Expected: FAIL, the glob finds no `supabase/tests/verify_setup.sql` (`Cannot read properties of undefined`).

- [ ] **Step 3: Write the script**

`supabase/tests/verify_setup.sql`:

```sql
-- Read-only check of a freshly set up project. Paste into the Supabase SQL
-- editor and run it after applying the migrations: every row should say
-- true. It changes nothing and needs no test data. (Behavior such as "one
-- person cannot read another's rows" is covered by the automated tests that
-- run these same migrations; this checks the project itself was set up the
-- same way.)

with synced(tbl) as (
  values ('settings'), ('buckets'), ('allocations'), ('month_notes'), ('recurring_transactions'),
         ('transactions'), ('incomes'), ('savings_goals'), ('investment_lots'), ('investment_sells'),
         ('investment_prices')
),
checks(name, ok) as (
  select 'row level security is on for all 11 synced tables and the invite list',
         (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relrowsecurity
             and c.relname in (select tbl from synced union select 'allowed_users')) = 12
  union all
  select 'signed-out visitors have no access to any table',
         not exists (select 1 from synced where has_table_privilege('anon', 'public.' || tbl, 'select,insert,update,delete'))
         and not has_table_privilege('anon', 'public.allowed_users', 'select,insert,update,delete')
  union all
  select 'signed-in users can read, add and change synced rows, but not delete them',
         not exists (select 1 from synced where not has_table_privilege('authenticated', 'public.' || tbl, 'select')
                                             or not has_table_privilege('authenticated', 'public.' || tbl, 'insert')
                                             or not has_table_privilege('authenticated', 'public.' || tbl, 'update'))
         and not exists (select 1 from synced where has_table_privilege('authenticated', 'public.' || tbl, 'delete')
                                                 or has_table_privilege('authenticated', 'public.' || tbl, 'truncate'))
  union all
  select 'signed-in users cannot read or change the invite list',
         not has_table_privilege('authenticated', 'public.allowed_users', 'select,insert,update,delete')
  union all
  select 'every synced table has the write rules (trigger)',
         (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and t.tgname = 'sync_write' and not t.tgisinternal) = 11
  union all
  select 'every synced table has its three access policies',
         not exists (select 1 from synced where (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = tbl) <> 3)
  union all
  select 'the analytics views exist and are closed to the app',
         exists (select 1 from pg_namespace where nspname = 'analytics')
         and not has_schema_privilege('anon', 'analytics', 'usage')
         and not has_schema_privilege('authenticated', 'analytics', 'usage')
  union all
  select 'the helper schema is closed to signed-out visitors',
         not has_schema_privilege('anon', 'private', 'usage')
  union all
  select 'the account check can be called by signed-in users only',
         has_function_privilege('authenticated', 'public.sync_account_state()', 'execute')
         and not has_function_privilege('anon', 'public.sync_account_state()', 'execute')
         and has_function_privilege('authenticated', 'public.sync_schema_version()', 'execute')
         and not has_function_privilege('anon', 'public.sync_schema_version()', 'execute')
  union all
  select 'the database is at the migration level the app needs (1)', public.sync_schema_version() = 1
  union all
  select 'the invite list has at least one email (add yours before signing in)',
         exists (select 1 from public.allowed_users)
)
select name, ok from checks;
```

- [ ] **Step 4: Run the tests and the whole suite**

Run: `npx vitest run tests/sql && npx vitest run && npm run check`
Expected: 4 new tests PASS (43 in `tests/sql`), the suite PASS, 0 type errors.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync-supabase
git add tests/sql/verifySetup.test.ts supabase/tests/verify_setup.sql
git commit --no-gpg-sign -m "feat(supabase): a read-only setup check to run in the dashboard"
```

---

### Task 4: The Supabase transport

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `src/lib/sync/supabaseTransport.ts`, `tests/lib/sync/supabaseTransport.test.ts`

**Interfaces:**
- Consumes: `SyncError`, `SyncTransport`, `AccountState`, `PulledRow`, `StoredStamp` from `$lib/sync/transport`; `Row` from `$lib/sync/registry`.
- Produces: `class SupabaseTransport implements SyncTransport` (constructor takes anything with supabase-js's `from` and `rpc`), `mapPostgrestError(failure): SyncError`, `normalizeTimestamp(value): unknown`, `interface PostgrestFailure { status?; code?; message? }`.

- [ ] **Step 1: Install supabase-js, pinned**

Run: `npm install --save-exact @supabase/supabase-js@2.117.2`
Expected: `package.json` dependencies gains `"@supabase/supabase-js": "2.117.2"`.

- [ ] **Step 2: Write the failing tests**

`tests/lib/sync/supabaseTransport.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SupabaseTransport, mapPostgrestError, normalizeTimestamp } from '$lib/sync/supabaseTransport';
import { SyncError } from '$lib/sync/transport';

// A client that records the calls made on it and answers with a canned result.
function fakeClient(result: unknown) {
  const calls: [string, ...unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const name of ['upsert', 'select', 'gte', 'order', 'limit']) {
    builder[name] = (...args: unknown[]) => {
      calls.push([name, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)).then(resolve, reject);
  const client = {
    from: (table: string) => {
      calls.push(['from', table]);
      return builder;
    },
    rpc: (fn: string) => {
      calls.push(['rpc', fn]);
      return builder;
    },
  };
  return { client: client as never, calls };
}

describe('mapPostgrestError', () => {
  const kind = (f: Parameters<typeof mapPostgrestError>[0]) => mapPostgrestError(f).kind;

  it('treats a bad or missing session as auth', () => {
    expect(kind({ status: 401, code: 'PGRST301', message: 'JWT expired' })).toBe('auth');
    expect(kind({ status: 401, code: '42501', message: 'permission denied for table' })).toBe('auth');
    expect(kind({ status: 400, code: '28000', message: 'not signed in' })).toBe('auth');
  });

  it('treats a row-level security refusal as not invited', () => {
    expect(kind({ status: 403, code: '42501', message: 'new row violates row-level security policy' })).toBe('notAllowed');
  });

  it('treats a missing column, table or function as an out-of-date database', () => {
    for (const code of ['PGRST204', 'PGRST205', 'PGRST202', '42703', '42P01', '42883']) {
      expect(kind({ status: 400, code, message: 'x' }), code).toBe('schema');
    }
  });

  it('treats failures to reach the server as network, so the queue is kept and retried', () => {
    expect(kind({ status: 0, message: 'TypeError: Failed to fetch' })).toBe('network');
    expect(kind({ status: 503, message: 'Service Unavailable' })).toBe('network');
    expect(kind({ status: 429, message: 'Too many requests' })).toBe('network');
    expect(kind({ status: 408, message: 'timeout' })).toBe('network');
  });

  it('treats a constraint or data error on a row as rejected', () => {
    expect(kind({ status: 400, code: '23514', message: 'violates check constraint' })).toBe('rejected');
    expect(kind({ status: 409, code: '23505', message: 'duplicate key' })).toBe('rejected');
    expect(kind({ status: 400, code: '22P02', message: 'invalid input syntax' })).toBe('rejected');
  });

  it('retries rather than parks anything it does not recognise', () => {
    expect(kind({ status: 418, code: 'XX999', message: 'teapot' })).toBe('network');
  });

  it('keeps the message', () => {
    expect(mapPostgrestError({ status: 400, code: '23514', message: 'bad row' }).message).toBe('bad row');
  });
});

describe('normalizeTimestamp', () => {
  it('writes every form Postgres produces as UTC milliseconds', () => {
    expect(normalizeTimestamp('2026-10-20T12:34:56.123456+00:00')).toBe('2026-10-20T12:34:56.123Z');
    expect(normalizeTimestamp('2026-10-20T12:34:56+00:00')).toBe('2026-10-20T12:34:56.000Z');
    expect(normalizeTimestamp('2026-10-20T12:34:56.1+00:00')).toBe('2026-10-20T12:34:56.100Z');
    expect(normalizeTimestamp('2026-10-20T14:34:56.5+02:00')).toBe('2026-10-20T12:34:56.500Z');
  });

  it('leaves null and anything unparseable alone', () => {
    expect(normalizeTimestamp(null)).toBeNull();
    expect(normalizeTimestamp('not a date')).toBe('not a date');
  });
});

describe('SupabaseTransport requests', () => {
  it('upserts on the primary key, never blanking missing columns, and asks for the stored rows back', async () => {
    const { client, calls } = fakeClient({ data: [{ id: 'a', updated_at: '2026-10-20T12:00:00.123456+00:00' }], error: null, status: 201 });
    const rows = [{ id: 'a', amount_cents: 1, updated_at: '2026-10-20T12:00:00.000Z', deleted_at: null }];

    const stored = await new SupabaseTransport(client).upsert('allocations', rows);

    expect(calls).toEqual([
      ['from', 'allocations'],
      ['upsert', rows, { onConflict: 'user_id,id', defaultToNull: false }],
      ['select', 'id,updated_at'],
    ]);
    expect(stored).toEqual([{ id: 'a', updated_at: '2026-10-20T12:00:00.123Z' }]);
  });

  it('pulls oldest first by write time then id, from the given time, up to the limit', async () => {
    const { client, calls } = fakeClient({ data: [], error: null, status: 200 });
    await new SupabaseTransport(client).pull('transactions', '2026-10-20T11:59:00.000Z', 500);
    expect(calls).toEqual([
      ['from', 'transactions'],
      ['select', '*'],
      ['gte', 'synced_at', '2026-10-20T11:59:00.000Z'],
      ['order', 'synced_at', { ascending: true }],
      ['order', 'id', { ascending: true }],
      ['limit', 500],
    ]);
  });

  it('pulls everything when there is no starting time, and normalizes the sync columns', async () => {
    const { client, calls } = fakeClient({
      data: [{ id: 'a', updated_at: '2026-10-20T12:00:00+00:00', synced_at: '2026-10-20T12:00:01.654321+00:00', deleted_at: null, amount_cents: 5 }],
      error: null, status: 200,
    });
    const rows = await new SupabaseTransport(client).pull('allocations', null, 1000);
    expect(calls.map((c) => c[0])).toEqual(['from', 'select', 'order', 'order', 'limit']);
    expect(rows[0]).toMatchObject({ updated_at: '2026-10-20T12:00:00.000Z', synced_at: '2026-10-20T12:00:01.654Z', deleted_at: null, amount_cents: 5 });
  });

  it('reads the account state from the RPC', async () => {
    const { client, calls } = fakeClient({
      data: { allowed: true, schemaVersion: 1, buckets: [{ id: 'b', updated_at: '2026-10-20T12:00:00+00:00', synced_at: '2026-10-20T12:00:00+00:00', deleted_at: null }], hasOtherRows: false },
      error: null, status: 200,
    });
    const state = await new SupabaseTransport(client).accountState();
    expect(calls).toEqual([['rpc', 'sync_account_state']]);
    expect(state).toMatchObject({ allowed: true, schemaVersion: 1, hasOtherRows: false });
    expect(state.buckets[0].updated_at).toBe('2026-10-20T12:00:00.000Z');
  });
});

describe('SupabaseTransport failures', () => {
  it('throws a SyncError mapped from the error PostgREST returned', async () => {
    const { client } = fakeClient({ data: null, error: { code: '23514', message: 'bad row' }, status: 400 });
    await expect(new SupabaseTransport(client).upsert('allocations', [{ id: 'a' }])).rejects.toMatchObject({ kind: 'rejected', message: 'bad row' });
  });

  it('throws a network error when the request itself fails', async () => {
    const { client } = fakeClient(new TypeError('Failed to fetch'));
    const error = await new SupabaseTransport(client).pull('allocations', null, 10).catch((e) => e);
    expect(error).toBeInstanceOf(SyncError);
    expect(error.kind).toBe('network');
  });

  it('treats an account check that returns nothing as an out-of-date database', async () => {
    const { client } = fakeClient({ data: null, error: null, status: 200 });
    await expect(new SupabaseTransport(client).accountState()).rejects.toMatchObject({ kind: 'schema' });
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run tests/lib/sync/supabaseTransport.test.ts`
Expected: FAIL, module `$lib/sync/supabaseTransport` not found.

- [ ] **Step 4: Implement**

`src/lib/sync/supabaseTransport.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Row } from './registry';
import { SyncError, type AccountState, type PulledRow, type StoredStamp, type SyncTransport } from './transport';

// The sync transport over Supabase: PostgREST for the tables, one RPC for
// the account check. Everything the engine needs from the server, in terms
// of the SyncTransport interface, so the engine never sees Supabase.

export interface PostgrestFailure {
  status?: number;
  code?: string;
  message?: string;
}

const SCHEMA_CODES = new Set([
  'PGRST202', // function not found
  'PGRST204', // column not found in the schema cache
  'PGRST205', // table not found in the schema cache
  '42703', // undefined column
  '42P01', // undefined table
  '42883', // undefined function
]);

const NETWORK_MESSAGE = /fetch|network|load failed|timeout|timed out|abort/i;

// Maps what PostgREST or Postgres says to what the engine can act on.
// Order matters: a permission problem for an anonymous caller arrives as
// 42501 with HTTP 401, and that one is about the session, not the invite.
export function mapPostgrestError(failure: PostgrestFailure): SyncError {
  const message = failure.message || 'Request failed';
  const status = failure.status ?? 0;
  const code = failure.code ?? '';

  if (status === 401 || code.startsWith('PGRST30') || code.startsWith('28')) return new SyncError('auth', message);
  if (code === '42501' || status === 403) return new SyncError('notAllowed', message);
  if (SCHEMA_CODES.has(code)) return new SyncError('schema', message);
  if (status === 0 || status === 408 || status === 429 || (status >= 500 && !code) || NETWORK_MESSAGE.test(message)) {
    return new SyncError('network', message);
  }
  // A constraint or data problem with a row: the batch is refused for good.
  if (/^(21|22|23)/.test(code) || code === 'P0001' || [400, 409, 422].includes(status)) {
    return new SyncError('rejected', message);
  }
  // Unknown: retry later rather than park the person's data.
  return new SyncError('network', message);
}

interface Result<T> {
  data: T | null;
  error: { code?: string; message?: string } | null;
  status: number;
}

// Postgres writes a timestamp as 2026-10-20T12:34:56.123456+00:00, with a
// varying number of fraction digits. The engine compares these as strings
// and parses them with Date.parse, so give it one fixed form: UTC,
// milliseconds, 'Z'.
export function normalizeTimestamp(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const ms = Date.parse(value.replace(/(\.\d{3})\d+/, '$1'));
  return Number.isNaN(ms) ? value : new Date(ms).toISOString();
}

const SYNC_TIME_COLUMNS = ['updated_at', 'deleted_at', 'synced_at'];

function normalizeRow<T extends Row>(row: T): T {
  const out: Row = { ...row };
  for (const col of SYNC_TIME_COLUMNS) if (col in out) out[col] = normalizeTimestamp(out[col]);
  return out as T;
}

type Client = Pick<SupabaseClient, 'from' | 'rpc'>;

export class SupabaseTransport implements SyncTransport {
  constructor(private client: Client) {}

  private async run<T>(request: PromiseLike<Result<T>>): Promise<T | null> {
    let result: Result<T>;
    try {
      result = await request;
    } catch (e) {
      throw new SyncError('network', e instanceof Error ? e.message : 'Network request failed');
    }
    if (result.error) throw mapPostgrestError({ ...result.error, status: result.status });
    return result.data;
  }

  async accountState(): Promise<AccountState> {
    const data = await this.run<Record<string, unknown>>(this.client.rpc('sync_account_state') as unknown as PromiseLike<Result<Record<string, unknown>>>);
    if (!data || typeof data !== 'object') throw new SyncError('schema', 'The sync account check returned nothing');
    return {
      allowed: data.allowed === true,
      schemaVersion: Number(data.schemaVersion),
      buckets: ((data.buckets as PulledRow[] | undefined) ?? []).map(normalizeRow),
      hasOtherRows: data.hasOtherRows === true,
    };
  }

  async upsert(remote: string, rows: Row[]): Promise<StoredStamp[]> {
    // onConflict names the primary key; defaultToNull false so a column a row
    // does not mention is never blanked. Only the rows actually stored come
    // back: one the server skipped (it held a newer edit) is absent.
    const request = this.client
      .from(remote)
      .upsert(rows as never, { onConflict: 'user_id,id', defaultToNull: false })
      .select('id,updated_at');
    const data = await this.run<{ id: string; updated_at: string }[]>(request as unknown as PromiseLike<Result<{ id: string; updated_at: string }[]>>);
    return (data ?? []).map((r) => ({ id: String(r.id), updated_at: String(normalizeTimestamp(r.updated_at)) }));
  }

  async pull(remote: string, since: string | null, limit: number): Promise<PulledRow[]> {
    let query = this.client.from(remote).select('*');
    if (since !== null) query = query.gte('synced_at', since);
    const request = query.order('synced_at', { ascending: true }).order('id', { ascending: true }).limit(limit);
    const data = await this.run<PulledRow[]>(request as unknown as PromiseLike<Result<PulledRow[]>>);
    return (data ?? []).map(normalizeRow);
  }
}
```

- [ ] **Step 5: Run the tests, the whole suite and the type check**

Run: `npx vitest run tests/lib/sync/supabaseTransport.test.ts && npx vitest run && npm run check`
Expected: 16 new tests PASS, the suite PASS, 0 type errors.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync-supabase
git add package.json package-lock.json src/lib/sync/supabaseTransport.ts tests/lib/sync/supabaseTransport.test.ts
git commit --no-gpg-sign -m "feat(supabase): the sync transport over supabase-js, with error mapping"
```

---

### Task 5: The engine against the real database

**Files:**
- Create: `tests/helpers/postgrestOverPglite.ts`, `tests/sql/parity.test.ts`
- Modify (only if a scenario fails): the module the failure points at, with its own focused test first.

**Interfaces:**
- Consumes: everything from Tasks 1–4 and the sync engine (`syncOnce`, `checkAccount`, `runFirstSignIn`, `pushPending`).
- Produces: `class PostgrestOverPglite` (the calls `SupabaseTransport` makes, run as SQL; throws on anything else) and the scenarios that run the engine, through the real transport, against the real SQL.

This task adds no production code. The scenarios mirror the `FakeServer` tests from the engine plan, so a difference between the fake and the database shows up here as a failure. If one fails, decide whether the fake or the SQL is wrong, fix that with a focused test first, and note it in the ledger.

- [ ] **Step 1: Write the PostgREST stand-in**

`tests/helpers/postgrestOverPglite.ts`:

```ts
import type { PGlite } from '@electric-sql/pglite';

// Just enough of PostgREST/supabase-js to run SupabaseTransport against a
// real Postgres: .from(t).upsert(rows, {onConflict}).select(cols),
// .from(t).select('*').gte().order().order().limit(), and .rpc(fn). Each call
// runs the statement PostgREST would run, as the role the test has set, and
// answers with {data, error, status} the way supabase-js does. Anything the
// transport does that is not supported here throws, so a change in the
// transport's requests fails the parity tests instead of passing quietly.

interface Failure {
  code?: string;
  message: string;
}

// PostgREST's HTTP status for a Postgres error (the cases that can occur).
function statusFor(code: string | undefined, role: string): number {
  if (code === '42501') return role === 'anon' ? 401 : 403;
  if (!code) return 500;
  if (code === '23505' || code === '23503') return 409;
  if (code.startsWith('28')) return 403;
  if (code === '42P01' || code === '42883') return 404;
  return 400;
}

async function currentRole(pg: PGlite): Promise<string> {
  return (await pg.query<{ r: string }>('select current_user as r')).rows[0].r;
}

async function execute<T>(pg: PGlite, run: () => Promise<T>): Promise<{ data: T | null; error: Failure | null; status: number }> {
  try {
    return { data: await run(), error: null, status: 200 };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { data: null, error: { code: err.code, message: err.message ?? 'error' }, status: statusFor(err.code, await currentRole(pg)) };
  }
}

class TableBuilder implements PromiseLike<unknown> {
  private op: 'select' | 'upsert' = 'select';
  private rows: Record<string, unknown>[] = [];
  private returning = '';
  private filters: { column: string; value: unknown }[] = [];
  private orders: { column: string; ascending: boolean }[] = [];
  private max: number | null = null;

  constructor(private pg: PGlite, private table: string) {}

  upsert(rows: Record<string, unknown>[], options: { onConflict?: string; defaultToNull?: boolean }): this {
    if (options.onConflict !== 'user_id,id') throw new Error('unsupported onConflict');
    if (options.defaultToNull !== false) throw new Error('the transport must pass defaultToNull: false');
    this.op = 'upsert';
    this.rows = rows;
    return this;
  }

  select(columns: string): this {
    if (this.op === 'upsert') this.returning = columns;
    else if (columns !== '*') throw new Error('unsupported select');
    return this;
  }

  gte(column: string, value: unknown): this {
    if (column !== 'synced_at') throw new Error('unsupported filter');
    this.filters.push({ column, value });
    return this;
  }

  order(column: string, options: { ascending: boolean }): this {
    this.orders.push({ column, ascending: options.ascending });
    return this;
  }

  limit(n: number): this {
    this.max = n;
    return this;
  }

  then<R1, R2>(onfulfilled?: (v: unknown) => R1 | PromiseLike<R1>, onrejected?: (e: unknown) => R2 | PromiseLike<R2>) {
    return this.run().then(onfulfilled, onrejected);
  }

  private async run() {
    const t = `public."${this.table}"`;
    return execute(this.pg, async () => {
      if (this.op === 'upsert') {
        // What PostgREST sends: the union of the payload's keys as the column
        // list, rows from json_populate_recordset, merge on the primary key.
        const columns = [...new Set(this.rows.flatMap((r) => Object.keys(r)))];
        const list = columns.map((c) => `"${c}"`).join(', ');
        const set = columns.filter((c) => c !== 'id').map((c) => `"${c}" = excluded."${c}"`).join(', ');
        const returning = this.returning.split(',').map((c) => `"${c.trim()}"`).join(', ');
        const { rows } = await this.pg.query<{ r: unknown }>(
          `with stored as (
             insert into ${t} (${list})
             select ${list} from json_populate_recordset(null::${t}, $1::json)
             on conflict (user_id, id) do update set ${set}
             returning ${returning}
           ) select to_jsonb(stored) as r from stored`,
          [JSON.stringify(this.rows)]
        );
        return rows.map((x) => x.r);
      }
      const params: unknown[] = this.filters.map((f) => f.value);
      const where = this.filters.map((f, i) => `"${f.column}" >= $${i + 1}::timestamptz`).join(' and ');
      const order = this.orders.map((o) => `"${o.column}" ${o.ascending ? 'asc' : 'desc'}`).join(', ');
      const { rows } = await this.pg.query<{ r: unknown }>(
        `select to_jsonb(t) as r from ${t} t ${where ? `where ${where}` : ''} ${order ? `order by ${order}` : ''} ${this.max ? `limit ${this.max}` : ''}`,
        params
      );
      return rows.map((x) => x.r);
    });
  }
}

class RpcBuilder implements PromiseLike<unknown> {
  constructor(private pg: PGlite, private fn: string) {}

  then<R1, R2>(onfulfilled?: (v: unknown) => R1 | PromiseLike<R1>, onrejected?: (e: unknown) => R2 | PromiseLike<R2>) {
    return execute(this.pg, async () => {
      const { rows } = await this.pg.query<{ r: unknown }>(`select public.${this.fn}() as r`);
      return rows[0].r;
    }).then(onfulfilled, onrejected);
  }
}

export class PostgrestOverPglite {
  constructor(private pg: PGlite) {}
  from(table: string) {
    return new TableBuilder(this.pg, table);
  }
  rpc(fn: string) {
    return new RpcBuilder(this.pg, fn);
  }
}
```

- [ ] **Step 2: Write the scenarios**

`tests/sql/parity.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDevice, dropDevice } from '../helpers/devices';
import { createSupabaseDb, resetData, addUser, asOwner, asUser, USER_A, USER_B, USER_C } from '../helpers/supabaseSql';
import { PostgrestOverPglite } from '../helpers/postgrestOverPglite';
import { SupabaseTransport } from '$lib/sync/supabaseTransport';
import { syncOnce, checkAccount } from '$lib/sync/engine';
import { runFirstSignIn } from '$lib/sync/firstSignIn';
import { pushPending } from '$lib/sync/push';
import { getState, LINKED_ACCOUNT } from '$lib/sync/state';
import { COLLECTIONS, toRow } from '$lib/sync/registry';
import { resetClockForTests } from '$lib/sync/clock';
import type { BudgetDatabase } from '$lib/db';

// The engine, through the real SupabaseTransport, against the real SQL.
// The same scenarios the FakeServer tests run, so a difference between the
// fake and the database shows up here.

let pg: PGlite;
let A: BudgetDatabase;
let B: BudgetDatabase;
const day = new Date(2026, 9, 20);
const transport = () => new SupabaseTransport(new PostgrestOverPglite(pg) as never);
const ctx = (db: BudgetDatabase) => ({ db, transport: transport() });
const sync = (db: BudgetDatabase) => syncOnce(ctx(db));
const bucket = (id: string) => ({ id, name: id, color: '#000', order: 0, isDefault: false, allocationType: 'fixed' as const, fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: true, createdAt: new Date(2026, 0, 1) });
const tx = (id: string, over: Record<string, unknown> = {}) => ({ id, amount: 100, bucketId: 'b1', date: day, ...over });

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

const live = async (table: string) => {
  await asOwner(pg);
  const rows = (await pg.query<{ id: string; amount_cents: string }>(`select id, amount_cents from public.${table} where deleted_at is null order by id`)).rows;
  await asUser(pg, USER_A);
  return rows;
};

beforeAll(async () => {
  pg = await createSupabaseDb();
});

beforeEach(async () => {
  resetClockForTests();
  await resetData(pg);
  await addUser(pg, USER_A);
  await addUser(pg, USER_B);
  await addUser(pg, USER_C, false);
  await asUser(pg, USER_A);
  A = await makeDevice('sql-a');
  B = await makeDevice('sql-b');
});

afterEach(async () => {
  await dropDevice(A);
  await dropDevice(B);
});

describe('the engine against the real database', () => {
  it('spreads new records from one device to the other', async () => {
    await A.buckets.add(bucket('b1'));
    await A.transactions.add(tx('t1', { note: 'Flight', foreign: { amount: 500000, currency: 'INR', rate: 84.25, base: 'USD' } }));
    expect(await sync(A)).toMatchObject({ status: 'ok', pushed: 2 });
    await settle();
    expect(await B.transactions.get('t1')).toMatchObject({ amount: 100, note: 'Flight', foreign: { amount: 500000, currency: 'INR', rate: 84.25, base: 'USD' } });
    expect(await state(A)).toEqual(await state(B));
    expect(await A.syncOutbox.count()).toBe(0);
  });

  it('does not rewrite a device\'s own records when its pushed rows come back', async () => {
    await A.buckets.add(bucket('b1'));
    await A.transactions.add(tx('t1', { date: new Date(2026, 9, 20, 15, 30), createdAt: 1790000000123 }));
    await sync(A);
    expect(await sync(A)).toMatchObject({ status: 'ok', changed: false, pushed: 0 });
    expect((await A.transactions.get('t1'))!.date.getHours()).toBe(15);
  });

  it('converges on the later edit when both devices edit the same record', async () => {
    await A.buckets.add(bucket('b1'));
    await A.transactions.add(tx('t1'));
    await settle();
    await A.transactions.update('t1', { amount: 1 });
    await B.transactions.update('t1', { amount: 2 });
    await settle();
    expect((await A.transactions.get('t1'))!.amount).toBe(2);
    expect((await live('transactions')).map((r) => [r.id, Number(r.amount_cents)])).toEqual([['t1', 2]]);
  });

  it('keeps an edit made after a delete, and a delete made after an edit', async () => {
    await A.buckets.add(bucket('b1'));
    await A.transactions.bulkAdd([tx('keep'), tx('gone')]);
    await settle();
    await A.transactions.delete('keep');
    await B.transactions.update('keep', { amount: 5 });
    await B.transactions.update('gone', { amount: 5 });
    await A.transactions.delete('gone');
    await settle();
    expect((await A.transactions.get('keep'))!.amount).toBe(5);
    expect(await B.transactions.get('gone')).toBeUndefined();
    expect((await live('transactions')).map((r) => r.id)).toEqual(['keep']);
    expect(await state(A)).toEqual(await state(B));
  });

  it('lets a device edit a record whose latest version came from a clock ahead of its own', async () => {
    await A.buckets.add(bucket('b1'));
    await sync(A);
    // Another device with a clock 30 s ahead (inside the server's 1 minute allowance).
    const ahead = Date.now() + 30_000;
    const def = COLLECTIONS.find((c) => c.table === 'transactions')!;
    await transport().upsert('transactions', [{ ...toRow(def, tx('t1')), updated_at: new Date(ahead).toISOString(), deleted_at: null }]);
    await sync(A);
    await A.transactions.update('t1', { amount: 42 });
    expect((await A.syncOutbox.get('transactions:t1'))!.at).toBe(ahead + 1);
    await settle();
    expect(Number((await live('transactions'))[0].amount_cents)).toBe(42);
    expect((await B.transactions.get('t1'))!.amount).toBe(42);
  });

  it('caps an edit time far in the future, and still lets the device edit again afterwards', async () => {
    await A.buckets.add(bucket('b1'));
    await A.transactions.add(tx('t1'));
    await A.syncVersions.put({ key: 'transactions:t1', at: Date.now() + 10 * 86_400_000 });
    await A.transactions.update('t1', { amount: 7 });
    await sync(A);
    const stored = (await A.syncVersions.get('transactions:t1'))!.at;
    expect(stored).toBeLessThan(Date.now() + 120_000); // the server's cap, not the 10 days
    await A.transactions.update('t1', { amount: 8 });
    await settle();
    expect(Number((await live('transactions'))[0].amount_cents)).toBe(8);
  });

  it('merges assignments to different buckets in the same month', async () => {
    await A.allocations.put({ id: '2026-10:b1', month: '2026-10', bucketId: 'b1', amount: 100 });
    await B.allocations.put({ id: '2026-10:b2', month: '2026-10', bucketId: 'b2', amount: 200 });
    await settle();
    for (const d of [A, B]) expect((await d.allocations.toArray()).map((a) => a.id).sort()).toEqual(['2026-10:b1', '2026-10:b2']);
  });

  it('files a transaction under Unsorted when its bucket was deleted on the other device', async () => {
    await A.buckets.add(bucket('b1'));
    await settle();
    await A.buckets.delete('b1');
    await B.transactions.add(tx('t9'));
    await settle();
    for (const d of [A, B]) {
      expect(await d.buckets.get('b1')).toBeUndefined();
      expect((await d.transactions.get('t9'))!.bucketId).toBe('unsorted');
    }
    expect(await state(A)).toEqual(await state(B));
  });

  it('adds up sold shares when both devices sell from the same lot', async () => {
    await A.investmentLots.add({ id: 'l1', symbol: 'VTI', shares: 10, pricePerShare: 1000, purchaseDate: day, soldShares: 0 });
    await settle();
    await A.investmentSells.add({ id: 's1', lotId: 'l1', shares: 3, pricePerShare: 1100, sellDate: day });
    await A.investmentLots.update('l1', { soldShares: 3 });
    await B.investmentSells.add({ id: 's2', lotId: 'l1', shares: 4, pricePerShare: 1100, sellDate: day });
    await B.investmentLots.update('l1', { soldShares: 4 });
    await settle();
    for (const d of [A, B]) expect((await d.investmentLots.get('l1'))!.soldShares).toBe(7);
  });

  it('parks a row the database refuses and still uploads the rest', async () => {
    await A.allocations.bulkAdd([
      { id: '2026-10:ok', month: '2026-10', bucketId: 'ok', amount: 1 },
      { id: 'bad', month: 'not-a-month', bucketId: 'bad', amount: 1 },
    ]);
    const result = await sync(A);
    expect(result).toMatchObject({ status: 'ok', pushed: 1, parked: 1 });
    const parked = (await A.syncOutbox.get('allocations:bad'))!;
    expect(parked.parked).toBe(true);
    expect(parked.error).toMatch(/month_valid|check constraint/);
    expect((await live('allocations')).map((r) => r.id)).toEqual(['2026-10:ok']);
  });

  it('stops an account that is not invited, with a message instead of an error', async () => {
    await asUser(pg, USER_C);
    expect(await checkAccount(ctx(A))).toMatchObject({ status: 'notAllowed' });
    await A.buckets.add(bucket('b1'));
    expect(await sync(A)).toMatchObject({ status: 'notAllowed' });
    expect(await A.syncOutbox.count()).toBe(1);
  });

  it('reports an account that is not signed in as a session problem', async () => {
    await asOwner(pg);
    await pg.exec(`set role anon`);
    expect(await checkAccount(ctx(A))).toMatchObject({ status: 'auth' });
  });
});

describe('first sign-in against the real database', () => {
  const state1 = async () => (await pg.query<{ s: { buckets: unknown[]; hasOtherRows: boolean } }>(`select public.sync_account_state() as s`)).rows[0].s;

  it('uploads a device\'s data to an empty account', async () => {
    await A.buckets.add(bucket('b1'));
    await A.transactions.add(tx('t1'));
    const result = await runFirstSignIn(ctx(A), USER_A.id);
    expect(result).toMatchObject({ status: 'done', plan: 'upload', sync: { status: 'ok' } });
    expect((await live('transactions')).map((r) => r.id)).toEqual(['t1']);
    expect(await getState(A, LINKED_ACCOUNT)).toBe(USER_A.id);
  });

  it('downloads the account into an empty device', async () => {
    await A.buckets.add(bucket('b1'));
    await A.transactions.add(tx('t1'));
    await runFirstSignIn(ctx(A), USER_A.id);
    const result = await runFirstSignIn(ctx(B), USER_A.id);
    expect(result).toMatchObject({ status: 'done', plan: 'download' });
    expect(await B.transactions.get('t1')).toBeTruthy();
    expect(await B.syncOutbox.count()).toBe(0);
  });

  it('asks before replacing a device when both sides hold data', async () => {
    await A.buckets.add(bucket('b1'));
    await runFirstSignIn(ctx(A), USER_A.id);
    await B.buckets.add({ ...bucket('mine'), name: 'Mine' });
    expect(await runFirstSignIn(ctx(B), USER_A.id)).toEqual({ status: 'needsChoice', reason: 'conflict' });
    expect((await state1()).buckets).toHaveLength(1);
  });

  it('replaces the account\'s untouched default buckets with the device\'s data, so none appear twice', async () => {
    const { DEFAULT_BUCKETS } = await import('$lib/db');
    await B.buckets.bulkAdd(DEFAULT_BUCKETS.map((b, i) => ({ ...b, id: `d${i}`, createdAt: new Date(2026, 0, 1) })));
    await runFirstSignIn(ctx(B), USER_A.id); // uploads the defaults to the empty account
    expect((await state1()).buckets).toHaveLength(11);
    await A.buckets.add(bucket('mine'));
    await A.transactions.add(tx('t1', { bucketId: 'mine' }));
    const result = await runFirstSignIn(ctx(A), USER_A.id);
    expect(result).toMatchObject({ status: 'done', plan: 'upload' });
    expect((await state1()).buckets).toHaveLength(1);
  });

  it('says a pushed batch is empty when nothing was waiting', async () => {
    expect(await pushPending(ctx(A))).toEqual({ sent: 0, skipped: 0, parked: 0 });
  });
});
```

- [ ] **Step 3: Run the scenarios**

Run: `npx vitest run tests/sql/parity.test.ts`
Expected: PASS (17 tests).

- [ ] **Step 4: Run the whole suite and the type check**

Run: `npx vitest run && npm run check`
Expected: all PASS, 0 type errors.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync-supabase
git add tests/helpers/postgrestOverPglite.ts tests/sql/parity.test.ts
git commit --no-gpg-sign -m "test(supabase): the sync engine runs against the real SQL through the real transport"
```

---

### Task 6: Setup documentation

**Files:**
- Create: `docs/sync-setup.md`, `supabase/README.md`, `tests/docs/syncSetup.test.ts`
- Modify: `docs/deferred.md`

**Interfaces:**
- Consumes: the file names from Tasks 1–3.
- Produces: the setup guide (part 1: the database) the project owner follows, and a test that fails if the guide names a SQL file that does not exist.

- [ ] **Step 1: Write the failing test**

`tests/docs/syncSetup.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

// The setup guide tells a person to paste specific files into the dashboard.
// A renamed or missing file would send them to something that does not exist.
const sql = Object.keys(import.meta.glob('/supabase/**/*.sql', { query: '?raw', import: 'default', eager: true }));
const guide = Object.values(import.meta.glob('/docs/sync-setup.md', { query: '?raw', import: 'default', eager: true }))[0] as string;

describe('docs/sync-setup.md', () => {
  it('only mentions SQL files that exist', () => {
    const mentioned = [...guide.matchAll(/supabase\/[\w/.-]+\.sql/g)].map((m) => `/${m[0]}`);
    expect(mentioned.length).toBeGreaterThanOrEqual(3);
    for (const path of mentioned) expect(sql, path).toContain(path);
  });

  it('applies the migrations in file-name order', () => {
    const mentioned = [...guide.matchAll(/supabase\/migrations\/[\w.-]+\.sql/g)].map((m) => m[0]);
    expect(mentioned).toEqual([...mentioned].sort());
  });

  it('never tells anyone to put a secret key in the app', () => {
    expect(guide).toMatch(/Never put the secret key/);
    expect(guide).not.toMatch(/service_role['"` ]*=|sb_secret_[A-Za-z0-9]/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/docs/syncSetup.test.ts`
Expected: FAIL (`docs/sync-setup.md` does not exist, so the guide is undefined).

- [ ] **Step 3: Write the setup guide**

`docs/sync-setup.md`:

````markdown
# Setting up cloud sync

Cloud sync is optional. The app works exactly as before until a Supabase project is connected and someone signs in. This guide has two parts:

1. **The database** (this part): create the Supabase project, apply the migrations, invite yourself, check it.
2. **Sign-in and the deployed site** (added with the sign-in release): the Google login key, redirect addresses and the GitHub variables.

You do part 1 once. It takes about 15 minutes. Nothing in it can change or delete data in the app itself.

## Before you start

- A Supabase account. The Free plan is enough: two active projects (the other is your existing one), 500 MB per project, 50,000 monthly active users.
- Free projects **pause after a week of inactivity** and have **no automatic backups**. While a project is paused the app keeps working on the device and syncs again once the project is resumed from the dashboard. Keep exporting JSON backups from Settings.
- The email of the Google account you will sign in with, in lowercase.

## Part 1: the database

### 1. Create the project

1. Open the Supabase dashboard and choose **New project**.
2. Name it `bdgt`. Pick the region closest to you (syncing happens in the background, so the choice barely matters).
3. Set a database password and store it in your password manager. The app never uses it.
4. Wait for the project to finish provisioning.

### 2. Apply the migrations

Open **SQL Editor → New query** and run each file below, in this order, one at a time. Copy the whole file from this repository, paste it in, and press **Run**. Each should end with *Success. No rows returned*.

1. `supabase/migrations/20261021000000_sync_core.sql` — the tables, the write rules and the access rules.
2. `supabase/migrations/20261021000100_analytics.sql` — the views for studying your data.

If a run fails, copy the error text and tell me before running anything again. The files create tables without `if not exists` on purpose: running one twice fails loudly instead of silently overwriting something.

### 3. Invite yourself

Only emails on the invite list can sync. In a new SQL query run (use your own address, lowercase):

```sql
insert into public.allowed_users (email, note) values ('you@gmail.com', 'me');
```

To invite someone else later, add their email the same way. To stop someone syncing, delete their row; their data stays in the database until you delete it.

### 4. Check the setup

In a new query paste the whole of `supabase/tests/verify_setup.sql` and run it. Every row in the result must say `true`. The last row is `true` only after step 3.

### 5. Check the API settings

1. Open **Project Settings → Data API** (shown as *API* in older dashboards).
2. Under **Exposed schemas**, only `public` (and `graphql_public`) should be listed. `analytics` and `private` must **not** be: they hold helper functions and every user's analysis views.

### 6. Copy the project's address and public key

Open **Project Settings → API Keys** and note:

- the **Project URL** (`https://<project-ref>.supabase.co`), and
- the **Publishable key** (starts with `sb_publishable_`).

Both are safe to put in the app. **Never put the secret key (`sb_secret_…`) or the old `service_role` key in the app or in GitHub variables**: it bypasses all access rules.

Send me the URL and the publishable key when you have them; the sign-in release needs them.

## Looking at your data

The `analytics` views are for you, not the app. In the SQL editor:

```sql
select * from analytics.monthly_cashflow where user_id = (select user_id from analytics.users where email = 'you@gmail.com') order by month;
select * from analytics.monthly_bucket_spend order by month desc, spent_cents desc limit 20;
select * from analytics.transactions_enriched order by date desc limit 50;
```

They hide deleted rows and the sync bookkeeping columns, show amounts in currency units next to cents, and are readable only by the project owner. To copy them into BigQuery or another tool, connect it to the project's database with a read-only role and read the `analytics` schema.

## When the schema changes

Every change to the synced tables is a new numbered file in `supabase/migrations/` that you apply in the SQL editor, in order. The app checks the database's migration level (`select public.sync_schema_version()`) and pauses sync with a clear message if the database is behind, instead of failing row by row.
````

- [ ] **Step 4: Write the supabase README**

`supabase/README.md`:

````markdown
# supabase/

SQL for the optional cloud sync. The app does not need any of this to run.

- `migrations/` — applied in file-name order in the Supabase SQL editor (see `docs/sync-setup.md`).
  - `…_sync_core.sql`: the typed tables, the write rules (trigger), the access rules (row-level security and grants), the invite list and the account check.
  - `…_analytics.sql`: the `analytics` views, closed to the app.
- `tests/verify_setup.sql` — a read-only check you run in the dashboard after applying the migrations.

The automated tests in `tests/sql/` build a real Postgres (PGlite) with the same roles and `auth` helpers as Supabase, apply these migrations, and test them: the write rules, who can see what, the constraints, the views, and the sync engine end to end through the real `SupabaseTransport`.

## Changing the schema

1. Add a new file `migrations/YYYYMMDDHHMMSS_what_it_does.sql`. Never edit one that has been applied.
2. If a synced table or column changes, add it to `src/lib/sync/registry.ts` too; the test `the schema matches the app` fails until both agree.
3. If older app versions cannot work against the new schema, bump `public.sync_schema_version()` in the new migration and `REQUIRED_SCHEMA_VERSION` in `src/lib/sync/engine.ts`.
4. Run `npx vitest run tests/sql`, then apply the file in the dashboard and run `tests/verify_setup.sql`.
````

- [ ] **Step 5: Update the deferred list**

In `docs/deferred.md`, under "Cloud sync", replace the paragraph headed "Planned next: plan 3, Supabase wiring" with:

```markdown
### Planned next: plan 4, sign-in, sync service and screens
Not deferred in the sense of dropped; it is the next plan. It covers the Supabase client and Google sign-in, the sync service (start-up, triggers, locking, backoff, status), the Settings → Sync section and status chip, the first-sign-in and sign-out dialogs, deploy variables, part 2 of `docs/sync-setup.md` (Google login key, redirect addresses, GitHub variables) and a manual check on the real project. The handoff section at the end of `docs/superpowers/plans/2026-10-21-cloud-sync-engine.md` lists what it must honor.
```

and add under "Cloud sync":

```markdown
### Acceptance of the database on the real project (waiting on the project owner)
The SQL is tested on a real Postgres in the test suite, but not yet on a real Supabase project. Follow part 1 of `docs/sync-setup.md` and confirm every row of `supabase/tests/verify_setup.sql` is `true`. Then record the project URL and publishable key for plan 4.
```

- [ ] **Step 6: Run the tests and the whole suite**

Run: `npx vitest run tests/docs && npx vitest run && npm run check`
Expected: 3 new tests PASS, the suite PASS, 0 type errors.

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync-supabase
git add docs/sync-setup.md supabase/README.md tests/docs/syncSetup.test.ts docs/deferred.md
git commit --no-gpg-sign -m "docs(supabase): setup guide for the database and a README for the SQL"
```

---

### Task 7: Verify nothing changed in the app

**Files:** none unless a bug is found (then: a test, a fix, its own commit).

- [ ] **Step 1: Full checks**

Run: `npx vitest run && npm run check && npm run build`
Expected: all PASS, 0 errors, build succeeds.

- [ ] **Step 2: The app does not import the transport, and the bundle does not contain it**

Run: `grep -rn "supabaseTransport\|supabase-js" src --include='*.ts' --include='*.svelte' | grep -v "src/lib/sync/supabaseTransport.ts"; grep -rl "sync_account_state\|supabase" build/ || echo "bundle clean"`
Expected: the first command prints nothing (no importer) and the second prints `bundle clean`.

- [ ] **Step 3: The app still starts**

Run `npm run dev -- --port 5199`, open `http://localhost:5199/` in a fresh browser profile, confirm the dashboard renders and the browser console has no errors, then stop the server and remove any Playwright output.

- [ ] **Step 4: Commit any fixes**

```bash
git branch --show-current   # must print feat/cloud-sync-supabase
git add -A src tests
git commit --no-gpg-sign -m "fix(supabase): <what was found>"
```

Skip this step if nothing needed fixing.

---

### Task 8: Acceptance on the real project (done by the project owner; not part of the pull request)

The executor does not do this task. After the pull request is open, the owner follows part 1 of `docs/sync-setup.md`:

- [ ] Create the `bdgt` project and apply the two migrations in the SQL editor.
- [ ] Add their email to `public.allowed_users`.
- [ ] Run `supabase/tests/verify_setup.sql`: every row is `true`.
- [ ] Check that `analytics` and `private` are not in the Data API's exposed schemas.
- [ ] Send the project URL and the publishable key (never the secret key) so plan 4 can use them.

If a row is `false` or a migration errors, the owner pastes the exact output; the fix is a new test in `tests/sql/` that reproduces it on PGlite where possible, then a new migration file. Do not edit an applied migration.
