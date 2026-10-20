import type { Row } from './registry';

export type { Row };

export type SyncErrorKind = 'network' | 'auth' | 'notAllowed' | 'schema' | 'rejected';

// Everything a transport can go wrong with, in terms the engine understands.
export class SyncError extends Error {
  constructor(readonly kind: SyncErrorKind, message: string) {
    super(message);
    this.name = 'SyncError';
  }
}

// A row as the server returns it: the mapped columns plus the sync columns.
export interface PulledRow extends Row {
  id: string;
  updated_at: string; // ISO; when the edit was made
  deleted_at: string | null;
  synced_at: string; // ISO; when the server stored it (drives pulls)
}

export interface StoredStamp {
  id: string;
  updated_at: string;
}

export interface AccountState {
  allowed: boolean; // the account's email is on the invite list
  schemaVersion: number; // migration level of the database
  buckets: PulledRow[]; // the account's live bucket rows (only when allowed)
  hasOtherRows: boolean; // any live row in any other table (only when allowed)
}

export interface SyncTransport {
  accountState(): Promise<AccountState>;
  // Rows to upsert, all with the same columns. Resolves with the rows the
  // server actually stored; a row it skipped because it held a newer edit is
  // absent. Rejects with SyncError('rejected') if the server refuses the batch.
  upsert(remote: string, rows: Row[]): Promise<StoredStamp[]>;
  // Rows with synced_at at or after `since` (everything when null), oldest
  // first, at most `limit`.
  pull(remote: string, since: string | null, limit: number): Promise<PulledRow[]>;
}
