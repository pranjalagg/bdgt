# Base Currency Design

**Date:** 2026-10-19
**Status:** Draft, awaiting review

## Overview

The app assumes US dollars everywhere. Some users are in India (and elsewhere).
Give each budget one **base currency**: detected automatically on first run,
confirmed by the user, and changeable later. All money is still stored as
integer minor units (cents/paise) of the base currency.

This is step 1 of three:

1. **Base currency** (this spec): detection, confirmation, formatting, parsing, backup.
2. Per-expense currency with a stored conversion rate (later).
3. Convert-on-change: rewriting history into a new base currency (later).

## Goals

- A user in India sees `₹` with lakh grouping (12,34,567.00) everywhere.
- Existing USD data looks exactly as it does today.
- Currency travels with the data in export/import.
- No network calls, no IP geolocation. Detection is client-side only.

## Non-goals

- Per-expense or per-lot currency (step 2).
- Converting stored amounts when the base changes (step 3). Changing the base
  in this step only **relabels**: same numbers, new symbol.
- Zero-decimal and three-decimal currencies (JPY, KWD). The cents assumption
  would break; they are excluded from the supported list.
- Live exchange rates.

## Decisions

- **Investments follow the base currency.** One formatter covers them. A lot
  with its own currency belongs to step 2.
- **Setting lives in IndexedDB**, not `localStorage`, so a restored backup
  carries the right symbol.
- **`formatCurrency` keeps its signature.** It reads a module-level current
  currency; the root layout wraps the app in `{#key $baseCurrency}` so a
  change rebuilds the tree. The 17 callers are untouched.
- **Existing users default to USD**, not the detected value, and are asked to
  confirm once.

## Data

### Supported currencies

`src/lib/currency/currencies.ts` exports a table of two-decimal currencies:

| Code | Symbol | Display locale |
|------|--------|----------------|
| USD  | $      | en-US |
| INR  | ₹      | en-IN |
| EUR  | €      | de-DE |
| GBP  | £      | en-GB |
| CAD  | $      | en-CA |
| AUD  | $      | en-AU |
| SGD  | $      | en-SG |
| AED  | AED    | en-AE |

`isSupportedCurrency(code)` guards every external input (import, storage).

### Settings table

Dexie **v10** adds `settings: 'key'`, a key-value table:

- `baseCurrency`: a supported code.
- `currencyConfirmed`: boolean.

The v10 upgrade, for a database that already holds data (at least one
transaction or income entry), writes `baseCurrency = 'USD'` and
`currencyConfirmed = false`. A fresh database gets no rows; the app resolves
the currency by detection on first load.

## Detection

Pure function `detectCurrency(timeZone, language)` in
`src/lib/currency/detect.ts`:

1. **Time zone** (`Intl.DateTimeFormat().resolvedOptions().timeZone`), e.g.
   `Asia/Kolkata` and `Asia/Calcutta` give INR; `America/*` and `US/*` give USD.
2. **Language region** (`navigator.language`), e.g. `en-IN` gives INR.
3. Fallback `USD`.

A region that maps to a currency outside the supported list falls through to
the next step. Detection only sets the initial suggestion; the user decides.

## Formatting, parsing, inputs

- `formatCurrency(cents)` uses
  `Intl.NumberFormat(locale, { style: 'currency', currency })` for the
  current base currency, and keeps the minus-sign-first output for negatives.
- `parseCurrency`, `evaluateExpression` and `isExpression` strip any
  supported currency symbol and grouping commas (not only `$` and `,`).
  `₹1,200 + 300` parses; `$` still parses for USD users.
- A `currencySymbol()` helper replaces the literal `$` in the input prefixes
  of `LogEntry`, `AssignPanel` and `EditTransaction`.
- No new amount elements are introduced, so `.amt` privacy coverage is
  unchanged.

## UI

- **Confirm modal**, shown while `currencyConfirmed` is false. Text: "Looks
  like INR. Is that right?" with the supported list. Fresh users get the
  detected suggestion preselected; existing users get USD preselected.
  Confirming writes both settings rows.
- **Currency chip** in the sidebar footer beside the privacy toggle, e.g.
  `$ USD`. It opens the same modal.
- Changing the base shows: "This changes the symbol only. Your amounts stay
  the same numbers." Saving rebuilds the app via `{#key}`.

## Export / import

- The backup gains an optional `settings` section with `baseCurrency` and
  `currencyConfirmed`. `version` stays `1` because the addition is optional.
- Import validates the code with `isSupportedCurrency`. A missing section or
  unsupported code imports as `USD` with `currencyConfirmed = false`, so the
  modal appears.

## Testing

- Detection table: time zones, language regions, unsupported regions, fallback.
- Format per currency: USD, INR lakh grouping (`1234567.00` to `₹12,34,567.00`),
  negatives, zero.
- Parse: symbols and grouping per currency, expressions, invalid input.
- v10 migration on a database with data and on an empty one.
- Export/import roundtrip, an old backup without `settings`, and an
  unsupported code.
- Modal decision logic: when to show, which currency is preselected.
