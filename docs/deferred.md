# Deferred work

A running list of things we chose not to do yet, kept so they are not lost. Each entry says what it is, why it was deferred, where it lives, and a suggested fix. Add to it whenever something is deferred; move an entry to "Resolved" when it is done.

Last updated: 2026-10-21.

## How to read this

- **Effect** is what a person using the app would see, not how hard the fix is.
- **Size**: S is under an hour, M is a few hours, L is a feature of its own.

---

## Cloud sync (design: `docs/superpowers/specs/2026-10-20-cloud-sync-design.md`)

### Planned next: plan 4, sign-in, sync service and screens
Not deferred in the sense of dropped; it is the next plan. It covers the Supabase client and Google sign-in, the sync service (start-up, triggers, locking, backoff, status), the Settings → Sync section and status chip, the first-sign-in and sign-out dialogs, deploy variables, part 2 of `docs/sync-setup.md` (Google login key, redirect addresses, GitHub variables) and a manual check on the real project. The handoff section at the end of `docs/superpowers/plans/2026-10-21-cloud-sync-engine.md` lists what it must honor.

### Acceptance of the database on the real project (waiting on the project owner)
The SQL is tested on a real Postgres in the test suite, but not yet on a real Supabase project. Follow part 1 of `docs/sync-setup.md` and confirm every row of `supabase/tests/verify_setup.sql` is `true`. Then record the project URL and publishable key for plan 4.

### Phase 2 of sync (from the design's non-goals)
- **Live updates between open devices (Supabase Realtime), and other tabs refreshing instantly.** Today a change shows up on the next sync cycle (a couple of seconds after an edit on the same device, up to five minutes for changes from another device). Size L.
- **Account deletion and data download for invited users, from inside the app.** Today only the project owner can do either, in the dashboard. Size M.
- **End-to-end encryption.** The project owner can read invited users' data in the Supabase dashboard. Encrypting in the browser before upload would stop that, but breaks the analytics views and the BigQuery idea unless the owner's own data stays unencrypted. Needs a key-management design (lost passphrase means lost data). Size L.
- **Email sign-in.** Supabase's built-in email only sends to members of the project's team, at 2 messages an hour. Real email sign-in needs a custom SMTP provider (Resend, Postmark, SES) and a sending domain with DKIM/SPF/DMARC. Size M.
- **SQL views that reproduce allocation math** (fixed, percentage and hybrid allocation, rollovers). Deliberately left out of `analytics` views so a SQL copy cannot drift from the app's code. If added, ship a test that compares the view's numbers with the app's on a fixture. Size M.
- **BigQuery pipeline.** Any Postgres-to-BigQuery copy tool works on the typed tables as they are; nothing is set up. Size S–M.
- **Free-plan limits.** Free Supabase projects pause after a week of inactivity and have no automatic backups; the app keeps working while paused and JSON export is the backup. Revisit if the project gets real users (the Pro plan fixes both).

