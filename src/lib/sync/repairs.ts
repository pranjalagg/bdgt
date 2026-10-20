import type { BudgetDatabase } from '$lib/db';
import { UNSORTED_BUCKET_ID, findOrphans, makeUnsortedBucket } from '$lib/utils/unsorted';
import { autoTransaction } from './transactions';

// Two devices can make edits that are each fine alone but inconsistent
// together. After a pull, put the data back in a consistent shape with
// automatic writes (stamped so a real edit elsewhere always wins).
export async function repairAfterPull(db: BudgetDatabase): Promise<boolean> {
  let changed = false;
  await autoTransaction(db, [db.buckets, db.transactions, db.investmentLots, db.investmentSells], async () => {
    const [buckets, transactions, lots, sells] = await Promise.all([
      db.buckets.toArray(),
      db.transactions.toArray(),
      db.investmentLots.toArray(),
      db.investmentSells.toArray(),
    ]);

    // A transaction whose bucket was deleted elsewhere: file it under
    // Unsorted instead of letting it vanish from every view.
    const orphans = findOrphans(transactions, buckets.map((b) => b.id));
    if (orphans.length > 0) {
      if (!buckets.some((b) => b.id === UNSORTED_BUCKET_ID)) {
        await db.buckets.add(makeUnsortedBucket(Math.max(-1, ...buckets.map((b) => b.order)) + 1));
      }
      await db.transactions.bulkUpdate(orphans.map((t) => ({ key: t.id, changes: { bucketId: UNSORTED_BUCKET_ID } })));
      changed = true;
    }

    // Two devices selling from one lot each raise soldShares from the same
    // starting point. The sell records are the truth: raise the count to
    // their total, never lower it (lots sold before sell records existed keep
    // theirs) and never above what the lot holds.
    const soldByLot = new Map<string, number>();
    for (const s of sells) soldByLot.set(s.lotId, (soldByLot.get(s.lotId) ?? 0) + s.shares);
    for (const lot of lots) {
      const sold = soldByLot.get(lot.id);
      if (sold !== undefined && sold - lot.soldShares > 1e-9) {
        await db.investmentLots.update(lot.id, { soldShares: Math.min(sold, lot.shares) });
        changed = true;
      }
    }
  });
  return changed;
}
