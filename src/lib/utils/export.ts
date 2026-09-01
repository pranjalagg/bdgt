import { db } from '$lib/db';
import { centsToDollars } from './currency';
import { formatDate } from './dates';
import type { ExportData } from '$lib/types';

export async function exportToJson(): Promise<string> {
  const [buckets, transactions, recurringTransactions, incomes, monthSnapshots, savingsGoals, investmentLots, investmentSells] = await Promise.all([
    db.buckets.toArray(),
    db.transactions.toArray(),
    db.recurringTransactions.toArray(),
    db.incomes.toArray(),
    db.monthSnapshots.toArray(),
    db.savingsGoals.toArray(),
    db.investmentLots.toArray(),
    db.investmentSells.toArray(),
  ]);

  const data: ExportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { buckets, transactions, recurringTransactions, incomes, monthSnapshots, savingsGoals, investmentLots, investmentSells },
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
] as const;

// Date-valued fields per collection, revived from ISO strings on import.
const DATE_FIELDS: Record<string, string[]> = {
  transactions: ['date'],
  recurringTransactions: ['nextDueDate'],
  incomes: ['date'],
  savingsGoals: ['createdAt', 'targetDate'],
  investmentLots: ['purchaseDate'],
  investmentSells: ['sellDate'],
};

function reviveDates<T extends Record<string, unknown>>(rows: T[], fields: string[]): T[] {
  return rows.map((row) => {
    const copy: Record<string, unknown> = { ...row };
    for (const field of fields) {
      if (copy[field] != null && !(copy[field] instanceof Date)) {
        copy[field] = new Date(copy[field] as string);
      }
    }
    return copy as T;
  });
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

  await db.transaction('rw', [db.buckets, db.transactions, db.recurringTransactions, db.incomes, db.monthSnapshots, db.savingsGoals, db.investmentLots, db.investmentSells], async () => {
    await Promise.all(COLLECTIONS.map((name) => db.table(name).clear()));

    await db.buckets.bulkAdd(data.buckets);
    await db.transactions.bulkAdd(data.transactions);
    await db.recurringTransactions.bulkAdd(data.recurringTransactions);
    await db.incomes.bulkAdd(data.incomes);
    await db.monthSnapshots.bulkAdd(data.monthSnapshots);
    await db.savingsGoals.bulkAdd(data.savingsGoals);
    await db.investmentLots.bulkAdd(data.investmentLots);
    await db.investmentSells.bulkAdd(data.investmentSells);
  });
}

export async function resetAllData(): Promise<void> {
  await db.transaction('rw', [db.buckets, db.transactions, db.recurringTransactions, db.incomes, db.monthSnapshots, db.savingsGoals, db.investmentLots, db.investmentSells], async () => {
    await db.buckets.clear();
    await db.transactions.clear();
    await db.recurringTransactions.clear();
    await db.incomes.clear();
    await db.monthSnapshots.clear();
    await db.savingsGoals.clear();
    await db.investmentLots.clear();
    await db.investmentSells.clear();
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