### Engine edge cases found in review (all in `src/lib/sync/`)
- **Settings written before linking are not uploaded when both sides are empty.** `firstSignIn.ts`, the `'start'` plan queues nothing, so a confirmed currency chosen on the device first never reaches the account, and a later pull of another device's settings can overwrite it (the local version is undefined). Effect: the base currency could flip to another device's. Fix: queue the settings rows in the `'start'` plan too. Size S.
- **A recurring occurrence you deleted can come back.** `autoStamp` is the known version plus one, so if the recurring item's `nextDueDate` is stale (a template edit from a device that had not advanced it won), `processRecurring` re-adds the deleted occurrence stamped one past the tombstone, and it revives everywhere. The spec says a delete beats an automatic re-creation. Fix: have the automatic writer skip ids that have a local tombstone version, or stamp automatic writes below tombstones. `clock.ts`, `recurringStore.ts`. Size S–M.
- **Two tabs opening at once can re-add a deleted recurring occurrence.** `processRecurring` reads the due list outside its transaction; a stale list in a second tab misses an occurrence that was just deleted. Fix: read the due list inside the transaction. `recurringStore.ts`. Size S.
- **The automatic-write marker is not inherited by nested transactions** (`capture.ts`, WeakMap keyed by the Dexie transaction). Nothing nests today; a future `autoTransaction` inside another transaction would stamp as an edit. Fix: walk `Dexie.currentTransaction.parent`. Size S.
- **A malformed timestamp from the server** (`Date.parse` gives NaN) would poison the stored version, then make `iso(NaN)` throw in push, and the error is rethrown because it is not a `SyncError`. Unlikely with a real Postgres. Fix: skip rows whose `updated_at` does not parse, in `pull.ts`. Size S.
- **Unknown sub-fields of `foreign` are dropped** (`registry.ts` claims the whole object). A future field added inside `foreign` would be lost until the registry learns it. Fix: collect unclaimed nested keys into `extra`. Size S.
- **Many bad rows make push expensive.** A refused batch is split in halves, which costs about `2k·log2(n/k)` requests for `k` bad rows, and `2n−1` if every row is bad. Cap the splitting depth or park a whole batch after N failures. `push.ts`. Size S.
- **Parked and waiting entries are counted together** by `pendingChanges`. The status screen needs the parked count separately. Size S (UI side).
- **Capture reads two undocumented Dexie internals** (`IDBTransaction.mode` and `objectStoreNames` on `req.trans`). `package.json` allows `dexie ^4.4.2`, so a minor release could change them. The capture tests would fail loudly; pin or re-verify on Dexie upgrades.
- **Two devices signing in to an empty account at the same time both upload their default buckets**, giving 22 buckets. Fix: a server-side rule (for example a unique name per default bucket) or a first-writer check in the sign-in flow. Size M.
- **A parked bucket can orphan its transactions on other devices**, which the repair then files under Unsorted everywhere. Fix: do not push transactions whose bucket is parked. Size S.
- **`signOutLocal` is not serialized with an in-flight sync.** A pull that applies after the wipe refills a signed-out device with account data. The caller must hold the sync lock (noted in the handoff for plan 3).

---

## Month records and recurring items (groundwork, merged)
- **A month record with neither allocations nor notes is not migrated.** Such a record could exist only from adding then deleting a month's only note in an empty month. Its sole effect was stretching the rollover range back to a month with no activity, so a migration can shift one rollover number for someone who has such a record. Your backup has none. Fix if it matters: keep an anchor for the month. Size S.
- **An allocation key such as `__proto__` is not rejected** in `splitSnapshots` (month keys are now validated, bucket ids inside allocations are not). A hand-edited backup could store a row the app cannot show or export. Fix: skip the reserved ids that `parseImport` already rejects for buckets. Size S.
- **A duplicate note id across months loses a note.** Both the upgrade and import use `bulkPut` keyed by note id, so the later month wins. Only a hand-edited backup can do this. Size S.
- **Recurring occurrence ids depend on the device time zone** (`occurrenceId` uses the local day). Two devices in different zones that generate the same occurrence before syncing get different ids. Once due dates sync as calendar days this mostly washes out; storing due dates as day strings would remove it. Size M.
- **The reserved-id list in `export.ts` omits `toString`, `valueOf` and `hasOwnProperty`.** A bucket imported with such an id makes `snapshot.allocations[bucket.id]` return a function and its numbers become NaN. Existed before the sync work. Size S.

---

## Currency

### Step 3: convert on change
Changing the base currency only relabels today; amounts are not converted. Step 3 would rewrite history into a new base using rates. Needs a decision on which rate to use for old transactions (the entry-time rate where there is one, otherwise a historical rate), and what happens to foreign transactions whose original currency becomes the new base. Size L.

