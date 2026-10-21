-- Read-only check of a freshly set up project. Paste into the Supabase SQL
-- editor and run it after applying the migrations: every row should say
-- true. It changes nothing and needs no test data. (Behavior such as "one
-- person cannot read another's rows" is covered by the automated tests that
-- run these same migrations; this checks the project itself was set up the
-- same way.)

with synced(tbl) as (
  values ('settings'), ('buckets'), ('allocations'), ('month_notes'), ('recurring_transactions'),
         ('transactions'), ('incomes'), ('savings_goals'), ('investment_lots'), ('investment_sells'),
         ('investment_prices'), ('captures'), ('capture_rules')
),
checks(name, ok) as (
  select 'row level security is on for all 13 synced tables and the invite list',
         (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relrowsecurity
             and c.relname in (select tbl from synced union select 'allowed_users')) = 14
  union all
  select 'signed-out visitors have no access to any table',
         not exists (select 1 from synced where has_table_privilege('anon', 'public.' || tbl, 'select,insert,update,delete,truncate,references,trigger'))
         and not has_table_privilege('anon', 'public.allowed_users', 'select,insert,update,delete,truncate,references,trigger')
  union all
  select 'signed-in users can read, add and change synced rows, but not delete them',
         not exists (select 1 from synced where not has_table_privilege('authenticated', 'public.' || tbl, 'select')
                                             or not has_table_privilege('authenticated', 'public.' || tbl, 'insert')
                                             or not has_table_privilege('authenticated', 'public.' || tbl, 'update'))
         and not exists (select 1 from synced where has_table_privilege('authenticated', 'public.' || tbl, 'delete,truncate,references,trigger'))
  union all
  select 'signed-in users cannot read or change the invite list',
         not has_table_privilege('authenticated', 'public.allowed_users', 'select,insert,update,delete,truncate,references,trigger')
         and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'allowed_users')
  union all
  select 'every synced table has the write rules (trigger)',
         (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and t.tgname = 'sync_write' and not t.tgisinternal) = 13
  union all
  select 'every synced table has exactly its three access policies, for signed-in users only',
         not exists (
           select 1 from synced
           where (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = tbl) <> 3
              or exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = tbl
                           and (p.roles <> array['authenticated']::name[] or p.cmd not in ('SELECT', 'INSERT', 'UPDATE')))
         )
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
         and (select prosecdef from pg_proc where oid = 'public.sync_account_state()'::regprocedure)
         and (select prosecdef from pg_proc where oid = 'private.sync_is_allowed()'::regprocedure)
  union all
  select 'the database is at the migration level the app needs (2 or later)', public.sync_schema_version() >= 2
  union all
  select 'the invite list has at least one email (add yours before signing in)',
         exists (select 1 from public.allowed_users)
)
select name, ok from checks;
