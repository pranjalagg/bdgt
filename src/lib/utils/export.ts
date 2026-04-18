import { db } from '$lib/db';
import { centsToDollars } from './currency';
import { formatDate } from './dates';
import type { ExportData } from '$lib/types';

export async function exportToJson(): Promise<string> {
  const [buckets, transactions, recurringTransactions, incomes, monthSnapshots, savingsGoals] = await Promise.all([
    db.buckets.toArray(),
    db.transactions.toArray(),
    db.recurringTransactions.toArray(),
    db.incomes.toArray(),
    db.monthSnapshots.toArray(),
    db.savingsGoals.toArray(),
  ]);

  const data: ExportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { buckets, transactions, recurringTransactions, incomes, monthSnapshots, savingsGoals },
  };

  return JSON.stringify(data, null, 2);
}

export async function exportToCsv(): Promise<string> {
  const transactions = await db.transactions.toArray();
  const buckets = await db.buckets.toArray();
  const bucketMap = new Map(buckets.map((b) => [b.id, b.name]));

  const rows = [
    'Date,Bucket,Amount,Note',
    ...transactions.map((t) =>
      `${formatDate(new Date(t.date))},${bucketMap.get(t.bucketId) || 'Unknown'},${centsToDollars(t.amount)},${t.note || ''}`
    ),
  ];

  return rows.join('\n');
}

export async function importFromJson(json: string): Promise<void> {
  const data: ExportData = JSON.parse(json);

  if (data.version !== 1) {
    throw new Error('Unsupported backup version');
  }

  await db.transaction('rw', [db.buckets, db.transactions, db.recurringTransactions, db.incomes, db.monthSnapshots, db.savingsGoals], async () => {
    await db.buckets.clear();
    await db.transactions.clear();
    await db.recurringTransactions.clear();
    await db.incomes.clear();
    await db.monthSnapshots.clear();
    await db.savingsGoals.clear();

    await db.buckets.bulkAdd(data.data.buckets);
    await db.transactions.bulkAdd(data.data.transactions);
    await db.recurringTransactions.bulkAdd(data.data.recurringTransactions);
    await db.incomes.bulkAdd(data.data.incomes);
    await db.monthSnapshots.bulkAdd(data.data.monthSnapshots);
    if (data.data.savingsGoals) {
      await db.savingsGoals.bulkAdd(data.data.savingsGoals);
    }
  });
}

export async function resetAllData(): Promise<void> {
  await db.transaction('rw', [db.buckets, db.transactions, db.recurringTransactions, db.incomes, db.monthSnapshots, db.savingsGoals], async () => {
    await db.buckets.clear();
    await db.transactions.clear();
    await db.recurringTransactions.clear();
    await db.incomes.clear();
    await db.monthSnapshots.clear();
    await db.savingsGoals.clear();
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
