# Automatic Payment Capture (Android) Design

**Date:** 2026-10-21
**Status:** Draft, awaiting review

## Overview

An Android app for bdgt that notices payments as they happen and queues them for review. It wraps the existing static build with Capacitor and adds a small Kotlin plugin that reads the notifications payment apps already show: Google Wallet after a tap, UPI apps after a payment, and bank SMS through the messaging app's notification. Each payment becomes a **capture**: amount, date, merchant and a suggested bucket. Captures wait in a review queue; approving one turns it into an ordinary transaction. The queue syncs through the existing Supabase sync, so a capture made on the phone can be approved on the laptop.

The idea follows Expensa (iPhone), which records Apple Pay purchases from Wallet with a Shortcuts automation and suggests a category. The differences: Android reads notifications directly, UPI apps and bank SMS are sources too, and nothing counts until the person approves it.

Users: the owner (pays mostly with Google Wallet) and invited friends (pay mostly by UPI, some with both).

## Goals

- A Wallet or UPI payment shows up for review within a minute, without opening the app.
- Every capture waits for approval. Approving is one tap when the suggested bucket is right; amount, bucket, date and note can be changed first.
- Approve, change or dismiss from any signed-in device.
- Suggestions learn: the next payment to the same payee arrives with the bucket used last time, and approving one payment updates every other pending payment to that payee.
- Pending payments lower "safe to spend" right away.
- Only payment notifications from apps the person chose are kept; everything else is dropped on arrival. The full text of a message never leaves the phone.
- The web app is unchanged for anyone with nothing to review.

## Non-goals (later)

- Incoming money: salary, refunds, reversals, friends paying back. Dropped when parsed.
- The SMS permission, and importing past messages.
- Automatic approval, and AI suggestions for unknown merchants.
- Bank and card app notifications (added per bank when someone needs one).
- Approving from the reminder notification without opening the app; a home-screen widget.
- Splitting one payment across buckets.
- Capture on iPhone (a Shortcuts automation posting to a Supabase Edge Function).
- Voice and receipt entry into the queue.
- Captures and rules in JSON or CSV backups.

## Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Android app | Capacitor around the existing static build, plus a Kotlin plugin inside the app | Reuses the UI, Dexie and the sync engine. A Trusted Web Activity has no practical way to hand data from a native listener to the page; a native rewrite would duplicate the budget math and sync |
| How payments are seen | A notification listener | Google Wallet has no API for reading payments. One special access covers Wallet, UPI apps and bank SMS |
| Bank SMS | Read from the messaging app's notification, not with the SMS permission | No Play permission declaration and no restricted-settings prompt for SMS. Cost: no import of past messages, and muted SMS notifications are missed |
| Review | Every capture waits for approval | The owner's call: nothing counts until checked |
| Where captures live | A synced `captures` collection, apart from transactions and from Unsorted | Approval on any device; a capture is not spending until approved |
| What syncs | Parsed fields only | Raw SMS hold balances and account numbers, and UPI IDs can hold other people's phone numbers. The project owner can read invited users' rows |
| Parsing | In TypeScript when captures are brought into the app; Kotlin only keeps or drops | Parsers sit next to the existing currency code with Vitest fixtures; the native part stays small |
| Suggestions | Worked out when shown, from learned payee rules, then a starter dictionary | A rule learned on any device applies at once to every pending capture on every device |
| Transaction id | `capture:<captureId>` | Approving one capture on two devices gives one transaction, and a dismiss can delete it even on a device that never saw it |
| Safe to spend | Pending captures that would land in everyday buckets, or have no suggestion, reduce the pool | The owner's call: the figure should never look better than it is |
| Scope | Spending only | The owner's call for the first version |
| Capture and accounts | On a build connected to Supabase, capture can only be turned on while signed in | A pending capture must not be lost when a device later signs in and takes the account's data. An exception to "no feature may require an account"; see Open questions |
| Distribution | Google Play internal testing | Friends join by email and get updates from Play; Play installs avoid Android's restricted-settings prompts and the 2027 sideloading verification |

