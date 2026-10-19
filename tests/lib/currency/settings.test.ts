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
