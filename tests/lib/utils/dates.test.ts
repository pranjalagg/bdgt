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
  getDayOfMonth,
  parseLocalDate,
  defaultEntryDate,
  reviveDateFields,
  getMonthKeysBetween
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

    it('start is at the very beginning of the first day', () => {
      const { start } = getMonthRange('2026-04');
      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);
      expect(start.getSeconds()).toBe(0);
      expect(start.getMilliseconds()).toBe(0);
    });

    it('end includes the entire last day of the month', () => {
      const { end } = getMonthRange('2026-04');
      expect(end.getHours()).toBe(23);
      expect(end.getMinutes()).toBe(59);
      expect(end.getSeconds()).toBe(59);
      expect(end.getMilliseconds()).toBe(999);
    });

    it('a transaction late on the last day falls within range', () => {
      const { start, end } = getMonthRange('2026-04');
      const lateOnLastDay = new Date(2026, 3, 30, 18, 30);
      expect(lateOnLastDay >= start && lateOnLastDay <= end).toBe(true);
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

  describe('parseLocalDate', () => {
    it('parses YYYY-MM-DD into local Date object', () => {
      const date = parseLocalDate('2026-06-27');
      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(5); // June is 5 (0-indexed)
      expect(date.getDate()).toBe(27);
    });
  });

  describe('defaultEntryDate', () => {
    it('returns today when the viewed month is the current month', () => {
      const today = new Date(2026, 8, 17, 10, 30);
      const result = defaultEntryDate('2026-09', today);
      expect(result.getFullYear()).toBe(2026);
      expect(result.getMonth()).toBe(8);
      expect(result.getDate()).toBe(17);
    });

    it('returns the first of the month when viewing a different month', () => {
      const today = new Date(2026, 8, 17);
      const result = defaultEntryDate('2026-04', today);
      expect(result.getFullYear()).toBe(2026);
      expect(result.getMonth()).toBe(3);
      expect(result.getDate()).toBe(1);
    });
  });

  describe('reviveDateFields', () => {
    it('converts an ISO string field to a real Date', () => {
      const record = { id: 'g1', createdAt: '2026-02-01T00:00:00.000Z' };
      const result = reviveDateFields(record, ['createdAt']);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect((result.createdAt as unknown as Date).toISOString()).toBe('2026-02-01T00:00:00.000Z');
    });

    it('leaves an already-Date field untouched', () => {
      const date = new Date(2026, 1, 1);
      const record = { createdAt: date };
      const result = reviveDateFields(record, ['createdAt']);
      expect(result.createdAt).toBe(date);
    });

    it('leaves a null or undefined field alone', () => {
      const record = { targetDate: undefined as unknown as string };
      const result = reviveDateFields(record, ['targetDate']);
      expect(result.targetDate).toBeUndefined();
    });

    it('does not mutate the original record', () => {
      const record = { createdAt: '2026-02-01T00:00:00.000Z' };
      reviveDateFields(record, ['createdAt']);
      expect(typeof record.createdAt).toBe('string');
    });

    it('handles multiple fields on the same record', () => {
      const record = { createdAt: '2026-01-01T00:00:00.000Z', targetDate: '2026-12-01T00:00:00.000Z' };
      const result = reviveDateFields(record, ['createdAt', 'targetDate']);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.targetDate).toBeInstanceOf(Date);
    });
  });

  describe('getMonthKeysBetween', () => {
    it('returns every month inclusive of both ends', () => {
      expect(getMonthKeysBetween('2026-01', '2026-04')).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
    });

    it('spans a year boundary', () => {
      expect(getMonthKeysBetween('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    });

    it('returns a single month when start equals end', () => {
      expect(getMonthKeysBetween('2026-03', '2026-03')).toEqual(['2026-03']);
    });

    it('returns an empty array when start is after end', () => {
      expect(getMonthKeysBetween('2026-05', '2026-01')).toEqual([]);
    });
  });
});