## How it fits together

```
Phone (Android)                                    Any signed-in device
---------------------------------------------      ------------------------------
Notification from Wallet / UPI app / SMS app
  -> listener keeps or drops it (Kotlin)
  -> native buffer (raw text)
  -> app opens: bring in, parse, dedupe (TS)
  -> captures (synced) + captureRaw (phone)   ->   Review: approve / edit / dismiss
                                                     -> transaction capture:<id>
                                                     -> payee rule learned (synced)
```

## Sources (first version)

| Source | App | What is kept |
|--------|-----|--------------|
| Google Wallet | `com.google.android.apps.walletnfcrel` | Payment notifications (merchant, amount, currency) |
| Bank SMS | The default messaging app (`Telephony.Sms.getDefaultSmsPackage`), plus Google Messages (`com.google.android.apps.messaging`) and Samsung Messages (`com.samsung.android.messaging`) | Each message in a conversation notification whose sender is a business ID (such as `HDFCBK`) or a short code, and whose text holds an amount |
| Google Pay (India) | `com.google.android.apps.nbu.paisa.user` | Payment notifications, if the app posts them |
| PhonePe | `com.phonepe.app` | Same |
| Paytm | `net.one97.paytm` | Same |

The person chooses sources in Settings; only installed apps are offered. The test build (Rollout step 1) confirms what each app actually posts, and which banks get a parser first follows the test group's samples.

## Android app

### Shell

- Capacitor with `webDir: 'build'`; the Android project lives in `android/` and is committed.
- `svelte.config.js` takes the base path from an explicit `BASE_PATH` variable: the GitHub Pages workflow sets `/bdgt`, the Android build leaves it empty. Today the base path follows `GITHUB_ACTIONS`, which would break an Android build made in CI.
- IBM Plex is bundled with the app instead of loaded from Google Fonts, so the app looks right offline (the web build benefits too).
- The Supabase URL and publishable key are built in, as for GitHub Pages.
- Application id `io.github.pranjalagg.bdgt` (it cannot change after the first Play upload).
- Downloads (backups, the CSV, the capture log) go through the Android share sheet: a WebView cannot save a file from a link.

### Capture plugin (Kotlin)

- **Listener** (`NotificationListenerService`). For each posted notification, return at once unless capture is on and the app is an enabled source. For messaging apps, take each message from the notification's message list (one conversation notification carries several messages and is re-posted as new ones arrive) and keep those from business senders that contain an amount. For other sources, keep notifications whose text contains an amount. Nothing else is stored or logged.
- **Item ids.** For a message: a hash of the package, sender, message time and text, which stays the same when the conversation notification is re-posted. For any other notification: a hash of the package, notification key and post time; a re-post of the same notification with the same text within two minutes counts as the same item.
- **Catch-up.** When the listener connects, it checks `getActiveNotifications()` for anything posted while it was not running.
- **Buffer.** A small SQLite table of kept items: `id`, `package`, `sender`, `postedAt`, `title`, `text`. Items stay until the app acknowledges them.
- **Reminder.** A daily WorkManager job at the chosen time posts "N payments to review" when the count last reported by the app plus unread buffer items is above zero. The count can be stale (a laptop may have cleared the queue); tapping opens Review, which syncs.
- **Permissions.** Notification access (granted by the person in system settings), `POST_NOTIFICATIONS` for the reminder, and `<queries>` entries for the supported apps. No SMS permission. Battery help opens the system battery settings rather than requesting an exemption.

Plugin interface (`src/lib/capture/native.ts`; on the web every call is a no-op):

| Call | Purpose |
|------|---------|
| `getStatus()` | Access granted, listener connected, time of the last kept item, capture on |
| `setConfig({ enabled, packages, sms, reminderTime })` | Kept natively so capture works while the app is closed |
| `installedSources()` | Which supported apps are installed |
| `openAccessSettings()`, `openBatterySettings()` | System screens |
| `requestRebind()` | Asks the system to reconnect a stopped listener |
| `takePending()` | Buffered items, oldest first, not removed |
| `ack({ ids })` | Removes items the app has stored |
| `setPendingCount({ count })` | For the reminder |
| `clear()` | Empties the buffer and turns capture off (sign-out) |
| event `itemKept` | While the app is open, starts bringing items in |

