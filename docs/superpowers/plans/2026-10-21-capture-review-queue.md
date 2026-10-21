# Capture Review Queue Implementation Plan

> Stage 2 of 4 of automatic payment capture. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Captured payments wait in a review queue that syncs, so they can be approved, edited or dismissed on any signed-in device. Approving turns a capture into an ordinary transaction and teaches a payee rule. Pending payments lower safe to spend. Nothing creates captures yet except a development helper; stage 4 brings them in from the phone.

**Spec:** `docs/superpowers/specs/2026-10-21-android-payment-capture-design.md`: "Data model", "Supabase migration", "Suggestions", "Rule learning", "Review", "Other changes".

## Global Constraints

- Same as stage 1: branch `claude/intelligent-davinci-7qblqz`, no pull requests, `git commit --no-gpg-sign` without attribution lines, never run the Pages deploy from this branch.
- **Apply the migration before deploying a build with it:** an app at schema version 2 pauses sync against a version 1 database ("Database needs update 2"); older apps keep working against version 2.

## Rulings made while planning

- **Pure logic in `src/lib/capture/queue.ts`** (suggestions, base amounts, safe-to-spend share, what approving writes); the store (`captureStore.ts`) only reads and writes. The review screen and dashboard read derived stores.
- **Safe to spend lives next to the captures:** `budgetStore` cannot import the capture store (the capture store imports it), so `captureStore` exports `safeToSpendWithPending` and the dashboard reads that. `calculateSafeToSpendPerDay` takes the pending amount as an optional argument.
- **Approving writes with `put`,** so approving again after an undo or a dismiss on another device revives the same transaction id.
- **The merchant dictionary comes in stage 4** with the parsers; `kind` is already a field and suggestions already use it.
- **Undo** is a bar at the bottom of the review page for the last action, not an app-wide toast.
- **Development helper:** `window.__bdgtSampleCaptures()` under `npm run dev` adds sample captures (Wallet, bank SMS, PhonePe, a duplicate, a card-bill hint, a foreign payment).

## Tasks

- [ ] Types (`Capture`, `CaptureRule`, `CaptureRaw`); Dexie v14 tables `captures`, `captureRules`, `captureRaw`.
- [ ] Registry entries after `transactions`; migration `supabase/migrations/20261022000000_captures.sql` (tables, write trigger, pull index, row-level security, `sync_account_state()` counting them, analytics views, schema version 2); `REQUIRED_SCHEMA_VERSION = 2`; SQL tests, verify script and fake server updated.
- [ ] `queue.ts` with tests: suggestion (rule, then kind, then none), base amount (same currency, remembered rate), pending everyday share, approve-all eligibility.
- [ ] `captureStore.ts` with integration tests (real Dexie): load, approve (transaction `capture:<id>`, capture, rule), edit-approve, dismiss (deletes the transaction id), ignore payee, undo, not a duplicate, approve all suggested.
- [ ] Safe to spend with pending captures and the "includes … waiting for review" line.
- [ ] `/review` page, dashboard card, Activity badge, capture rules in Settings.
- [ ] Reset clears the new tables; sign-out clears `captureRaw`; the quiet reload loads captures.
- [ ] Two-device sync tests: approve on one and dismiss on the other converge; approving on both gives one transaction; a rule learned on one device suggests on the other.
- [ ] Look at the screens with the development helper (phone size, light and dark).
