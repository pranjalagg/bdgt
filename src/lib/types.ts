import type { CurrencyCode } from '$lib/currency/currencies';
import type { CurrencySettings } from '$lib/currency/settings';

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
  isSavings: boolean;       // spending here counts as saved, not spent
  isEveryday: boolean;      // counts toward "safe to spend today" (not a fixed obligation)
  createdAt: Date;          // excludes the bucket from rollover before this month
  isSystem?: boolean;       // app-managed (Unsorted): not user-editable or assignable
}

// A transaction entered in a currency other than the budget's base. `amount`
// on the transaction stays base cents; this keeps what was actually paid.
export interface ForeignAmount {
  amount: number; // minor units of `currency`
  currency: CurrencyCode;
  rate: number; // units of `currency` per 1 unit of `base`
  base: CurrencyCode; // the base currency when it was entered
}

export interface Transaction {
  id: string;
  amount: number; // cents
  bucketId: string;
  date: Date;
  note?: string;
  recurringId?: string;
  createdAt?: number; // epoch ms entry order; absent on older records
  foreign?: ForeignAmount;
}

// A payment noticed on the phone (Google Wallet, a UPI app, a bank SMS),
// waiting for review. It is not spending until approved, when it becomes the
// transaction `capture:<id>`.
export type CaptureSource = 'wallet' | 'sms' | 'upi-app';
export type CaptureStatus = 'pending' | 'approved' | 'dismissed' | 'duplicate';
export type CaptureHint = 'card-bill' | 'transfer' | 'atm' | 'upi-lite-topup';
export type MerchantKind = 'grocery' | 'dining' | 'transport' | 'subscriptions' | 'entertainment' | 'utilities';

export interface Capture {
  id: string;
  status: CaptureStatus;
  source: CaptureSource;
  sourceLabel: string; // "Google Wallet", "HDFC Bank SMS"
  postedAt: number; // epoch ms the notification or message arrived
  date: Date; // local calendar day of the payment
  amount: number; // minor units of `currency`
  currency: CurrencyCode; // what was charged; may differ from the base
  merchant: string; // display name, long digit runs masked
  payeeKey?: string; // SHA-256 of the normalized payee identifier
  kind?: MerchantKind;
  accountHint?: string; // last 4 digits of the card or account
  hint?: CaptureHint; // looks like it is not spending
  duplicateOf?: string;
  transactionId?: string; // set on approval
  resolvedAt?: number; // epoch ms of approval or dismissal
}

export interface CaptureRule {
  id: string; // `payee:${payeeKey}`
  payeeKey: string;
  merchant: string;
  action: 'suggest' | 'ignore';
  bucketId?: string; // for 'suggest'
}

// The full text behind a capture. Stays on the phone: never synced or exported.
export interface CaptureRaw {
  id: string; // the capture's id
  packageName: string;
  sender?: string;
  text: string;
  postedAt: number;
  reference?: string; // UPI reference number, for dedupe
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

// Context for a month ("Family visit", "Bonus"), not a calculation input.
// `effect` is what it did to that month's savings.
export type MonthNoteEffect = 'up' | 'down' | 'none';

export interface MonthNote {
  id: string;
  text: string;
  effect: MonthNoteEffect;
  createdAt: number; // epoch ms, for stable ordering
}

export interface MonthSnapshot {
  month: string; // YYYY-MM
  incomeTotal: number; // cents
  allocations: Record<string, number>; // bucketId -> cents
  spent: Record<string, number>; // bucketId -> cents
  rollovers: Record<string, number>; // bucketId -> cents
  notes?: MonthNote[];
}

// One explicit assignment: `amount` cents for one bucket in one month. Month
// records are stored as these rows (and MonthNoteRow) so each can sync on
// its own; the app still works with whole MonthSnapshots in memory.
export interface AllocationRow {
  id: string; // `${month}:${bucketId}`
  month: string; // YYYY-MM
  bucketId: string;
  amount: number; // cents
}

export interface MonthNoteRow extends MonthNote {
  month: string; // YYYY-MM
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

export interface InvestmentLot {
  id: string;
  symbol: string;
  shares: number;
  pricePerShare: number;
  purchaseDate: Date;
  note?: string;
  soldShares: number;
}

export interface InvestmentSell {
  id: string;
  lotId: string;
  shares: number;
  pricePerShare: number;
  sellDate: Date;
  note?: string;
}

export interface InvestmentPrice {
  symbol: string;        // primary key
  pricePerShare: number; // cents, entered manually
  updatedAt: Date;
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
    investmentLots: InvestmentLot[];
    investmentSells: InvestmentSell[];
    investmentPrices: InvestmentPrice[];
    settings: CurrencySettings;
  };
};