### Sign-in on Android

Google refuses OAuth inside a WebView, so `signInWithOAuth` with a redirect cannot work in the app. On Android, **Sign in with Google** asks the app's own `GoogleAuth` plugin for an ID token: Credential Manager's *Sign in with Google* sheet (`GetSignInWithGoogleOption`) for the web client (`VITE_GOOGLE_WEB_CLIENT_ID`), carrying the SHA-256 (hex) of a one-time nonce. The page then calls `supabase.auth.signInWithIdToken({ provider: 'google', token, nonce })` with the raw nonce. The library announces `SIGNED_IN`, and the first-sign-in flow that follows is unchanged.

Setup needs an Android OAuth client in Google Cloud (package name and the SHA-1 of the signing key, which CI prints); a Play release adds the Play app signing key's SHA-1 as another client. The signing key lives in a repository secret, so it survives GitHub emptying the Actions cache. The plugin is our own (about 60 lines on Google's libraries) rather than a third-party Capacitor sign-in plugin: no other providers' code, and full control of the nonce.

## Data model (Dexie v14)

```ts
export type CaptureSource = 'wallet' | 'sms' | 'upi-app';
export type CaptureStatus = 'pending' | 'approved' | 'dismissed' | 'duplicate';
export type CaptureHint = 'card-bill' | 'transfer' | 'atm' | 'upi-lite-topup';
export type MerchantKind = 'grocery' | 'dining' | 'transport' | 'subscriptions' | 'entertainment' | 'utilities';

export interface Capture {
  id: string;             // `${source}:${hash}` of the item's own key
  status: CaptureStatus;
  source: CaptureSource;
  sourceLabel: string;    // "Google Wallet", "HDFC Bank SMS", "PhonePe"
  postedAt: number;       // epoch ms the notification or message arrived
  date: Date;             // local calendar day of the payment
  amount: number;         // minor units of `currency`
  currency: CurrencyCode; // what was charged; may differ from the base
  merchant: string;       // display name; runs of 6+ digits masked
  payeeKey?: string;      // SHA-256 of the normalized payee identifier
  kind?: MerchantKind;    // from the starter dictionary
  accountHint?: string;   // last 4 digits of the card or account
  hint?: CaptureHint;     // looks like it is not spending
  duplicateOf?: string;
  transactionId?: string; // set on approval
  resolvedAt?: number;    // epoch ms of approval or dismissal
}

export interface CaptureRule {
  id: string;             // `payee:${payeeKey}`
  payeeKey: string;
  merchant: string;       // shown in the rules list
  action: 'suggest' | 'ignore';
  bucketId?: string;      // for 'suggest'
}
```

- New tables: `captures: 'id, status, date'` and `captureRules: 'id'` (synced), and `captureRaw: 'id, postedAt'` (this device only) holding `{ id, package, sender, text, postedAt, reference }`, where `reference` is the UPI reference number. Raw text is deleted 30 days after its capture is resolved.
- Registry entries, after `transactions` in push order:
  - `captures` to `captures`: `status`, `source`, `source_label`, `posted_at timestamptz`, `date date`, `amount_minor bigint`, `currency`, `merchant`, `payee_key`, `kind`, `account_hint`, `hint`, `duplicate_of`, `transaction_id`, `resolved_at timestamptz`.
  - `captureRules` to `capture_rules`: `payee_key`, `merchant`, `action`, `bucket_id`.
- `captureRaw` is not in the registry, so its writes are never queued for sync.

### Supabase migration (schema version 2)

