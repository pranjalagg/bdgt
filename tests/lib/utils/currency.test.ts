import { describe, it, expect, afterEach } from 'vitest';
import { formatMoney, formatCurrency, parseCurrency, centsToDollars, dollarsToCents, isValidCurrency, evaluateExpression, isExpression, setActiveCurrency, getActiveCurrency, currencySymbol, symbolPadding, splitFraction } from '$lib/utils/currency';

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
      expect(evaluateExpression('10 *')).toBeNull();
    });

    it('multiplies operands', () => {
      expect(evaluateExpression('10 * 5')).toBe(50);
      expect(evaluateExpression('12.50 * 3')).toBe(37.50);
      expect(evaluateExpression('10*5')).toBe(50);
    });

    it('divides operands', () => {
      expect(evaluateExpression('100 / 4')).toBe(25);
      expect(evaluateExpression('10 / 3')).toBe(3.33);
    });

    it('returns null for division by zero', () => {
      expect(evaluateExpression('10 / 0')).toBeNull();
    });

    it('gives multiplication and division precedence over addition and subtraction', () => {
      expect(evaluateExpression('10 + 2 * 5')).toBe(20);
      expect(evaluateExpression('2 * 5 + 10')).toBe(20);
      expect(evaluateExpression('20 - 10 / 2')).toBe(15);
      expect(evaluateExpression('100 / 4 + 5')).toBe(30);
    });

    it('chains multiplication and division left to right', () => {
      expect(evaluateExpression('100 / 5 * 2')).toBe(40);
      expect(evaluateExpression('2 * 3 * 4')).toBe(24);
    });

    it('applies a leading negative sign across a multiplicative chain', () => {
      expect(evaluateExpression('-5 * 2')).toBe(-10);
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

    it('detects multiplication expressions', () => {
      expect(isExpression('10 * 5')).toBe(true);
      expect(isExpression('10*5')).toBe(true);
    });

    it('detects division expressions', () => {
      expect(isExpression('100 / 4')).toBe(true);
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

describe('decimal commas are not grouping commas', () => {
  it('rejects a comma that is not a thousands separator instead of reading it as x100', () => {
    for (const bad of ['12,50', '1,5', '0,89', ',5', '1,234,56', '10,5 + 2', '5 + 3,25', '1234,567']) {
      expect(isValidCurrency(bad), bad).toBe(false);
      expect(parseCurrency(bad), bad).toBeNaN();
    }
  });

  it('still accepts real grouping, Western and lakh', () => {
    expect(parseCurrency('1,234.56')).toBe(123456);
    expect(parseCurrency('1,000')).toBe(100000);
    expect(parseCurrency('12,500')).toBe(1250000);
    expect(parseCurrency('1,00,000')).toBe(10000000);
    expect(parseCurrency('12,34,567.89')).toBe(123456789);
    expect(parseCurrency('$1,000 + 5')).toBe(100500);
    expect(parseCurrency('-1,000')).toBe(-100000);
  });
});

describe('splitFraction', () => {
  it('splits a formatted amount at its decimal point', () => {
    expect(splitFraction('$1,280.29')).toEqual(['$1,280', '.29']);
    expect(splitFraction('-₹12,34,567.00')).toEqual(['-₹12,34,567', '.00']);
    expect(splitFraction('AED 35')).toEqual(['AED 35', '']);
  });
});
