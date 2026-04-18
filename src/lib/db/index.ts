import Dexie, { type Table } from 'dexie';
import type { Bucket, Transaction, RecurringTransaction, Income, MonthSnapshot } from '$lib/types';

export class BudgetDatabase extends Dexie {
  buckets!: Table<Bucket, string>;
  transactions!: Table<Transaction, string>;
  recurringTransactions!: Table<RecurringTransaction, string>;
  incomes!: Table<Income, string>;
  monthSnapshots!: Table<MonthSnapshot, string>;

  constructor() {
    super('BudgetDB');

    this.version(1).stores({
      buckets: 'id, name, order',
      transactions: 'id, bucketId, date, recurringId',
      recurringTransactions: 'id, bucketId, nextDueDate, isActive',
      incomes: 'id, date',
      monthSnapshots: 'month'
    });
  }
}

export const db = new BudgetDatabase();

export const DEFAULT_BUCKETS: Omit<Bucket, 'id'>[] = [
  { name: 'Rent/Mortgage', color: '#6366f1', order: 0, isDefault: true },
  { name: 'Utilities', color: '#8b5cf6', order: 1, isDefault: true },
  { name: 'Grocery', color: '#10b981', order: 2, isDefault: true },
  { name: 'Transportation', color: '#f59e0b', order: 3, isDefault: true },
  { name: 'Dining Out', color: '#ef4444', order: 4, isDefault: true },
  { name: 'Entertainment', color: '#ec4899', order: 5, isDefault: true },
  { name: 'Subscriptions', color: '#06b6d4', order: 6, isDefault: true },
  { name: 'Savings', color: '#22c55e', order: 7, isDefault: true },
  { name: 'Investments', color: '#3b82f6', order: 8, isDefault: true },
  { name: 'Emergency Fund', color: '#f97316', order: 9, isDefault: true },
  { name: 'Misc', color: '#6b7280', order: 10, isDefault: true },
];

export async function initializeDefaultBuckets(): Promise<void> {
  const count = await db.buckets.count();
  if (count === 0) {
    const bucketsWithIds = DEFAULT_BUCKETS.map((b, i) => ({
      ...b,
      id: crypto.randomUUID(),
    }));
    await db.buckets.bulkAdd(bucketsWithIds);
  }
}
