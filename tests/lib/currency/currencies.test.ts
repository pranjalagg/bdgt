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
