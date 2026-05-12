import { describe, it, expect } from 'vitest';
import { formatCurrency, parseCurrency, centsToDollars, dollarsToCents, isValidCurrency, evaluateExpression, isExpression } from '$lib/utils/currency';

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

    it('parses addition expressions to cents', () => {
      expect(parseCurrency('12.04 + 20.34')).toBe(3238);
      expect(parseCurrency('10 + 5')).toBe(1500);
    });

    it('parses subtraction expressions to cents', () => {
      expect(parseCurrency('50 - 12.50')).toBe(3750);
    });

    it('parses mixed expressions to cents', () => {
      expect(parseCurrency('100 + 20 - 5.50')).toBe(11450);
    });

    it('parses negative amounts to cents', () => {
      expect(parseCurrency('-5')).toBe(-500);
      expect(parseCurrency('-12.34')).toBe(-1234);
    });

    it('returns NaN for invalid input', () => {
      expect(parseCurrency('abc')).toBeNaN();
      expect(parseCurrency('$abc')).toBeNaN();
      expect(parseCurrency('10 + abc')).toBeNaN();
    });

    it('returns 0 for empty string', () => {
      expect(parseCurrency('')).toBe(0);
      expect(parseCurrency('  ')).toBe(0);
      expect(parseCurrency('$')).toBe(0);
    });
  });

  describe('isValidCurrency', () => {
    it('accepts valid decimal amounts', () => {
      expect(isValidCurrency('12.34')).toBe(true);
      expect(isValidCurrency('0.50')).toBe(true);
      expect(isValidCurrency('0.01')).toBe(true);
      expect(isValidCurrency('100.99')).toBe(true);
    });

    it('accepts shorthand decimals without leading zero', () => {
      expect(isValidCurrency('.50')).toBe(true);
      expect(isValidCurrency('.99')).toBe(true);
      expect(isValidCurrency('.5')).toBe(true);
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

    it('accepts negative amounts', () => {
      expect(isValidCurrency('-5')).toBe(true);
      expect(isValidCurrency('-12.34')).toBe(true);
    });

    it('rejects zero', () => {
      expect(isValidCurrency('0')).toBe(false);
      expect(isValidCurrency('0.00')).toBe(false);
    });

    it('rejects expressions that evaluate to zero', () => {
      expect(isValidCurrency('10 - 10')).toBe(false);
    });

    it('rejects amounts with more than two decimal places', () => {
      expect(isValidCurrency('12.345')).toBe(false);
      expect(isValidCurrency('1.999')).toBe(false);
    });

    it('accepts single decimal place', () => {
      expect(isValidCurrency('12.5')).toBe(true);
    });

    it('accepts addition expressions', () => {
      expect(isValidCurrency('12.04 + 20.34')).toBe(true);
      expect(isValidCurrency('10 + 5 + 3')).toBe(true);
    });

    it('accepts subtraction expressions', () => {
      expect(isValidCurrency('50 - 12.50')).toBe(true);
    });

    it('accepts mixed expressions', () => {
      expect(isValidCurrency('100 + 20 - 5.50')).toBe(true);
    });

    it('accepts expressions with negative result', () => {
      expect(isValidCurrency('5 - 10')).toBe(true);
    });

    it('rejects expressions with result zero', () => {
      expect(isValidCurrency('10 - 10')).toBe(false);
    });

    it('rejects expressions with invalid operands', () => {
      expect(isValidCurrency('10 + abc')).toBe(false);
      expect(isValidCurrency('abc + 10')).toBe(false);
      expect(isValidCurrency('+ 10')).toBe(false);
      expect(isValidCurrency('10 +')).toBe(false);
    });
  });

  describe('evaluateExpression', () => {
    it('evaluates single numbers', () => {
      expect(evaluateExpression('12.34')).toBe(12.34);
      expect(evaluateExpression('100')).toBe(100);
    });

    it('evaluates addition', () => {
      expect(evaluateExpression('12.04 + 20.34')).toBe(32.38);
      expect(evaluateExpression('1 + 2 + 3')).toBe(6);
    });

    it('evaluates subtraction', () => {
      expect(evaluateExpression('50 - 12.50')).toBe(37.50);
      expect(evaluateExpression('100 - 25 - 10')).toBe(65);
    });

    it('evaluates mixed operations', () => {
      expect(evaluateExpression('100 + 20 - 5.50')).toBe(114.50);
      expect(evaluateExpression('10 - 3 + 7')).toBe(14);
    });

    it('evaluates shorthand decimals', () => {
      expect(evaluateExpression('.50')).toBe(0.5);
      expect(evaluateExpression('.50 + .25')).toBe(0.75);
      expect(evaluateExpression('10 + .99')).toBe(10.99);
    });

    it('handles spaces flexibly', () => {
      expect(evaluateExpression('10+5')).toBe(15);
      expect(evaluateExpression('10 +5')).toBe(15);
      expect(evaluateExpression('10+ 5')).toBe(15);
      expect(evaluateExpression(' 10 + 5 ')).toBe(15);
    });

    it('strips currency symbols', () => {
      expect(evaluateExpression('$10 + $5')).toBe(15);
      expect(evaluateExpression('$1,000 + 500')).toBe(1500);
    });

    it('returns null for invalid expressions', () => {
      expect(evaluateExpression('')).toBeNull();
      expect(evaluateExpression('abc')).toBeNull();
      expect(evaluateExpression('10 + abc')).toBeNull();
      expect(evaluateExpression('+ 10')).toBeNull();
      expect(evaluateExpression('10 +')).toBeNull();
      expect(evaluateExpression('10 * 5')).toBeNull();
    });

    it('returns null for operands with too many decimal places', () => {
      expect(evaluateExpression('10.123 + 5')).toBeNull();
    });

    it('handles negative results from subtraction', () => {
      expect(evaluateExpression('5 - 10')).toBe(-5);
    });

    it('handles leading negative sign', () => {
      expect(evaluateExpression('-5')).toBe(-5);
      expect(evaluateExpression('-12.34')).toBe(-12.34);
      expect(evaluateExpression('-10 + 3')).toBe(-7);
      expect(evaluateExpression('- 5')).toBe(-5);
    });

    it('rounds result to two decimal places', () => {
      expect(evaluateExpression('10.10 + 20.20')).toBe(30.30);
    });
  });

  describe('isExpression', () => {
    it('detects addition expressions', () => {
      expect(isExpression('10 + 5')).toBe(true);
      expect(isExpression('10+5')).toBe(true);
    });

    it('detects subtraction expressions', () => {
      expect(isExpression('50 - 12')).toBe(true);
    });

    it('returns false for plain numbers', () => {
      expect(isExpression('12.34')).toBe(false);
      expect(isExpression('100')).toBe(false);
    });

    it('returns false for empty strings', () => {
      expect(isExpression('')).toBe(false);
    });

    it('returns false for negative numbers', () => {
      expect(isExpression('-5')).toBe(false);
      expect(isExpression('-12.34')).toBe(false);
    });
  });
});
