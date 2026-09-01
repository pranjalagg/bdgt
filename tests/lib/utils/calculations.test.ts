import { describe, it, expect } from 'vitest';
import {
  calculateUnallocated,
  calculateBucketRemaining,
  getBucketStatus,
  calculateTotalSpent,
  filterFixedIncome,
  sumIncome,
  incomePercentage,
  calculateSavingsRate,
  spentExcludingSavings,
  accumulateRollovers
} from '$lib/utils/calculations';
import type { Bucket, Income } from '$lib/types';

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

  describe('calculateSavingsRate', () => {
    it('calculates percentage saved', () => {
      expect(calculateSavingsRate(100000, 70000)).toBe(30);
    });

    it('returns one decimal precision', () => {
      expect(calculateSavingsRate(100000, 66666)).toBe(33.3);
    });

    it('returns null for zero income', () => {
      expect(calculateSavingsRate(0, 5000)).toBeNull();
    });

    it('returns null for negative income', () => {
      expect(calculateSavingsRate(-10000, 5000)).toBeNull();
    });

    it('handles overspending (negative rate)', () => {
      expect(calculateSavingsRate(100000, 120000)).toBe(-20);
    });

    it('handles zero spending', () => {
      expect(calculateSavingsRate(100000, 0)).toBe(100);
    });
  });

  describe('spentExcludingSavings', () => {
    const txns = [
      { bucketId: 'rent', amount: 100000 },
      { bucketId: 'savings', amount: 50000 },
      { bucketId: 'invest', amount: 30000 },
      { bucketId: 'food', amount: 20000 },
    ];

    it('sums all spending when no buckets are savings', () => {
      expect(spentExcludingSavings(txns, new Set())).toBe(200000);
    });

    it('excludes transactions in savings buckets', () => {
      expect(spentExcludingSavings(txns, new Set(['savings', 'invest']))).toBe(120000);
    });

    it('accepts an array of savings ids', () => {
      expect(spentExcludingSavings(txns, ['savings'])).toBe(150000);
    });

    it('returns 0 for no transactions', () => {
      expect(spentExcludingSavings([], new Set(['savings']))).toBe(0);
    });
  });

  describe('accumulateRollovers', () => {
    const fixedBucket = (id: string, fixedAmount: number): Bucket => ({
      id, name: id, color: '#000', order: 0, isDefault: false,
      allocationType: 'fixed', fixedAmount, percentageAmount: 0, isSavings: false,
    });
    const pctBucket = (id: string, pct: number): Bucket => ({
      id, name: id, color: '#000', order: 0, isDefault: false,
      allocationType: 'percentage', fixedAmount: 0, percentageAmount: pct, isSavings: false,
    });

    it('carries unspent fixed allocation forward across months', () => {
      const rollovers = accumulateRollovers(
        ['2026-01', '2026-02'],
        [fixedBucket('groceries', 50000)],
        {},
        {},
        { '2026-01': { groceries: 30000 }, '2026-02': { groceries: 40000 } }
      );
      // Jan: 50000-30000=+20000, Feb: 50000-40000=+10000
      expect(rollovers.groceries).toBe(30000);
    });

    it('carries an overspend forward as negative', () => {
      const rollovers = accumulateRollovers(
        ['2026-01'],
        [fixedBucket('dining', 20000)],
        {},
        {},
        { '2026-01': { dining: 35000 } }
      );
      expect(rollovers.dining).toBe(-15000);
    });

    it('prefers a per-month allocation override over the bucket default', () => {
      const rollovers = accumulateRollovers(
        ['2026-01'],
        [fixedBucket('rent', 100000)],
        { '2026-01': { rent: 120000 } },
        {},
        { '2026-01': { rent: 120000 } }
      );
      // override matches spend exactly -> no carry (absent key reads as 0)
      expect(rollovers.rent ?? 0).toBe(0);
    });

    it('derives percentage-bucket allocation from that month\'s income', () => {
      const rollovers = accumulateRollovers(
        ['2026-01'],
        [pctBucket('savings', 10)],
        {},
        { '2026-01': 500000 },
        {}
      );
      // 10% of 5000.00 = 500.00 allocated, nothing spent
      expect(rollovers.savings).toBe(50000);
    });

    it('is empty when there are no prior months', () => {
      const rollovers = accumulateRollovers([], [fixedBucket('x', 1000)], {}, {}, {});
      expect(rollovers).toEqual({});
    });
  });
});
