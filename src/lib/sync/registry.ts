import { getLocalDateKey } from '$lib/utils/dates';

// Which Dexie tables sync, and how each record maps to a Postgres row.
// Declarative on purpose: push, pull and the first-sign-in code are generic
// over this list, so adding a field is one line here plus a SQL migration.

export type Row = Record<string, unknown>;

export type FieldType = 'text' | 'int' | 'numeric' | 'bool' | 'cents' | 'date' | 'timestamp' | 'epochMs' | 'json';

export interface FieldDef {
  prop: string; // record property; a dotted path ('foreign.amount') flattens a nested object
  col: string; // Postgres column
  type: FieldType;
}

export interface CollectionDef {
  table: string; // Dexie table
  remote: string; // Postgres table
  keyProp: string; // record property holding the id
  fields: FieldDef[];
}

const f = (prop: string, col: string, type: FieldType): FieldDef => ({ prop, col, type });

// Push order: a table's dependencies come first.
export const COLLECTIONS: CollectionDef[] = [
  { table: 'settings', remote: 'settings', keyProp: 'key', fields: [f('value', 'value', 'json')] },
  {
    table: 'buckets', remote: 'buckets', keyProp: 'id',
    fields: [
      f('name', 'name', 'text'), f('color', 'color', 'text'), f('order', 'sort_order', 'int'),
      f('isDefault', 'is_default', 'bool'), f('allocationType', 'allocation_type', 'text'),
      f('fixedAmount', 'fixed_amount_cents', 'cents'), f('percentageAmount', 'percentage', 'numeric'),
      f('isSavings', 'is_savings', 'bool'), f('isEveryday', 'is_everyday', 'bool'),
      f('isSystem', 'is_system', 'bool'), f('createdAt', 'created_at', 'timestamp'),
    ],
  },
  {
    table: 'allocations', remote: 'allocations', keyProp: 'id',
    fields: [f('month', 'month', 'text'), f('bucketId', 'bucket_id', 'text'), f('amount', 'amount_cents', 'cents')],
  },
  {
    table: 'monthNotes', remote: 'month_notes', keyProp: 'id',
    fields: [f('month', 'month', 'text'), f('text', 'text', 'text'), f('effect', 'effect', 'text'), f('createdAt', 'created_at', 'epochMs')],
  },
  {
    table: 'recurringTransactions', remote: 'recurring_transactions', keyProp: 'id',
    fields: [
      f('bucketId', 'bucket_id', 'text'), f('amount', 'amount_cents', 'cents'), f('frequency', 'frequency', 'text'),
      f('dayOfMonth', 'day_of_month', 'int'), f('nextDueDate', 'next_due_date', 'date'),
      f('note', 'note', 'text'), f('isActive', 'is_active', 'bool'),
    ],
  },
  {
    table: 'transactions', remote: 'transactions', keyProp: 'id',
    fields: [
      f('bucketId', 'bucket_id', 'text'), f('date', 'date', 'date'), f('amount', 'amount_cents', 'cents'),
      f('note', 'note', 'text'), f('recurringId', 'recurring_id', 'text'), f('createdAt', 'created_at', 'epochMs'),
      f('foreign.amount', 'foreign_amount_minor', 'cents'), f('foreign.currency', 'foreign_currency', 'text'),
      f('foreign.rate', 'foreign_rate', 'numeric'), f('foreign.base', 'foreign_base', 'text'),
    ],
  },
  {
    table: 'captures', remote: 'captures', keyProp: 'id',
    fields: [
      f('status', 'status', 'text'), f('source', 'source', 'text'), f('sourceLabel', 'source_label', 'text'),
      f('postedAt', 'posted_at', 'epochMs'), f('date', 'date', 'date'), f('amount', 'amount_minor', 'cents'),
      f('currency', 'currency', 'text'), f('merchant', 'merchant', 'text'), f('payeeKey', 'payee_key', 'text'),
      f('kind', 'kind', 'text'), f('accountHint', 'account_hint', 'text'), f('hint', 'hint', 'text'),
      f('duplicateOf', 'duplicate_of', 'text'), f('transactionId', 'transaction_id', 'text'),
      f('resolvedAt', 'resolved_at', 'epochMs'),
    ],
  },
  {
    table: 'captureRules', remote: 'capture_rules', keyProp: 'id',
    fields: [f('payeeKey', 'payee_key', 'text'), f('merchant', 'merchant', 'text'), f('action', 'action', 'text'), f('bucketId', 'bucket_id', 'text')],
  },
  {
    table: 'incomes', remote: 'incomes', keyProp: 'id',
    fields: [
      f('date', 'date', 'date'), f('amount', 'amount_cents', 'cents'), f('note', 'note', 'text'),
      f('isRecurring', 'is_recurring', 'bool'), f('type', 'type', 'text'),
    ],
  },
  {
    table: 'savingsGoals', remote: 'savings_goals', keyProp: 'id',
    fields: [
      f('name', 'name', 'text'), f('bucketId', 'bucket_id', 'text'), f('targetAmount', 'target_amount_cents', 'cents'),
      f('targetDate', 'target_date', 'date'), f('monthlyContribution', 'monthly_contribution_cents', 'cents'),
      f('startingBalance', 'starting_balance_cents', 'cents'), f('createdAt', 'created_at', 'timestamp'),
    ],
  },
  {
    table: 'investmentLots', remote: 'investment_lots', keyProp: 'id',
    fields: [
      f('symbol', 'symbol', 'text'), f('shares', 'shares', 'numeric'), f('pricePerShare', 'price_per_share_cents', 'cents'),
      f('purchaseDate', 'purchase_date', 'date'), f('note', 'note', 'text'), f('soldShares', 'sold_shares', 'numeric'),
    ],
  },
  {
    table: 'investmentSells', remote: 'investment_sells', keyProp: 'id',
    fields: [
      f('lotId', 'lot_id', 'text'), f('shares', 'shares', 'numeric'), f('pricePerShare', 'price_per_share_cents', 'cents'),
      f('sellDate', 'sell_date', 'date'), f('note', 'note', 'text'),
    ],
  },
  {
    table: 'investmentPrices', remote: 'investment_prices', keyProp: 'symbol',
    fields: [
      f('symbol', 'symbol', 'text'), f('pricePerShare', 'price_per_share_cents', 'cents'),
      f('updatedAt', 'price_updated_at', 'timestamp'),
    ],
  },
];

