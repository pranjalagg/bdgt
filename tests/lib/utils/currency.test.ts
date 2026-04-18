import { describe, it, expect } from 'vitest';
import { formatCurrency, parseCurrency, centsToDollars, dollarsToCents } from '$lib/utils/currency';

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
});
