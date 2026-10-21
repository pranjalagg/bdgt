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

  it('stamps a row inserted without an edit time with now, not a time in the future', async () => {
    await asOwner(pg);
    await pg.query(`insert into public.allocations (user_id, id, month, bucket_id, amount_cents) values ($1, 'dash', '2026-10', 'b', 1)`, [USER_A.id]);
    const { rows } = await pg.query<{ future: boolean }>(`select updated_at > now() + interval '5 seconds' as future from public.allocations where id = 'dash'`);
    expect(rows[0].future).toBe(false);
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

describe('the invite list', () => {
  it('only accepts emails already in lower case with no surrounding spaces', async () => {
    await asOwner(pg);
    for (const bad of [' you@gmail.com', 'you@gmail.com ', 'You@Gmail.com']) {
      await expect(pg.query(`insert into public.allowed_users (email) values ($1)`, [bad]), bad).rejects.toMatchObject({ code: '23514' });
    }
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
