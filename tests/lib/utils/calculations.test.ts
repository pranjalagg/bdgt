import { describe, it, expect } from 'vitest';
import {
  calculateUnallocated,
  calculateBucketRemaining,
  getBucketStatus,
  calculateTotalSpent,
  filterFixedIncome,
  sumIncome,
  incomePercentage
} from '$lib/utils/calculations';
import type { Income } from '$lib/types';

describe('budget calculations', () => {
  describe('calculateUnallocated', () => {
    it('returns income minus allocations', () => {
      const income = 500000; // $5000
      const allocations = { a: 200000, b: 150000, c: 100000 };
      expect(calculateUnallocated(income, allocations)).toBe(50000);
    });

    it('returns negative when over-allocated', () => {
      const income = 100000;
      const allocations = { a: 60000, b: 60000 };
      expect(calculateUnallocated(income, allocations)).toBe(-20000);
    });

    it('handles empty allocations', () => {
      expect(calculateUnallocated(100000, {})).toBe(100000);
    });
  });

  describe('calculateBucketRemaining', () => {
    it('calculates remaining with rollover', () => {
      expect(calculateBucketRemaining(10000, 3000, 500)).toBe(7500);
    });

    it('handles negative remaining (overspent)', () => {
      expect(calculateBucketRemaining(10000, 12000, 0)).toBe(-2000);
    });

    it('handles negative spending (credit increases remaining beyond allocation)', () => {
      expect(calculateBucketRemaining(10000, -3000, 0)).toBe(13000);
    });

    it('handles negative spending with rollover', () => {
      expect(calculateBucketRemaining(10000, -2000, 500)).toBe(12500);
    });
  });

  describe('getBucketStatus', () => {
    it('returns success for healthy budget', () => {
      expect(getBucketStatus(10000, 3000)).toBe('success');
    });

    it('returns success when nothing spent', () => {
      expect(getBucketStatus(10000, 0)).toBe('success');
    });

    it('returns warning when near budget limit', () => {
      expect(getBucketStatus(10000, 9500)).toBe('warning');
    });

    it('returns warning at exactly 90%', () => {
      expect(getBucketStatus(10000, 9000)).toBe('warning');
    });

    it('returns danger when overspent', () => {
      expect(getBucketStatus(10000, 12000)).toBe('danger');
    });

    it('returns credit when spending is negative', () => {
      expect(getBucketStatus(10000, -3000)).toBe('credit');
    });

    it('returns credit for any negative amount', () => {
      expect(getBucketStatus(10000, -100)).toBe('credit');
    });

    it('returns credit even with zero allocation', () => {
      expect(getBucketStatus(0, -5000)).toBe('credit');
    });
  });

  describe('calculateTotalSpent', () => {
    it('sums all bucket spending', () => {
      const spent = { a: 5000, b: 3000, c: 2000 };
      expect(calculateTotalSpent(spent)).toBe(10000);
    });

    it('returns 0 for empty', () => {
      expect(calculateTotalSpent({})).toBe(0);
    });
  });

  describe('filterFixedIncome', () => {
    const makeIncome = (amount: number, type: 'fixed' | 'one-time'): Income => ({
      id: crypto.randomUUID(),
      amount,
      date: new Date(),
      isRecurring: false,
      type,
    });

    it('filters only fixed income entries', () => {
      const incomes = [
        makeIncome(500000, 'fixed'),
        makeIncome(100000, 'one-time'),
        makeIncome(200000, 'fixed'),
      ];
      const result = filterFixedIncome(incomes);
      expect(result).toHaveLength(2);
      expect(result.every((i) => i.type === 'fixed')).toBe(true);
    });

    it('returns empty array when no fixed income', () => {
      const incomes = [makeIncome(100000, 'one-time')];
      expect(filterFixedIncome(incomes)).toHaveLength(0);
    });

    it('returns all when all are fixed', () => {
      const incomes = [makeIncome(300000, 'fixed'), makeIncome(200000, 'fixed')];
      expect(filterFixedIncome(incomes)).toHaveLength(2);
    });

    it('handles empty array', () => {
      expect(filterFixedIncome([])).toHaveLength(0);
    });

    it('handles incomes without type field as non-fixed', () => {
      const legacy = { id: '1', amount: 100000, date: new Date(), isRecurring: false } as Income;
      expect(filterFixedIncome([legacy])).toHaveLength(0);
    });
  });

  describe('sumIncome', () => {
    const makeIncome = (amount: number, type: 'fixed' | 'one-time'): Income => ({
      id: crypto.randomUUID(),
      amount,
      date: new Date(),
      isRecurring: false,
      type,
    });

    it('sums all income amounts', () => {
      const incomes = [makeIncome(500000, 'fixed'), makeIncome(100000, 'one-time')];
      expect(sumIncome(incomes)).toBe(600000);
    });

    it('returns 0 for empty array', () => {
      expect(sumIncome([])).toBe(0);
    });
  });

  describe('incomePercentage', () => {
    it('calculates percentage of fixed income', () => {
      expect(incomePercentage(30000, 500000)).toBe(6);
    });

    it('returns null when fixed income is 0', () => {
      expect(incomePercentage(30000, 0)).toBeNull();
    });

    it('returns null when spent is 0', () => {
      expect(incomePercentage(0, 500000)).toBeNull();
    });

    it('returns null when both are 0', () => {
      expect(incomePercentage(0, 0)).toBeNull();
    });

    it('returns null for negative income', () => {
      expect(incomePercentage(10000, -5000)).toBeNull();
    });

    it('returns null for negative spent', () => {
      expect(incomePercentage(-5000, 500000)).toBeNull();
    });

    it('handles percentage over 100', () => {
      expect(incomePercentage(600000, 500000)).toBe(120);
    });

    it('rounds to one decimal place', () => {
      expect(incomePercentage(33333, 500000)).toBe(6.7);
    });
  });
});