// Bookkeeping tables: never synced, never captured.
export const SYNC_TABLES = ['syncOutbox', 'syncVersions', 'syncState'];

const BY_TABLE = new Map(COLLECTIONS.map((c) => [c.table, c]));

export function collectionByTable(name: string): CollectionDef | undefined {
  return BY_TABLE.get(name);
}

export function isSyncedTable(name: string): boolean {
  return BY_TABLE.has(name);
}

function getPath(record: Record<string, unknown>, path: string): unknown {
  let cur: unknown = record;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function setPath(record: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur = record;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]];
    cur = (typeof next === 'object' && next !== null ? next : (cur[parts[i]] = {})) as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function encode(type: FieldType, value: unknown): unknown {
  if (value === undefined || value === null) return null;
  switch (type) {
    case 'date': {
      const d = new Date(value as Date | string);
      return Number.isNaN(d.getTime()) ? null : getLocalDateKey(d);
    }
    case 'timestamp': {
      const d = new Date(value as Date | string);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    case 'epochMs':
      return typeof value === 'number' && Number.isFinite(value) ? new Date(value).toISOString() : null;
    default:
      return value;
  }
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})/;

function decode(type: FieldType, value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  switch (type) {
    case 'date': {
      const m = typeof value === 'string' ? DATE_ONLY.exec(value) : null;
      return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
    }
    case 'timestamp': {
      const d = new Date(value as string);
      return Number.isNaN(d.getTime()) ? undefined : d;
    }
    case 'epochMs': {
      const ms = typeof value === 'string' ? Date.parse(value) : NaN;
      return Number.isNaN(ms) ? undefined : ms;
    }
    case 'int':
    case 'numeric':
    case 'cents': {
      if (typeof value === 'string') {
        const n = Number(value);
        return Number.isNaN(n) ? undefined : n;
      }
      return value;
    }
    default:
      return value;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// The row for a record: id, one column per mapped field, and everything the
// mapping does not know in `extra`, so a forgotten migration never drops data.
export function toRow(def: CollectionDef, record: Record<string, unknown>): Row {
  const row: Row = { id: String(record[def.keyProp]) };
  const claimed = new Set<string>([def.keyProp]);
  for (const field of def.fields) {
    claimed.add(field.prop.split('.')[0]);
    row[field.col] = encode(field.type, getPath(record, field.prop));
  }
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (!claimed.has(k) && v !== undefined) extra[k] = v;
  }
  row.extra = extra;
  return row;
}

export function fromRow(def: CollectionDef, row: Row): Record<string, unknown> {
  const record: Record<string, unknown> = isPlainObject(row.extra) ? { ...row.extra } : {};
  for (const field of def.fields) {
    const value = decode(field.type, row[field.col]);
    if (value !== undefined) setPath(record, field.prop, value);
  }
  record[def.keyProp] = row.id;
  return record;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

// A value in a form that does not depend on how the database wrote it:
// Postgres returns a timestamp as 2026-01-01T00:00:00+00:00 where this app
// sent 2026-01-01T00:00:00.000Z, a date may carry a time part, and a number
// may arrive as a string.
function comparable(type: FieldType, value: unknown): unknown {
  if (value === undefined || value === null) return null;
  switch (type) {
    case 'timestamp':
    case 'epochMs': {
      const ms = Date.parse(String(value));
      return Number.isNaN(ms) ? value : ms;
    }
    case 'date':
      return typeof value === 'string' ? value.slice(0, 10) : value;
    case 'int':
    case 'numeric':
    case 'cents':
      return typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)) ? Number(value) : value;
    default:
      return value;
  }
}

// Same record data, ignoring sync columns (updated_at, synced_at, deleted_at,
// user_id), key order and how the database formats values.
export function rowsMatch(def: CollectionDef, a: Row, b: Row): boolean {
  const pick = (row: Row) => {
    const out: Row = { id: row.id, extra: isPlainObject(row.extra) ? row.extra : {} };
    for (const field of def.fields) out[field.col] = comparable(field.type, row[field.col]);
    return canonical(out);
  };
  return pick(a) === pick(b);
}
