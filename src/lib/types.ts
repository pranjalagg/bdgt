// src/lib/types.ts

export type AllocationType = 'fixed' | 'percentage' | 'hybrid';

export type IncomeType = 'fixed' | 'one-time';

export interface Income {
  id: string;
  amount: number; // cents
  date: Date;
  note?: string;
  isRecurring: boolean;
  type: IncomeType;
}

export interface Bucket {
  id: string;
  name: string;
  color: string;
  order: number;
  isDefault: boolean;
  allocationType: AllocationType;
  fixedAmount: number;      // cents
  percentageAmount: number; // 0-100
}

export interface Transaction {
  id: string;
  amount: number; // cents
  bucketId: string;
  date: Date;
  note?: string;
  recurringId?: string;
}

export interface RecurringTransaction {
  id: string;
  amount: number; // cents
  bucketId: string;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  dayOfMonth?: number;
  nextDueDate: Date;
  note?: string;
  isActive: boolean;
}

export interface MonthSnapshot {
  month: string; // YYYY-MM
  incomeTotal: number; // cents
  allocations: Record<string, number>; // bucketId -> cents
  spent: Record<string, number>; // bucketId -> cents
  rollovers: Record<string, number>; // bucketId -> cents
}

export interface BucketStatus {
  bucket: Bucket;
  allocated: number;
  spent: number;
  rollover: number;
  remaining: number;
}

export interface SavingsGoal {
  id: string;
  name: string;
  bucketId: string;
  targetAmount: number;          // cents
  targetDate?: Date;             // optional: user-set deadline
  monthlyContribution?: number;  // optional: user-set monthly (cents)
  createdAt: Date;
  startingBalance: number;       // cents
}

export type ExportData = {
  version: number;
  exportedAt: string;
  data: {
    buckets: Bucket[];
    transactions: Transaction[];
    recurringTransactions: RecurringTransaction[];
    incomes: Income[];
    monthSnapshots: MonthSnapshot[];
    savingsGoals: SavingsGoal[];
  };
};
