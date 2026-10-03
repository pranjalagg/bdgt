import { db, DATE_FIELDS, SAVINGS_BUCKET_NAMES } from '$lib/db';
import { centsToDollars } from './currency';
import { formatDate, reviveDateFields } from './dates';
import { normalizeMonthNotes } from './monthNotes';
import type { ExportData } from '$lib/types';

export async function exportToJson(): Promise<string> {
  const [buckets, transactions, recurringTransactions, incomes, monthSnapshots, savingsGoals, investmentLots, investmentSells, investmentPrices] = await Promise.all([
    db.buckets.toArray(),
    db.transactions.toArray(),
    db.recurringTransactions.toArray(),
    db.incomes.toArray(),
    db.monthSnapshots.toArray(),
    db.savingsGoals.toArray(),
    db.investmentLots.toArray(),
    db.investmentSells.toArray(),
    db.investmentPrices.toArray(),
  ]);

  const data: ExportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { buckets, transactions, recurringTransactions, incomes, monthSnapshots, savingsGoals, investmentLots, investmentSells, investmentPrices },
  };

  return JSON.stringify(data, null, 2);
}

export function escapeCsvField(value: unknown): string {
  const str = value == null ? '' : String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// A cell whose text starts with =, +, -, @ or a tab is read as a formula
// by Excel/Sheets when the CSV is opened -- a bucket name or note could
// carry a formula payload (e.g. '=cmd|...'!A1'). Prefixing with an
// apostrophe forces it to render as literal text instead of executing.
const FORMULA_TRIGGER = /^[=+\-@\t]/;

export function sanitizeCsvFormula(value: string): string {
  return FORMULA_TRIGGER.test(value) ? `'${value}` : value;
}

export async function exportToCsv(): Promise<string> {
  const transactions = await db.transactions.toArray();
  const buckets = await db.buckets.toArray();
  const bucketMap = new Map(buckets.map((b) => [b.id, b.name]));

  const rows = [
    'Date,Bucket,Amount,Note',
    ...transactions.map((t) =>
      [
        formatDate(new Date(t.date)),
        sanitizeCsvFormula(bucketMap.get(t.bucketId) || 'Unknown'),
        centsToDollars(t.amount), // numeric -- never formula-sanitized
        sanitizeCsvFormula(t.note || ''),
      ]
        .map(escapeCsvField)
        .join(',')
    ),
  ];

  return rows.join('\n');
}

const COLLECTIONS = [
  'buckets',
  'transactions',
  'recurringTransactions',
  'incomes',
  'monthSnapshots',
  'savingsGoals',
  'investmentLots',
  'investmentSells',
  'investmentPrices',
] as const;

function reviveDates<T extends Record<string, unknown>>(rows: T[], fields: string[]): T[] {
  return rows.map((row) => reviveDateFields(row, fields));
}

const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']);

export function parseImport(json: string): ExportData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('File is not valid JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Backup file is malformed');
  }
  const obj = parsed as Record<string, unknown>;

  if (obj.version !== 1) {
    throw new Error('Unsupported backup version');
  }
  if (!obj.data || typeof obj.data !== 'object') {
    throw new Error('Backup file is missing its data section');
  }
  const data = obj.data as Record<string, unknown>;

  for (const name of COLLECTIONS) {
    if (data[name] === undefined) {
      data[name] = [];
      continue;
    }
    if (!Array.isArray(data[name])) {
      throw new Error(`Backup section "${name}" is not a list`);
    }
    if (DATE_FIELDS[name]) {
      data[name] = reviveDates(data[name] as Record<string, unknown>[], DATE_FIELDS[name]);
    }
  }

  // Older backups predate some bucket fields. Restoring raw skips the
  // database upgrade steps that backfill them, and a bucket without
  // createdAt breaks rollover math, so apply the same defaults here.
  // isSavings falls back to the same default-name rule as database
  // migration v5, so an old backup's Savings/Investments/Emergency Fund stay
  // savings rather than becoming spending buckets in the safe-to-spend pool.
  data.buckets = (data.buckets as Record<string, unknown>[]).map((b) => {
    const isSavings = (b.isSavings as boolean | undefined) ?? SAVINGS_BUCKET_NAMES.has(b.name as string);
    return {
      ...b,
      createdAt: b.createdAt ?? new Date(0),
      isSavings,
      isEveryday: b.isEveryday ?? !isSavings,
    };
  });

  // Ids key plain-object lookups throughout the app; these would alias
  // Object.prototype.
  for (const b of data.buckets as { id: unknown }[]) {
    if (typeof b.id !== 'string' || RESERVED_IDS.has(b.id)) {
      throw new Error(`Backup contains a bucket with an unusable id: "${String(b.id)}"`);
    }
  }

  data.monthSnapshots = (data.monthSnapshots as Record<string, unknown>[]).map((s) => {
    const { notes, ...rest } = s;
    const clean = normalizeMonthNotes(notes);
    return { ...rest, allocations: s.allocations ?? {}, ...(clean.length > 0 ? { notes: clean } : {}) };
  });

  data.incomes = (data.incomes as Record<string, unknown>[]).map((i) => ({
    ...i,
    type: i.type || 'fixed',
  }));

  const VALID_FREQUENCIES = new Set(['weekly', 'biweekly', 'monthly']);
  for (const r of data.recurringTransactions as Record<string, unknown>[]) {
    if (!VALID_FREQUENCIES.has(r.frequency as string)) {
      // An unrecognized frequency can never advance its due date
      // (calculateNextDueDate has no default case), which would hang
      // processRecurring on every future app load. Reject at the door.
      throw new Error(`Recurring transaction has an unknown frequency: "${r.frequency}"`);
    }
  }

  return obj as unknown as ExportData;
}

export async function importFromJson(json: string): Promise<void> {
  const { data } = parseImport(json);
  const tables = COLLECTIONS.map((name) => db.table(name));

  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()));
    for (const name of COLLECTIONS) {
      await db.table(name).bulkAdd((data as Record<string, unknown[]>)[name]);
    }
  });
}

export async function resetAllData(): Promise<void> {
  const tables = COLLECTIONS.map((name) => db.table(name));
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()));
  });
}

export function downloadFile(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
