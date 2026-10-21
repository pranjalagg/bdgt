# supabase/

SQL for the optional cloud sync. The app does not need any of this to run.

- `migrations/` — applied in file-name order in the Supabase SQL editor (see `docs/sync-setup.md`).
  - `…_sync_core.sql`: the typed tables, the write rules (trigger), the access rules (row-level security and grants), the invite list and the account check.
  - `…_analytics.sql`: the `analytics` views, closed to the app.
- `tests/verify_setup.sql` — a read-only check you run in the dashboard after applying the migrations.

The automated tests in `tests/sql/` build a real Postgres (PGlite) with the same roles and `auth` helpers as Supabase, apply these migrations, and test them: the write rules, who can see what, the constraints, the views, and the sync engine end to end through the real `SupabaseTransport`.

## Changing the schema

1. Add a new file `migrations/YYYYMMDDHHMMSS_what_it_does.sql`. Never edit one that has been applied.
2. If a synced table or column changes, add it to `src/lib/sync/registry.ts` too; the test `the schema matches the app` fails until both agree.
3. If older app versions cannot work against the new schema, bump `public.sync_schema_version()` in the new migration and `REQUIRED_SCHEMA_VERSION` in `src/lib/sync/engine.ts`.
4. Run `npx vitest run tests/sql`, then apply the file in the dashboard and run `tests/verify_setup.sql`.
