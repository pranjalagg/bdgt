import { describe, it, expect } from 'vitest';
import { completeMonths, monthlyTotals, WINDOW_MONTHS } from '$lib/insights/monthlySeries';

describe('completeMonths', () => {
  it('returns the months before now, oldest first, excluding the current month', () => {
    expect(completeMonths(new Date(2026, 9, 15), 3)).toEqual(['2026-07', '2026-08', '2026-09']);
  });

  it('counts the month just ended as complete on the 1st of a month', () => {
    expect(completeMonths(new Date(2026, 9, 1), 2)).toEqual(['2026-08', '2026-09']);
  });

  it('defaults to the 12-month window and crosses a year boundary', () => {
    const months = completeMonths(new Date(2026, 1, 10));
    expect(months).toHaveLength(WINDOW_MONTHS);
    expect(months[0]).toBe('2025-02');
    expect(months[11]).toBe('2026-01');
  });
});

describe('monthlyTotals', () => {
  it('sums per bucket per month in cents', () => {
    const totals = monthlyTotals([
      { bucketId: 'a', amount: 1000, date: new Date(2026, 7, 3) },
      { bucketId: 'a', amount: 250, date: new Date(2026, 7, 20) },
      { bucketId: 'a', amount: 400, date: new Date(2026, 8, 1) },
      { bucketId: 'b', amount: 99, date: new Date(2026, 8, 5) },
    ]);
    expect(totals.get('a')?.get('2026-08')).toBe(1250);
    expect(totals.get('a')?.get('2026-09')).toBe(400);
    expect(totals.get('b')?.get('2026-09')).toBe(99);
  });

  it('keeps refunds as negative totals, including a net-negative month', () => {
    const totals = monthlyTotals([
      { bucketId: 'a', amount: 300, date: new Date(2026, 7, 3) },
      { bucketId: 'a', amount: -800, date: new Date(2026, 7, 9) },
    ]);
    expect(totals.get('a')?.get('2026-08')).toBe(-500);
  });

  it('accepts ISO date strings', () => {
    const totals = monthlyTotals([{ bucketId: 'a', amount: 5, date: '2026-08-15T12:00:00.000Z' }]);
    expect(totals.get('a')?.get('2026-08')).toBe(5);
  });
});
