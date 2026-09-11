import { describe, it, expect } from 'vitest';
import { escapeCsvField, sanitizeCsvFormula } from '$lib/utils/export';

describe('escapeCsvField', () => {
  it('leaves a plain value untouched', () => {
    expect(escapeCsvField('Grocery')).toBe('Grocery');
  });

  it('quotes a value containing a comma', () => {
    expect(escapeCsvField('Lunch, tip included')).toBe('"Lunch, tip included"');
  });

  it('quotes and doubles embedded quotes', () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it('quotes a value containing a newline', () => {
    expect(escapeCsvField('line one\nline two')).toBe('"line one\nline two"');
  });

  it('coerces non-strings', () => {
    expect(escapeCsvField(42)).toBe('42');
  });
});

describe('sanitizeCsvFormula', () => {
  it('prefixes a leading = with an apostrophe so it is not read as a formula', () => {
    expect(sanitizeCsvFormula('=cmd|\'/C calc\'!A1')).toBe('\'=cmd|\'/C calc\'!A1');
  });

  it('neutralizes leading +, -, @ and tab the same way', () => {
    expect(sanitizeCsvFormula('+1+1')).toBe('\'+1+1');
    expect(sanitizeCsvFormula('-1+1')).toBe('\'-1+1');
    expect(sanitizeCsvFormula('@SUM(A1)')).toBe('\'@SUM(A1)');
    expect(sanitizeCsvFormula('\tHello')).toBe('\'\tHello');
  });

  it('leaves ordinary text untouched', () => {
    expect(sanitizeCsvFormula('Grocery')).toBe('Grocery');
    expect(sanitizeCsvFormula('Coffee - Blue Bottle')).toBe('Coffee - Blue Bottle');
  });

  it('leaves empty strings untouched', () => {
    expect(sanitizeCsvFormula('')).toBe('');
  });
});
