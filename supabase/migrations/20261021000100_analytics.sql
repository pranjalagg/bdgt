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
    coalesce((max(value #>> '{}') filter (where id = 'currencyConfirmed')) = 'true', false) as currency_confirmed
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
