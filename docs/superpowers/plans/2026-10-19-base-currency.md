# Base Currency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the budget one base currency, auto-detected on first run, confirmable and changeable (relabel only), used by all formatting, parsing, inputs and backups.

**Architecture:** A pure `src/lib/currency/` module (supported-currency table, detection, settings normalization) feeds a `currencyStore` that persists to a new Dexie `settings` table and tells `utils/currency.ts` which currency is active. `formatCurrency` keeps its signature and reads the active currency from module state; the root layout wraps the app in `{#key $baseCurrency}` so a change rebuilds the tree. Export/import carry an optional `settings` object.

**Tech Stack:** SvelteKit 5, TypeScript, Dexie/IndexedDB, Vitest, `Intl.NumberFormat`.

**Spec:** `docs/superpowers/specs/2026-10-19-base-currency-design.md`

## Global Constraints

- Money stays integer minor units (cents/paise) of the base currency. No stored amount changes in this feature.
- Supported currencies are exactly: USD, INR, EUR, GBP, CAD, AUD, SGD, AED (all two-decimal). No JPY/KWD.
- Changing the base only **relabels**: "This changes the symbol only. Your amounts stay the same numbers."
- Dexie schema gets **v10** with a `settings: 'key'` table. Rows: `baseCurrency` (supported code) and `currencyConfirmed` (boolean).
- Existing databases that hold data migrate to `baseCurrency = 'USD'`, `currencyConfirmed = false`. Fresh databases get no rows and use detection.
- Detection is client-side only: time zone first, then language region, then USD. No network calls.
- Export `version` stays `1`. The new `settings` section is optional. Missing or unsupported currency imports as `USD` with `currencyConfirmed = false`.
- `formatCurrency(cents)` keeps its signature and its minus-sign-first output (`-$5.00`, `-₹5.00`).
- Every displayed amount keeps its `.amt` privacy marker. This feature adds no new amount elements.
- Commit with `git commit --no-gpg-sign`. No Co-Authored-By or AI attribution lines in commit messages (the user's rule overrides any reminder).
- Branch: `feat/base-currency`. Tests: `npx vitest run`. Types: `npm run check`.

## Deviations from the spec (found while reading the code)

- **EUR display locale is `en-IE`, not `de-DE`.** `parseCurrency` treats `.` as decimal and `,` as grouping. A `de-DE` display (`1.234,56 €`) would teach users to type `12,50`, which parses as 1250. Every supported currency must format with `.` decimals and `,` grouping.
- **The currency control goes in the desktop sidebar footer and in the existing Settings page.** The privacy toggle lives in the month picker header, not the sidebar, and mobile has no sidebar. Both controls open the same modal.
- **There are 12 literal `$` input prefixes, not 3** (listed in Task 5), plus the `DonutChart` tooltip.
- **The repo has no `fake-indexeddb`.** Tests cover the pure helpers (settings rows, migration decision, normalization). The Dexie wiring is verified in the browser in Task 7.

## Review Focus

Most likely first. Each line is pinned by a test in the task named in brackets.

- Negative INR amounts keep the minus first: `-₹5.00`. [Task 2]
- Large INR amounts use lakh grouping: `₹1,00,00,000.00`. [Task 2]
- Every supported currency formats with `.` decimals and `,` grouping, so typed `12.50` round-trips. [Task 1]
- A user with a USD habit typing `$` into an INR budget (or `₹1,200 + 300`) still parses. [Task 2]
- A backup with `baseCurrency: 'XXX'`, a number, or no settings imports as USD unconfirmed. [Task 3, Task 4]
- Closing the confirm modal with Escape must not reopen it in a loop within a session. [Task 6, verified in Task 7]

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/currency/currencies.ts` (create) | Supported currency table, `isSupportedCurrency`, `currencyInfo`, `DEFAULT_CURRENCY` |
| `src/lib/currency/detect.ts` (create) | Pure `detectCurrency(timeZone, language)` |
| `src/lib/currency/settings.ts` (create) | Pure settings logic: normalize, rows round trip, migration decision |
| `src/lib/stores/currencyStore.ts` (create) | `baseCurrency`, `currencyConfirmed` stores; `loadCurrency`, `confirmCurrency` |
| `src/lib/utils/currency.ts` (modify) | Active-currency state, `formatCurrency`, symbol-stripping parse, `currencySymbol`, `symbolPadding` |
| `src/lib/db/index.ts` (modify) | `settings` table, v10 |
| `src/lib/types.ts` (modify) | `ExportData.data.settings` |
| `src/lib/utils/export.ts` (modify) | Export/import/reset settings |
| `src/lib/components/shared/CurrencyModal.svelte` (create) | Confirm/change modal |
| `src/lib/components/shared/CurrencyChip.svelte` (create) | Button showing `$ USD`, opens the modal |
| `src/routes/+layout.svelte`, `src/lib/components/layout/Layout.svelte`, `Nav.svelte`, `src/routes/settings/+page.svelte` (modify) | Wiring |

---

### Task 1: Supported currencies and detection

**Files:**
- Create: `src/lib/currency/currencies.ts`
- Create: `src/lib/currency/detect.ts`
- Test: `tests/lib/currency/currencies.test.ts`
- Test: `tests/lib/currency/detect.test.ts`

**Interfaces:**
- Produces:
  - `type CurrencyCode = 'USD' | 'INR' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'SGD' | 'AED'`
  - `interface CurrencyInfo { code: CurrencyCode; name: string; symbol: string; locale: string }`
  - `const CURRENCIES: readonly CurrencyInfo[]`, `const DEFAULT_CURRENCY: CurrencyCode`
  - `isSupportedCurrency(code: unknown): code is CurrencyCode`
  - `currencyInfo(code: CurrencyCode): CurrencyInfo`
  - `detectCurrency(timeZone: string | undefined, language: string | undefined): CurrencyCode`

- [ ] **Step 1: Write the failing tests**

`tests/lib/currency/currencies.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CURRENCIES, DEFAULT_CURRENCY, isSupportedCurrency, currencyInfo } from '$lib/currency/currencies';

