import { describe, it, expect } from 'vitest';
import { monthsWithData } from '$lib/ui/months';

describe('monthsWithData', () => {
  it('lists months that have data, newest first, without repeats', () => {
    expect(monthsWithData(['2026-09', '2026-10', '2026-09', '2025-01'], '2026-10')).toEqual(['2026-10', '2026-09', '2025-01']);
  });
  it('always includes the current month', () => {
    expect(monthsWithData(['2026-08'], '2026-10')).toEqual(['2026-10', '2026-08']);
  });
  it('leaves out months after the current one', () => {
    expect(monthsWithData(['2026-11', '2026-10'], '2026-10')).toEqual(['2026-10']);
  });
  it('keeps at most the limit', () => {
    expect(monthsWithData(['2026-01', '2026-02', '2026-03'], '2026-04', 2)).toEqual(['2026-04', '2026-03']);
  });
});
