import { getCapture, isAndroidApp } from '$lib/capture/native';
import { normalizeForeign } from '$lib/currency/conversion';
import { normalizeCurrencySettings, rowsToSettings, settingsToRows } from '$lib/currency/settings';
import { db, DATE_FIELDS, SAVINGS_BUCKET_NAMES, FIXED_OBLIGATION_NAMES } from '$lib/db';
import { centsToDollars } from './currency';
import { formatDate, reviveDateFields } from './dates';
import { normalizeMonthNotes } from './monthNotes';
import { composeSnapshots, splitSnapshots } from './monthRecords';
import type { ExportData } from '$lib/types';

export async function exportToJson(): Promise<string> {
  const [buckets, transactions, recurringTransactions, incomes, allocations, monthNotes, savingsGoals, investmentLots, investmentSells, investmentPrices] = await Promise.all([
    db.buckets.toArray(),
    db.transactions.toArray(),
    db.recurringTransactions.toArray(),
    db.incomes.toArray(),
    db.allocations.toArray(),
    db.monthNotes.toArray(),
    db.savingsGoals.toArray(),
    db.investmentLots.toArray(),
    db.investmentSells.toArray(),
    db.investmentPrices.toArray(),
  ]);
  // Backups keep the whole-month shape so older versions can read them.
  const monthSnapshots = composeSnapshots(allocations, monthNotes);

  const storedSettings = rowsToSettings(await db.settings.toArray());

  const data: ExportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { buckets, transactions, recurringTransactions, incomes, monthSnapshots, savingsGoals, investmentLots, investmentSells, investmentPrices, settings: storedSettings ?? normalizeCurrencySettings(undefined) },
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

// Backup sections copied one-to-one into the table of the same name.
const PLAIN_TABLES = [
  'buckets',
  'transactions',
  'recurringTransactions',
  'incomes',
  'savingsGoals',
  'investmentLots',
  'investmentSells',
  'investmentPrices',
] as const;

// Every section a backup carries. Month records are split into the
// allocations and monthNotes tables on import and rebuilt on export.
const COLLECTIONS = [...PLAIN_TABLES, 'monthSnapshots'] as const;

function localTables() {
  return [...[...PLAIN_TABLES, 'allocations', 'monthNotes'].map((name) => db.table(name)), db.settings];
}

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
  // isSavings and isEveryday fall back to the same default-name rules as
  // database migrations v5 and v9, so an old backup's Savings/Investments/
  // Emergency Fund stay savings and Rent/Utilities/Subscriptions stay out of
  // the safe-to-spend pool.
  data.buckets = (data.buckets as Record<string, unknown>[]).map((b) => {
    const isSavings = (b.isSavings as boolean | undefined) ?? SAVINGS_BUCKET_NAMES.has(b.name as string);
    return {
      ...b,
      createdAt: b.createdAt ?? new Date(0),
      isSavings,
      isEveryday: b.isEveryday ?? (!isSavings && !FIXED_OBLIGATION_NAMES.has(b.name as string)),
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

  // A foreign amount that is not a clean {amount, currency, rate, base} would
  // break the row note and edit form, so it is dropped; the transaction keeps
  // its base-currency amount.
  data.transactions = (data.transactions as Record<string, unknown>[]).map((t) => {
    if (!('foreign' in t)) return t;
    const { foreign, ...rest } = t;
    const clean = normalizeForeign(foreign);
    return clean ? { ...rest, foreign: clean } : rest;
  });

  // Optional section: backups from before currencies have none, and an
  // unsupported code is never trusted. Both land on unconfirmed USD.
  data.settings = normalizeCurrencySettings(data.settings);

  return obj as unknown as ExportData;
}

export async function importFromJson(json: string): Promise<void> {
  const { data } = parseImport(json);
  const { allocations, notes } = splitSnapshots(data.monthSnapshots);
  const tables = localTables();

  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()));
    for (const name of PLAIN_TABLES) {
      await db.table(name).bulkAdd((data as unknown as Record<string, unknown[]>)[name]);
    }
    // bulkPut: a hand-edited backup can repeat a month or a note id.
    await db.allocations.bulkPut(allocations);
    await db.monthNotes.bulkPut(notes);
    await db.settings.bulkAdd(settingsToRows(data.settings));
  });
}

// Reset also empties the review queue; import leaves it (backups do not
// carry captures or their rules).
export async function resetAllData(): Promise<void> {
  const tables = [...localTables(), db.captures, db.captureRules, db.captureRaw];
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()));
  });
}

export function downloadFile(content: string, filename: string, type: string): void {
  // The Android app's WebView cannot save a file from a link; the share sheet can.
  if (isAndroidApp()) {
    void getCapture()
      .then((capture) => capture?.plugin.share({ filename, text: content, mimeType: type }))
      .catch((e) => console.error('Sharing the file failed', e));
    return;
  }
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
