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