- The two tables with the usual sync columns, write trigger, pull index and row-level security (the same loop as the core migration).
- Live-row checks: captures need `status`, `source`, `posted_at`, `date`, `amount_minor`, `currency` and `merchant`; rules need `payee_key` and `action`, and `bucket_id` unless the action is `ignore`. Fixed vocabularies are `text` with a `check`.
- `sync_account_state()` counts the new tables in `hasOtherRows`, matching the device side, which already counts every collection in the registry.
- `analytics.captures` and `analytics.capture_rules`, like the other tables' views.
- `sync_schema_version()` returns 2 and `REQUIRED_SCHEMA_VERSION` becomes 2. Apply the migration before deploying: a new app against the old database pauses sync with "Database needs update 2", while older apps keep working against the new one.

### Write kinds

- Bringing captures in (new captures, dismissals by ignore rules, duplicates) is an automatic write: any person's edit beats it.
- Approve, edit, dismiss, undo and rule changes are a person's edits.

## Bringing captures in (TypeScript, `src/lib/capture/`)

Runs at app start, on resume and on `itemKept`, one run at a time.

1. `takePending()`.
2. Skip items whose capture already exists or has a recorded version on this device.
3. Parse with the source's parser. Keep debits only; drop credits, refunds, payments that failed or are still processing, OTPs, balance alerts and promotions.
4. Build the capture: payee key, display merchant with digit runs masked, `kind` from the dictionary (matched on the raw payee and merchant), `hint` from transfer patterns.
5. An `ignore` rule for the payee key makes it `dismissed`.
6. Dedupe (below).
7. Store the captures and their `captureRaw` rows in one transaction, then `ack` the ids and report the pending count.

A run cut off between the write and the `ack` is safe: step 2 skips those items next time.

### Parsers

- One module per source in `src/lib/capture/parsers/`: `wallet.ts`, `upi/gpay.ts`, `upi/phonepe.ts`, `upi/paytm.ts`, `sms/<bank>.ts`, and `generic.ts`, the fallback: the first amount after a debit word, with the sender as merchant.
- Amounts: `Rs.1,234.50`, `Rs 1234`, `INR 1,234.50`, `₹1,23,456`, `$4.50`, `USD 4.50`, in Indian and Western grouping, to integer minor units.
- Payee identifiers, normalized before hashing: UPI IDs lowercased; card descriptors uppercased with processor prefixes (`SQ *`, `TST*`, `PAYPAL *`) removed; Wallet merchant names trimmed and lowercased.
- Hints: credit card bill payments, UPI Lite top-ups, ATM withdrawals and transfers. UPI Lite payments get no per-payment SMS, so the top-up is the only trace; Review lets the person file it as spending or dismiss it.
- Fixtures: anonymized texts from the test group in `tests/lib/capture/fixtures/`, one file per source.

### Dedupe

One payment often shows up twice: Wallet and a bank SMS, or a UPI app and a bank SMS.

- Candidates: captures in any status from a **different** source, posted within 15 minutes, with the same currency and amount. Two captures from the same source are never merged (two ₹50 rides are two payments).
- When both have a UPI reference, it decides: the same reference merges, a different one does not.
- Otherwise merge only when exactly one candidate qualifies.
- The newer capture becomes a `duplicate` of the earlier one, which is never changed.

### Suggestions (`suggest.ts`, pure)

For a capture, in order:

1. A `suggest` rule for its payee key whose bucket still exists: "Last filed under Dining Out".
2. Its `kind`, when the person has the matching default bucket (Grocery, Dining Out, Transportation, Subscriptions, Entertainment, Utilities): "Usually Dining Out".
3. Nothing.

The starter dictionary (`dictionary.ts`) maps well-known UPI IDs and names to kinds, Indian and US: Swiggy and Zomato; Blinkit, Zepto and BigBasket; Uber, Ola and Rapido; Netflix and Spotify; BookMyShow; Starbucks, Whole Foods, Trader Joe's and Lyft. Ambiguous names are left out.

### Rule learning

- Approving a capture with payee key K into bucket B saves rule `payee:K` as `suggest` B, unless it already says so. The latest approval wins.
- Dismissing with **Always ignore payments to <merchant>** saves an `ignore` rule and dismisses the other pending captures with that key.
- Setup gets a **Capture rules** list: change the bucket, switch between suggest and ignore, delete.

