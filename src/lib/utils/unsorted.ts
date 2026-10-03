import type { Bucket, Transaction } from '$lib/types';

// Transactions are never deleted because their bucket went away. They
// land in this system bucket instead, so nothing silently disappears and
// the user can re-file them one by one. It exists only while it holds
// something (see pruneUnsortedBucket in the store).
export const UNSORTED_BUCKET_ID = 'unsorted';
export const UNSORTED_NAME = 'Unsorted';

export function makeUnsortedBucket(order: number, now: Date = new Date()): Bucket {
  return {
    id: UNSORTED_BUCKET_ID,
    name: UNSORTED_NAME,
    color: '#94a3b8',
    order,
    isDefault: false,
    allocationType: 'fixed',
    fixedAmount: 0,
    percentageAmount: 0,
    isSavings: false,
    isEveryday: false, // never part of "safe to spend"
    // Stamped "now" so months before it carry no phantom rollover debt.
    createdAt: now,
    isSystem: true,
  };
}

export function findOrphans<T extends Pick<Transaction, 'bucketId'>>(
  transactions: T[],
  bucketIds: Iterable<string>
): T[] {
  const live = new Set(bucketIds);
  return transactions.filter((t) => !live.has(t.bucketId));
}
