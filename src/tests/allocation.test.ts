import { describe, it, expect } from 'vitest';
import { computeAllocation, getTotalPercentage } from '$lib/utils/calculations';
import type { Bucket } from '$lib/types';

function createBucket(overrides: Partial<Bucket> = {}): Bucket {
  return {
    id: 'test-id',
    name: 'Test Bucket',
    color: '#000000',
    order: 0,
    isDefault: false,
    allocationType: 'fixed',
    fixedAmount: 0,
    percentageAmount: 0,
    ...overrides
  };
}

describe('computeAllocation', () => {
  it('returns fixedAmount for fixed allocation type', () => {
    const bucket = createBucket({ allocationType: 'fixed', fixedAmount: 50000 });
    expect(computeAllocation(bucket, 100000)).toBe(50000);
  });

  it('returns percentage of income for percentage allocation type', () => {
    const bucket = createBucket({ allocationType: 'percentage', percentageAmount: 25 });
    expect(computeAllocation(bucket, 100000)).toBe(25000);
  });

  it('returns sum of fixed and percentage for hybrid allocation type', () => {
    const bucket = createBucket({
      allocationType: 'hybrid',
      fixedAmount: 10000,
      percentageAmount: 10
    });
    expect(computeAllocation(bucket, 100000)).toBe(20000);
  });

  it('handles zero income for percentage allocation', () => {
    const bucket = createBucket({ allocationType: 'percentage', percentageAmount: 50 });
    expect(computeAllocation(bucket, 0)).toBe(0);
  });

  it('handles missing fixedAmount and percentageAmount', () => {
    const bucket = createBucket({ allocationType: 'fixed' });
    // @ts-expect-error - testing missing fields
    delete bucket.fixedAmount;
    // @ts-expect-error - testing missing fields
    delete bucket.percentageAmount;
    expect(computeAllocation(bucket, 100000)).toBe(0);
  });

  it('rounds percentage calculations to nearest cent', () => {
    const bucket = createBucket({ allocationType: 'percentage', percentageAmount: 33 });
    expect(computeAllocation(bucket, 100)).toBe(33);
  });

  it('defaults to fixed for unknown allocation type', () => {
    const bucket = createBucket({ fixedAmount: 5000 });
    // @ts-expect-error - testing unknown type
    bucket.allocationType = 'unknown';
    expect(computeAllocation(bucket, 100000)).toBe(5000);
  });
});

describe('getTotalPercentage', () => {
  it('returns sum of all bucket percentages', () => {
    const buckets = [
      createBucket({ percentageAmount: 25 }),
      createBucket({ percentageAmount: 30 }),
      createBucket({ percentageAmount: 15 })
    ];
    expect(getTotalPercentage(buckets)).toBe(70);
  });

  it('returns 0 for empty bucket array', () => {
    expect(getTotalPercentage([])).toBe(0);
  });

  it('handles buckets with missing percentageAmount', () => {
    const buckets = [
      createBucket({ percentageAmount: 20 }),
      createBucket({})
    ];
    // @ts-expect-error - testing missing field
    delete buckets[1].percentageAmount;
    expect(getTotalPercentage(buckets)).toBe(20);
  });

  it('handles buckets with zero percentageAmount', () => {
    const buckets = [
      createBucket({ percentageAmount: 50 }),
      createBucket({ percentageAmount: 0 })
    ];
    expect(getTotalPercentage(buckets)).toBe(50);
  });
});
