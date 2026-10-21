import type { BudgetDatabase } from '$lib/db';
import type { SyncOutboxEntry } from './types';

// Changes the server refused are parked: kept, flagged, and left alone by
// later uploads. These are what the Settings screen offers to retry or drop.

export async function syncCounts(db: BudgetDatabase): Promise<{ waiting: number; parked: number }> {
  const entries = await db.syncOutbox.toArray();
  const parked = entries.filter((e) => e.parked).length;
  return { waiting: entries.length - parked, parked };
}

export function listParked(db: BudgetDatabase): Promise<SyncOutboxEntry[]> {
  return db.syncOutbox.filter((e) => e.parked === true).toArray();
}

// Back into the queue, to be tried again on the next sync.
export async function retryParked(db: BudgetDatabase): Promise<number> {
  const parked = await listParked(db);
  await db.syncOutbox.bulkPut(parked.map(({ parked: _p, error: _e, ...rest }) => rest));
  return parked.length;
}

// Stop trying. The records stay on this device; they just are not uploaded
// until they are edited again.
export async function discardParked(db: BudgetDatabase): Promise<number> {
  const parked = await listParked(db);
  await db.syncOutbox.bulkDelete(parked.map((e) => e.key));
  return parked.length;
}
