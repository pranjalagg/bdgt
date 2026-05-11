import { describe, it, expect } from 'vitest';
import { formatCurrency, parseCurrency, centsToDollars, dollarsToCents, isValidCurrency } from '$lib/utils/currency';

describe('currency utils', () => {
  describe('centsToDollars', () => {
    it('converts cents to dollars', () => {
      expect(centsToDollars(1234)).toBe(12.34);
      expect(centsToDollars(100)).toBe(1);
      expect(centsToDollars(0)).toBe(0);
      expect(centsToDollars(-500)).toBe(-5);
    });
  });

  describe('dollarsToCents', () => {
    it('converts dollars to cents', () => {
      expect(dollarsToCents(12.34)).toBe(1234);
      expect(dollarsToCents(1)).toBe(100);
      expect(dollarsToCents(0)).toBe(0);
      expect(dollarsToCents(-5)).toBe(-500);
    });

    it('handles floating point edge cases', () => {
      expect(dollarsToCents(0.1)).toBe(10);
      expect(dollarsToCents(0.01)).toBe(1);
    });
  });

  describe('formatCurrency', () => {
    it('formats cents as USD', () => {
      expect(formatCurrency(1234)).toBe('$12.34');
      expect(formatCurrency(100)).toBe('$1.00');
      expect(formatCurrency(0)).toBe('$0.00');
    });

    it('formats negative amounts', () => {
      expect(formatCurrency(-500)).toBe('-$5.00');
    });
  });

  describe('parseCurrency', () => {
    it('parses dollar string to cents', () => {
      expect(parseCurrency('12.34')).toBe(1234);
      expect(parseCurrency('$12.34')).toBe(1234);
      expect(parseCurrency('1')).toBe(100);
      expect(parseCurrency('')).toBe(0);
    });
  });

  describe('isValidCurrency', () => {
    it('accepts valid decimal amounts', () => {
      expect(isValidCurrency('12.34')).toBe(true);
      expect(isValidCurrency('0.50')).toBe(true);
      expect(isValidCurrency('0.01')).toBe(true);
      expect(isValidCurrency('100.99')).toBe(true);
    });

    it('accepts valid integer amounts', () => {
      expect(isValidCurrency('1')).toBe(true);
      expect(isValidCurrency('100')).toBe(true);
      expect(isValidCurrency('9999')).toBe(true);
    });

    it('accepts currency-formatted strings', () => {
      expect(isValidCurrency('$12.34')).toBe(true);
      expect(isValidCurrency('$1,234.56')).toBe(true);
      expect(isValidCurrency('$1,000')).toBe(true);
    });

    it('rejects non-numeric strings', () => {
      expect(isValidCurrency('abc')).toBe(false);
      expect(isValidCurrency('12.34abc')).toBe(false);
      expect(isValidCurrency('hello')).toBe(false);
      expect(isValidCurrency('$abc')).toBe(false);
    });

    it('rejects empty and whitespace-only strings', () => {
      expect(isValidCurrency('')).toBe(false);
      expect(isValidCurrency('  ')).toBe(false);
      expect(isValidCurrency('$')).toBe(false);
    });

    it('rejects negative amounts', () => {
      expect(isValidCurrency('-5')).toBe(false);
      expect(isValidCurrency('-12.34')).toBe(false);
    });

    it('rejects zero', () => {
      expect(isValidCurrency('0')).toBe(false);
      expect(isValidCurrency('0.00')).toBe(false);
    });

    it('rejects amounts with more than two decimal places', () => {
      expect(isValidCurrency('12.345')).toBe(false);
      expect(isValidCurrency('1.999')).toBe(false);
    });

    it('accepts single decimal place', () => {
      expect(isValidCurrency('12.5')).toBe(true);
    });
  });
});
