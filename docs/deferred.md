# Deferred work

A running list of things we chose not to do yet, kept so they are not lost. Each entry says what it is, why it was deferred, where it lives, and a suggested fix. Add to it whenever something is deferred; move an entry to "Resolved" when it is done.

Last updated: 2026-10-23 (mobile-first redesign).

## How to read this

- **Effect** is what a person using the app would see, not how hard the fix is.
- **Size**: S is under an hour, M is a few hours, L is a feature of its own.

---

## Cloud sync (design: `docs/superpowers/specs/2026-10-20-cloud-sync-design.md`)

### Sign-in release leftovers
- **Other open tabs are told only when this tab links or unlinks the device** (a `BroadcastChannel` makes them reload). Ordinary sync results (new data pulled from another device) do not refresh other tabs until they reload or regain focus; the cross-tab lock only stops two tabs syncing at once. Size S–M.
- **There is no live view of another device's changes.** A change from another device arrives on the next cycle: when you return to the tab, regain the network, or within five minutes. Realtime is in the phase 2 list below.
- **The first-run currency dialog can flash after Google sign-in.** The sign-in redirect reloads the page before the account's settings arrive, so the dialog opens and then closes itself once they do. Fix: hold the dialog back while a sign-in is finishing (`hasAuthCallback`). `Layout.svelte`. Size S.
- **Real Google sign-in is only checked by hand** (Google blocks automated sign-in); everything around it is tested with a fake client. Re-check after any change to `src/lib/sync/app.ts` or the Supabase client options.
- **A browser may block the backup download** that sign-out and the first-sign-in choice start (pop-up or multiple-download settings). The dialogs say what is happening, but do not detect a blocked download.
- **Import and Reset while signed in do not wait for the sync;** they reach the account in the background a couple of seconds later. Closing the tab in that window leaves them queued for the next time the device syncs.
- **Review minors from the sign-in release (not fixed):**
  - If the quiet reload after first sign-in throws, the service is left unstarted until the next page load.
  - A failed sign-out leaves the "signing out" flag set and shows no error.
  - Focus and `visibilitychange` can fire together and start two cycles back to back (the second is queued, not parallel).
  - `refreshParked` in `SyncSection.svelte` re-queries whenever the parked count differs from the list; a count that never matches the list could loop.
  - The first-sign-in choice dialog uses the single modal slot, so it can replace another open dialog.
  - A failed backup download before sign-out or the first-sign-in choice is silent.
  - An OAuth `?error=` in the redirect URL is not shown to the person.
  - `hasStoredSession(localStorage)` touches storage outside a try block in one caller.
  - `as SupabaseClient & AuthClient` in `browser.ts` hides drift between the real client and the narrow interface the app uses.
  - `aria-live` sits on an element that is inserted with its text, so some screen readers will not announce the first status.
  - Tests use `FakeServer` for not-invited accounts; the real database answers with empty selects under RLS. The first real run is the check.

### Acceptance on the real project (done 2026-10-22, local build)
Checked by the project owner against `http://localhost:5173/settings` with the real Supabase project: Google sign-in, upload of the 2026-10-20 backup (284 transactions, 14 buckets, 3 recurring, 17 incomes, 1 goal, 78 allocations, 6 month notes and 2 settings, all matching the backup), an edit reaching the database, download on a second profile, edits in both directions, offline edit then reconnect, and sign-out. Still open: the deployed GitHub Pages build (needs the repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, then a run of "Deploy to GitHub Pages"; the Google and Supabase redirect lists must include `https://pranjalagg.github.io/bdgt/settings`).

### Backend review leftovers (Supabase)
- **The invite check could also require the Google provider** (`auth.jwt() -> 'app_metadata' -> 'providers'` contains `google`). Skipped because Supabase links accounts by email in ways that could lock out the real owner; the guide turns the other sign-in methods off instead. Revisit if Email sign-in is ever enabled. Size S.
- **A deleted auth user whose token is still valid** hits the `user_id` foreign key (SQLSTATE 23503, HTTP 409) and its rows are parked as "rejected" instead of showing "sign in again". Rare. Fix: map 23503 on `user_id` to `auth`. `supabaseTransport.ts`. Size S.
- **The PostgREST stand-in in tests is not PostgREST.** `json_populate_recordset(null::t)` fills missing keys with NULL rather than the column default, it applies no `max-rows`, and PGlite's owner is a superuser, so rights of Supabase's non-superuser `postgres` role on `auth.users` are not tested (the foreign key and the `analytics.users` view work on Supabase today). The first real-project run is the check for these.
- **Pulls can stall if the project's Max rows is set below 1000** and more than that many rows fall in the 60-second overlap window. Documented in the setup guide; the engine fix is to stop paging on `fresh === 0` only, or to read `Content-Range`. `pull.ts`. Size S.
- **Unknown request-size limits.** Whether Supabase's gateway caps a 500-row batch is unknown; a 413 is now treated as rejected, so the batch is split rather than retried whole.

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

## Android app and payment capture (design: `docs/superpowers/specs/2026-10-21-android-payment-capture-design.md`)

