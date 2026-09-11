import { describe, it, expect } from 'vitest';
import { dueOccurrences } from '$lib/stores/recurringStore';

describe('dueOccurrences', () => {
  it('returns nothing when the next due date is still in the future', () => {
    const next = new Date(2026, 5, 1);
    const until = new Date(2026, 4, 20);
    const result = dueOccurrences(next, 'monthly', until);
    expect(result.occurrences).toEqual([]);
    expect(result.nextDueDate.getTime()).toBe(next.getTime());
  });

  it('catches up every missed monthly occurrence in one pass', () => {
    const result = dueOccurrences(new Date(2026, 0, 15), 'monthly', new Date(2026, 3, 20));
    expect(result.occurrences.map((d) => d.getMonth())).toEqual([0, 1, 2, 3]);
    expect(result.nextDueDate.getMonth()).toBe(4); // May
  });

  it('catches up weekly occurrences', () => {
    const result = dueOccurrences(new Date(2026, 0, 1), 'weekly', new Date(2026, 0, 29));
    expect(result.occurrences).toHaveLength(5); // Jan 1, 8, 15, 22, 29
    expect(result.nextDueDate.getDate()).toBe(5); // Feb 5
  });

  it('advances biweekly by 14 days', () => {
    const result = dueOccurrences(new Date(2026, 0, 1), 'biweekly', new Date(2026, 0, 20));
    expect(result.occurrences).toHaveLength(2); // Jan 1, Jan 15
    expect(result.nextDueDate.getDate()).toBe(29);
  });

  it('caps runaway catch-up and fast-forwards past the cutoff', () => {
    const result = dueOccurrences(new Date(2000, 0, 1), 'weekly', new Date(2026, 0, 1));
    expect(result.occurrences.length).toBeLessThanOrEqual(366);
    expect(result.nextDueDate.getTime()).toBeGreaterThan(new Date(2026, 0, 1).getTime());
  });

  it('terminates instead of hanging on a frequency that never advances the cursor', () => {
    // An imported record can carry a frequency outside the TS union
    // (parseImport doesn't validate it). calculateNextDueDate's switch
    // has no default case, so an unknown frequency leaves cursor
    // unchanged -- this must not spin forever.
    const start = new Date(2020, 0, 1);
    const result = dueOccurrences(start, 'yearly' as never, new Date(2026, 0, 1));
    expect(result.occurrences).toEqual([]);
    expect(result.nextDueDate.getTime()).toBe(start.getTime());
  }, 2000);
});
