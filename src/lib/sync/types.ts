import type { BudgetDatabase } from '$lib/db';
import type { SyncTransport } from './transport';

// A change waiting to be uploaded. One entry per record (key `table:id`),
// so repeated edits of one record collapse into the latest.
export interface SyncOutboxEntry {
  key: string;
  table: string; // Dexie table name
  id: string;
  op: 'upsert' | 'delete';
  at: number; // edit time, ms since epoch
  parked?: boolean; // the server rejected this row; kept but not retried automatically
  error?: string;
}

// The edit time of the version of a record this device holds.
export interface SyncVersion {
  key: string; // `table:id`
  at: number;
}

export interface SyncStateRow {
  key: string;
  value: unknown;
}

export interface SyncContext {
  db: BudgetDatabase;
  transport: SyncTransport;
}