### Test build (stage 1)
- **The app is "bdgt" on the home screen and "Budget" in its own header.** Pick one. `android/app/src/main/res/values/strings.xml`, `Nav.svelte`. Size S.
- **`npm audit` reports two moderate advisories through `@capacitor/cli`** (its iOS helper `xcode` uses an old `uuid`). Development only, never in the app. Re-check when upgrading Capacitor. Size S.
- **The notification listener has not run on a real phone yet.** Its rules are unit-tested; the test group's week is the check (phone makers stopping background apps, what each app really posts).
- **Testers install a debug build from a file,** so Android 13 and later asks them to *Allow restricted settings* before notification access can be turned on. Google Play internal testing removes that step but needs a release key, Play App Signing, a privacy page, and the Play signing key's SHA-1 as another Android OAuth client. Size M.

### Review queue (stage 2)
- **A payment in a currency never used before is left out of safe to spend and of the pending total** (its row says *rate needed*). Fix: fetch a rate when the capture is brought in (stage 4), or estimate from the newest rate. `captureStore.ts`, `pendingEverydaySpend`. Size S–M.
- **Deleting an approved payment's transaction in Activity leaves its capture approved,** so it does not return to the queue and the Approved tab says *Approved into a bucket*. Probably right (deleting says it was not spending), but unclear. Fix: deleting a `capture:` transaction marks its capture dismissed. `budgetStore.ts`, `deleteTransaction`. Size S.
- **Changing an approved payment's bucket in Activity does not update the payee's rule;** rules learn only at approval. Size S.
- **Approve all suggested approves one payment at a time;** a failure stops it midway, with the earlier ones approved and no summary. Size S.
- **Undo covers only the last action, for 8 seconds;** older ones go back with *Back to review*. Size S.
- **Two payees with the same display name look identical in Capture rules** (rules are keyed by a payee hash). Show the source or card digits next to the name. Size S.
- **The Dismissed tab lists every dismissed payment ever.** Limit it like Approved (7 days) once it gets long. Size S.

### Sign-in in the app (stage 3)
- **Native sign-in is checked only by hand.** Credential Manager needs a phone with Google Play services; the TypeScript side is tested with a fake plugin. Re-check after changing `GoogleAuthPlugin.kt`, `src/lib/sync/googleAuth.ts` or the sign-in part of `src/lib/sync/app.ts`.
- **Signing out does not call Credential Manager's `clearCredentialState`.** The *Sign in with Google* sheet asks every time, so nothing is remembered to clear. Needed only if one-tap automatic sign-in is ever used. Size S.
- **Until the signing-key secret exists, builds use a key in the Actions cache,** which GitHub deletes after 7 days without a build: the next build gets a new key, phones must reinstall, and Google stops recognising the app until the new SHA-1 is registered. Fix: the one-time step 1 in `docs/android-setup.md`. Size S.

### Capture into the queue (stage 4)
- **The daily reminder is not built** ("N payments to review" at a chosen time). Needs a WorkManager job, the notification permission, a notification channel and a tap that opens Review; testable only on a phone. The dashboard card and the Activity badge show waiting payments meanwhile. Size M.
- **Parsers are built from known message shapes, not real ones.** Fixtures in `tests/lib/capture/parse.test.ts` are made up; Google Wallet's real wording has not been seen yet. Add each test group log's misreads as fixtures and fix `src/lib/capture/parse.ts`. Ongoing.
- **A duplicate's better name is not used.** The bank SMS shows `swiggy@icici` while the PhonePe copy folded under it said *Swiggy*. Fix: when folding, give a still-pending original whose merchant is a UPI ID the duplicate's name (an automatic write). `bringIn.ts`. Size S.
- **Stored text is not read again after a parser fix,** so past misreads stay as they were (the full text is kept in `captureRaw` for 30 days). Size S–M.
- **A bare `$` is read as the budget's own dollar (else USD); an amount without any currency is read as rupees from an Indian bank sender ID, otherwise as the budget's currency.** Right for the test group; wrong for some travel. Size S.
- **Few merchants have a kind** (the dictionary in `src/lib/capture/payee.ts`); most suggestions will come from learned rules. Grow it from the logs. Size S.
- **The listener and plugin changes of this stage have only run in CI** (unit tests and a build), not on a phone yet.

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

## Native-feeling UI (branch `claude/native-ui`, plan: `docs/superpowers/plans/2026-10-23-native-ui.md`)
- **Edit sheets focus their first field when they open**, so on a phone the keyboard covers the sheet even when you came to look or delete. Consider focusing the sheet itself for edit sheets (not Log) on touch screens. `Modal.svelte` `focusFirst`. Size S.
- **The preview app ("bdgt preview") has no sync.** Google sign-in is registered for the real app id only. To turn it on: add an Android OAuth client for `io.github.pranjalagg.bdgt.preview` with the same SHA-1 in Google Cloud, then drop the `PREVIEW` gating of the three `VITE_` variables in `.github/workflows/android.yml`. Size S.
- **Back restores scroll only within a session:** positions are kept in memory per URL, so after a full reload Back starts at the top. `Layout.svelte`. Size S.
- **The bottom bar's count of payments to review is red**, the platform convention for badges and the one place red does not mean overspent.
- **GitHub Actions warns that `actions/checkout@v4` and `actions/setup-node@v4` target Node 20** (deprecated, now forced onto Node 24). Move to the next major versions when convenient. Size S.

