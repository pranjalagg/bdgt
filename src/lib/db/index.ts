import Dexie, { type Table } from 'dexie';
import { reviveDateFields } from '$lib/utils/dates';
import type { Bucket, Transaction, RecurringTransaction, Income, MonthSnapshot, SavingsGoal, InvestmentLot, InvestmentSell, InvestmentPrice } from '$lib/types';

const SAVINGS_BUCKET_NAMES = new Set(['Savings', 'Investments', 'Emergency Fund']);

// Date-valued fields per collection. Dexie preserves real Date objects
// through IndexedDB, but a record that ever round-tripped through JSON
// (an import predating date-revival there) can leave one of these as a
// plain string — which crashes any code that calls .getMonthKey()/etc.
// on it. Shared by the v7 repair migration and export.ts's import path.
export const DATE_FIELDS: Record<string, string[]> = {
  transactions: ['date'],
  recurringTransactions: ['nextDueDate'],
  incomes: ['date'],
  savingsGoals: ['createdAt', 'targetDate'],
  investmentLots: ['purchaseDate'],
  investmentSells: ['sellDate'],
  investmentPrices: ['updatedAt'],
};

export class BudgetDatabase extends Dexie {
  buckets!: Table<Bucket, string>;
  transactions!: Table<Transaction, string>;
  recurringTransactions!: Table<RecurringTransaction, string>;
  incomes!: Table<Income, string>;
  monthSnapshots!: Table<MonthSnapshot, string>;
  savingsGoals!: Table<SavingsGoal, string>;
  investmentLots!: Table<InvestmentLot, string>;
  investmentSells!: Table<InvestmentSell, string>;
  investmentPrices!: Table<InvestmentPrice, string>;

  constructor() {
    super('BudgetDB');

    this.version(1).stores({
      buckets: 'id, name, order',
      transactions: 'id, bucketId, date, recurringId',
      recurringTransactions: 'id, bucketId, nextDueDate, isActive',
      incomes: 'id, date',
      monthSnapshots: 'month'
    });

    this.version(2).stores({
      buckets: 'id, name, order',
      transactions: 'id, bucketId, date, recurringId',
      recurringTransactions: 'id, bucketId, nextDueDate, isActive',
      incomes: 'id, date',
      monthSnapshots: 'month',
      savingsGoals: 'id, bucketId'
    }).upgrade(tx => {
      return tx.table('buckets').toCollection().modify(bucket => {
        bucket.allocationType = 'fixed';
        bucket.fixedAmount = 0;
        bucket.percentageAmount = 0;
      });
    });

    this.version(3).stores({
      buckets: 'id, name, order',
      transactions: 'id, bucketId, date, recurringId',
      recurringTransactions: 'id, bucketId, nextDueDate, isActive',
      incomes: 'id, date',
      monthSnapshots: 'month',
      savingsGoals: 'id, bucketId'
    }).upgrade(tx => {
      return tx.table('incomes').toCollection().modify(income => {
        if (!income.type) income.type = 'fixed';
      });
    });

    this.version(4).stores({
      buckets: 'id, name, order',
      transactions: 'id, bucketId, date, recurringId',
      recurringTransactions: 'id, bucketId, nextDueDate, isActive',
      incomes: 'id, date',
      monthSnapshots: 'month',
      savingsGoals: 'id, bucketId',
      investmentLots: 'id, symbol, purchaseDate',
      investmentSells: 'id, lotId, sellDate'
    });

    this.version(5).stores({
      buckets: 'id, name, order',
      transactions: 'id, bucketId, date, recurringId',
      recurringTransactions: 'id, bucketId, nextDueDate, isActive',
      incomes: 'id, date',
      monthSnapshots: 'month',
      savingsGoals: 'id, bucketId',
      investmentLots: 'id, symbol, purchaseDate',
      investmentSells: 'id, lotId, sellDate'
    }).upgrade(tx => {
      return tx.table('buckets').toCollection().modify(bucket => {
        if (bucket.isSavings === undefined) {
          bucket.isSavings = SAVINGS_BUCKET_NAMES.has(bucket.name);
        }
      });
    });

    this.version(6).stores({
      buckets: 'id, name, order',
      transactions: 'id, bucketId, date, recurringId',
      recurringTransactions: 'id, bucketId, nextDueDate, isActive',
      incomes: 'id, date',
      monthSnapshots: 'month',
      savingsGoals: 'id, bucketId',
      investmentLots: 'id, symbol, purchaseDate',
      investmentSells: 'id, lotId, sellDate',
      investmentPrices: 'symbol'
    });

    // Repair-only: no schema change. Coerces any date field that
    // survived a pre-fix JSON import as a plain string back to a real
    // Date, everywhere one is expected.
    this.version(7).stores({
      buckets: 'id, name, order',
      transactions: 'id, bucketId, date, recurringId',
      recurringTransactions: 'id, bucketId, nextDueDate, isActive',
      incomes: 'id, date',
      monthSnapshots: 'month',
      savingsGoals: 'id, bucketId',
      investmentLots: 'id, symbol, purchaseDate',
      investmentSells: 'id, lotId, sellDate',
      investmentPrices: 'symbol'
    }).upgrade(async tx => {
      for (const [tableName, fields] of Object.entries(DATE_FIELDS)) {
        await tx.table(tableName).toCollection().modify(record => {
          Object.assign(record, reviveDateFields(record, fields));
        });
      }
    });

    // Repair-only: no schema change. Buckets predate the createdAt field
    // rollover math now uses to exclude months before a bucket existed
    // (a bucket created after older ledger months exist must not accrue
    // rollover for those months). Backfilling with the actual epoch
    // preserves today's behavior for every already-existing bucket --
    // none of them suddenly lose rollover history -- while addBucket
    // stamps a real "now" for every bucket created from here on.
    this.version(8).stores({
      buckets: 'id, name, order',
      transactions: 'id, bucketId, date, recurringId',
      recurringTransactions: 'id, bucketId, nextDueDate, isActive',
      incomes: 'id, date',
      monthSnapshots: 'month',
      savingsGoals: 'id, bucketId',
      investmentLots: 'id, symbol, purchaseDate',
      investmentSells: 'id, lotId, sellDate',
      investmentPrices: 'symbol'
    }).upgrade(tx => {
      return tx.table('buckets').toCollection().modify(bucket => {
        if (bucket.createdAt === undefined) {
          bucket.createdAt = new Date(0);
        }
      });
    });
  }
}

