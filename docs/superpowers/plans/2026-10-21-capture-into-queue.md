# Capture Into the Queue Implementation Plan

> Stage 4 of 4 of automatic payment capture. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A payment notification on the phone becomes a payment in Review without the app open for more than a moment: the listener keeps it, the app parses it, drops duplicates and non-spending, and adds it to the synced queue.

**Spec:** `docs/superpowers/specs/2026-10-21-android-payment-capture-design.md`: "Capture plugin", "Bringing captures in", "Parsers", "Dedupe", "Settings: Automatic capture", "Privacy".

## Global Constraints

- Same as stages 1 to 3: branch `claude/intelligent-davinci-7qblqz`, no pull requests, `git commit --no-gpg-sign` without attribution lines, never run the Pages deploy from this branch.
- Kotlin compiles and its unit tests run only on CI (no Android SDK or Gradle on the development Mac).

## Rulings made while planning

- **Recording works without signing in; payments reach the queue only on a linked device** (or a build without sync). Until then they wait in the phone's buffer, so a later first sign-in can never replace them, and friends can still record samples before they have an account. This replaces "capture can only be turned on while signed in".
- **The phone's buffer doubles as the capture log.** Bringing an item in marks it done (`acked_at`) instead of deleting it, so the log still shows everything for reporting parser problems; **Clear log** empties it. Items recorded before this build count as done, so updating does not flood the queue with old payments.
- **Sign-out stops bringing in first,** then the device's data is cleared. Recording and the log carry on (changed after testing: emptying the log and turning capture off lost the owner's log and left capture off after signing back in).
- **Keep rules tighten before anything is stored:** messages only from business senders (bank sender IDs such as `VM-HDFCBK`, short codes, names with a bank word), never from contacts or phone numbers; SBI-style amounts without a currency sign (`debited by 250.0`) count as amounts.
- **Parsers are pattern sets per kind of source** (Google Wallet, UPI apps, bank SMS) built from publicly known message shapes, with made-up fixtures. Exact per-bank and per-app parsers follow the test group's logs; anything unread falls back to an amount and a guessed payee, and every capture waits for review.
- **The log shows what the parser made of each item** (a payment, or why it was skipped), and the shared file carries it, so a log is a ready-made bug report.
- **The daily reminder moves to a follow-up:** it needs WorkManager, the notification permission and a notification channel, testable only on a phone; the dashboard card and Activity badge already show waiting payments.

## Tasks

- [x] Kotlin: business-sender rule and SBI amounts in `KeepRules` (tests); `CaptureStore` v2 with `acked_at`; plugin `takePending`, `ack`, `reset`, `waiting` in the status.
- [x] `src/lib/utils/hash.ts` (SHA-256 shared by sign-in and payee keys).
- [x] `src/lib/capture/parse.ts`: amounts, currency, debit or not, payee, card or account digits, UPI reference, hints; per source (tests with fixtures).
- [x] `src/lib/capture/payee.ts`: payee normalisation and key, display merchant, merchant kinds dictionary (tests).
- [x] `src/lib/capture/dedupe.ts` (tests).
- [x] `src/lib/capture/bringIn.ts`: take, parse, rules, dedupe, store, acknowledge, raw text cleanup (integration tests with a fake plugin and the real database).
- [x] `src/lib/capture/runner.ts`: when to bring in (start, `itemKept`, return to the app, linking); sign-out hook in `SyncApp`.
- [x] Settings **Automatic capture** section replacing the test section: access, on/off, sources, sign-in note, log with parse results, share and clear.
- [x] Docs: Android guide (testing auto-add), spec, deferred list.
- [ ] CI green; then the owner tests with real payments.
