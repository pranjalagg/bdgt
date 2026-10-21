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