export const db = new BudgetDatabase();

export const DEFAULT_BUCKETS: Omit<Bucket, 'id' | 'createdAt'>[] = [
  { name: 'Rent/Mortgage', color: '#6366f1', order: 0, isDefault: true, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0, isSavings: false },
  { name: 'Utilities', color: '#8b5cf6', order: 1, isDefault: true, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0, isSavings: false },
  { name: 'Grocery', color: '#10b981', order: 2, isDefault: true, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0, isSavings: false },
  { name: 'Transportation', color: '#f59e0b', order: 3, isDefault: true, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0, isSavings: false },
  { name: 'Dining Out', color: '#ef4444', order: 4, isDefault: true, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0, isSavings: false },
  { name: 'Entertainment', color: '#ec4899', order: 5, isDefault: true, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0, isSavings: false },
  { name: 'Subscriptions', color: '#06b6d4', order: 6, isDefault: true, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0, isSavings: false },
  { name: 'Savings', color: '#22c55e', order: 7, isDefault: true, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0, isSavings: true },
  { name: 'Investments', color: '#3b82f6', order: 8, isDefault: true, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0, isSavings: true },
  { name: 'Emergency Fund', color: '#f97316', order: 9, isDefault: true, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0, isSavings: true },
  { name: 'Misc', color: '#6b7280', order: 10, isDefault: true, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0, isSavings: false },
];

const SEEDED_KEY = 'bdgt-default-buckets-seeded';

// Seed defaults only the very first time. Otherwise a user who
// intentionally deletes every bucket gets all 11 back on next load.
export function shouldSeedDefaults(bucketCount: number, alreadySeeded: boolean): boolean {
  return bucketCount === 0 && !alreadySeeded;
}

export async function initializeDefaultBuckets(): Promise<void> {
  const alreadySeeded =
    typeof localStorage !== 'undefined' && localStorage.getItem(SEEDED_KEY) === 'true';
  const count = await db.buckets.count();

  if (shouldSeedDefaults(count, alreadySeeded)) {
    const now = new Date();
    const bucketsWithIds = DEFAULT_BUCKETS.map((b) => ({
      ...b,
      id: crypto.randomUUID(),
      createdAt: now,
    }));
    await db.buckets.bulkAdd(bucketsWithIds);
  }

  try {
    localStorage.setItem(SEEDED_KEY, 'true');
  } catch {
    // localStorage unavailable (private mode) — falls back to old behavior
  }
}
