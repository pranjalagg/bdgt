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
  email text primary key check (email = lower(btrim(email))),
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
  -- coalesce: a row added without an edit time (the dashboard's table editor)
  -- is stamped now, not left to the cap below.
  new.updated_at := least(coalesce(new.updated_at, now()), now() + interval '1 minute');
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
