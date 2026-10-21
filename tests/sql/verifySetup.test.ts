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

  it('catches a policy that opens a table to everyone', async () => {
    await asOwner(pg);
    const original = `for select to authenticated using (user_id = (select auth.uid()) and (select private.sync_is_allowed()))`;
    await pg.exec(`drop policy transactions_select on public.transactions; create policy transactions_select on public.transactions for select to authenticated, anon using (true)`);
    try {
      const failing = (await run()).filter((r) => !r.ok).map((r) => r.name);
      expect(failing).toEqual(['every synced table has exactly its three access policies, for signed-in users only']);
    } finally {
      await pg.exec(`drop policy transactions_select on public.transactions; create policy transactions_select on public.transactions ${original}`);
    }
  });

  it('catches privileges beyond read, add and change for signed-out visitors', async () => {
    await asOwner(pg);
    await pg.exec('grant truncate on public.buckets to anon');
    expect((await run()).filter((r) => !r.ok).map((r) => r.name)).toEqual(['signed-out visitors have no access to any table']);
    await pg.exec('revoke truncate on public.buckets from anon');
    await pg.exec('grant references on public.buckets to authenticated');
    expect((await run()).filter((r) => !r.ok).map((r) => r.name)).toEqual(['signed-in users can read, add and change synced rows, but not delete them']);
    await pg.exec('revoke references on public.buckets from authenticated');
  });

  it('catches a policy added to the invite list', async () => {
    await asOwner(pg);
    await pg.exec(`create policy open on public.allowed_users for select to authenticated using (true)`);
    expect((await run()).filter((r) => !r.ok).map((r) => r.name)).toEqual(['signed-in users cannot read or change the invite list']);
    await pg.exec('drop policy open on public.allowed_users');
  });

  it('catches an account check that is not a security definer function', async () => {
    await asOwner(pg);
    await pg.exec('alter function public.sync_account_state() security invoker');
    expect((await run()).filter((r) => !r.ok).map((r) => r.name)).toEqual(['the account check can be called by signed-in users only']);
    await pg.exec('alter function public.sync_account_state() security definer');
  });

  it('still passes at a later migration level', async () => {
    await asOwner(pg);
    await pg.exec(`create or replace function public.sync_schema_version() returns integer language sql immutable set search_path = '' as $$ select 2 $$`);
    expect((await run()).filter((r) => !r.ok)).toEqual([]);
    await pg.exec(`create or replace function public.sync_schema_version() returns integer language sql immutable set search_path = '' as $$ select 1 $$`);
  });

  it('catches row level security switched off', async () => {
    await asOwner(pg);
    await pg.exec('alter table public.incomes disable row level security');
    const failing = (await run()).filter((r) => !r.ok).map((r) => r.name);
    expect(failing).toContain('row level security is on for all 11 synced tables and the invite list');
    await pg.exec('alter table public.incomes enable row level security');
  });
});