### Foreign currency beyond individual transactions
- **Recurring transactions in a foreign currency.** A recurring rent in INR on a USD budget needs a rate at generation time. Size M.
- **Investment lots and prices in a foreign currency.** Lots follow the base currency today. Size M.
- **Rates for past dates.** The rate fetch returns the latest rate only; entering an old transaction needs a historical rate (Frankfurter supports a date). Size S–M.
- **Original amount in CSV export.** The CSV has Date, Bucket, Amount, Note; the original currency, amount and rate are not included. Size S.
- **Zero-decimal currencies such as JPY.** They need a per-currency decimals field (all money is integer cents today). Excluded from the supported list. Size M.

### Small things
- **Pressing Enter with an invalid rate does nothing and says nothing** (`LogEntry.svelte`). The only hint is the "Enter a rate to convert." text. Fix: move focus to the rate field. Size S.
- **Switching currency away and back in Edit loads the newest rate for that currency**, not the record's own rate (`ForeignCurrencyField.svelte`), so saving can recompute the base amount although nothing was meant to change. Fix: remember the record's original rate while editing. Size S.
- **A foreign amount that rounds to zero in the base currency saves as a zero transaction** (for example ₹0.40 as USD). Realistically rare. Fix: block with "too small to convert", but allow saving imported records that are already zero. Size S.
- **Fetched rates for small quotes carry about 4 significant digits** (INR→USD 0.01054, up to roughly 0.05% off). Fix: fetch the inverse pair (USD→INR) and invert to six decimals. Size S.
- **Another open tab keeps the old base currency until it reloads.** There is no cross-tab notification. Size S–M (could share a BroadcastChannel with the sync work).
- **Pasted amounts like `12AED34` are accepted** (`stripSymbols` in `src/lib/utils/currency.ts` removes symbols anywhere in the string). Fix: allow a symbol only at the start. Size S.
- **Time-zone detection misses some zones** (`src/lib/currency/detect.ts`): Canadian zones such as Moncton and Iqaluit, some euro-area zones, and language tags with a script such as `zh-Hant-TW`. The person confirms the suggestion, so it only affects the default. Size S.
- **`confirmCurrency` updates the store before closing the modal**, causing a one-frame remount and lost focus (`currencyStore.ts`, `CurrencyModal.svelte`). Size S.
- **The v10 upgrade decides "has data" from transactions and incomes only.** A database holding only bucket allocations or goals is treated as empty and gets device detection instead of USD. Size S.

### Verification not done
- **Safari/WebKit formatting of `en-AE`, `en-SG` and `en-CA`.** Checked only in Chromium 155 (`AED 1,234,567.89`, `$1,234,567.89`). Run `(1234567.89).toLocaleString('en-AE', {style:'currency', currency:'AED'})` in Safari's console, and the same for the other two. Also unverified in Safari: parsing of six-digit fractional timestamps with `Date.parse` (affects sync cursors, see `pull.ts` `sinceFor`).

---

## Product and UI
- **Should the bucket delete button be allowed for default buckets?** It is restricted by `isDefault` today. Open question rather than a bug.
- **Amounts in `aria-label`s and tooltips are not marked `.amt`**, so the hide-amounts toggle does not blur them for screen-reader users or on hover. Size S–M.
- **Import your re-bucketed backup when ready:** `budget-backup-2026-10-02.rebucketed-v4-with-notes.json` (after exporting a fresh backup first). Not code; a reminder.
- **Hide-amounts blur with non-dollar symbols** was checked for the row note and preview, not for every screen.

---

## Resolved
- Settings page `fileInput.value = ''` threw a TypeError after any import (fixed, guarded).
- Exporting a never-confirmed fresh profile wrote USD instead of the detected currency (fixed: the detected currency is now saved as unconfirmed when first loaded).
- Decimal commas (`12,50`) were read as 1250 (fixed: only thousands separators are accepted).
- A late "Fetch rate" answer could overwrite a newer rate (fixed).
- Pulled rows would have been rewritten every cycle because Postgres formats timestamps differently (fixed, values are compared not strings).