describe('currencies', () => {
  it('supports exactly the eight two-decimal currencies', () => {
    expect(CURRENCIES.map((c) => c.code)).toEqual(['USD', 'INR', 'EUR', 'GBP', 'CAD', 'AUD', 'SGD', 'AED']);
    expect(DEFAULT_CURRENCY).toBe('USD');
  });

  it('guards unknown input', () => {
    expect(isSupportedCurrency('INR')).toBe(true);
    expect(isSupportedCurrency('JPY')).toBe(false);
    expect(isSupportedCurrency('inr')).toBe(false);
    expect(isSupportedCurrency(42)).toBe(false);
    expect(isSupportedCurrency(undefined)).toBe(false);
  });

  it('looks up info by code', () => {
    expect(currencyInfo('INR')).toMatchObject({ symbol: '₹', locale: 'en-IN' });
  });

  // parseCurrency reads "." as decimal and "," as grouping, so what we
  // display must use the same convention or a user types 12,50 and gets 1250.
  it.each(CURRENCIES.map((c) => [c.code, c.locale] as const))(
    '%s displays with "." decimals and "," grouping',
    (code, locale) => {
      const out = new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(1234567.89);
      expect(out.replace(/\s/g, ' ')).toMatch(/[\d,]+\.89$/);
    }
  );
});
```

`tests/lib/currency/detect.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { detectCurrency } from '$lib/currency/detect';

