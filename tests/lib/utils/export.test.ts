import { describe, it, expect } from 'vitest';
import { escapeCsvField } from '$lib/utils/export';

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
