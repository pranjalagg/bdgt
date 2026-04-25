import { describe, it, expect } from 'vitest';
import {
  calculateUnallocated,
  calculateBucketRemaining,
  getBucketStatus,
  calculateTotalSpent
} from '$lib/utils/calculations';

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
});
