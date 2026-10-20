# Foreign-Currency Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one transaction be entered in another supported currency, converted to the base currency at a rate fixed at entry, with the original amount, currency and rate kept and shown.

**Architecture:** An optional `foreign` object on `Transaction` carries `{ amount, currency, rate, base }`; `Transaction.amount` stays base cents so all budget math is untouched. Pure helpers (`conversion.ts`, `fetchRate.ts`) hold the logic; one shared `ForeignCurrencyField.svelte` serves the Log and Edit forms; `TransactionRow` shows a note; import validates `foreign` and drops invalid values.

**Tech Stack:** SvelteKit 5 (Svelte 4 component syntax as used in this repo), TypeScript, Dexie, Vitest, `Intl.NumberFormat`.

**Spec:** `docs/superpowers/specs/2026-10-19-foreign-currency-transactions-design.md` (builds on `2026-10-19-base-currency-design.md`, already implemented on this branch).

## Global Constraints

- `Transaction.amount` stays integer cents of the base currency. Budget math never reads `foreign`.
- `foreign.amount` is minor units of `foreign.currency`; `foreign.rate` is units of that currency per 1 base unit ("1 USD = 84.25 INR"); `foreign.base` is the base currency at entry.
- `convertToBase(foreignMinor, rate) = round(foreignMinor / rate)`, rounding half away from zero so a refund converts to exactly the negative of the purchase.
- A rate is accepted only if positive, finite, at most 6 decimal places.
- Rates are fetched only when the user presses "Fetch rate", from `GET https://api.frankfurter.dev/v2/rates?base=<base>&quotes=<quote>` (verified 2026-10-19: CORS open, response `[{date, base, quote, rate}]`, includes AED). Never the deprecated `/v1/`.
- Supported currencies are the eight already in `src/lib/currency/currencies.ts`. Two-decimal only.
- Old data and old backups behave as before. Export `version` stays `1`.
- Every displayed amount keeps `.amt`. The row note carries `.amt`.
- No literal `$` for money in markup; use `currencySymbol()`, `formatCurrency` or `formatMoney`.
- Commit with `git commit --no-gpg-sign`. No Co-Authored-By or AI attribution lines (the user's rule overrides any reminder).
- Branch: `feat/base-currency` (same PR as the base currency work). Tests: `npx vitest run`. Types: `npm run check`.

## Rulings made while planning

- **Edit of a transaction whose `foreign.base` no longer matches the current base** (after a relabel) opens as an ordinary base-currency transaction; saving clears its stale `foreign`. Cost if wrong: the original-currency note of that one record is lost when edited.
- **An unchanged foreign edit keeps its stored base amount** (`baseAmountForSave`), so an imported record whose base amount differs slightly from `round(foreign / rate)` is never silently rewritten by saving a note change.
- **Step-1 bug found:** four expression previews rendered a literal `$` (`= $12.50`) for non-USD budgets. Task 1 fixes them and extends the scan test.

## Review Focus

Most likely first. Each is pinned by a test in the task named in brackets.

- A refund (negative foreign amount) converts to exactly the negative of the same purchase, including at half-cent boundaries. [Task 3]
- A rate of `0`, a negative, empty, junk, or more than 6 decimals is rejected, and a foreign entry with no valid rate cannot be committed. [Task 3, verified in Task 8]
- Saving an unchanged foreign transaction whose stored base amount disagrees with `round(foreign / rate)` keeps the stored base amount. [Task 3]
- After the base currency is relabeled, rows whose `foreign.base` no longer matches show no note. [Task 3]
- A backup transaction with an unsupported currency, non-integer amount, non-positive rate or `currency === base` keeps its base amount and loses only `foreign`. [Task 5]
- Offline or a failed fetch shows a message and manual entry still works. [Task 4, verified in Task 8]
- Switching an edited transaction back to the base currency clears `foreign` in the stored record, surviving a reload. [Task 8]

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/types.ts` (modify) | `ForeignAmount` type, `Transaction.foreign?` |
| `src/lib/currency/conversion.ts` (create) | `convertToBase`, `parseRate`, `rememberedRate`, `shouldShowForeignNote`, `normalizeForeign`, `baseAmountForSave` |
| `src/lib/currency/fetchRate.ts` (create) | `fetchRate`, `RateFetchError` |
| `src/lib/utils/currency.ts` (modify) | `formatMoney(cents, code)`, `symbolPadding(baseRem, symbol?)` |
| `src/lib/utils/export.ts` (modify) | Validate `foreign` on import |
| `src/lib/components/shared/ForeignCurrencyField.svelte` (create) | Currency chip, rate row, fetch button, base preview |
| `LogEntry.svelte`, `EditTransaction.svelte`, `TransactionRow.svelte` (modify) | Wire the field and the note |
| Expression previews in `LogEntry`, `EditTransaction`, `routes/+page.svelte`, `routes/recurring/+page.svelte` (modify) | Remove literal `$` |

---

### Task 1: Fix literal `$` in expression previews

**Files:**
- Modify: `src/lib/components/shared/LogEntry.svelte:129`
- Modify: `src/lib/components/shared/EditTransaction.svelte:72`
- Modify: `src/routes/+page.svelte:356`
- Modify: `src/routes/recurring/+page.svelte:175`
- Test: `tests/lib/currency/noHardcodedSymbols.test.ts`

**Interfaces:**
- Consumes: `formatCurrency`, `dollarsToCents` from `$lib/utils/currency` (already imported in some of these files; add what is missing).
- Produces: nothing new.

- [ ] **Step 1: Extend the scan test (RED)**

In `tests/lib/currency/noHardcodedSymbols.test.ts` change the offenders regex to also catch a literal `$` right before an interpolation in text (`>= ${…`):

```ts
      .filter(([, source]) => /<span[^>]*>\$<\/span>|placeholder="\$|>= \$\{/.test(source))
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/lib/currency/noHardcodedSymbols.test.ts`
Expected: FAIL, offenders list contains `LogEntry.svelte`, `EditTransaction.svelte`, `routes/+page.svelte` and `routes/recurring/+page.svelte`.

- [ ] **Step 3: Replace the four previews**

Each site renders a dollars number. Replace the text with the formatted base amount and mark it as an amount:

- `LogEntry.svelte:129`:
  `<p class="mt-1.5 text-sm text-muted dark:text-muted-dark">= <span class="amt">{formatCurrency(dollarsToCents(previewValue))}</span></p>`
- `EditTransaction.svelte:72`:
  `<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">= <span class="amt">{formatCurrency(dollarsToCents(previewValue))}</span></p>`
- `routes/+page.svelte:356`:
  `<p class="mt-1 text-sm text-muted">= <span class="amt">{formatCurrency(dollarsToCents(incomePreview))}</span></p>`
- `routes/recurring/+page.svelte:175`:
  `<p class="mt-1 text-sm text-muted">= <span class="amt">{formatCurrency(dollarsToCents(previewValue))}</span></p>`

Add `dollarsToCents` (and `formatCurrency` where absent) to each file's existing `import { ... } from '$lib/utils/currency';`. Do not change other lines.

- [ ] **Step 4: Run tests and type check**

Run: `npx vitest run && npm run check`
Expected: PASS and 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit --no-gpg-sign -m "fix(currency): show the active currency in expression previews"
```

---

### Task 2: `formatMoney` and symbol-aware padding

**Files:**
- Modify: `src/lib/utils/currency.ts`
- Test: `tests/lib/utils/currency.test.ts`

**Interfaces:**
- Consumes: `currencyInfo`, `CurrencyCode` (already imported in this file).
- Produces:
  - `formatMoney(cents: number, code: CurrencyCode): string`; `formatCurrency(cents)` becomes `formatMoney(cents, activeCurrency)` with identical output.
  - `symbolPadding(baseRem: number, symbol: string = currencySymbol()): string | undefined` (second parameter is new, default keeps existing callers unchanged).

- [ ] **Step 1: Write the failing tests**

Add `formatMoney` to the existing import list from `$lib/utils/currency` in `tests/lib/utils/currency.test.ts`, then append:

```ts
describe('formatMoney', () => {
  afterEach(() => setActiveCurrency('USD'));

  it('formats in a given currency whatever the active one is', () => {
    expect(formatMoney(500000, 'INR')).toBe('₹5,000.00');
    expect(formatMoney(1250, 'USD')).toBe('$12.50');
    setActiveCurrency('INR');
    expect(formatMoney(1250, 'USD')).toBe('$12.50');
  });

  it('keeps the minus sign first', () => {
    expect(formatMoney(-500, 'GBP')).toBe('-£5.00');
  });

  it('formatCurrency still follows the active currency', () => {
    setActiveCurrency('INR');
    expect(formatCurrency(500000)).toBe('₹5,000.00');
  });
});

describe('symbolPadding with an explicit symbol', () => {
  it('pads only for multi-character symbols', () => {
    expect(symbolPadding(1.75, '$')).toBeUndefined();
    expect(symbolPadding(1.75, 'AED')).toBe('3.35rem');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/utils/currency.test.ts`
Expected: FAIL (`formatMoney` is not exported; `symbolPadding(1.75, '$')` ignores the symbol).

- [ ] **Step 3: Implement**

In `src/lib/utils/currency.ts` replace `symbolPadding` and `formatCurrency`:

```ts
export function symbolPadding(baseRem: number, symbol: string = currencySymbol()): string | undefined {
  const extra = symbol.length - 1;
  return extra > 0 ? `${(baseRem + extra * 0.8).toFixed(2).replace(/\.?0+$/, '')}rem` : undefined;
}
```

```ts
export function formatMoney(cents: number, code: CurrencyCode): string {
  const info = currencyInfo(code);
  const formatted = centsToDollars(Math.abs(cents)).toLocaleString(info.locale, {
    style: 'currency',
    currency: info.code,
  });
  return cents < 0 ? `-${formatted}` : formatted;
}

export function formatCurrency(cents: number): string {
  return formatMoney(cents, activeCurrency);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run && npm run check`
Expected: PASS, 0 errors (all existing `formatCurrency` tests unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/currency.ts tests/lib/utils/currency.test.ts
git commit --no-gpg-sign -m "feat(currency): format money in an explicit currency"
```

---

### Task 3: Foreign type and conversion helpers

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/currency/conversion.ts`
- Test: `tests/lib/currency/conversion.test.ts`

**Interfaces:**
- Consumes: `CurrencyCode`, `isSupportedCurrency` from `$lib/currency/currencies`.
- Produces:
  - `interface ForeignAmount { amount: number; currency: CurrencyCode; rate: number; base: CurrencyCode }` and `Transaction.foreign?: ForeignAmount` (in `types.ts`)
  - `convertToBase(foreignMinor: number, rate: number): number`
  - `parseRate(input: string): number | null`
  - `rememberedRate(transactions: Pick<Transaction, 'foreign' | 'createdAt' | 'date'>[], currency: CurrencyCode, base: CurrencyCode): number | null`
  - `shouldShowForeignNote(foreign: ForeignAmount | undefined, base: CurrencyCode): boolean`
  - `normalizeForeign(raw: unknown): ForeignAmount | undefined`
  - `baseAmountForSave(original: { amount: number; foreign?: ForeignAmount }, typedMinor: number, foreign: ForeignAmount | undefined, computedBase: number): number`

- [ ] **Step 1: Write the failing tests**

`tests/lib/currency/conversion.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  convertToBase,
  parseRate,
  rememberedRate,
  shouldShowForeignNote,
  normalizeForeign,
  baseAmountForSave,
} from '$lib/currency/conversion';

const f = (over = {}) => ({ amount: 500000, currency: 'INR' as const, rate: 84.25, base: 'USD' as const, ...over });

describe('convertToBase', () => {
  it('converts foreign minor units to base cents', () => {
    expect(convertToBase(500000, 84.25)).toBe(5935);
    expect(convertToBase(1234, 1)).toBe(1234);
  });

  it('converts a refund to exactly the negative of the purchase', () => {
    expect(convertToBase(-500000, 84.25)).toBe(-5935);
  });

  it('rounds half away from zero in both directions', () => {
    expect(convertToBase(250, 100)).toBe(3);
    expect(convertToBase(-250, 100)).toBe(-3);
  });

  it('never returns negative zero', () => {
    expect(Object.is(convertToBase(-1, 100), 0)).toBe(true);
    expect(convertToBase(0, 84.25)).toBe(0);
  });
});

describe('parseRate', () => {
  it('accepts plain and grouped positive numbers', () => {
    expect(parseRate('84.25')).toBe(84.25);
    expect(parseRate(' 1,000.5 ')).toBe(1000.5);
    expect(parseRate('.5')).toBe(0.5);
    expect(parseRate('0.011234')).toBe(0.011234);
  });

  it('rejects empty, zero, negative and junk', () => {
    for (const bad of ['', '  ', '0', '0.0', '-5', 'abc', '84.2.5', '1e3', '₹84']) {
      expect(parseRate(bad), bad).toBeNull();
    }
  });

  it('rejects more than 6 decimal places', () => {
    expect(parseRate('0.1234567')).toBeNull();
  });
});

describe('rememberedRate', () => {
  const tx = (foreign: ReturnType<typeof f> | undefined, createdAt?: number, date = new Date(2026, 9, 1)) => ({ foreign, createdAt, date });

  it('returns the rate of the most recent matching transaction by createdAt', () => {
    const list = [tx(f({ rate: 80 }), 100), tx(f({ rate: 90 }), 300), tx(f({ rate: 85 }), 200)];
    expect(rememberedRate(list, 'INR', 'USD')).toBe(90);
  });

  it('falls back to the date when createdAt is missing', () => {
    const list = [tx(f({ rate: 80 }), undefined, new Date(2026, 8, 1)), tx(f({ rate: 90 }), undefined, new Date(2026, 9, 1))];
    expect(rememberedRate(list, 'INR', 'USD')).toBe(90);
  });

  it('accepts ISO date strings', () => {
    const list = [{ foreign: f({ rate: 88 }), createdAt: undefined, date: '2026-10-01T12:00:00.000Z' as unknown as Date }];
    expect(rememberedRate(list, 'INR', 'USD')).toBe(88);
  });

  it('ignores other currencies, other bases and non-foreign transactions', () => {
    const list = [tx(f({ currency: 'EUR', rate: 0.9 }), 100), tx(f({ base: 'GBP', rate: 100 }), 200), tx(undefined, 300)];
    expect(rememberedRate(list, 'INR', 'USD')).toBeNull();
  });

  it('returns null with no history', () => {
    expect(rememberedRate([], 'INR', 'USD')).toBeNull();
  });
});

describe('shouldShowForeignNote', () => {
  it('shows only when the stored base matches the current base and the currency differs', () => {
    expect(shouldShowForeignNote(f(), 'USD')).toBe(true);
  });

  it('hides after the base currency was relabeled', () => {
    expect(shouldShowForeignNote(f(), 'INR')).toBe(false);
    expect(shouldShowForeignNote(f(), 'EUR')).toBe(false);
  });

  it('hides without a foreign field or when currency equals base', () => {
    expect(shouldShowForeignNote(undefined, 'USD')).toBe(false);
    expect(shouldShowForeignNote(f({ currency: 'USD' }), 'USD')).toBe(false);
  });
});

describe('normalizeForeign', () => {
  it('keeps a valid value and returns a clean copy', () => {
    const out = normalizeForeign({ ...f(), extra: 'x' });
    expect(out).toEqual(f());
    expect(out).not.toHaveProperty('extra');
  });

  it('rejects unsupported currency or base', () => {
    expect(normalizeForeign(f({ currency: 'JPY' }))).toBeUndefined();
    expect(normalizeForeign(f({ base: 'XXX' }))).toBeUndefined();
  });

  it('rejects currency equal to base', () => {
    expect(normalizeForeign(f({ currency: 'USD' }))).toBeUndefined();
  });

  it('rejects a non-integer or non-number amount', () => {
    expect(normalizeForeign(f({ amount: 12.5 }))).toBeUndefined();
    expect(normalizeForeign(f({ amount: '500' }))).toBeUndefined();
    expect(normalizeForeign(f({ amount: Number.NaN }))).toBeUndefined();
  });

  it('rejects a non-positive, non-finite or non-number rate', () => {
    for (const rate of [0, -1, Infinity, Number.NaN, '84']) {
      expect(normalizeForeign(f({ rate })), String(rate)).toBeUndefined();
    }
  });

  it('rejects non-objects', () => {
    for (const raw of [undefined, null, 5, 'INR', []]) {
      expect(normalizeForeign(raw)).toBeUndefined();
    }
  });
});

describe('baseAmountForSave', () => {
  it('keeps the stored base amount when the foreign details are unchanged', () => {
    // stored 5900 differs from round(500000 / 84.25) = 5935 (an imported record)
    expect(baseAmountForSave({ amount: 5900, foreign: f() }, 500000, f(), 5935)).toBe(5900);
  });

  it('uses the computed amount when the foreign amount, rate or currency changed', () => {
    expect(baseAmountForSave({ amount: 5900, foreign: f() }, 600000, f({ amount: 600000 }), 7122)).toBe(7122);
    expect(baseAmountForSave({ amount: 5900, foreign: f() }, 500000, f({ rate: 90 }), 5556)).toBe(5556);
    expect(baseAmountForSave({ amount: 5900, foreign: f() }, 500000, f({ currency: 'EUR' }), 450000)).toBe(450000);
  });

  it('uses the computed amount for an ordinary transaction and when switching to or from foreign', () => {
    expect(baseAmountForSave({ amount: 1000 }, 1200, undefined, 1200)).toBe(1200);
    expect(baseAmountForSave({ amount: 1000 }, 500000, f(), 5935)).toBe(5935);
    expect(baseAmountForSave({ amount: 5900, foreign: f() }, 5900, undefined, 5900)).toBe(5900);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/currency/conversion.test.ts`
Expected: FAIL, module `$lib/currency/conversion` not found.

- [ ] **Step 3: Add the type**

In `src/lib/types.ts`, change the settings type import line to also import `CurrencyCode`:

```ts
import type { CurrencyCode } from '$lib/currency/currencies';
```

(add it next to the existing `CurrencySettings` import). Add before `export interface Transaction`:

```ts
// A transaction entered in a currency other than the budget's base. `amount`
// on the transaction stays base cents; this keeps what was actually paid.
export interface ForeignAmount {
  amount: number; // minor units of `currency`
  currency: CurrencyCode;
  rate: number; // units of `currency` per 1 unit of `base`
  base: CurrencyCode; // the base currency when it was entered
}
```

and add to `Transaction` after `createdAt`:

```ts
  foreign?: ForeignAmount;
```

- [ ] **Step 4: Implement the helpers**

`src/lib/currency/conversion.ts`:

```ts
import { isSupportedCurrency, type CurrencyCode } from './currencies';
import type { ForeignAmount, Transaction } from '$lib/types';

// Half away from zero, so a refund converts to exactly the negative of the
// purchase (Math.round alone rounds -2.5 to -2 and 2.5 to 3).
export function convertToBase(foreignMinor: number, rate: number): number {
  const value = foreignMinor / rate;
  const rounded = Math.sign(value) * Math.round(Math.abs(value));
  return rounded === 0 ? 0 : rounded;
}

const RATE_PATTERN = /^(?:\d+(?:\.\d{1,6})?|\.\d{1,6})$/;

export function parseRate(input: string): number | null {
  const cleaned = input.replace(/,/g, '').trim();
  if (!RATE_PATTERN.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function rememberedRate(
  transactions: Pick<Transaction, 'foreign' | 'createdAt' | 'date'>[],
  currency: CurrencyCode,
  base: CurrencyCode
): number | null {
  let best: { at: number; rate: number } | null = null;
  for (const t of transactions) {
    if (!t.foreign || t.foreign.currency !== currency || t.foreign.base !== base) continue;
    const at = t.createdAt ?? new Date(t.date).getTime();
    if (!best || at > best.at) best = { at, rate: t.foreign.rate };
  }
  return best ? best.rate : null;
}

// After the user relabels the base currency, an old foreign record's rate no
// longer relates to the new base, so its note would read nonsense.
export function shouldShowForeignNote(foreign: ForeignAmount | undefined, base: CurrencyCode): boolean {
  return !!foreign && foreign.base === base && foreign.currency !== base;
}

// Backups are untrusted: anything off becomes "no foreign details", and the
// transaction keeps its base amount.
export function normalizeForeign(raw: unknown): ForeignAmount | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const { amount, currency, rate, base } = raw as Record<string, unknown>;
  if (!isSupportedCurrency(currency) || !isSupportedCurrency(base) || currency === base) return undefined;
  if (typeof amount !== 'number' || !Number.isInteger(amount)) return undefined;
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return undefined;
  return { amount, currency, rate, base };
}

// Saving without touching the foreign details must not rewrite the stored
// base amount (an imported record may differ by a cent from round(foreign / rate)).
export function baseAmountForSave(
  original: { amount: number; foreign?: ForeignAmount },
  typedMinor: number,
  foreign: ForeignAmount | undefined,
  computedBase: number
): number {
  const o = original.foreign;
  if (o && foreign && o.currency === foreign.currency && o.rate === foreign.rate && o.amount === typedMinor) {
    return original.amount;
  }
  return computedBase;
}
```

- [ ] **Step 5: Run tests and type check**

Run: `npx vitest run && npm run check`
Expected: PASS and 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/currency/conversion.ts tests/lib/currency/conversion.test.ts
git commit --no-gpg-sign -m "feat(currency): foreign amount type and conversion helpers"
```

---

### Task 4: Fetch a rate on request

**Files:**
- Create: `src/lib/currency/fetchRate.ts`
- Test: `tests/lib/currency/fetchRate.test.ts`

**Interfaces:**
- Consumes: `CurrencyCode`.
- Produces: `fetchRate(base: CurrencyCode, quote: CurrencyCode, fetchImpl?: typeof fetch): Promise<number>`, `class RateFetchError extends Error`, `const RATES_URL: string`.

- [ ] **Step 1: Write the failing tests**

`tests/lib/currency/fetchRate.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { fetchRate, RateFetchError, RATES_URL } from '$lib/currency/fetchRate';

const respond = (body: unknown, init: { ok?: boolean; status?: number } = {}) =>
  vi.fn(async (_input: RequestInfo | URL) => ({ ok: init.ok ?? true, status: init.status ?? 200, json: async () => body }) as Response);

describe('fetchRate', () => {
  it('requests the v2 endpoint with base and quote and returns the rate', async () => {
    const fetchImpl = respond([{ date: '2026-10-19', base: 'USD', quote: 'INR', rate: 94.85 }]);
    await expect(fetchRate('USD', 'INR', fetchImpl)).resolves.toBe(94.85);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(`${RATES_URL}?base=USD&quotes=INR`);
    expect(RATES_URL).toBe('https://api.frankfurter.dev/v2/rates');
  });

  it('throws RateFetchError on a non-OK status, including 422 for an unknown currency', async () => {
    await expect(fetchRate('USD', 'INR', respond({ status: 422 }, { ok: false, status: 422 }))).rejects.toBeInstanceOf(RateFetchError);
    await expect(fetchRate('USD', 'INR', respond({}, { ok: false, status: 500 }))).rejects.toBeInstanceOf(RateFetchError);
  });

  it('throws on an empty array or a body that is not an array', async () => {
    await expect(fetchRate('USD', 'INR', respond([]))).rejects.toBeInstanceOf(RateFetchError);
    await expect(fetchRate('USD', 'INR', respond({ rate: 1 }))).rejects.toBeInstanceOf(RateFetchError);
  });

  it('throws on a bad, zero, negative or non-numeric rate', async () => {
    for (const rate of [0, -1, Infinity, '94.85', null]) {
      await expect(fetchRate('USD', 'INR', respond([{ base: 'USD', quote: 'INR', rate }])), String(rate)).rejects.toBeInstanceOf(RateFetchError);
    }
  });

  it('throws when the answer is for a different pair than asked', async () => {
    await expect(fetchRate('USD', 'INR', respond([{ base: 'USD', quote: 'EUR', rate: 0.9 }]))).rejects.toBeInstanceOf(RateFetchError);
  });

  it('throws RateFetchError when the network fails', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL): Promise<Response> => {
      throw new TypeError('Failed to fetch');
    });
    await expect(fetchRate('USD', 'INR', fetchImpl)).rejects.toBeInstanceOf(RateFetchError);
  });

  it('throws when the body is not JSON', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } }) as unknown as Response);
    await expect(fetchRate('USD', 'INR', fetchImpl)).rejects.toBeInstanceOf(RateFetchError);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/currency/fetchRate.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/lib/currency/fetchRate.ts`:

```ts
import type { CurrencyCode } from './currencies';

// Frankfurter v2 (ECB and other central-bank rates). v1 is deprecated and has
// no AED. Verified 2026-10-19: CORS is open and the answer is
// [{ date, base, quote, rate }] with rate = quote units per 1 base.
export const RATES_URL = 'https://api.frankfurter.dev/v2/rates';

export class RateFetchError extends Error {}

// Called only when the user presses "Fetch rate". The request carries nothing
// but the two currency codes.
export async function fetchRate(
  base: CurrencyCode,
  quote: CurrencyCode,
  fetchImpl: typeof fetch = fetch
): Promise<number> {
  let response: Response;
  try {
    response = await fetchImpl(`${RATES_URL}?base=${base}&quotes=${quote}`);
  } catch {
    throw new RateFetchError('Network request failed');
  }
  if (!response.ok) throw new RateFetchError(`Rates service answered ${response.status}`);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new RateFetchError('Rates service sent an unreadable answer');
  }

  const first = Array.isArray(body) ? (body[0] as Record<string, unknown> | undefined) : undefined;
  const rate = first?.rate;
  if (first?.base !== base || first?.quote !== quote || typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    throw new RateFetchError('Rates service sent an unexpected answer');
  }
  return rate;
}
```

- [ ] **Step 4: Run tests and type check**

Run: `npx vitest run && npm run check`
Expected: PASS and 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/currency/fetchRate.ts tests/lib/currency/fetchRate.test.ts
git commit --no-gpg-sign -m "feat(currency): fetch a rate on request"
```

---

### Task 5: Validate `foreign` on import

**Files:**
- Modify: `src/lib/utils/export.ts` (`parseImport`)
- Test: `tests/lib/utils/import.test.ts`

**Interfaces:**
- Consumes: `normalizeForeign` (Task 3).
- Produces: imported transactions carry a validated `foreign` or none.

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/utils/import.test.ts` (reuse its `validPayload()` helper; its one transaction is `t1`):

```ts
describe('parseImport foreign amounts', () => {
  const withForeign = (foreign: unknown) => {
    const payload = validPayload();
    (payload.data.transactions[0] as Record<string, unknown>).foreign = foreign;
    return JSON.stringify(payload);
  };
  const good = { amount: 500000, currency: 'INR', rate: 84.25, base: 'USD' };

  it('keeps a valid foreign amount', () => {
    const tx = parseImport(withForeign(good)).data.transactions[0];
    expect(tx.foreign).toEqual(good);
    expect(tx.amount).toBe(500);
  });

  it('drops an invalid foreign amount but keeps the transaction and its base amount', () => {
    for (const bad of [{ ...good, currency: 'JPY' }, { ...good, amount: 12.5 }, { ...good, rate: 0 }, { ...good, currency: 'USD' }, 'INR', 5, null]) {
      const tx = parseImport(withForeign(bad)).data.transactions[0];
      expect(tx.foreign, JSON.stringify(bad)).toBeUndefined();
      expect('foreign' in tx).toBe(false);
      expect(tx.amount).toBe(500);
    }
  });

  it('leaves a transaction without the field untouched', () => {
    const tx = parseImport(JSON.stringify(validPayload())).data.transactions[0];
    expect('foreign' in tx).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/utils/import.test.ts`
Expected: FAIL (the "drops an invalid" test: `tx.foreign` is still set to the bad value).

- [ ] **Step 3: Implement**

In `src/lib/utils/export.ts` add `import { normalizeForeign } from '$lib/currency/conversion';` with the other imports. In `parseImport`, just before the `data.settings = normalizeCurrencySettings(...)` block, add:

```ts
  // A foreign amount that is not a clean {amount, currency, rate, base} would
  // break the row note and edit form, so it is dropped; the transaction keeps
  // its base-currency amount.
  data.transactions = (data.transactions as Record<string, unknown>[]).map((t) => {
    if (!('foreign' in t)) return t;
    const { foreign, ...rest } = t;
    const clean = normalizeForeign(foreign);
    return clean ? { ...rest, foreign: clean } : rest;
  });
```

- [ ] **Step 4: Run tests and type check**

Run: `npx vitest run && npm run check`
Expected: PASS and 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/export.ts tests/lib/utils/import.test.ts
git commit --no-gpg-sign -m "feat(currency): validate foreign amounts on import"
```

---

### Task 6: The currency field and the Log form

**Files:**
- Create: `src/lib/components/shared/ForeignCurrencyField.svelte`
- Modify: `src/lib/components/shared/LogEntry.svelte`

**Interfaces:**
- Consumes: `CURRENCIES`, `currencyInfo`, `CurrencyCode`; `baseCurrency` store; `transactions` store from `budgetStore`; `rememberedRate`, `parseRate`, `convertToBase` (Task 3); `fetchRate` (Task 4); `formatCurrency`, `formatMoney`, `symbolPadding(baseRem, symbol)` (Task 2).
- Produces: `<ForeignCurrencyField bind:currency bind:rate foreignMinor bind:baseCents bind:rateValid id />`. After this task a foreign transaction can be logged and is stored with `foreign`.

Svelte templates have no unit tests; verification is `svelte-check`, the full suite and the browser pass in Task 8.

- [ ] **Step 1: Create the field**

`src/lib/components/shared/ForeignCurrencyField.svelte`:

```svelte
<script lang="ts">
  import { CURRENCIES, type CurrencyCode } from '$lib/currency/currencies';
  import { baseCurrency } from '$lib/stores/currencyStore';
  import { transactions } from '$lib/stores/budgetStore';
  import { rememberedRate, parseRate, convertToBase } from '$lib/currency/conversion';
  import { fetchRate } from '$lib/currency/fetchRate';
  import { formatCurrency } from '$lib/utils/currency';

  // Bound by the parent form: the chosen currency and the rate as typed.
  export let currency: CurrencyCode;
  export let rate = '';
  // The typed amount in minor units of `currency` (the parent parses it).
  export let foreignMinor = 0;
  // Outputs the parent reads: the amount in the base currency, and whether the
  // entry can be saved (a foreign currency needs a valid rate).
  export let baseCents = 0;
  export let rateValid = true;
  export let id = 'currency';

  let lastCurrency = currency;
  let fetching = false;
  let fetchError = '';

  $: isForeign = currency !== $baseCurrency;
  $: parsedRate = isForeign ? parseRate(rate) : null;
  $: baseCents = !isForeign ? foreignMinor : parsedRate !== null ? convertToBase(foreignMinor, parsedRate) : 0;
  $: rateValid = !isForeign || parsedRate !== null;

  // Choosing a currency prefills the last rate used for it, or clears the field.
  $: if (currency !== lastCurrency) {
    lastCurrency = currency;
    fetchError = '';
    rate = currency === $baseCurrency ? '' : String(rememberedRate($transactions, currency, $baseCurrency) ?? '');
  }

  async function fetchLatest() {
    fetching = true;
    fetchError = '';
    try {
      rate = String(await fetchRate($baseCurrency, currency));
    } catch {
      fetchError = "Couldn't fetch the rate. Enter it manually.";
    } finally {
      fetching = false;
    }
  }
</script>

<div class="mt-2 space-y-2">
  <div class="flex items-center gap-2 text-sm text-muted dark:text-muted-dark">
    <label for="{id}-select">Paid in</label>
    <select id="{id}-select" bind:value={currency} class="select-base !w-auto !py-1 text-sm">
      {#each CURRENCIES as c}
        <option value={c.code}>{c.code}</option>
      {/each}
    </select>
  </div>

  {#if isForeign}
    <div class="rounded-lg border border-border p-3 text-sm dark:border-border-dark">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-gray-700 dark:text-gray-300">1 {$baseCurrency} =</span>
        <input
          id="{id}-rate"
          type="text"
          inputmode="decimal"
          aria-label="Exchange rate"
          bind:value={rate}
          placeholder="0.00"
          class="input-base !w-28 !py-1 text-sm"
        />
        <span class="text-gray-700 dark:text-gray-300">{currency}</span>
        <button type="button" class="btn-secondary !px-3 !py-1 text-sm" disabled={fetching} on:click={fetchLatest}>
          {fetching ? 'Fetching…' : 'Fetch rate'}
        </button>
      </div>
      {#if fetchError}
        <p class="mt-2 text-danger dark:text-danger-light">{fetchError}</p>
      {:else if !rateValid}
        <p class="mt-2 text-muted dark:text-muted-dark">Enter a rate to convert.</p>
      {:else if foreignMinor !== 0}
        <p class="mt-2 text-muted dark:text-muted-dark">≈ <span class="amt">{formatCurrency(baseCents)}</span></p>
      {/if}
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Wire the Log form: script**

In `src/lib/components/shared/LogEntry.svelte`:

Imports: extend the currency utils import with `formatMoney, dollarsToCents` if not present; add

```ts
  import ForeignCurrencyField from './ForeignCurrencyField.svelte';
  import { baseCurrency } from '$lib/stores/currencyStore';
  import { currencyInfo, type CurrencyCode } from '$lib/currency/currencies';
  import { parseRate } from '$lib/currency/conversion';
```

State, after `let amountInput ...`:

```ts
  let foreignCurrency: CurrencyCode = $baseCurrency;
  let rate = '';
  let baseCents = 0;
  let rateValid = true;
```

Replace the existing `$: amountCents = isValidCurrency(amount) ? parseCurrency(amount) : 0;` with:

```ts
  // What was typed, in minor units of the chosen currency, and what it is
  // worth in the base currency (the bucket fit figures use the latter).
  $: typedMinor = isValidCurrency(amount) ? parseCurrency(amount) : 0;
  $: amountCents = baseCents;
```

In `commit`, after the `isValidCurrency` guard and before `isSubmitting = true;`, add `if (!rateValid) return;`, and replace the `addTransaction({...})` call with:

```ts
      const foreign =
        foreignCurrency === $baseCurrency
          ? undefined
          : { amount: typedMinor, currency: foreignCurrency, rate: parseRate(rate)!, base: $baseCurrency };
      await addTransaction({
        amount: baseCents,
        ...(foreign ? { foreign } : {}),
        bucketId,
        date: defaultEntryDate($currentMonthKey),
        note: note || undefined,
      });
```

(delete the old `amount: parseCurrency(amount),` line.)

- [ ] **Step 3: Wire the Log form: markup**

Change the amount prefix span to the chosen currency's symbol and padding:

```svelte
      <span class="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-muted dark:text-muted-dark">{currencyInfo(foreignCurrency).symbol}</span>
```

and on the amount input replace `style:padding-left={symbolPadding(2.25)}` with `style:padding-left={symbolPadding(2.25, currencyInfo(foreignCurrency).symbol)}`.

Replace the expression preview line (from Task 1) with the chosen currency:

```svelte
      <p class="mt-1.5 text-sm text-muted dark:text-muted-dark">= <span class="amt">{formatMoney(dollarsToCents(previewValue), foreignCurrency)}</span></p>
```

Directly after the closing `{/if}` of the error/preview/hint block, still inside the amount `<div>`, add:

```svelte
    <ForeignCurrencyField
      id="log"
      bind:currency={foreignCurrency}
      bind:rate
      foreignMinor={typedMinor}
      bind:baseCents
      bind:rateValid
    />
```

On each bucket button change `disabled={isSubmitting}` to `disabled={isSubmitting || !rateValid}`.

- [ ] **Step 4: Type check and tests**

Run: `npm run check && npx vitest run`
Expected: 0 errors, all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src
git commit --no-gpg-sign -m "feat(currency): log a transaction in another currency"
```

---

### Task 7: Edit form and the row note

**Files:**
- Modify: `src/lib/components/shared/EditTransaction.svelte`
- Modify: `src/lib/components/shared/TransactionRow.svelte`

**Interfaces:**
- Consumes: `ForeignCurrencyField` (Task 6); `baseAmountForSave`, `parseRate`, `shouldShowForeignNote` (Task 3); `formatMoney` (Task 2); `updateTransaction` (accepts `foreign: undefined`, which removes the key in Dexie).
- Produces: foreign transactions can be edited, converted back to base, and shown with a note.

- [ ] **Step 1: Edit form: script**

In `EditTransaction.svelte` add imports:

```ts
  import ForeignCurrencyField from './ForeignCurrencyField.svelte';
  import { baseCurrency } from '$lib/stores/currencyStore';
  import { currencyInfo, type CurrencyCode } from '$lib/currency/currencies';
  import { parseRate, baseAmountForSave } from '$lib/currency/conversion';
```

and extend the currency utils import with `formatMoney, dollarsToCents`. Replace the `let amount = ...` line and add state:

```ts
  // A record entered under another base currency no longer relates to this
  // one (the user relabeled), so it opens as an ordinary transaction and
  // saving clears its stale foreign details.
  const foreignShown = transaction.foreign && transaction.foreign.base === $baseCurrency ? transaction.foreign : undefined;

  let currency: CurrencyCode = foreignShown?.currency ?? $baseCurrency;
  let rate = foreignShown ? String(foreignShown.rate) : '';
  let baseCents = transaction.amount;
  let rateValid = true;
  let amount = centsToDollars(foreignShown?.amount ?? transaction.amount).toString();
```

Add after `showPreview`/`previewValue`:

```ts
  $: typedMinor = isValidCurrency(amount) ? parseCurrency(amount) : 0;
```

Change `canSubmit` to also require `rateValid`:

```ts
  $: canSubmit = !!amount && !!bucketId && !!date && !amountError && isValidCurrency(amount) && rateValid;
```

Replace the `updateTransaction(...)` call in `handleSubmit`:

```ts
      const foreign =
        currency === $baseCurrency
          ? undefined
          : { amount: typedMinor, currency, rate: parseRate(rate)!, base: $baseCurrency };
      await updateTransaction(transaction.id, {
        amount: baseAmountForSave({ amount: transaction.amount, foreign: foreignShown }, typedMinor, foreign, baseCents),
        foreign, // undefined removes it from the stored record
        bucketId,
        date: parseLocalDate(date),
        note: note || undefined,
      });
```

- [ ] **Step 2: Edit form: markup**

Prefix span: `{currencyInfo(currency).symbol}`; input: `style:padding-left={symbolPadding(1.75, currencyInfo(currency).symbol)}`. Preview line:

```svelte
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">= <span class="amt">{formatMoney(dollarsToCents(previewValue), currency)}</span></p>
```

After the amount block's closing `{/if}` (still inside that `<div>`), add:

```svelte
    <ForeignCurrencyField
      id="edit"
      bind:currency
      bind:rate
      foreignMinor={typedMinor}
      bind:baseCents
      bind:rateValid
    />
```

- [ ] **Step 3: Row note**

In `TransactionRow.svelte` add imports:

```ts
  import { formatCurrency, formatMoney } from '$lib/utils/currency';
  import { baseCurrency } from '$lib/stores/currencyStore';
  import { shouldShowForeignNote } from '$lib/currency/conversion';
```

(replace the existing `formatCurrency`-only import). Under the amount `<p class="amt ...">` add:

```svelte
      {#if transaction.foreign && shouldShowForeignNote(transaction.foreign, $baseCurrency)}
        <p class="amt text-xs tabular-nums text-muted dark:text-gray-400">
          {formatMoney(transaction.foreign.amount, transaction.foreign.currency)} @ {transaction.foreign.rate}
        </p>
      {/if}
```

- [ ] **Step 4: Type check and tests**

Run: `npm run check && npx vitest run`
Expected: 0 errors, all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src
git commit --no-gpg-sign -m "feat(currency): edit foreign transactions and show the original amount"
```

---

### Task 8: Verify in the browser

**Files:** none unless a bug is found (then fix, with a test where the code is pure, and commit separately). Playwright files live under `.playwright-mcp/` in the repo and are deleted afterwards.

- [ ] **Step 1: Full checks**

Run: `npx vitest run && npm run check && npm run build`
Expected: all PASS, 0 errors, build succeeds.

- [ ] **Step 2: Scenarios** (`npm run dev -- --port 5199`, a fresh `USD` browser context, confirm USD in the modal first, add an income and give a bucket money so "fits" shows)

1. **Log in INR with a typed rate:** choose INR in "Paid in", type `5000`, type rate `84.25`. The preview reads `≈ $59.35`, the bucket rows show fit figures based on that. Commit to a bucket. The Activity row shows `$59.35` with `₹5,000.00 @ 84.25` beneath.
2. **No rate, no commit:** choose EUR with no history. Bucket buttons are disabled and the field says "Enter a rate to convert."; typing `0`, `-1` or `abc` keeps them disabled.
3. **Remembered rate:** log another INR entry. The rate is prefilled with `84.25`.
4. **Fetch rate:** press "Fetch rate". The field fills with a plausible INR rate (around 90 to 100); also try AED. Then block the network (`page.context().setOffline(true)`) and press again: the message "Couldn't fetch the rate. Enter it manually." appears and typing a rate still works.
5. **Refund:** log `-5000` INR at `84.25`. The row shows `-$59.35` and `-₹5,000.00 @ 84.25`.
6. **Edit:** open the INR entry. The form shows `5000`, INR, `84.25`. Change only the note, save: the base amount is unchanged. Change the rate to `90`, save: the base amount becomes `$55.56`.
7. **Back to base:** edit the entry, choose USD, save; the note disappears. Reload the page: it is still gone (the stored record lost `foreign`).
8. **Relabel:** with a foreign entry present, switch the base currency to INR through the chip. The foreign rows show their base numbers with no note and nothing broken. Edit one: it opens as an ordinary transaction.
9. **Backup:** export JSON, confirm the foreign transaction carries `foreign`. Import it into a fresh context: the note is back. Import a hand-edited copy with `"currency": "JPY"` in one `foreign`: that transaction imports with its base amount and no note.
10. **Hide amounts:** toggle privacy. The base amount, the row note and the `≈` preview blur.
11. **Mobile:** at 390px width the "Paid in" row and the rate row wrap without horizontal scroll.

- [ ] **Step 3: Clean up**

Delete anything created under `.playwright-mcp/`, stop the dev server, and fix anything that failed before finishing.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A src tests
git commit --no-gpg-sign -m "fix(currency): <what was found>"
```

Skip this step if nothing needed fixing.