---

## Mobile-first redesign (branch `claude/native-ui`, plan: `docs/superpowers/plans/2026-10-23-mobile-first-redesign.md`)
- **Only Activity's rows swipe.** The envelope page's transaction list and the Bills list open their sheets on tap (Delete and Move live there) but do not swipe. `SwipeRow.svelte` can wrap them. Size S.
- **The Review deck has no arrow keys on desktop**; Approve, Edit and Dismiss are buttons, so the keyboard works, but → / ← as shortcuts would be quicker. `Deck.svelte`. Size S.
- **The Sync page was checked only without sync** (the dev server runs with sync off); its content is unchanged apart from colours, but sign-in, Sync now and Sign out under `/settings/sync` want a look on a synced build. Not code; a check.
- **Investments' Add purchase and Sell sheets keep the older form layout** (labels over outlined fields), restyled only in colour and button order. Size S.
- **Review minors from the redesign's final pass (not fixed):**
  - The deck resets a card that flew off one tick after the decision is sent; if the save were slow enough, the card could start sliding back before it disappears. Not seen even at 8× CPU throttling. Fix: keep it off until the top card changes, with a timeout for a failed save. `Deck.svelte` `decide`. Size S.
  - Edit Home: a drag that ends without a click leaves the `moved` flag set, so the next tap on that handle is ignored once. `EditHomeSheet.svelte`. Size S.
  - Settings' Sync row reads the sync status time once per render, not every 30 seconds as the Sync page does. Size S.
- **Add purchase (Investments) starts on tomorrow's date in the evening** in time zones west of UTC: `AddLotModal.svelte` takes the date from `toISOString()` (UTC). Found while restyling; not changed because it is behaviour. Fix: `getLocalDateKey(new Date())` in both places it is set. Size S.

## Quieter design language (branch `claude/minimal-ui`, plan: `docs/superpowers/plans/2026-10-24-minimal-ui.md`)
- **Font is Manrope on trial** (the owner half agreed). To go back to the system font: in `src/routes/+layout.svelte` import `@fontsource-variable/inter/opsz.css` instead of Manrope, and set `--font-sans` in `src/app.css` back to `-apple-system, BlinkMacSystemFont, 'Inter Variable', Inter, system-ui, sans-serif`. Size S.
- **Pale chart bars sit below 3:1 against the page** (as in the references). Every value is also in the figure above the chart, the scrub bubble, the chart's spoken label and the trend pages' lists. If a non-text contrast check matters later, darken the pale bars to `label-2` at about 40%. `ScrubBars.svelte`. Size S.
- **Settings keeps hairline groups** (the iOS convention for settings); every other list is open. Revisit if the owner wants Settings open too.
- **Only the Home envelope tiles use tinted colour backgrounds**; Budget rows show the envelope colour as a dot and a bar. Tiles elsewhere (Budget) could follow if the owner likes them.

---

## Product and UI
- **Should the bucket delete button be allowed for default buckets?** It is restricted by `isDefault` today. Open question rather than a bug.
- **Amounts in `aria-label`s and tooltips are not marked `.amt`**, so the hide-amounts toggle does not blur them for screen-reader users or on hover. Size S–M.
- **Import your re-bucketed backup when ready:** `budget-backup-2026-10-02.rebucketed-v4-with-notes.json` (after exporting a fresh backup first). Not code; a reminder.
- **Hide-amounts blur with non-dollar symbols** was checked for the row note and preview, not for every screen.

---

## Resolved
- Close after opening Review or Settings directly counted as a step back (fixed: the app keeps a record of the pages behind the current one, and replacing navigations do not add to it; `src/lib/ui/history.ts`).
- Editing a paused recurring item resumed it (fixed in the redesign: the form's data shaping is `recurringFormData()` in `src/lib/budget/recurringForm.ts`, tested).
- Insights drew spending in red and income in green (fixed in the redesign: spending is the tint, income grey; the charts are the app's own SVG components with theme tokens).
- Review's per-card buttons without swipe or haptics (replaced by the swipe deck, with `haptic()` on decisions).
- A `SIGNED_IN` event for the same user did not resume a device whose session had ended (fixed with Android sign-in, where signing in again does not reload the page).
- Settings page `fileInput.value = ''` threw a TypeError after any import (fixed, guarded).
- Exporting a never-confirmed fresh profile wrote USD instead of the detected currency (fixed: the detected currency is now saved as unconfirmed when first loaded).
- Decimal commas (`12,50`) were read as 1250 (fixed: only thousands separators are accepted).
- A late "Fetch rate" answer could overwrite a newer rate (fixed).
- Pulled rows would have been rewritten every cycle because Postgres formats timestamps differently (fixed, values are compared not strings).
