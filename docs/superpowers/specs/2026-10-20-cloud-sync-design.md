# Cloud Sync Design

**Date:** 2026-10-20
**Status:** Draft, awaiting review

## Overview

Today all data lives in the browser's IndexedDB (Dexie). Clearing site data
erases it, it cannot follow the user to another device, and each person who
uses the app has an island of data on one device.

This design keeps the browser database as the app's working store and adds a
background sync to a Supabase (Postgres) project: local-first sync. The app
stays fast and fully usable offline; signing in with Google turns on backup,
multi-device use and real per-person accounts. Data in Supabase is stored in
typed, SQL-friendly tables with an analytics view layer on top, so it can be
studied in the Supabase SQL editor or copied to tools like BigQuery.

## Goals

- Data survives a cleared browser and a lost device.
- The same budget on several devices of one person (laptop, phone).
- Real accounts for other people, each with their own data, by invitation only.
- No change for anyone who does not sign in: the app works exactly as today.
- Fully usable offline; changes made offline sync later.
- Data in Supabase is typed, normalized and easy to query, with views built for analysis.
- No data loss from sync: concurrent edits resolve predictably, and automatic
  processes never create duplicates or overwrite a person's edits.

## Non-goals (phase 2 or later)

- Live push of changes between open devices (Supabase Realtime); other open tabs refreshing instantly.
- Account deletion and data download for invited users from inside the app.
- End-to-end encryption (the project owner can read invited users' data; see Risks).
- Email sign-in (needs a custom SMTP provider and a sending domain).
- SQL views that reproduce allocation math (fixed / percentage / hybrid, rollovers).
- Setting up a BigQuery pipeline.

## Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Architecture | Local-first: Dexie stays the working store, background sync to Supabase | Keeps offline use and speed; a paused or unreachable server never breaks the app |
| Interim whole-backup upload ("option C") | Skipped | Its only durable parts (project, sign-in, account lifecycle) are the first steps of this design anyway; whole-copy last-write-wins loses edits with two devices |
| Account | Optional | The app keeps working without an account; signing in turns on sync |
| Sign-in | Google only | Supabase's built-in email only delivers to the project's team at 2 messages per hour; email sign-in needs a custom SMTP provider and domain |
| Who can sync | Invite-only, via an `allowed_users` table | The site is public; the owner controls whose financial data is stored and how much quota is used |
| Device and account both hold data at first sign-in | Use the account's data, after saving the device's data as a backup file | Merging creates duplicate default buckets, duplicate recurring items and mixed base currencies |
| Server storage | One typed table per collection plus an `analytics` view schema | SQL-friendly for the Supabase editor and table-copy tools (BigQuery); normalized core with purpose-built views is the industry-standard shape |
| Sync implementation | Own engine on Dexie, generic over a collection registry | Keeps Dexie and the existing store code; off-the-shelf options either leave Supabase (Dexie Cloud) or replace Dexie with SQLite (PowerSync, ElectricSQL) |

## Supabase schema

### Conventions (every synced table)

- snake_case names. Primary key `(user_id, id)`; `id` is `text` in every table so the sync engine treats all tables alike.
- `user_id uuid not null default auth.uid() references auth.users(id) on delete cascade`.
- Money is exact integer cents in `bigint` columns ending in `_cents`. Shares, percentages and exchange rates are `numeric`.
- Calendar days (transaction date, due date, purchase date) are `date`, holding the user's local calendar day. Moments are `timestamptz`.
- Fixed vocabularies (`allocation_type`, `frequency`, income `type`, note `effect`) are `text` with a `check` constraint.
- Four sync columns:
  - `updated_at timestamptz not null`: when the edit was made (client time, capped by the server). Decides conflicts.
  - `synced_at timestamptz not null`: set by the server on every write (`clock_timestamp()`). Drives pulls.
  - `deleted_at timestamptz`: soft delete. Deleted rows stay as tombstones so every device learns of the delete.
  - `extra jsonb not null default '{}'`: any record field the mapping does not know yet, so a forgotten migration never drops data.
- Domain columns are nullable at the type level; a table-level `check (deleted_at is not null or (<required columns> is not null))` enforces required fields on live rows only, so a tombstone needs just its keys.
- No foreign-key constraints between user tables: rows from different devices can arrive in any order, and one orphaned historic transaction must not block sync forever. Views use left joins.
- Index on `(user_id, synced_at, id)` for pulls, plus indexes for common joins (`bucket_id`, `lot_id`, `month`).

### Tables

`order` and the investment price's `updatedAt` are renamed to avoid a reserved word and a clash with the sync column.

| Table | Domain columns (in addition to `user_id`, `id` and the sync columns) |
|-------|------------------------------------------------------------------------|
| `buckets` | `name`, `color`, `sort_order int`, `is_default bool`, `allocation_type`, `fixed_amount_cents`, `percentage numeric`, `is_savings bool`, `is_everyday bool`, `is_system bool`, `created_at timestamptz` |
| `transactions` | `bucket_id`, `date date`, `amount_cents`, `note`, `recurring_id`, `created_at timestamptz` (nullable: older records have none), `foreign_amount_minor bigint`, `foreign_currency`, `foreign_rate numeric`, `foreign_base` |
| `incomes` | `date date`, `amount_cents`, `note`, `is_recurring bool`, `type` (`fixed` / `one-time`) |
| `recurring_transactions` | `bucket_id`, `amount_cents`, `frequency` (`weekly` / `biweekly` / `monthly`), `day_of_month int`, `next_due_date date`, `note`, `is_active bool` |
| `allocations` | `month text` (`YYYY-MM`), `bucket_id`, `amount_cents`; `id` is `YYYY-MM:bucketId` |
| `month_notes` | `month text`, `text`, `effect` (`up` / `down` / `none`), `created_at timestamptz` |
| `savings_goals` | `name`, `bucket_id`, `target_amount_cents`, `target_date date`, `monthly_contribution_cents`, `starting_balance_cents`, `created_at timestamptz` |
| `investment_lots` | `symbol`, `shares numeric`, `price_per_share_cents`, `purchase_date date`, `note`, `sold_shares numeric` |
| `investment_sells` | `lot_id`, `shares numeric`, `price_per_share_cents`, `sell_date date`, `note` |
| `investment_prices` | `symbol`, `price_per_share_cents`, `price_updated_at timestamptz`; `id` is the symbol |
| `settings` | `value jsonb`; `id` is the setting key (`baseCurrency`, `currencyConfirmed`) |

Plus `allowed_users (email text primary key, note text, added_at timestamptz default now())`, the invite list. It has no user-specific rows.

### Write rules (one shared trigger function on every synced table)

`BEFORE INSERT OR UPDATE`:

1. `new.updated_at := least(new.updated_at, now() + interval '1 minute')`: a device with a clock far in the future cannot win every conflict forever.
2. On update, if `new.updated_at < old.updated_at`, return `NULL`: the update is skipped and the newer row stays. A plain PostgREST upsert can then never overwrite a newer edit with an older one. Equal times are applied (idempotent re-push).
3. On update, `new.user_id := old.user_id` (a row never changes owner).
4. `new.synced_at := clock_timestamp()`.

### Access control

- Row-level security on every synced table, one policy template applied to all tables in a loop: `select`, `insert` and `update` only where `user_id = auth.uid()` and `public.sync_is_allowed()`; inserts and updates also `with check` the same. No `delete` policy: deletes are soft.
- `sync_is_allowed()` is `security definer`: true when `auth.jwt() ->> 'email'` (lowercased) is in `allowed_users`. Google emails are verified.
- `allowed_users` has row-level security enabled with no policies: unreachable through the API, maintained in the dashboard.
- `sync_account_state()` (`security definer`), called once after sign-in, returns `{ allowed, schema_version, buckets (live rows, only when allowed), has_other_rows (any live row in any other table, only when allowed) }`.
- `sync_schema_version()` returns the migration level the database is at.
- The app holds only the publishable key (`sb_publishable_…`), never a secret key.

### Analytics views

Schema `analytics`, not exposed through the API (`anon` and `authenticated` get no usage on it). Views show live rows only (`deleted_at is null`), drop the sync columns and add currency-unit amounts next to cents (`amount_cents / 100.0 as amount`).

- One clean view per table: `analytics.buckets`, `analytics.transactions`, and so on.
- `analytics.transactions_enriched`: each transaction with its bucket's name, `is_savings`, `is_everyday`, its month (`YYYY-MM`), and the original-currency columns.
- `analytics.monthly_bucket_spend`: per user, month and bucket: total spent and transaction count.
- `analytics.monthly_cashflow`: per user and month: income, spending excluding savings buckets, amount set aside into savings buckets, net, and savings rate.
- `analytics.user_settings`: settings pivoted to one row per user (`base_currency`, `currency_confirmed`).
- `analytics.users`: `user_id` to email (from `auth.users`), for analysis across invited users.

Amounts are in the account's base currency at the time of analysis (changing the base currency relabels, as in the base-currency design).

### Migrations

SQL files in `supabase/migrations/` (Supabase CLI layout), applied in order through the SQL editor or `supabase db push`. Each migration that changes the synced schema bumps `sync_schema_version()`. The app knows the version it needs; if the database is older, sync pauses with a clear message instead of failing row by row.

## Local database (Dexie v11)

- New tables `allocations` (key `id` = `YYYY-MM:bucketId`, indexes `month`, `bucketId`) and `monthNotes` (key `id`, index `month`).
- The upgrade moves every month record's `allocations` and `notes` into the new tables, then drops `monthSnapshots`. The app never reads a month record's `incomeTotal`, `spent` or `rollovers`: current versions write them as zero or empty, and some older records hold stale figures from earlier versions that no longer match the transactions. They are not carried over; a backup taken before the upgrade keeps them.
- The in-memory `monthSnapshots` store is built from the two tables at load, so the derived budget stores that read it are unchanged. `setAllocation`, `setAllocations` and the month-note functions write the new tables.
- Backup format is unchanged (version `1`): export rebuilds month records from the two tables; import splits them. Old backups import as before, and new backups still open in older app versions.
- Hidden sync tables, never exported: `syncOutbox`, `syncVersions`, `syncState`.

## Sync engine

### Collection registry

One declarative entry per synced collection: Dexie table, Postgres table, key, field mapping and field types (`text`, `cents`, `numeric`, `bool`, `date` (local calendar day), `timestamp` (Date), `epochMs` (number of ms), `json`), flattening for nested values (`foreign` becomes four columns) and the push order. Mapping is generic: `toRow(record)` and `fromRow(row)`. Record fields not in the registry go into `extra` on push and come back from it on pull; in development they are logged so a migration can be added.

Push order (dependencies first): `settings`, `buckets`, `allocations`, `monthNotes`, `recurringTransactions`, `transactions`, `incomes`, `savingsGoals`, `investmentLots`, `investmentSells`, `investmentPrices`.

### Change capture

A Dexie DBCore middleware:

- Adds `syncOutbox` and `syncVersions` to every read-write transaction that touches a synced table, so the record and its queue entry commit together.
- On `add` and `put`: queues `{ table, id, op: 'upsert', at }`. On `delete`: queues `op: 'delete'`. On `deleteRange` (`clear()`): reads the keys in the range first, then queues a delete for each. Covers bulk writes, `modify()`, import, reset and the bucket-deletion cascade without touching the code that writes.
- Queue entries are keyed `table:id`, so repeated edits of one record collapse into one entry with the latest operation and time.
- Records `syncVersions[table:id] = at` for every captured write.
- Skips capture for writes flagged as coming from the server, or from a local reset of the device on first sign-in or sign-out.

### Edit times and versions

- A person's edit is stamped `max(Date.now(), lastStamp + 1)`, unique and increasing on the device.
- An automatic write is stamped minimally newer than the version it replaces: the record's current version plus 1 ms, or 1 ms after the epoch for a new record. It persists when nothing else changed the record, and loses to any person's edit made elsewhere. Automatic writes are recurring generation and due-date advance, default bucket seeding, the load-time orphan repair (including creating the Unsorted bucket for it), sold-share repair, and persisting the detected currency. Writes made because a person did something (deleting a bucket moves its transactions to Unsorted) are edits.
- After a push, a record's version becomes the `updated_at` the server stored (which reflects the future-time cap).

### Push

1. Take a batch of queue entries (up to 500), grouped by table in push order.
2. Read each record's current value. If it is gone, send a delete instead.
3. Upsert rows on conflict `(user_id, id)`, returning the stored rows. A delete is a row with `deleted_at = updated_at = at` and only the key columns. Saves and deletes go in separate requests, because a PostgREST bulk upsert needs the same columns in every row.
4. In one Dexie transaction: for each returned row, record its version and remove the queue entry if it has not changed since step 1. Entries the server skipped (it held a newer edit) are removed; the next pull brings the newer row.

### Pull

1. For each table, fetch rows with `synced_at > cursor - 1 minute`, ordered by `(synced_at, id)`, paging by key until done. The overlap catches writes that committed out of `synced_at` order. Re-applying a row is harmless.
2. Only after every page of every table has arrived, apply them all in one Dexie transaction flagged as from-server:
   - a remote row older than the local version is skipped;
   - otherwise it is written (or deleted when `deleted_at` is set), its version recorded, and any queued local entry not newer than it removed.
3. Advance each table's cursor to the largest `synced_at` seen, in the same transaction.
4. If anything changed, run the self-repairs (below) and reload the stores.

If any request fails, nothing is applied and the cursors stay put.

### Conflict rules

- Per record, the latest edit wins, by edit time, not upload time. The server enforces it. A delete is an edit.
- Allocations are per month and bucket and notes per note, so edits to different buckets or notes on two devices never collide.
- Automatic writes are stamped so any person's edit beats them, and repeating them on two devices converges on the same record.

### When sync runs

- App start, signed in and online: pull, then load the stores, run recurring generation, then push.
- About 2 seconds after a local write, on returning to the tab (`visibilitychange`, `focus`), on `online`, and every 5 minutes while the app is visible.
- One sync at a time across tabs (Web Locks API `navigator.locks`; an in-tab mutex where unsupported).
- The Supabase client library is loaded with a dynamic import only once a session exists or sign-in starts.

### Statuses and failures

The app keeps working locally in every case.

| Condition | Status shown | Behavior |
|-----------|--------------|----------|
| Signed out | (nothing) | No sync |
| Syncing | Syncing… | |
| Up to date | Synced · 2 min ago | |
| Offline, server unreachable or project paused | Offline · N waiting | Retry with growing gaps (capped at 5 minutes) |
| Session cannot be refreshed | Sign in again | Queue kept |
| Email not invited | Sync isn't enabled for this account | Sync stops; local data untouched |
| Database older than the app expects | Database needs update N | Sync pauses |
| Server rejects a particular row (constraint error) | N changes couldn't sync | That entry is set aside with its error, shown in Settings (retry or discard); everything else keeps syncing |

## Domain changes

- **Recurring occurrences** get the id `recurringId:YYYY-MM-DD` (local day), so two devices generate the same record. An occurrence a person deleted stays deleted, because the delete beats the automatic re-creation. Existing transactions keep their ids.
- **Default buckets**: signed out, seeded on first run as today; signed in, seeded only after the first pull shows the account empty.
- **Self-repairs after an applied pull** (automatic writes):
  - orphaned transactions move to the Unsorted bucket (existing logic, which only now runs after a complete pull, so a transaction that arrives before its bucket is never misfiled);
  - each lot's `soldShares` is raised to the sum of its sell records when lower (two devices selling from one lot at once). It is never lowered, so lots sold before sell records existed keep their count. Sells cannot be deleted in the app, so the sum only grows.
- **Dates**: calendar-day fields upload as the local day and return as local midnight. The time of day on a transaction's date is not shown anywhere; ordering within a day keeps using `createdAt`.
- **Import while signed in** replaces the account's data on every device (confirm text says so): the existing clear-and-add becomes deletes for the old records and saves for the imported ones through normal capture.
- **Reset while signed in** clears the account on every device. As today, a database the person cleared on purpose is not re-seeded with default buckets.
- **Currency settings** sync like any record; a base-currency change on one device applies everywhere. The detected, unconfirmed currency is an automatic write, so an account's confirmed currency wins on a new device.

## Accounts and UI

### Settings: Sync section

- Signed out: a short explanation and **Sign in with Google**.
- Signed in: email, status, last synced, waiting count, **Sync now**, rejected changes (retry or discard each), **Sign out**, and one sentence for invited users that their data is stored in a database the app's owner controls.
- Hidden entirely when the build has no Supabase configuration.

### Status indicator

- Desktop: a small chip in the sidebar footer under the currency chip; it opens Settings → Sync.
- Mobile: a dot on the Setup tab only for statuses that need attention.
- Hidden when signed out.

### Sign-in

`signInWithOAuth({ provider: 'google' })` with `flowType: 'pkce'` and `detectSessionInUrl: true`; the redirect returns to the page the person was on. Allowed redirects: the GitHub Pages address under `/bdgt` and `http://localhost:5173`.

### After sign-in

1. Call `sync_account_state()`. Server unreachable: decide nothing, retry.
2. Not allowed: status "Sync isn't enabled for this account"; nothing on the device changes.
3. Allowed: classify both sides. A side holds **untouched defaults** when its only live records are buckets that match the default buckets exactly (same names and the same allocation type, amounts, percentage, color and flags) and no other table has records; settings do not count.

| Device | Account | Action |
|--------|---------|--------|
| Has data | Empty or untouched defaults | Replace the account with this device: tombstone the account's default buckets (known from `sync_account_state()`), upload everything (progress shown) |
| Empty or untouched defaults | Has data | Replace this device with the account: clear locally without capture, pull everything |
| Empty or untouched defaults | Untouched defaults | Pull the account's (keeps one set of ids) |
| Empty or untouched defaults | Empty | Upload this device's defaults |
| Has data | Has data | Dialog: "This device and your account both have data. This device's data will be saved as a backup file, then replaced with your account's." **Use account data** (download the backup, then replace) or **Cancel** (sign out; the device keeps its data) |

4. Record the account id in `syncState`.

### Sign-out

1. Push waiting changes.
2. If any remain (offline), warn: "N changes haven't synced and will be lost on this device." **Download backup and sign out** or **Stay signed in**.
3. Clear this device's budget data and sync tables without capture, end the session and return to a fresh local-only state with default buckets. Theme and hide-amounts preferences stay.

### Session

Kept by the Supabase library in the browser and refreshed automatically. A failed refresh shows "Sign in again" and keeps the queue.

## Setup and configuration

A step-by-step guide in `docs/sync-setup.md`:

1. Create a free Supabase project `bdgt` (any region).
2. Apply `supabase/migrations/*.sql`.
3. Google Cloud: a web OAuth client whose redirect URI is the project's `/auth/v1/callback`; consent screen with basic scopes only.
4. Supabase Auth: enable Google with that client; site URL and redirect URLs for GitHub Pages `/bdgt` and localhost.
5. Insert invited emails into `allowed_users`.
6. GitHub repository variables `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY`, passed to the build step in `.github/workflows/deploy.yml`; `.env` for local development (already git-ignored), with an `.env.example`.

Without these variables the app builds and runs exactly as today, with no sync UI.

New dependencies: `@supabase/supabase-js` (runtime, dynamically imported) and `fake-indexeddb` (tests only).

## Testing

- **Unit** (pure):
  - mapping round trip for every collection, with every field, date conversions, `foreign` flattening and unknown fields through `extra`;
  - apply-or-skip decisions;
  - queue collapsing;
  - edit-time stamping for edits and automatic writes;
  - recurring ids;
  - untouched-defaults classification and the sign-in decision table;
  - month split migration and backup round trip;
  - schema version check.
- **Integration** (Vitest with `fake-indexeddb` and the real Dexie database):
  - capture of every write kind (`add`, `put`, `update`, `modify`, bulk operations, `delete`, `clear`), and no capture for writes flagged as from-server;
  - full sync cycles against an in-memory fake server that implements the same write rules as the SQL trigger. Two simulated devices must converge through:
    - concurrent edits;
    - edit versus delete;
    - recurring generation on both;
    - a bucket deleted on one device while a transaction is added to it on the other;
    - offline then reconnect;
    - a pull failing halfway;
    - first sign-in in each row of the decision table;
    - import and reset while signed in.
- **SQL** (`supabase/tests/`, run in the SQL editor):
  - a user sees and writes only their own rows;
  - an uninvited user is refused;
  - `analytics` is not reachable as `anon` or `authenticated`;
  - an older edit cannot overwrite a newer one;
  - future edit times are capped;
  - tombstones need only keys.
- **Manual** on the real project: laptop and phone with the owner's Google account. Google blocks automated sign-in, so this step is not scripted.

## Rollout

- Branch `feat/cloud-sync`, two pull requests:
  1. **Groundwork:** Dexie v11 month split with backup compatibility, recurring occurrence ids, the default-bucket seeding rule, hidden sync tables. It changes local data for everyone, so it ships and is verified on its own first.
  2. **Sync:** SQL migrations and tests, registry and mapping, capture middleware, push and pull, sign-in and first-sign-in flows, Settings section and status indicator, deploy configuration, setup guide.
- Export a JSON backup before opening the groundwork release.
- Until the repository variables are set, the deployed app behaves as today.

## Risks

- **The owner can read invited users' data** in the dashboard. Stated in the Sync section; end-to-end encryption is phase 2.
- **Clock skew:** edit times come from device clocks. The server caps future times, so a badly skewed device can at most win conflicts within the cap; ordinary skew of seconds only matters for edits of the same record within those seconds.
- **Free plan:** projects pause after a week without activity, and there are no automatic database backups. The app keeps working while paused and JSON export remains the backup.
- **Free plan project limit:** two active projects; this would be the second next to boxofgoodies.
- **The legacy `anon` key** is deprecated by the end of 2026; the app uses the publishable key from the start.
