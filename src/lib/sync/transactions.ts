import type Dexie from 'dexie';
import type { Table } from 'dexie';
import { markTransaction, type WriteKind } from './capture';

function run<T>(kind: WriteKind, db: Dexie, tables: Table[], fn: () => Promise<T>): Promise<T> {
  return db.transaction('rw', tables, async () => {
    markTransaction(kind);
    return fn();
  });
}

// Writes the app makes on its own (default buckets, recurring items,
// repairs). Stamped minimally newer than what they replace so any person's
// edit beats them.
export function autoTransaction<T>(db: Dexie, tables: Table[], fn: () => Promise<T>): Promise<T> {
  return run('auto', db, tables, fn);
}

// Applying what the server sent: never queued for upload again.
export function remoteTransaction<T>(db: Dexie, tables: Table[], fn: () => Promise<T>): Promise<T> {
  return run('remote', db, tables, fn);
}

// Wiping this device (sign-out, "use account data"): not a deletion to sync.
export function resetTransaction<T>(db: Dexie, tables: Table[], fn: () => Promise<T>): Promise<T> {
  return run('reset', db, tables, fn);
}
