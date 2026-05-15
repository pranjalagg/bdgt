import { describe, it, expect } from 'vitest';
import {
  getMonthKey,
  parseMonthKey,
  getCurrentMonthKey,
  getPreviousMonthKey,
  getNextMonthKey,
  formatDate,
  isCurrentMonth,
  getMonthRange,
  getLast6Months,
  getDaysInMonth,
  getDayOfMonth
} from '$lib/utils/dates';

describe('date utils', () => {
  describe('getMonthKey', () => {
    it('returns YYYY-MM format', () => {
      expect(getMonthKey(new Date(2026, 3, 15))).toBe('2026-04');
      expect(getMonthKey(new Date(2026, 11, 1))).toBe('2026-12');
    });
  });

  describe('parseMonthKey', () => {
    it('returns first day of month', () => {
      const date = parseMonthKey('2026-04');
      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(3); // April = 3 (0-indexed)
      expect(date.getDate()).toBe(1);
    });
  });

  describe('getPreviousMonthKey', () => {
    it('returns previous month', () => {
      expect(getPreviousMonthKey('2026-04')).toBe('2026-03');
      expect(getPreviousMonthKey('2026-01')).toBe('2025-12');
    });
  });

  describe('getNextMonthKey', () => {
    it('returns next month', () => {
      expect(getNextMonthKey('2026-04')).toBe('2026-05');
      expect(getNextMonthKey('2026-12')).toBe('2027-01');
    });
  });

  describe('getMonthRange', () => {
    it('returns start and end of month', () => {
      const { start, end } = getMonthRange('2026-04');
      expect(start.getDate()).toBe(1);
      expect(end.getDate()).toBe(30);
      expect(end.getMonth()).toBe(3);
    });
  });

  describe('formatDate', () => {
    it('formats date for display', () => {
      const result = formatDate(new Date(2026, 3, 15));
      expect(result).toContain('Apr');
      expect(result).toContain('15');
    });
  });

  describe('getLast6Months', () => {
    it('returns 6 month keys ending with current month', () => {
      const months = getLast6Months('2026-05');
      expect(months).toHaveLength(6);
      expect(months[5]).toBe('2026-05');
      expect(months[0]).toBe('2025-12');
    });

    it('handles year boundary', () => {
      const months = getLast6Months('2026-02');
      expect(months).toEqual(['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
    });
  });

  describe('getDaysInMonth', () => {
    it('returns 31 for January', () => {
      expect(getDaysInMonth('2026-01')).toBe(31);
    });

    it('returns 28 for non-leap February', () => {
      expect(getDaysInMonth('2026-02')).toBe(28);
    });

    it('returns 29 for leap year February', () => {
      expect(getDaysInMonth('2024-02')).toBe(29);
    });

    it('returns 30 for April', () => {
      expect(getDaysInMonth('2026-04')).toBe(30);
    });
  });

  describe('getDayOfMonth', () => {
    it('returns day number from date', () => {
      expect(getDayOfMonth(new Date(2026, 4, 14))).toBe(14);
    });

    it('returns 1 for first of month', () => {
      expect(getDayOfMonth(new Date(2026, 0, 1))).toBe(1);
    });
  });
});
