import { db, DATE_FIELDS } from '$lib/db';
import { centsToDollars } from './currency';
import { formatDate, reviveDateFields } from './dates';
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

export async function exportToCsv(): Promise<string> {
  const transactions = await db.transactions.toArray();
  const buckets = await db.buckets.toArray();
  const bucketMap = new Map(buckets.map((b) => [b.id, b.name]));

  const rows = [
    'Date,Bucket,Amount,Note',
    ...transactions.map((t) =>
      [
        formatDate(new Date(t.date)),
        bucketMap.get(t.bucketId) || 'Unknown',
        centsToDollars(t.amount),
        t.note || '',
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

  data.incomes = (data.incomes as Record<string, unknown>[]).map((i) => ({
    ...i,
    type: i.type || 'fixed',
  }));

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