describe('detectCurrency', () => {
  it.each([
    ['Asia/Kolkata', 'INR'],
    ['Asia/Calcutta', 'INR'],
    ['America/New_York', 'USD'],
    ['America/Los_Angeles', 'USD'],
    ['US/Pacific', 'USD'],
    ['Pacific/Honolulu', 'USD'],
    ['America/Toronto', 'CAD'],
    ['America/Vancouver', 'CAD'],
    ['Europe/London', 'GBP'],
    ['Europe/Berlin', 'EUR'],
    ['Europe/Dublin', 'EUR'],
    ['Australia/Sydney', 'AUD'],
    ['Asia/Singapore', 'SGD'],
    ['Asia/Dubai', 'AED'],
  ])('time zone %s gives %s', (tz, expected) => {
    expect(detectCurrency(tz, 'en-US')).toBe(expected);
  });

  it('time zone wins over the browser language', () => {
    expect(detectCurrency('Asia/Kolkata', 'en-US')).toBe('INR');
    expect(detectCurrency('America/Chicago', 'en-IN')).toBe('USD');
  });

  it('falls back to the language region when the time zone is not mapped', () => {
    expect(detectCurrency('UTC', 'en-IN')).toBe('INR');
    expect(detectCurrency('Etc/GMT', 'en-GB')).toBe('GBP');
    expect(detectCurrency(undefined, 'de-DE')).toBe('EUR');
  });

  it('falls back to USD when nothing maps', () => {
    expect(detectCurrency('UTC', 'en')).toBe('USD');
    expect(detectCurrency(undefined, undefined)).toBe('USD');
    expect(detectCurrency('Asia/Tokyo', 'ja-JP')).toBe('USD');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/currency`
Expected: FAIL, modules `$lib/currency/currencies` and `$lib/currency/detect` not found.

- [ ] **Step 3: Implement**

`src/lib/currency/currencies.ts`:

```ts
export type CurrencyCode = 'USD' | 'INR' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'SGD' | 'AED';

export interface CurrencyInfo {
  code: CurrencyCode;
  name: string;
  symbol: string;
  // Display locale. It must use "." for decimals and "," for grouping,
  // because parseCurrency reads typed input that way (EUR is en-IE for this reason).
  locale: string;
}

// Two-decimal currencies only: money is stored as amount x 100.
export const CURRENCIES: readonly CurrencyInfo[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', locale: 'en-US' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', locale: 'en-IN' },
  { code: 'EUR', name: 'Euro', symbol: '€', locale: 'en-IE' },
  { code: 'GBP', name: 'British Pound', symbol: '£', locale: 'en-GB' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: '$', locale: 'en-CA' },
  { code: 'AUD', name: 'Australian Dollar', symbol: '$', locale: 'en-AU' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: '$', locale: 'en-SG' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED', locale: 'en-AE' },
];

export const DEFAULT_CURRENCY: CurrencyCode = 'USD';

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code as string, c]));

export function isSupportedCurrency(code: unknown): code is CurrencyCode {
  return typeof code === 'string' && BY_CODE.has(code);
}

export function currencyInfo(code: CurrencyCode): CurrencyInfo {
  return BY_CODE.get(code)!;
}
```

`src/lib/currency/detect.ts`:

```ts
import { DEFAULT_CURRENCY, type CurrencyCode } from './currencies';

const CANADA_ZONES = new Set([
  'America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg',
  'America/Halifax', 'America/St_Johns', 'America/Regina', 'America/Montreal',
]);

const EURO_ZONES = new Set([
  'Europe/Berlin', 'Europe/Paris', 'Europe/Madrid', 'Europe/Rome', 'Europe/Amsterdam',
  'Europe/Brussels', 'Europe/Vienna', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/Helsinki',
  'Europe/Athens', 'Europe/Luxembourg',
]);

function fromTimeZone(tz: string | undefined): CurrencyCode | null {
  if (!tz) return null;
  if (tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta') return 'INR';
  if (tz === 'Asia/Singapore') return 'SGD';
  if (tz === 'Asia/Dubai') return 'AED';
  if (tz === 'Europe/London' || tz === 'Europe/Belfast') return 'GBP';
  if (EURO_ZONES.has(tz)) return 'EUR';
  if (tz.startsWith('Australia/')) return 'AUD';
  if (CANADA_ZONES.has(tz)) return 'CAD';
  if (tz.startsWith('America/') || tz.startsWith('US/') || tz === 'Pacific/Honolulu') return 'USD';
  return null;
}

const REGION_CURRENCY: Record<string, CurrencyCode> = {
  US: 'USD', IN: 'INR', GB: 'GBP', CA: 'CAD', AU: 'AUD', SG: 'SGD', AE: 'AED',
  DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR',
  IE: 'EUR', PT: 'EUR', FI: 'EUR', GR: 'EUR', LU: 'EUR',
};

function fromLanguage(language: string | undefined): CurrencyCode | null {
  const region = language?.split('-')[1]?.toUpperCase();
  return (region && REGION_CURRENCY[region]) || null;
}

// Where the app is being used, guessed on the device with no network call:
// the time zone is the best signal (it follows the device), the language
// region is weaker (en-US is common everywhere). Only a suggestion; the
// user confirms it.
export function detectCurrency(timeZone: string | undefined, language: string | undefined): CurrencyCode {
  return fromTimeZone(timeZone) ?? fromLanguage(language) ?? DEFAULT_CURRENCY;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/lib/currency`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lib/currency tests/lib/currency
git commit --no-gpg-sign -m "feat(currency): supported currencies and device-based detection"
```

---

### Task 2: Format and parse by active currency

**Files:**
- Modify: `src/lib/utils/currency.ts`
- Test: `tests/lib/utils/currency.test.ts`

**Interfaces:**
- Consumes: `CurrencyCode`, `currencyInfo`, `CURRENCIES`, `DEFAULT_CURRENCY` from `$lib/currency/currencies` (Task 1).
- Produces:
  - `setActiveCurrency(code: CurrencyCode): void`, `getActiveCurrency(): CurrencyCode`
  - `currencySymbol(): string`
  - `symbolPadding(baseRem: number): string | undefined` (extra left padding for multi-character symbols)
  - `formatCurrency(cents)` now uses the active currency; `parseCurrency`, `evaluateExpression`, `isExpression` strip every supported symbol.

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/utils/currency.test.ts` (add imports `afterEach` from vitest and `setActiveCurrency, getActiveCurrency, currencySymbol, symbolPadding` from `$lib/utils/currency`):

```ts
describe('active currency', () => {
  afterEach(() => setActiveCurrency('USD'));

  it('defaults to USD', () => {
    expect(getActiveCurrency()).toBe('USD');
    expect(currencySymbol()).toBe('$');
  });

  it('formats INR with the rupee sign and lakh grouping', () => {
    setActiveCurrency('INR');
    expect(formatCurrency(123456789)).toBe('₹12,34,567.89');
    expect(formatCurrency(1000000000)).toBe('₹1,00,00,000.00');
    expect(currencySymbol()).toBe('₹');
  });

  it('keeps the minus sign first for negatives', () => {
    setActiveCurrency('INR');
    expect(formatCurrency(-500)).toBe('-₹5.00');
    setActiveCurrency('GBP');
    expect(formatCurrency(-500)).toBe('-£5.00');
  });

  it('formats zero and small amounts', () => {
    setActiveCurrency('EUR');
    expect(formatCurrency(0)).toBe('€0.00');
    expect(formatCurrency(5)).toBe('€0.05');
  });

  it('formats AED with its code', () => {
    setActiveCurrency('AED');
    expect(formatCurrency(1250).replace(/\s/g, ' ')).toMatch(/AED\s?12\.50/);
  });

  it('adds left padding only for multi-character symbols', () => {
    expect(symbolPadding(1.75)).toBeUndefined();
    setActiveCurrency('AED');
    expect(symbolPadding(1.75)).toBe('3.35rem');
  });
});

describe('parsing with currency symbols', () => {
  afterEach(() => setActiveCurrency('USD'));

  it('strips any supported symbol, whatever the active currency', () => {
    expect(parseCurrency('$12.50')).toBe(1250);
    expect(parseCurrency('₹12.50')).toBe(1250);
    expect(parseCurrency('€12.50')).toBe(1250);
    expect(parseCurrency('£12.50')).toBe(1250);
    expect(parseCurrency('AED 12.50')).toBe(1250);
  });

  it('parses grouped amounts and expressions with symbols', () => {
    expect(parseCurrency('₹1,200 + 300')).toBe(150000);
    expect(parseCurrency('₹12,34,567.89')).toBe(123456789);
    expect(isExpression('₹1,200 + 300')).toBe(true);
  });

  it('treats a bare symbol as empty and junk as invalid', () => {
    expect(parseCurrency('₹')).toBe(0);
    expect(parseCurrency('AED')).toBe(0);
    expect(parseCurrency('₹abc')).toBeNaN();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/utils/currency.test.ts`
Expected: FAIL (`setActiveCurrency` is not exported, etc.). Existing USD tests still pass.

- [ ] **Step 3: Implement**

In `src/lib/utils/currency.ts`, replace the head of the file through `parseCurrency` and update the two other `value.replace(/[$,]/g, '')` calls:

```ts
import { CURRENCIES, DEFAULT_CURRENCY, currencyInfo, type CurrencyCode } from '$lib/currency/currencies';

let activeCurrency: CurrencyCode = DEFAULT_CURRENCY;

// Set once at startup (and on change) by currencyStore. Kept as module
// state so formatCurrency keeps its one-argument signature; the root
// layout rebuilds the app on change so nothing renders a stale symbol.
export function setActiveCurrency(code: CurrencyCode): void {
  activeCurrency = code;
}

export function getActiveCurrency(): CurrencyCode {
  return activeCurrency;
}

export function currencySymbol(): string {
  return currencyInfo(activeCurrency).symbol;
}

// A multi-character symbol (AED) overflows the one-character prefix the
// inputs are padded for. `baseRem` is the input's normal left padding.
export function symbolPadding(baseRem: number): string | undefined {
  const extra = currencySymbol().length - 1;
  return extra > 0 ? `${(baseRem + extra * 0.8).toFixed(2).replace(/\.?0+$/, '')}rem` : undefined;
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function formatCurrency(cents: number): string {
  const info = currencyInfo(activeCurrency);
  const formatted = centsToDollars(Math.abs(cents)).toLocaleString(info.locale, {
    style: 'currency',
    currency: info.code,
  });
  return cents < 0 ? `-${formatted}` : formatted;
}

// Every supported symbol plus grouping commas, whatever the active
// currency: someone with a USD habit typing "$" into an INR budget still
// gets the number they meant.
const SYMBOLS = [...new Set(CURRENCIES.map((c) => c.symbol))];
const STRIP_PATTERN = new RegExp(
  `[,${SYMBOLS.filter((s) => s.length === 1).map((s) => s.replace(/[\\]^$-]/g, '\\$&')).join('')}]|${SYMBOLS.filter((s) => s.length > 1).join('|')}`,
  'gi'
);

function stripSymbols(value: string): string {
  return value.replace(STRIP_PATTERN, '');
}

export function parseCurrency(value: string): number {
  const cleaned = stripSymbols(value).trim();
  if (!cleaned) return 0;
  const result = evaluateExpression(value);
  if (result === null) return NaN;
  return dollarsToCents(result);
}
```

In `evaluateExpression` change `let cleaned = value.replace(/[$,]/g, '').trim();` to `let cleaned = stripSymbols(value).trim();`. In `isExpression` change `const cleaned = value.replace(/[$,]/g, '').trim();` to `const cleaned = stripSymbols(value).trim();`.

Note: `symbolPadding(1.75)` with AED: extra = 2, `1.75 + 1.6 = 3.35` gives `'3.35rem'`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/lib/utils/currency.test.ts`
Expected: PASS, including the original USD tests unchanged.

If the INR assertions fail on the string (for example a non-breaking space), print the actual output with `console.log(JSON.stringify(formatCurrency(123456789)))` and fix the implementation, not the expectation, unless the output is merely whitespace.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/currency.ts tests/lib/utils/currency.test.ts
git commit --no-gpg-sign -m "feat(currency): format and parse by active currency"
```

---

### Task 3: Settings logic, DB table and store

**Files:**
- Create: `src/lib/currency/settings.ts`
- Create: `src/lib/stores/currencyStore.ts`
- Modify: `src/lib/db/index.ts` (settings table, v10)
- Test: `tests/lib/currency/settings.test.ts`

**Interfaces:**
- Consumes: `CurrencyCode`, `DEFAULT_CURRENCY`, `isSupportedCurrency` (Task 1); `detectCurrency` (Task 1); `setActiveCurrency` (Task 2).
- Produces:
  - `interface CurrencySettings { baseCurrency: CurrencyCode; currencyConfirmed: boolean }`
  - `interface SettingRow { key: string; value: string | boolean }`
  - `normalizeCurrencySettings(raw: unknown): CurrencySettings` (missing or unsupported gives USD, unconfirmed)
  - `settingsToRows(s: CurrencySettings): SettingRow[]`
  - `rowsToSettings(rows: SettingRow[]): CurrencySettings | null` (null when no `baseCurrency` row)
  - `migrationSettingsRows(hasData: boolean): SettingRow[]`
  - `resolveStartupSettings(stored: CurrencySettings | null, detected: CurrencyCode): CurrencySettings`
  - Stores: `baseCurrency: Writable<CurrencyCode>`, `currencyConfirmed: Writable<boolean>`; `loadCurrency(): Promise<void>`, `confirmCurrency(code: CurrencyCode): Promise<void>`
  - `db.settings: Table<SettingRow, string>`

- [ ] **Step 1: Write the failing tests**

`tests/lib/currency/settings.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  normalizeCurrencySettings,
  settingsToRows,
  rowsToSettings,
  migrationSettingsRows,
  resolveStartupSettings,
} from '$lib/currency/settings';

describe('normalizeCurrencySettings', () => {
  it('keeps a valid object', () => {
    expect(normalizeCurrencySettings({ baseCurrency: 'INR', currencyConfirmed: true })).toEqual({
      baseCurrency: 'INR',
      currencyConfirmed: true,
    });
  });

  it('falls back to unconfirmed USD for missing or malformed input', () => {
    const fallback = { baseCurrency: 'USD', currencyConfirmed: false };
    expect(normalizeCurrencySettings(undefined)).toEqual(fallback);
    expect(normalizeCurrencySettings(null)).toEqual(fallback);
    expect(normalizeCurrencySettings('INR')).toEqual(fallback);
    expect(normalizeCurrencySettings({ baseCurrency: 'XXX', currencyConfirmed: true })).toEqual(fallback);
    expect(normalizeCurrencySettings({ baseCurrency: 42 })).toEqual(fallback);
  });

  it('treats a non-boolean confirmed flag as false', () => {
    expect(normalizeCurrencySettings({ baseCurrency: 'GBP', currencyConfirmed: 'yes' })).toEqual({
      baseCurrency: 'GBP',
      currencyConfirmed: false,
    });
  });
});

describe('settings rows', () => {
  it('round-trips', () => {
    const s = { baseCurrency: 'EUR' as const, currencyConfirmed: true };
    expect(rowsToSettings(settingsToRows(s))).toEqual(s);
  });

  it('returns null when there is no baseCurrency row', () => {
    expect(rowsToSettings([])).toBeNull();
    expect(rowsToSettings([{ key: 'currencyConfirmed', value: true }])).toBeNull();
  });

  it('ignores an unsupported stored code instead of trusting it', () => {
    expect(rowsToSettings([{ key: 'baseCurrency', value: 'XXX' }])).toEqual({
      baseCurrency: 'USD',
      currencyConfirmed: false,
    });
  });
});

describe('migrationSettingsRows', () => {
  it('marks an existing database with data as unconfirmed USD', () => {
    expect(rowsToSettings(migrationSettingsRows(true))).toEqual({ baseCurrency: 'USD', currencyConfirmed: false });
  });

  it('writes nothing for an empty database so detection runs', () => {
    expect(migrationSettingsRows(false)).toEqual([]);
  });
});

describe('resolveStartupSettings', () => {
  it('uses the detected currency, unconfirmed, when nothing is stored', () => {
    expect(resolveStartupSettings(null, 'INR')).toEqual({ baseCurrency: 'INR', currencyConfirmed: false });
  });

  it('keeps stored settings and ignores detection', () => {
    const stored = { baseCurrency: 'USD' as const, currencyConfirmed: true };
    expect(resolveStartupSettings(stored, 'INR')).toEqual(stored);
  });

  it('keeps stored unconfirmed USD (migrated user) rather than switching to detection', () => {
    const stored = { baseCurrency: 'USD' as const, currencyConfirmed: false };
    expect(resolveStartupSettings(stored, 'INR')).toEqual(stored);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/lib/currency/settings.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the pure logic**

`src/lib/currency/settings.ts`:

```ts
import { DEFAULT_CURRENCY, isSupportedCurrency, type CurrencyCode } from './currencies';

export interface CurrencySettings {
  baseCurrency: CurrencyCode;
  currencyConfirmed: boolean;
}

export interface SettingRow {
  key: string;
  value: string | boolean;
}

const UNCONFIRMED_DEFAULT: CurrencySettings = { baseCurrency: DEFAULT_CURRENCY, currencyConfirmed: false };

// Anything from a backup or storage is untrusted: an unknown code or a
// wrong type becomes unconfirmed USD, which makes the confirm modal appear.
export function normalizeCurrencySettings(raw: unknown): CurrencySettings {
  if (!raw || typeof raw !== 'object') return { ...UNCONFIRMED_DEFAULT };
  const { baseCurrency, currencyConfirmed } = raw as Record<string, unknown>;
  if (!isSupportedCurrency(baseCurrency)) return { ...UNCONFIRMED_DEFAULT };
  return { baseCurrency, currencyConfirmed: currencyConfirmed === true };
}

export function settingsToRows(s: CurrencySettings): SettingRow[] {
  return [
    { key: 'baseCurrency', value: s.baseCurrency },
    { key: 'currencyConfirmed', value: s.currencyConfirmed },
  ];
}

export function rowsToSettings(rows: SettingRow[]): CurrencySettings | null {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  if (!byKey.has('baseCurrency')) return null;
  return normalizeCurrencySettings({
    baseCurrency: byKey.get('baseCurrency'),
    currencyConfirmed: byKey.get('currencyConfirmed'),
  });
}

// v10 upgrade. A database that already holds data was entered in dollars
// before currencies existed, so it stays USD (asking once to confirm). An
// empty one writes nothing and gets device detection on first load.
export function migrationSettingsRows(hasData: boolean): SettingRow[] {
  return hasData ? settingsToRows({ baseCurrency: DEFAULT_CURRENCY, currencyConfirmed: false }) : [];
}

export function resolveStartupSettings(stored: CurrencySettings | null, detected: CurrencyCode): CurrencySettings {
  return stored ?? { baseCurrency: detected, currencyConfirmed: false };
}
```

- [ ] **Step 4: Add the DB table and v10**

In `src/lib/db/index.ts`: add `import type { SettingRow } from '$lib/currency/settings';` and `import { migrationSettingsRows } from '$lib/currency/settings';` (combine into one import). Add the property after `investmentPrices!: ...`:

```ts
  settings!: Table<SettingRow, string>;
```

Add after the `version(9)` block, inside the constructor:

```ts
    // v10: base currency. Existing data with any transaction or income stays
    // USD but asks once to confirm; empty databases get detection instead.
    this.version(10).stores({
      buckets: 'id, name, order',
      transactions: 'id, bucketId, date, recurringId',
      recurringTransactions: 'id, bucketId, nextDueDate, isActive',
      incomes: 'id, date',
      monthSnapshots: 'month',
      savingsGoals: 'id, bucketId',
      investmentLots: 'id, symbol, purchaseDate',
      investmentSells: 'id, lotId, sellDate',
      investmentPrices: 'symbol',
      settings: 'key'
    }).upgrade(async tx => {
      const [transactionCount, incomeCount] = await Promise.all([
        tx.table('transactions').count(),
        tx.table('incomes').count(),
      ]);
      const rows = migrationSettingsRows(transactionCount + incomeCount > 0);
      if (rows.length > 0) await tx.table('settings').bulkPut(rows);
    });
```

- [ ] **Step 5: Implement the store**

`src/lib/stores/currencyStore.ts`:

```ts
import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { db } from '$lib/db';
import { DEFAULT_CURRENCY, type CurrencyCode } from '$lib/currency/currencies';
import { detectCurrency } from '$lib/currency/detect';
import { resolveStartupSettings, rowsToSettings, settingsToRows } from '$lib/currency/settings';
import { setActiveCurrency } from '$lib/utils/currency';

export const baseCurrency = writable<CurrencyCode>(DEFAULT_CURRENCY);
export const currencyConfirmed = writable<boolean>(true);

baseCurrency.subscribe(setActiveCurrency);

function detectOnDevice(): CurrencyCode {
  if (!browser) return DEFAULT_CURRENCY;
  let timeZone: string | undefined;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timeZone = undefined;
  }
  return detectCurrency(timeZone, navigator.language);
}

// Reads the saved currency, or guesses one from the device when nothing
// is saved yet. A guess is not saved until the user confirms it.
export async function loadCurrency(): Promise<void> {
  const stored = rowsToSettings(await db.settings.toArray());
  const settings = resolveStartupSettings(stored, detectOnDevice());
  baseCurrency.set(settings.baseCurrency);
  currencyConfirmed.set(settings.currencyConfirmed);
}

// Saves the choice. This only relabels: stored amounts are not touched.
export async function confirmCurrency(code: CurrencyCode): Promise<void> {
  await db.settings.bulkPut(settingsToRows({ baseCurrency: code, currencyConfirmed: true }));
  baseCurrency.set(code);
  currencyConfirmed.set(true);
}
```

- [ ] **Step 6: Run tests and type check**

Run: `npx vitest run && npm run check`
Expected: all tests PASS; svelte-check reports 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/currency/settings.ts src/lib/stores/currencyStore.ts src/lib/db/index.ts tests/lib/currency/settings.test.ts
git commit --no-gpg-sign -m "feat(currency): persist base currency in a settings table (db v10)"
```

---

### Task 4: Backups carry the currency

**Files:**
- Modify: `src/lib/types.ts` (the `ExportData` type)
- Modify: `src/lib/utils/export.ts` (`exportToJson`, `parseImport`, `importFromJson`, `resetAllData`)
- Test: `tests/lib/utils/import.test.ts`

**Interfaces:**
- Consumes: `normalizeCurrencySettings`, `settingsToRows`, `rowsToSettings`, `CurrencySettings` (Task 3); `db.settings` (Task 3).
- Produces: `ExportData.data.settings: CurrencySettings`, always present after `parseImport`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/lib/utils/import.test.ts`, inside or after the `parseImport` describe. Reuse the file's existing `validPayload()` helper (it builds a valid `{ version: 1, data: {...} }` object; read the top of the file first to match its shape):

```ts
describe('parseImport currency settings', () => {
  it('defaults an old backup with no settings to unconfirmed USD', () => {
    const result = parseImport(JSON.stringify(validPayload()));
    expect(result.data.settings).toEqual({ baseCurrency: 'USD', currencyConfirmed: false });
  });

  it('keeps valid settings from the backup', () => {
    const payload = validPayload();
    (payload.data as Record<string, unknown>).settings = { baseCurrency: 'INR', currencyConfirmed: true };
    const result = parseImport(JSON.stringify(payload));
    expect(result.data.settings).toEqual({ baseCurrency: 'INR', currencyConfirmed: true });
  });

  it('falls back to unconfirmed USD for an unsupported currency code', () => {
    const payload = validPayload();
    (payload.data as Record<string, unknown>).settings = { baseCurrency: 'XXX', currencyConfirmed: true };
    const result = parseImport(JSON.stringify(payload));
    expect(result.data.settings).toEqual({ baseCurrency: 'USD', currencyConfirmed: false });
  });

  it('falls back for a malformed settings section', () => {
    const payload = validPayload();
    (payload.data as Record<string, unknown>).settings = 'INR';
    const result = parseImport(JSON.stringify(payload));
    expect(result.data.settings).toEqual({ baseCurrency: 'USD', currencyConfirmed: false });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/utils/import.test.ts`
Expected: FAIL (`result.data.settings` is `undefined`).

- [ ] **Step 3: Implement**

`src/lib/types.ts`: add `import type { CurrencySettings } from '$lib/currency/settings';` at the top (match the file's existing import style) and add to `ExportData.data`:

```ts
    settings: CurrencySettings;
```

`src/lib/utils/export.ts`:

- Imports: `import { normalizeCurrencySettings, rowsToSettings, settingsToRows } from '$lib/currency/settings';`
- In `exportToJson`, read the stored settings and add them to `data`:

```ts
  const storedSettings = rowsToSettings(await db.settings.toArray());
```
  and in the object: `settings: storedSettings ?? normalizeCurrencySettings(undefined),` (add as the last key inside `data: { ... }`).
- In `parseImport`, just before `return obj as unknown as ExportData;` add:

```ts
  // Optional section: backups from before currencies have none, and an
  // unsupported code is never trusted. Both land on unconfirmed USD.
  data.settings = normalizeCurrencySettings(data.settings);
```
- In `importFromJson`, include the settings table in the transaction and write the rows:

```ts
export async function importFromJson(json: string): Promise<void> {
  const { data } = parseImport(json);
  const tables = [...COLLECTIONS.map((name) => db.table(name)), db.settings];

  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()));
    for (const name of COLLECTIONS) {
      await db.table(name).bulkAdd((data as Record<string, unknown[]>)[name]);
    }
    await db.settings.bulkAdd(settingsToRows(data.settings));
  });
}
```
- In `resetAllData`, clear settings too so a reset starts fresh with detection:

```ts
export async function resetAllData(): Promise<void> {
  const tables = [...COLLECTIONS.map((name) => db.table(name)), db.settings];
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()));
  });
}
```

- [ ] **Step 4: Run tests and type check**

Run: `npx vitest run && npm run check`
Expected: PASS and 0 errors. If an existing import/export test deep-compares the whole parsed `data` object and now fails only because of the new `settings` key, update that expectation to include `settings: { baseCurrency: 'USD', currencyConfirmed: false }`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/utils/export.ts tests/lib/utils/import.test.ts
git commit --no-gpg-sign -m "feat(currency): include base currency in backups"
```

---

### Task 5: Replace hard-coded `$` prefixes and the chart tooltip

**Files (modify):**
- `src/lib/components/shared/AssignPanel.svelte:145`
- `src/lib/components/shared/LogEntry.svelte:107`
- `src/lib/components/shared/EditTransaction.svelte:56`
- `src/routes/+page.svelte:341, 439, 457, 498`
- `src/routes/buckets/+page.svelte:165`
- `src/routes/analytics/+page.svelte:150`
- `src/routes/recurring/+page.svelte:159`
- `src/lib/components/charts/DonutChart.svelte:72`

**Interfaces:**
- Consumes: `currencySymbol()`, `symbolPadding(baseRem)`, `formatCurrency`, `dollarsToCents` from `$lib/utils/currency` (Task 2).

These are Svelte templates with no unit tests. Verification is `svelte-check` plus the browser pass in Task 7.

- [ ] **Step 1: Confirm the list of sites is still complete**

Run: `grep -rnE ">\\$<|\\$</span>|\\$\\$\{" src`
Expected: exactly the 12 prefix lines above plus the `DonutChart` line. If another site appears, treat it the same way.

- [ ] **Step 2: Replace each prefix**

For each file, make sure `currencySymbol` and `symbolPadding` are imported from `'$lib/utils/currency'` (extend the existing import from that module if the file has one, otherwise add `import { currencySymbol, symbolPadding } from '$lib/utils/currency';` inside the `<script>`). Then replace the literal `$` inside the prefix `<span>` with `{currencySymbol()}`.

Example, `LogEntry.svelte:107`:

```svelte
<span class="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-muted dark:text-muted-dark">{currencySymbol()}</span>
```

`bucket/+page.svelte:165` is `<span class="text-muted">$</span>` (an inline prefix, not absolute). Replace with `<span class="text-muted">{currencySymbol()}</span>`.

- [ ] **Step 3: Pad inputs for multi-character symbols**

For each absolute-positioned prefix, the `<input>` right after it has a Tailwind left-padding class (`pl-6`, `pl-7`, `pl-8`, ...). Convert it to rem (`pl-N` = `N * 0.25` rem, so `pl-7` is `1.75`) and add `style:padding-left={symbolPadding(<that value>)}` to the same input. `symbolPadding` returns `undefined` for one-character symbols, so USD/INR/EUR/GBP keep the Tailwind class untouched. Skip the inline `buckets/+page.svelte:165` prefix (it is not absolutely positioned and flows with the text).

Example for an input with `pl-8`:

```svelte
<input class="... pl-8 ..." style:padding-left={symbolPadding(2)} ... />
```

- [ ] **Step 4: Fix the DonutChart tooltip**

In `src/lib/components/charts/DonutChart.svelte`, import `formatCurrency, dollarsToCents` from `'$lib/utils/currency'` (extend the existing import if present) and replace line 72:

```ts
                return ` ${formatCurrency(dollarsToCents(value))} (${pct}%)`;
```

(`value` here is in dollars, so it goes through `dollarsToCents`.)

- [ ] **Step 5: Type check and tests**

Run: `npm run check && npx vitest run`
Expected: 0 errors, all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src
git commit --no-gpg-sign -m "feat(currency): use the active currency symbol in inputs and chart tooltips"
```

---

### Task 6: Confirm modal, chip, and wiring

**Files:**
- Create: `src/lib/components/shared/CurrencyModal.svelte`
- Create: `src/lib/components/shared/CurrencyChip.svelte`
- Modify: `src/routes/+layout.svelte`
- Modify: `src/lib/components/layout/Layout.svelte`
- Modify: `src/lib/components/layout/Nav.svelte`
- Modify: `src/routes/settings/+page.svelte`

**Interfaces:**
- Consumes: `baseCurrency`, `currencyConfirmed`, `loadCurrency`, `confirmCurrency` (Task 3); `CURRENCIES`, `currencyInfo` (Task 1); `openModal`, `closeModal` from `uiStore`; `Modal` component (props `id`, `title`).
- Produces: `<CurrencyModal />` (modal id `'currency'`) and `<CurrencyChip />`.

- [ ] **Step 1: Create the modal**

`src/lib/components/shared/CurrencyModal.svelte`:

```svelte
<script lang="ts">
  import Modal from './Modal.svelte';
  import { CURRENCIES, currencyInfo, type CurrencyCode } from '$lib/currency/currencies';
  import { baseCurrency, currencyConfirmed, confirmCurrency } from '$lib/stores/currencyStore';
  import { closeModal, activeModal } from '$lib/stores/uiStore';

  let selected: CurrencyCode = $baseCurrency;
  let saving = false;

  // Start from the current (or detected) currency each time it opens.
  $: if ($activeModal === 'currency') selected = $baseCurrency;

  async function save() {
    saving = true;
    try {
      await confirmCurrency(selected);
      closeModal();
    } finally {
      saving = false;
    }
  }
</script>

<Modal id="currency" title="Currency">
  <div class="space-y-4 pt-4">
    {#if !$currencyConfirmed}
      <p class="text-sm text-gray-600 dark:text-gray-300">
        Looks like <strong>{currencyInfo($baseCurrency).code}</strong>. Is that right?
      </p>
    {:else}
      <p class="text-sm text-gray-600 dark:text-gray-300">
        This changes the symbol only. Your amounts stay the same numbers.
      </p>
    {/if}

    <fieldset class="space-y-1">
      <legend class="sr-only">Currency</legend>
      {#each CURRENCIES as c}
        <label class="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800/50">
          <input type="radio" name="currency" value={c.code} bind:group={selected} />
          <span class="w-10 text-sm font-medium text-gray-900 dark:text-gray-100">{c.symbol}</span>
          <span class="text-sm text-gray-700 dark:text-gray-300">{c.name} ({c.code})</span>
        </label>
      {/each}
    </fieldset>

    <button type="button" class="btn-primary w-full" disabled={saving} on:click={save}>
      {$currencyConfirmed ? 'Save' : 'Confirm'}
    </button>
  </div>
</Modal>
```

(`btn-primary` is the app's existing primary button class; check `src/app.css` and use the same class name the other modals use if it differs.)

- [ ] **Step 2: Create the chip**

`src/lib/components/shared/CurrencyChip.svelte`:

```svelte
<script lang="ts">
  import { baseCurrency } from '$lib/stores/currencyStore';
  import { currencyInfo } from '$lib/currency/currencies';
  import { openModal } from '$lib/stores/uiStore';

  $: info = currencyInfo($baseCurrency);
</script>

<button
  type="button"
  on:click={() => openModal('currency')}
  aria-label="Change currency, currently {info.code}"
  class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors
         hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-200"
>
  <span aria-hidden="true">{info.symbol}</span>
  <span>{info.code}</span>
</button>
```

- [ ] **Step 3: Wire the root layout**

`src/routes/+layout.svelte`: import `loadCurrency, baseCurrency` from `'$lib/stores/currencyStore'`; call `await loadCurrency();` first in `init()` (before `await loadData();`); wrap the loaded branch in a key block:

```svelte
{:else}
	{#key $baseCurrency}
		<Layout>
			{@render children()}
		</Layout>
	{/key}
{/if}
```

- [ ] **Step 4: Mount the modal and auto-open it**

`src/lib/components/layout/Layout.svelte`: add imports

```ts
  import CurrencyModal from '$lib/components/shared/CurrencyModal.svelte';
  import { currencyConfirmed } from '$lib/stores/currencyStore';
  import { openModal } from '$lib/stores/uiStore';
  import { onMount } from 'svelte';
```

(merge `openModal` into the existing `uiStore` import). Add to the script:

```ts
  // Ask once per session until the user confirms. Closing the modal with
  // Escape just defers it to the next launch; it does not reopen in a loop.
  let askedThisSession = false;
  onMount(() => {
    if (!$currencyConfirmed && !askedThisSession) {
      askedThisSession = true;
      openModal('currency');
    }
  });
```

Add `<CurrencyModal />` after the existing `<Modal id="log" ...>` block.

Because the root layout re-keys on a currency change, `Layout` remounts with `currencyConfirmed = true` after saving, so it does not reopen.

- [ ] **Step 5: Add the chip to the desktop sidebar**

`src/lib/components/layout/Nav.svelte`: import `CurrencyChip from '$lib/components/shared/CurrencyChip.svelte'`. In the desktop `<nav>`, after the closing `</ul>`, add:

```svelte
  <div class="border-t border-border px-3 py-3 dark:border-border-dark">
    <CurrencyChip />
  </div>
```

- [ ] **Step 6: Add a Currency row and fix reloads on the Settings page**

`src/routes/settings/+page.svelte`: import `CurrencyChip` and `loadCurrency`. Add a `Currency` section using the same section markup as the neighbouring sections (copy the heading/card classes from the Theme section in that file), containing `<CurrencyChip />` and the sentence "Changing it only relabels amounts; it does not convert them." Add `await loadCurrency();` immediately before each existing `await loadData();` (in `handleImport` at line ~46 and in `handleReset` at line ~64) so a restored backup or a reset picks up its currency.

- [ ] **Step 7: Type check and tests**

Run: `npm run check && npx vitest run`
Expected: 0 errors, all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src
git commit --no-gpg-sign -m "feat(currency): confirm modal, currency chip and settings entry"
```

---

### Task 7: Verify in the browser

**Files:** none changed unless a bug is found (then fix with a test where the code is pure, commit separately).

Files for Playwright must live under the repo in `.playwright-mcp/` and be deleted afterwards.

- [ ] **Step 1: Run the full suite and build**

Run: `npx vitest run && npm run check && npm run build`
Expected: all PASS, 0 check errors, build succeeds.

- [ ] **Step 2: Check each scenario in the running app** (`npm run dev`, Playwright)

1. **Fresh profile, India:** new browser context with time zone `Asia/Kolkata` and locale `en-IN`. The confirm modal appears with INR preselected; dashboard shows `₹`; Confirm saves; reload shows no modal.
2. **Fresh profile, USA:** time zone `America/New_York`: modal shows USD.
3. **Existing data:** import `budget-backup-2026-10-02.rebucketed-v4-with-notes.json` (read-only input) into a fresh context. Currency is USD, modal asks once, nothing else about amounts changes.
4. **Change later:** open the sidebar chip, pick INR. Copy says "symbol only"; every amount re-renders as `₹` with the same numbers; lakh grouping on large values.
5. **Inputs:** Log, EditTransaction, AssignPanel, dashboard income fields and recurring/buckets/analytics fields show the new symbol. With AED selected, the prefix does not overlap typed text.
6. **Escape:** open the app fresh, press Escape on the confirm modal, navigate between pages. It does not reopen until the next launch.
7. **Backup roundtrip:** export JSON, confirm it contains `"settings"`; switch to EUR, import the old file, currency returns to the file's value (or USD unconfirmed for an old backup).
8. **Hide amounts:** toggle privacy; amounts with `₹` still blur.

- [ ] **Step 3: Clean up and report**

Delete anything created under `.playwright-mcp/`. Record any scenario that failed and fix it before finishing.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A src tests
git commit --no-gpg-sign -m "fix(currency): <what was found>"
```

Skip this step if nothing needed fixing.
