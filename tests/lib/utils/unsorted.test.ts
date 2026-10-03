import { describe, it, expect } from 'vitest';
import { findOrphans, makeUnsortedBucket, UNSORTED_BUCKET_ID } from '$lib/utils/unsorted';

describe('findOrphans', () => {
  it('returns transactions whose bucket is not in the list', () => {
    const txs = [{ bucketId: 'a' }, { bucketId: 'gone' }, { bucketId: 'b' }];
    expect(findOrphans(txs, ['a', 'b'])).toEqual([{ bucketId: 'gone' }]);
  });

  it('returns nothing when every bucket exists', () => {
    expect(findOrphans([{ bucketId: 'a' }], ['a'])).toEqual([]);
  });
});

describe('makeUnsortedBucket', () => {
  it('is a zero-budget system bucket outside safe-to-spend and savings', () => {
    const b = makeUnsortedBucket(5, new Date(2026, 9, 1));
    expect(b).toMatchObject({
      id: UNSORTED_BUCKET_ID, order: 5, fixedAmount: 0,
      isSystem: true, isEveryday: false, isSavings: false,
    });
  });
});
