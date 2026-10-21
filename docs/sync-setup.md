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
