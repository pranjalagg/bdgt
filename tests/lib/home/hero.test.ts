import { describe, it, expect } from 'vitest';
import { heroMode, planDiff } from '$lib/home/hero';

describe('Home hero', () => {
  it('speaks about today only in the current month', () => {
    expect(heroMode('2026-10', new Date(2026, 9, 23))).toBe('today');
    expect(heroMode('2026-09', new Date(2026, 9, 23))).toBe('past');
    expect(heroMode('2026-11', new Date(2026, 9, 23))).toBe('future');
  });
  it('is positive when everyday spending is under the plan so far', () => {
    expect(planDiff(77997, 125000, 23, 31)).toBe(14745);
    expect(planDiff(100000, 62000, 31, 31)).toBe(-38000);
  });
});