## Review

### Where it shows

- A `/review` page, not a fifth navigation destination.
- A dashboard card while anything is pending: "5 payments to review · ₹1,240", linking to Review.
- A count badge on Activity in both navigations.
- The daily reminder opens Review.
- Nothing shows for someone who has never had a capture.

### The list

- Pending captures, newest first. Each row shows the merchant; the amount in the currency paid (with a base estimate when foreign); date and time; the source; card or account digits; the suggested bucket as a colored chip with its reason; and a note when a hint applies ("Looks like a credit card bill payment").
- Duplicates fold under the capture they matched ("Also seen: HDFC Bank SMS"), with **Not a duplicate**.
- Filters: Pending, Approved in the last 7 days, Dismissed.

### Actions

- **Approve.** One tap with a suggestion; without one it opens the bucket picker (the Log flow's bucket rows, with their "does this fit?" status).
- **Edit.** The edit sheet, prefilled: amount in the currency paid, bucket, date, and a note set to the merchant. Saving approves. A foreign payment uses the existing rate field (last rate for that currency, fetch on request).
- **Dismiss**, with an optional **Always ignore payments to <merchant>**.
- **Approve all suggested.** Every pending capture with a suggestion, no hint and, when foreign, a known rate; the count and total are shown first.
- **Undo** (a toast after approve or dismiss): back to pending; an approved capture's transaction is deleted.

### What approving writes

In one Dexie transaction:

- Transaction `capture:<captureId>`: the base-currency amount (a foreign payment is converted with the confirmed rate and keeps `foreign`), bucket, date, note and `createdAt`.
- The capture: `approved`, `transactionId`, `resolvedAt`.
- The payee rule, when it changes.

Dismissing writes the capture and deletes transaction `capture:<captureId>`, which records a delete even where the transaction never existed. So if one device approves and another dismisses, both records end up as the later action left them.

### Safe to spend

- `safeToSpendPerDay` takes the everyday pool as today, minus the base amount of pending captures dated this month whose suggestion is an everyday, non-savings bucket or who have no suggestion. Foreign captures use the last rate for their currency and are left out when there is none.
- Under the figure: "includes ₹1,240 waiting for review" whenever that amount is above zero.
- Bucket cards, remaining amounts, the Log flow's fit check and analytics count approved transactions only.

## Settings: Automatic capture (Android only)

- On a build with sync, signed out: "Sign in to turn on automatic capture. Payments wait for your review on any of your devices."
- Turning on: a disclosure (which apps are read; every other notification is ignored and never stored; amount, date and merchant sync to your account, which the app's owner can see; full message text stays on this phone), then the system Notification access screen, then choosing sources, then an optional daily reminder (default 8 pm), which asks for notification permission.
- Status: **On**, with the time of the last payment seen; **Off**; or **Not running** with **Fix**: ask the system to reconnect the listener, open battery settings, and show the steps for the phone's maker.
- A note that muting Wallet or bank SMS notifications stops capture from them.
- A **Capture log** (from the test build) stays available for reporting parser problems.

## Other changes

- Sign-out turns capture off, clears the plugin's buffer and `captureRaw`, and clears captures and rules with the rest of the data.
- Reset clears captures, rules and `captureRaw` (`resetAllData` lists its tables explicitly today).
- Import replaces budget data and leaves captures and rules alone; a rule pointing at a bucket that no longer exists stops suggesting.
- The quiet reload after a sync also reloads the capture stores.

## Privacy

- The listener drops everything except enabled sources, and every SMS except business senders with an amount, before storing anything.
- Raw text, UPI references and raw payee identifiers stay on the phone (the plugin's buffer and `captureRaw`). They are never synced or exported.
- Synced captures hold amount, currency, date, the display merchant with long digit runs masked, a payee hash, card or account last 4, and status.
- The payee hash keeps UPI IDs, which can contain phone numbers, out of plain view in the dashboard. It does not stop someone with dashboard access from guessing a phone-number UPI ID.
- As with every synced table, the project owner can read invited users' captures and rules. The disclosure says so.

## Testing

- **Unit** (pure): every parser against its fixtures; amount parsing; payee normalization and hashing; digit masking; debit and drop classification; dedupe decisions; suggestions; safe to spend with pending captures.
- **Integration** (Vitest with `fake-indexeddb` and the real Dexie database): approve, edit, dismiss and undo writes; bringing captures in through a fake plugin, covering re-delivered items, a run cut off before `ack`, ignore rules, and unreadable text falling back to the generic parser.
- **Sync** (the two-device harness and fake server): approve on one device and dismiss on the other; approve on both with different buckets (one transaction); a rule learned on the laptop changes the phone's suggestion; captured on the phone, approved on the laptop.
- **SQL** (`tests/sql`): the parity test covers the new tables; access rules; tombstones; `sync_account_state()` counts them; schema version 2.
- **Kotlin unit tests:** keep or drop, message-list splitting, item ids and re-posts.
- **Manual:** the test group's phones (including a Samsung and a Xiaomi if available) for a week; real Google sign-in on Android.

## Rollout

Four stages, all on one branch (`claude/intelligent-davinci-7qblqz`) so the live app is never affected. No pull requests until every stage has been tested; then one pull request for the whole feature.

1. **Test build.** The Capacitor shell (base path variable, bundled fonts), the listener with keep or drop and the buffer, and a **Capture log** screen in Settings: kept items with **Export** (masks reference, account and phone numbers, meaning runs of 6 or more digits that are not part of an amount; amounts and dates are kept) and **Clear**. No queue and no sign-in. GitHub Actions builds a debug APK on every push to the branch; the owner and two or three friends with different banks and UPI apps install it (Play internal testing once a release key exists), and a week of their exported samples becomes the parser fixtures.
2. **Queue.** Dexie v14, types, registry entries, the Supabase migration, suggestions, rules, Review, the dashboard card, the badge and the safe-to-spend change. Built and tested on desktop with a development-only helper that adds sample captures from the fixtures.
3. **Sign-in on Android.** Credential Manager sign-in, the build's sign-in settings and signing key, and the setup guide section.
4. **Capture.** Parsers, bringing captures in, dedupe, the Settings section with capture tied to sign-in (it turns on only while signed in; sign-out stops it and empties the inbox), and the reminder. Tying capture to sign-in moved here from stage 3: the switch and the inbox it guards are built in this stage.

Setup guide additions (`docs/android-setup.md`): a Play developer account, the internal testing track and tester list, app signing, the Android OAuth client, and a privacy page (needed for Google sign-in in production, and expected by Play for an app that reads notifications).

## Risks

- **Wording changes** in Wallet, UPI apps or bank SMS break a parser. The generic fallback still captures the amount, raw text is kept so captures can be parsed again, and fixtures make fixes quick.
- **Phone makers' battery management** stops the listener. Settings shows **Not running** with a fix, and catch-up reads notifications still in the shade.
- **Muted SMS notifications** mean no SMS captures. Settings says so.
- **UPI Lite** payments get no per-payment SMS; only top-ups appear.
- **Wrong merges or missed duplicates.** Merging is conservative; **Not a duplicate** and **Dismiss** fix the rest.
- **Double counting** of card bill payments and transfers. Hints keep them out of **Approve all suggested**; ignore rules handle repeats.
- **Play policy on notification access** could tighten. The listener is one module; a sideloaded build is the fallback.
- **The owner can read invited users' captures.** Stated in the disclosure; raw text is never uploaded.

## Open questions

- Capture requires sign-in on builds with sync, an exception to "no feature may require an account". The alternative keeps pending captures through first sign-in (left out of the device's data check, kept when the device takes the account's data, then uploaded), at the cost of more first-sign-in cases to build and test.
- Reminder default (8 pm) and raw-text retention (30 days).
- Which banks and UPI apps the first parsers cover (from the test group).
