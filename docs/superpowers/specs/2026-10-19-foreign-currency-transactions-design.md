# Foreign-Currency Transactions Design

**Date:** 2026-10-19
**Status:** Draft, awaiting review

## Overview

Step 2 of the currency work (step 1: [base currency](2026-10-19-base-currency-design.md)).
Let a single transaction be entered in a currency other than the budget's base
currency, for example an INR flight booking in a USD budget. The transaction
counts in the budget at a base-currency amount computed from a rate fixed at
entry time. The original amount, currency and rate are kept and shown.

Built on the same branch and PR as step 1.

## Goals

- Enter a transaction in any supported currency from the Log and Edit forms.
- The budget math is unchanged: every stored `amount` stays integer cents of the base currency.
- Works offline. A rate is typed by hand, prefilled from the last rate used for that currency, or fetched on explicit request.
- The original amount, currency and rate survive edit, export and import.
- Old data and old backups behave exactly as before.

## Non-goals

- Recurring transactions and investment lots in a foreign currency (later).
- Foreign income, allocations or goals.
- Rates for past dates (the fetch returns the latest rate).
- Extra CSV columns for the original amount.
- Converting history when the base currency changes (step 3).

## Data

`Transaction` gains an optional field:

```ts
foreign?: {
  amount: number;       // minor units of `currency` (INR 5,000.00 is 500000)
  currency: CurrencyCode;
  rate: number;         // units of `currency` per 1 unit of `base`
  base: CurrencyCode;   // the base currency at entry time
};
```

- `Transaction.amount` stays the base-currency cents and is the only value budget math reads. For a foreign transaction it is `convertToBase(foreign.amount, foreign.rate)`.
- `rate` is "1 USD = 84.25 INR" style (foreign per base), matching how rates are quoted. `convertToBase(foreignMinor, rate) = Math.round(foreignMinor / rate)`. Negative amounts (refunds) convert symmetrically.
- `foreign.base` records which base the rate was relative to. It makes a later base-currency relabel safe (see Display).
- A transaction whose chosen currency equals the base has no `foreign` field.

## Conversion helpers

`src/lib/currency/conversion.ts` (pure):

- `convertToBase(foreignMinor: number, rate: number): number`
- `parseRate(input: string): number | null`: a positive, finite number with at most 6 decimal places; strips grouping commas; rejects empty, zero, negative, `NaN`, junk.
- `rememberedRate(transactions, currency, base): number | null`: the `rate` of the most recent transaction (by `createdAt`, falling back to `date`) whose `foreign.currency` and `foreign.base` match; otherwise `null`.
- `shouldShowForeignNote(foreign, base): boolean`: true only when `foreign.base === base` and `foreign.currency !== base`.
- `normalizeForeign(raw, baseAmount?): Transaction['foreign'] | undefined`: validates an untrusted `foreign` value (supported `currency` and `base`, integer `amount`, positive finite `rate`); returns `undefined` when invalid.

## Rate fetching

`src/lib/currency/fetchRate.ts`:

- `fetchRate(base, quote, fetchImpl = fetch): Promise<number>` calls
  `GET https://api.frankfurter.dev/v2/rates?base=<base>&quotes=<quote>` and reads `[0].rate`.
- Verified on 2026-10-19: CORS is open (`access-control-allow-origin: *`), the response is `[{date, base, quote, rate}]` with `rate` = quote units per 1 base (the same direction the app stores), and all eight supported currencies including AED are available. The older `/v1/` endpoint is deprecated and lacks AED, so it is not used.
- Throws a typed error on a non-OK status, an empty array, or a non-positive or non-finite rate. A 422 means an unknown currency.
- Called only when the user presses "Fetch rate". The request carries no user data beyond the two currency codes. There is no background or automatic call.

## UI

New `src/lib/components/shared/ForeignCurrencyField.svelte`, used by `LogEntry` and `EditTransaction`:

- A currency chip beside the amount, defaulting to the base currency.
- When another currency is chosen, a row appears: `1 <BASE> = [rate] <CODE>`, a "Fetch rate" button, and a live preview `≈ <base amount>`.
- The rate is prefilled with `rememberedRate(...)`; empty when there is no history.
- Fetch states: idle, loading, error ("Couldn't fetch the rate, enter it manually").
- The component exposes the chosen currency, the rate input and the validity; the parent computes `convertToBase`.

`LogEntry` (amount-first flow):

- The typed amount is in the chosen currency. `amountCents` for the bucket "fits / after / over" figures is the converted base amount.
- A foreign entry with no valid rate cannot commit; the form says "enter a rate".
- On commit, `addTransaction` receives `amount` (base cents) and `foreign`.

`EditTransaction`:

- A foreign transaction opens with its original amount, currency and rate. The user can change any of them, or change back to the base currency (the `foreign` field is then removed).
- An ordinary transaction can be switched to a foreign currency.
- Saving a change to note, bucket or date alone never changes `amount`.
- `updateTransaction` must be able to clear `foreign` (an explicit `foreign: undefined` removes it from the stored record as well as the in-memory store).

## Display

`TransactionRow` shows the base amount as before. When `shouldShowForeignNote(...)` is true it also shows a small line `₹5,000.00 @ 84.25` (original amount formatted in its own currency) carrying the `.amt` privacy marker. After the user relabels the base currency, rows whose `foreign.base` no longer matches simply show their base number with no note.

## Export / import

- Export needs no change: `foreign` is part of the transaction record.
- `parseImport` runs `normalizeForeign` over each imported transaction. An invalid `foreign` value is dropped (the transaction keeps its base `amount`); a valid one is kept. Backups without the field import unchanged. `version` stays `1`.

## Testing

- `convertToBase`: rounding, large amounts, negative (refund) amounts, rate 1.
- `parseRate`: valid forms, grouping commas, zero, negative, empty, junk, more than 6 decimals.
- `rememberedRate`: most recent wins by `createdAt`, falls back to `date`, ignores other currency and other base, returns null with no history.
- `shouldShowForeignNote`: matching base, mismatched base (after relabel), same currency.
- `normalizeForeign`: valid value, unsupported currency, unsupported base, non-integer amount, non-positive and non-finite rate, wrong types, non-object.
- `fetchRate` with a stubbed `fetch`: success, non-OK status, 422, empty array, bad rate, network rejection; asserts the request URL.
- `parseImport`: keeps a valid `foreign`, drops an invalid one and keeps `amount`, and an old transaction without it is unchanged.
- Clearing `foreign` on edit is verified in the browser (Dexie's `update` with an `undefined` value removes the key; the in-memory store spread leaves it `undefined`, which every reader treats as absent).
- Browser verification: log a foreign transaction, see the converted fit figures and the row note, edit it, relabel the base, export and re-import.
