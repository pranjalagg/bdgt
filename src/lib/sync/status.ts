// What the sync service reports, and which states the person has to look at.
// Kept apart from the service so the wording code can use it on its own.

export type SyncState = 'off' | 'idle' | 'syncing' | 'offline' | 'auth' | 'notAllowed' | 'schema';

export interface SyncStatus {
  state: SyncState;
  lastSyncedAt: number | null;
  waiting: number; // changes not yet uploaded
  parked: number; // changes the server refused
  message: string; // the server's or network's own words, for the Settings screen
}

export const OFF_STATUS: SyncStatus = { state: 'off', lastSyncedAt: null, waiting: 0, parked: 0, message: '' };

// Statuses the person should look at, not just glance past.
export function needsAttention(s: SyncStatus): boolean {
  return s.state === 'auth' || s.state === 'notAllowed' || s.state === 'schema' || s.parked > 0;
}
