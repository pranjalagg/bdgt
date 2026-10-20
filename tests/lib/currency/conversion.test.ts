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
