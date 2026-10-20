import type Dexie from 'dexie';

export const LINKED_ACCOUNT = 'linkedAccount';
export const INITIAL_SYNC_PENDING = 'initialSyncPending';

export function cursorKey(remote: string): string {
  return `cursor:${remote}`;
}

export async function getState<T>(db: Dexie, key: string): Promise<T | undefined> {
  const row = await db.table('syncState').get(key);
  return row?.value as T | undefined;
}

export async function setState(db: Dexie, key: string, value: unknown): Promise<void> {
  await db.table('syncState').put({ key, value });
}

// True from the moment a device starts signing in until its first sync has
// finished: default buckets must not be created in that window or they would
// duplicate the account's.
export async function isInitialSyncPending(db: Dexie): Promise<boolean> {
  return (await getState<boolean>(db, INITIAL_SYNC_PENDING)) === true;
}
