import { describe, it, expect } from 'vitest';
import { holdingValuation, realizedGain } from '$lib/utils/investments';

describe('holdingValuation', () => {
  it('returns nulls when the current price is unknown', () => {
    const v = holdingValuation(10, 150000, undefined);
    expect(v).toEqual({ marketValue: null, unrealizedGain: null, unrealizedGainPct: null });
  });

  it('computes market value, gain and percent when priced', () => {
    // 10 shares, cost basis $1500.00, now $180.00/share
    const v = holdingValuation(10, 150000, 18000);
    expect(v.marketValue).toBe(180000);
    expect(v.unrealizedGain).toBe(30000);
    expect(v.unrealizedGainPct).toBe(20);
  });

  it('handles a loss', () => {
    const v = holdingValuation(5, 100000, 16000); // now worth 80000
    expect(v.unrealizedGain).toBe(-20000);
    expect(v.unrealizedGainPct).toBe(-20);
  });

  it('returns null percent when cost basis is zero', () => {
    const v = holdingValuation(1, 0, 5000);
    expect(v.unrealizedGainPct).toBeNull();
  });
});

describe('realizedGain', () => {
  it('is zero with no sells', () => {
    expect(realizedGain([], {})).toBe(0);
  });

  it('sums proceeds above cost basis across sells', () => {
    const sells = [
      { lotId: 'a', shares: 5, pricePerShare: 20000 }, // basis 15000 -> +25000
      { lotId: 'b', shares: 2, pricePerShare: 9000 },  // basis 10000 -> -2000
    ];
    expect(realizedGain(sells, { a: 15000, b: 10000 })).toBe(23000);
  });

  it('treats an unknown lot as zero cost basis', () => {
    expect(realizedGain([{ lotId: 'x', shares: 1, pricePerShare: 5000 }], {})).toBe(5000);
  });
});
