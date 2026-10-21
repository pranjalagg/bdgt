-- Payment capture: payments noticed on a phone wait in a review queue
-- (captures), and approving teaches a rule for the payee (capture_rules).
-- Both follow the same shape and rules as every other synced table. The
-- full message text behind a capture never leaves the phone, so nothing here
-- stores it.

-- The app needs >= 2 from here on.
create or replace function public.sync_schema_version() returns integer
language sql immutable
set search_path = ''
as $$ select 2 $$;

create table public.captures (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  status text check (status in ('pending', 'approved', 'dismissed', 'duplicate')),
  source text check (source in ('wallet', 'sms', 'upi-app')),
  source_label text,
  posted_at timestamptz,
  date date,
  amount_minor bigint,
  currency text,
  merchant text,
  payee_key text,
  kind text check (kind in ('grocery', 'dining', 'transport', 'subscriptions', 'entertainment', 'utilities')),
  account_hint text,
  hint text check (hint in ('card-bill', 'transfer', 'atm', 'upi-lite-topup')),
  duplicate_of text,
  transaction_id text,
  resolved_at timestamptz,
  updated_at timestamptz not null,
  synced_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  extra jsonb not null default '{}'::jsonb,
  primary key (user_id, id),
  constraint live_row_complete check (deleted_at is not null or (
    status is not null and source is not null and posted_at is not null and date is not null
    and amount_minor is not null and currency is not null and merchant is not null))
);

create table public.capture_rules (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  payee_key text,
  merchant text,
  action text check (action in ('suggest', 'ignore')),
  bucket_id text,
  updated_at timestamptz not null,
  synced_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  extra jsonb not null default '{}'::jsonb,
  primary key (user_id, id),
  constraint live_row_complete check (deleted_at is not null or (
    payee_key is not null and action is not null and (action = 'ignore' or bucket_id is not null)))
);

do $$
declare
  t text;
begin
  foreach t in array array['captures', 'capture_rules']
  loop
    execute format('create trigger sync_write before insert or update on public.%I for each row execute function private.sync_write()', t);
    execute format('create index %I on public.%I (user_id, synced_at, id)', t || '_pull_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()) and (select private.sync_is_allowed()))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()) and (select private.sync_is_allowed()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid()) and (select private.sync_is_allowed())) with check (user_id = (select auth.uid()) and (select private.sync_is_allowed()))', t || '_update', t);
  end loop;
end
$$;

-- Same as before, with the two new tables counted as data.
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
      or exists (select 1 from public.captures where user_id = uid and deleted_at is null)
      or exists (select 1 from public.capture_rules where user_id = uid and deleted_at is null)
  );
end
$$;

create view analytics.captures as
  select user_id, id, status, source, source_label, posted_at, date,
         amount_minor, amount_minor / 100.0 as amount, currency, merchant, payee_key, kind,
         account_hint, hint, duplicate_of, transaction_id, resolved_at
  from public.captures where deleted_at is null;

create view analytics.capture_rules as
  select user_id, id, payee_key, merchant, action, bucket_id
  from public.capture_rules where deleted_at is null;
