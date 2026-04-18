# Zero-Based Budget App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a zero-based budgeting web app where every dollar of income is allocated to spending buckets.

**Architecture:** SvelteKit static site with IndexedDB storage via Dexie.js. Svelte stores manage reactive state. Chart.js for analytics visualizations. All data stays in browser, with JSON/CSV export.

**Tech Stack:** SvelteKit, Tailwind CSS, Dexie.js, Chart.js, TypeScript, Vitest

---

## File Structure

```
src/
├── lib/
│   ├── types.ts                    # All TypeScript interfaces
│   ├── db/
│   │   └── index.ts                # Dexie database setup
│   ├── stores/
│   │   ├── budgetStore.ts          # Core budget state
│   │   ├── recurringStore.ts       # Recurring transaction logic
│   │   └── uiStore.ts              # UI state (modals, current month)
│   ├── utils/
│   │   ├── currency.ts             # Format cents to dollars
│   │   ├── dates.ts                # Date helpers
│   │   └── calculations.ts         # Budget math
│   └── components/
│       ├── layout/
│       │   ├── Nav.svelte          # Navigation
│       │   └── Layout.svelte       # Page wrapper
│       ├── shared/
│       │   ├── Modal.svelte        # Reusable modal
│       │   ├── BucketCard.svelte   # Bucket display card
│       │   ├── TransactionRow.svelte
│       │   ├── QuickEntry.svelte   # Quick transaction form
│       │   ├── MonthPicker.svelte  # Month navigation
│       │   └── ProgressBar.svelte  # Budget progress
│       └── charts/
│           ├── DonutChart.svelte   # Category breakdown
│           ├── BarChart.svelte     # Monthly trends
│           └── LineChart.svelte    # Income vs spending
├── routes/
│   ├── +layout.svelte              # Root layout
│   ├── +page.svelte                # Dashboard
│   ├── buckets/+page.svelte        # Buckets management
│   ├── transactions/+page.svelte   # Transaction list
│   ├── recurring/+page.svelte      # Recurring transactions
│   ├── analytics/+page.svelte      # Charts and trends
│   └── settings/+page.svelte       # Export/import/reset
├── app.css                         # Tailwind + custom styles
└── app.html
tests/
├── lib/
│   ├── utils/
│   │   ├── currency.test.ts
│   │   ├── dates.test.ts
│   │   └── calculations.test.ts
│   └── stores/
│       └── budgetStore.test.ts
```

---

## Task 1: Project Setup

**Files:**
- Create: `package.json`, `svelte.config.js`, `vite.config.ts`, `tailwind.config.js`, `tsconfig.json`
- Create: `src/app.html`, `src/app.css`

- [ ] **Step 1: Initialize SvelteKit project**

```bash
npm create svelte@latest . -- --template skeleton --types typescript
```

Select: Skeleton project, Yes to TypeScript, Yes to ESLint, Yes to Prettier

- [ ] **Step 2: Install dependencies**

```bash
npm install dexie chart.js uuid
npm install -D tailwindcss postcss autoprefixer @sveltejs/adapter-static vitest @testing-library/svelte jsdom
```

- [ ] **Step 3: Initialize Tailwind**

```bash
npx tailwindcss init -p
```

- [ ] **Step 4: Configure tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        surface: '#ffffff',
        background: '#fafafa',
        primary: '#3b82f6',
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444',
      }
    },
  },
  plugins: [],
}
```

- [ ] **Step 5: Configure src/app.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-background text-gray-800;
}
```

- [ ] **Step 6: Configure static adapter in svelte.config.js**

```javascript
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
      precompress: false,
      strict: true
    })
  }
};

export default config;
```

- [ ] **Step 7: Configure Vitest in vite.config.ts**

```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'jsdom',
    globals: true
  }
});
```

- [ ] **Step 8: Add test script to package.json**

Add to scripts section:
```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 9: Verify setup**

```bash
npm run dev
```

Expected: Dev server starts at localhost:5173

- [ ] **Step 10: Commit**

```bash
git add -A
git commit --no-gpg-sign -m "Initialize SvelteKit project with Tailwind and Vitest"
```

---

## Task 2: TypeScript Types

**Files:**
- Create: `src/lib/types.ts`

- [ ] **Step 1: Create types file**

```typescript
// src/lib/types.ts

export interface Income {
  id: string;
  amount: number; // cents
  date: Date;
  note?: string;
  isRecurring: boolean;
}

export interface Bucket {
  id: string;
  name: string;
  color: string;
  order: number;
  isDefault: boolean;
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

export type ExportData = {
  version: number;
  exportedAt: string;
  data: {
    buckets: Bucket[];
    transactions: Transaction[];
    recurringTransactions: RecurringTransaction[];
    incomes: Income[];
    monthSnapshots: MonthSnapshot[];
  };
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit --no-gpg-sign -m "Add TypeScript type definitions"
```

---

## Task 3: Currency Utilities

**Files:**
- Create: `src/lib/utils/currency.ts`
- Create: `tests/lib/utils/currency.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/utils/currency.test.ts
import { describe, it, expect } from 'vitest';
import { formatCurrency, parseCurrency, centsToDollars, dollarsToCents } from '$lib/utils/currency';

describe('currency utils', () => {
  describe('centsToDollars', () => {
    it('converts cents to dollars', () => {
      expect(centsToDollars(1234)).toBe(12.34);
      expect(centsToDollars(100)).toBe(1);
      expect(centsToDollars(0)).toBe(0);
      expect(centsToDollars(-500)).toBe(-5);
    });
  });

  describe('dollarsToCents', () => {
    it('converts dollars to cents', () => {
      expect(dollarsToCents(12.34)).toBe(1234);
      expect(dollarsToCents(1)).toBe(100);
      expect(dollarsToCents(0)).toBe(0);
      expect(dollarsToCents(-5)).toBe(-500);
    });

    it('handles floating point edge cases', () => {
      expect(dollarsToCents(0.1)).toBe(10);
      expect(dollarsToCents(0.01)).toBe(1);
    });
  });

  describe('formatCurrency', () => {
    it('formats cents as USD', () => {
      expect(formatCurrency(1234)).toBe('$12.34');
      expect(formatCurrency(100)).toBe('$1.00');
      expect(formatCurrency(0)).toBe('$0.00');
    });

    it('formats negative amounts', () => {
      expect(formatCurrency(-500)).toBe('-$5.00');
    });
  });

  describe('parseCurrency', () => {
    it('parses dollar string to cents', () => {
      expect(parseCurrency('12.34')).toBe(1234);
      expect(parseCurrency('$12.34')).toBe(1234);
      expect(parseCurrency('1')).toBe(100);
      expect(parseCurrency('')).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- tests/lib/utils/currency.test.ts
```

Expected: FAIL - module not found

- [ ] **Step 3: Create utils directory and implement**

```typescript
// src/lib/utils/currency.ts

export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function formatCurrency(cents: number): string {
  const dollars = centsToDollars(Math.abs(cents));
  const formatted = dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
  return cents < 0 ? `-${formatted}` : formatted;
}

export function parseCurrency(value: string): number {
  const cleaned = value.replace(/[$,]/g, '').trim();
  if (!cleaned) return 0;
  return dollarsToCents(parseFloat(cleaned));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- tests/lib/utils/currency.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/currency.ts tests/lib/utils/currency.test.ts
git commit --no-gpg-sign -m "Add currency utility functions"
```

---

## Task 4: Date Utilities

**Files:**
- Create: `src/lib/utils/dates.ts`
- Create: `tests/lib/utils/dates.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/utils/dates.test.ts
import { describe, it, expect } from 'vitest';
import {
  getMonthKey,
  parseMonthKey,
  getCurrentMonthKey,
  getPreviousMonthKey,
  getNextMonthKey,
  formatDate,
  isCurrentMonth,
  getMonthRange
} from '$lib/utils/dates';

describe('date utils', () => {
  describe('getMonthKey', () => {
    it('returns YYYY-MM format', () => {
      expect(getMonthKey(new Date('2026-04-15'))).toBe('2026-04');
      expect(getMonthKey(new Date('2026-12-01'))).toBe('2026-12');
    });
  });

  describe('parseMonthKey', () => {
    it('returns first day of month', () => {
      const date = parseMonthKey('2026-04');
      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(3); // April = 3
      expect(date.getDate()).toBe(1);
    });
  });

  describe('getPreviousMonthKey', () => {
    it('returns previous month', () => {
      expect(getPreviousMonthKey('2026-04')).toBe('2026-03');
      expect(getPreviousMonthKey('2026-01')).toBe('2025-12');
    });
  });

  describe('getNextMonthKey', () => {
    it('returns next month', () => {
      expect(getNextMonthKey('2026-04')).toBe('2026-05');
      expect(getNextMonthKey('2026-12')).toBe('2027-01');
    });
  });

  describe('getMonthRange', () => {
    it('returns start and end of month', () => {
      const { start, end } = getMonthRange('2026-04');
      expect(start.getDate()).toBe(1);
      expect(end.getDate()).toBe(30);
      expect(end.getMonth()).toBe(3);
    });
  });

  describe('formatDate', () => {
    it('formats date for display', () => {
      const result = formatDate(new Date('2026-04-15'));
      expect(result).toContain('Apr');
      expect(result).toContain('15');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- tests/lib/utils/dates.test.ts
```

Expected: FAIL - module not found

- [ ] **Step 3: Implement date utilities**

```typescript
// src/lib/utils/dates.ts

export function getMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function parseMonthKey(monthKey: string): Date {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

export function getCurrentMonthKey(): string {
  return getMonthKey(new Date());
}

export function getPreviousMonthKey(monthKey: string): string {
  const date = parseMonthKey(monthKey);
  date.setMonth(date.getMonth() - 1);
  return getMonthKey(date);
}

export function getNextMonthKey(monthKey: string): string {
  const date = parseMonthKey(monthKey);
  date.setMonth(date.getMonth() + 1);
  return getMonthKey(date);
}

export function getMonthRange(monthKey: string): { start: Date; end: Date } {
  const start = parseMonthKey(monthKey);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  return { start, end };
}

export function isCurrentMonth(monthKey: string): boolean {
  return monthKey === getCurrentMonthKey();
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatMonthYear(monthKey: string): string {
  const date = parseMonthKey(monthKey);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- tests/lib/utils/dates.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/dates.ts tests/lib/utils/dates.test.ts
git commit --no-gpg-sign -m "Add date utility functions"
```

---

## Task 5: Budget Calculation Utilities

**Files:**
- Create: `src/lib/utils/calculations.ts`
- Create: `tests/lib/utils/calculations.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/utils/calculations.test.ts
import { describe, it, expect } from 'vitest';
import {
  calculateUnallocated,
  calculateBucketRemaining,
  getBucketStatus,
  calculateTotalSpent
} from '$lib/utils/calculations';

describe('budget calculations', () => {
  describe('calculateUnallocated', () => {
    it('returns income minus allocations', () => {
      const income = 500000; // $5000
      const allocations = { a: 200000, b: 150000, c: 100000 };
      expect(calculateUnallocated(income, allocations)).toBe(50000);
    });

    it('returns negative when over-allocated', () => {
      const income = 100000;
      const allocations = { a: 60000, b: 60000 };
      expect(calculateUnallocated(income, allocations)).toBe(-20000);
    });

    it('handles empty allocations', () => {
      expect(calculateUnallocated(100000, {})).toBe(100000);
    });
  });

  describe('calculateBucketRemaining', () => {
    it('calculates remaining with rollover', () => {
      expect(calculateBucketRemaining(10000, 3000, 500)).toBe(7500);
    });

    it('handles negative remaining (overspent)', () => {
      expect(calculateBucketRemaining(10000, 12000, 0)).toBe(-2000);
    });
  });

  describe('getBucketStatus', () => {
    it('returns green for healthy budget', () => {
      expect(getBucketStatus(10000, 3000)).toBe('success');
    });

    it('returns warning when near zero', () => {
      expect(getBucketStatus(10000, 9500)).toBe('warning');
    });

    it('returns danger when overspent', () => {
      expect(getBucketStatus(10000, 12000)).toBe('danger');
    });
  });

  describe('calculateTotalSpent', () => {
    it('sums all bucket spending', () => {
      const spent = { a: 5000, b: 3000, c: 2000 };
      expect(calculateTotalSpent(spent)).toBe(10000);
    });

    it('returns 0 for empty', () => {
      expect(calculateTotalSpent({})).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- tests/lib/utils/calculations.test.ts
```

Expected: FAIL - module not found

- [ ] **Step 3: Implement calculation utilities**

```typescript
// src/lib/utils/calculations.ts

export function calculateUnallocated(
  income: number,
  allocations: Record<string, number>
): number {
  const totalAllocated = Object.values(allocations).reduce((sum, val) => sum + val, 0);
  return income - totalAllocated;
}

export function calculateBucketRemaining(
  allocated: number,
  spent: number,
  rollover: number
): number {
  return allocated + rollover - spent;
}

export function getBucketStatus(
  allocated: number,
  spent: number
): 'success' | 'warning' | 'danger' {
  if (spent > allocated) return 'danger';
  if (allocated > 0 && spent >= allocated * 0.9) return 'warning';
  return 'success';
}

export function calculateTotalSpent(spent: Record<string, number>): number {
  return Object.values(spent).reduce((sum, val) => sum + val, 0);
}

export function calculateTotalAllocated(allocations: Record<string, number>): number {
  return Object.values(allocations).reduce((sum, val) => sum + val, 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- tests/lib/utils/calculations.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/calculations.ts tests/lib/utils/calculations.test.ts
git commit --no-gpg-sign -m "Add budget calculation utilities"
```

---

## Task 6: Database Setup with Dexie

**Files:**
- Create: `src/lib/db/index.ts`

- [ ] **Step 1: Create database schema**

```typescript
// src/lib/db/index.ts
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
```

- [ ] **Step 2: Verify database compiles**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/index.ts
git commit --no-gpg-sign -m "Add Dexie database setup with default buckets"
```

---

## Task 7: UI Store

**Files:**
- Create: `src/lib/stores/uiStore.ts`

- [ ] **Step 1: Create UI store**

```typescript
// src/lib/stores/uiStore.ts
import { writable, derived } from 'svelte/store';
import { getCurrentMonthKey, formatMonthYear, isCurrentMonth } from '$lib/utils/dates';

export const currentMonthKey = writable<string>(getCurrentMonthKey());

export const currentMonthDisplay = derived(currentMonthKey, ($month) =>
  formatMonthYear($month)
);

export const isViewingCurrentMonth = derived(currentMonthKey, ($month) =>
  isCurrentMonth($month)
);

export const activeModal = writable<string | null>(null);

export function openModal(modalId: string) {
  activeModal.set(modalId);
}

export function closeModal() {
  activeModal.set(null);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/stores/uiStore.ts
git commit --no-gpg-sign -m "Add UI store for month selection and modals"
```

---

## Task 8: Budget Store

**Files:**
- Create: `src/lib/stores/budgetStore.ts`

- [ ] **Step 1: Create budget store**

```typescript
// src/lib/stores/budgetStore.ts
import { writable, derived, get } from 'svelte/store';
import { db, initializeDefaultBuckets } from '$lib/db';
import { currentMonthKey } from './uiStore';
import { getMonthKey, getPreviousMonthKey, getMonthRange } from '$lib/utils/dates';
import { calculateBucketRemaining, calculateUnallocated } from '$lib/utils/calculations';
import type { Bucket, Transaction, Income, MonthSnapshot, BucketStatus } from '$lib/types';

export const buckets = writable<Bucket[]>([]);
export const transactions = writable<Transaction[]>([]);
export const incomes = writable<Income[]>([]);
export const monthSnapshots = writable<MonthSnapshot[]>([]);
export const isLoading = writable(true);

export async function loadData(): Promise<void> {
  isLoading.set(true);
  await initializeDefaultBuckets();
  
  const [loadedBuckets, loadedTransactions, loadedIncomes, loadedSnapshots] = await Promise.all([
    db.buckets.orderBy('order').toArray(),
    db.transactions.toArray(),
    db.incomes.toArray(),
    db.monthSnapshots.toArray(),
  ]);
  
  buckets.set(loadedBuckets);
  transactions.set(loadedTransactions);
  incomes.set(loadedIncomes);
  monthSnapshots.set(loadedSnapshots);
  isLoading.set(false);
}

export const currentMonthTransactions = derived(
  [transactions, currentMonthKey],
  ([$transactions, $month]) => {
    const { start, end } = getMonthRange($month);
    return $transactions.filter((t) => {
      const date = new Date(t.date);
      return date >= start && date <= end;
    });
  }
);

export const currentMonthIncomes = derived(
  [incomes, currentMonthKey],
  ([$incomes, $month]) => {
    const { start, end } = getMonthRange($month);
    return $incomes.filter((i) => {
      const date = new Date(i.date);
      return date >= start && date <= end;
    });
  }
);

export const currentMonthIncome = derived(currentMonthIncomes, ($incomes) =>
  $incomes.reduce((sum, i) => sum + i.amount, 0)
);

export const currentSnapshot = derived(
  [monthSnapshots, currentMonthKey],
  ([$snapshots, $month]) =>
    $snapshots.find((s) => s.month === $month) || {
      month: $month,
      incomeTotal: 0,
      allocations: {},
      spent: {},
      rollovers: {},
    }
);

export const bucketStatuses = derived(
  [buckets, currentSnapshot, currentMonthTransactions],
  ([$buckets, $snapshot, $transactions]) => {
    const spent: Record<string, number> = {};
    for (const t of $transactions) {
      spent[t.bucketId] = (spent[t.bucketId] || 0) + t.amount;
    }
    
    return $buckets.map((bucket): BucketStatus => {
      const allocated = $snapshot.allocations[bucket.id] || 0;
      const bucketSpent = spent[bucket.id] || 0;
      const rollover = $snapshot.rollovers[bucket.id] || 0;
      const remaining = calculateBucketRemaining(allocated, bucketSpent, rollover);
      
      return { bucket, allocated, spent: bucketSpent, rollover, remaining };
    });
  }
);

export const unallocated = derived(
  [currentMonthIncome, currentSnapshot],
  ([$income, $snapshot]) => calculateUnallocated($income, $snapshot.allocations)
);

// Actions
export async function addBucket(bucket: Omit<Bucket, 'id'>): Promise<string> {
  const id = crypto.randomUUID();
  const newBucket = { ...bucket, id };
  await db.buckets.add(newBucket);
  buckets.update((b) => [...b, newBucket].sort((a, b) => a.order - b.order));
  return id;
}

export async function updateBucket(id: string, updates: Partial<Bucket>): Promise<void> {
  await db.buckets.update(id, updates);
  buckets.update((b) => b.map((bucket) => (bucket.id === id ? { ...bucket, ...updates } : bucket)));
}

export async function deleteBucket(id: string): Promise<void> {
  await db.buckets.delete(id);
  buckets.update((b) => b.filter((bucket) => bucket.id !== id));
}

export async function addTransaction(transaction: Omit<Transaction, 'id'>): Promise<string> {
  const id = crypto.randomUUID();
  const newTransaction = { ...transaction, id };
  await db.transactions.add(newTransaction);
  transactions.update((t) => [...t, newTransaction]);
  return id;
}

export async function updateTransaction(id: string, updates: Partial<Transaction>): Promise<void> {
  await db.transactions.update(id, updates);
  transactions.update((t) => t.map((tx) => (tx.id === id ? { ...tx, ...updates } : tx)));
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.transactions.delete(id);
  transactions.update((t) => t.filter((tx) => tx.id !== id));
}

export async function addIncome(income: Omit<Income, 'id'>): Promise<string> {
  const id = crypto.randomUUID();
  const newIncome = { ...income, id };
  await db.incomes.add(newIncome);
  incomes.update((i) => [...i, newIncome]);
  return id;
}

export async function deleteIncome(id: string): Promise<void> {
  await db.incomes.delete(id);
  incomes.update((i) => i.filter((inc) => inc.id !== id));
}

export async function setAllocation(bucketId: string, amount: number): Promise<void> {
  const $month = get(currentMonthKey);
  let snapshot = await db.monthSnapshots.get($month);
  
  if (!snapshot) {
    snapshot = {
      month: $month,
      incomeTotal: 0,
      allocations: {},
      spent: {},
      rollovers: {},
    };
  }
  
  snapshot.allocations[bucketId] = amount;
  await db.monthSnapshots.put(snapshot);
  
  monthSnapshots.update((s) => {
    const idx = s.findIndex((snap) => snap.month === $month);
    if (idx >= 0) {
      s[idx] = snapshot!;
      return [...s];
    }
    return [...s, snapshot!];
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/stores/budgetStore.ts
git commit --no-gpg-sign -m "Add budget store with CRUD operations"
```

---

## Task 9: Recurring Store

**Files:**
- Create: `src/lib/stores/recurringStore.ts`

- [ ] **Step 1: Create recurring store**

```typescript
// src/lib/stores/recurringStore.ts
import { writable, derived } from 'svelte/store';
import { db } from '$lib/db';
import { addTransaction } from './budgetStore';
import type { RecurringTransaction } from '$lib/types';

export const recurringTransactions = writable<RecurringTransaction[]>([]);

export async function loadRecurring(): Promise<void> {
  const loaded = await db.recurringTransactions.toArray();
  recurringTransactions.set(loaded);
}

export const upcomingRecurring = derived(recurringTransactions, ($recurring) => {
  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  
  return $recurring
    .filter((r) => r.isActive && new Date(r.nextDueDate) <= sevenDays)
    .sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime());
});

export const dueRecurring = derived(recurringTransactions, ($recurring) => {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  
  return $recurring.filter((r) => r.isActive && new Date(r.nextDueDate) <= now);
});

function calculateNextDueDate(current: Date, frequency: RecurringTransaction['frequency']): Date {
  const next = new Date(current);
  
  switch (frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'biweekly':
      next.setDate(next.getDate() + 14);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
  }
  
  return next;
}

export async function processRecurring(): Promise<number> {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  
  const due = await db.recurringTransactions
    .filter((r) => r.isActive && new Date(r.nextDueDate) <= now)
    .toArray();
  
  let processed = 0;
  
  for (const recurring of due) {
    await addTransaction({
      amount: recurring.amount,
      bucketId: recurring.bucketId,
      date: new Date(recurring.nextDueDate),
      note: recurring.note,
      recurringId: recurring.id,
    });
    
    const nextDue = calculateNextDueDate(new Date(recurring.nextDueDate), recurring.frequency);
    await db.recurringTransactions.update(recurring.id, { nextDueDate: nextDue });
    processed++;
  }
  
  if (processed > 0) {
    await loadRecurring();
  }
  
  return processed;
}

export async function addRecurring(recurring: Omit<RecurringTransaction, 'id'>): Promise<string> {
  const id = crypto.randomUUID();
  const newRecurring = { ...recurring, id };
  await db.recurringTransactions.add(newRecurring);
  recurringTransactions.update((r) => [...r, newRecurring]);
  return id;
}

export async function updateRecurring(id: string, updates: Partial<RecurringTransaction>): Promise<void> {
  await db.recurringTransactions.update(id, updates);
  recurringTransactions.update((r) =>
    r.map((rec) => (rec.id === id ? { ...rec, ...updates } : rec))
  );
}

export async function deleteRecurring(id: string): Promise<void> {
  await db.recurringTransactions.delete(id);
  recurringTransactions.update((r) => r.filter((rec) => rec.id !== id));
}

export async function toggleRecurring(id: string): Promise<void> {
  const recurring = await db.recurringTransactions.get(id);
  if (recurring) {
    await updateRecurring(id, { isActive: !recurring.isActive });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/stores/recurringStore.ts
git commit --no-gpg-sign -m "Add recurring transaction store"
```

---

## Task 10: Modal Component

**Files:**
- Create: `src/lib/components/shared/Modal.svelte`

- [ ] **Step 1: Create Modal component**

```svelte
<!-- src/lib/components/shared/Modal.svelte -->
<script lang="ts">
  import { activeModal, closeModal } from '$lib/stores/uiStore';
  import { fade, fly } from 'svelte/transition';

  export let id: string;
  export let title: string;

  $: isOpen = $activeModal === id;

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') closeModal();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) closeModal();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    transition:fade={{ duration: 150 }}
    on:click={handleBackdropClick}
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
  >
    <div
      class="w-full max-w-md rounded-lg bg-white shadow-xl"
      transition:fly={{ y: 20, duration: 200 }}
    >
      <div class="flex items-center justify-between border-b px-4 py-3">
        <h2 id="modal-title" class="text-lg font-semibold text-gray-800">{title}</h2>
        <button
          class="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          on:click={closeModal}
          aria-label="Close modal"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="p-4">
        <slot />
      </div>
    </div>
  </div>
{/if}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/shared/Modal.svelte
git commit --no-gpg-sign -m "Add Modal component"
```

---

## Task 11: ProgressBar Component

**Files:**
- Create: `src/lib/components/shared/ProgressBar.svelte`

- [ ] **Step 1: Create ProgressBar component**

```svelte
<!-- src/lib/components/shared/ProgressBar.svelte -->
<script lang="ts">
  import { getBucketStatus } from '$lib/utils/calculations';

  export let allocated: number;
  export let spent: number;
  export let showLabel = true;

  $: percentage = allocated > 0 ? Math.min((spent / allocated) * 100, 100) : 0;
  $: status = getBucketStatus(allocated, spent);
  $: colorClass = {
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
  }[status];
</script>

<div class="w-full">
  <div class="h-2 overflow-hidden rounded-full bg-gray-200">
    <div
      class="h-full transition-all duration-300 {colorClass}"
      style="width: {percentage}%"
    />
  </div>
  {#if showLabel}
    <p class="mt-1 text-xs text-gray-500">
      {Math.round(percentage)}% spent
    </p>
  {/if}
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/shared/ProgressBar.svelte
git commit --no-gpg-sign -m "Add ProgressBar component"
```

---

## Task 12: MonthPicker Component

**Files:**
- Create: `src/lib/components/shared/MonthPicker.svelte`

- [ ] **Step 1: Create MonthPicker component**

```svelte
<!-- src/lib/components/shared/MonthPicker.svelte -->
<script lang="ts">
  import { currentMonthKey, currentMonthDisplay } from '$lib/stores/uiStore';
  import { getPreviousMonthKey, getNextMonthKey, getCurrentMonthKey } from '$lib/utils/dates';

  function goToPrevious() {
    currentMonthKey.update((m) => getPreviousMonthKey(m));
  }

  function goToNext() {
    currentMonthKey.update((m) => getNextMonthKey(m));
  }

  function goToCurrent() {
    currentMonthKey.set(getCurrentMonthKey());
  }

  $: isCurrentMonth = $currentMonthKey === getCurrentMonthKey();
</script>

<div class="flex items-center gap-2">
  <button
    class="rounded p-2 text-gray-600 hover:bg-gray-100"
    on:click={goToPrevious}
    aria-label="Previous month"
  >
    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
    </svg>
  </button>

  <button
    class="min-w-[140px] rounded px-3 py-1 text-center font-medium text-gray-800 hover:bg-gray-100"
    on:click={goToCurrent}
    title="Go to current month"
  >
    {$currentMonthDisplay}
  </button>

  <button
    class="rounded p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
    on:click={goToNext}
    disabled={isCurrentMonth}
    aria-label="Next month"
  >
    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
    </svg>
  </button>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/shared/MonthPicker.svelte
git commit --no-gpg-sign -m "Add MonthPicker component"
```

---

## Task 13: BucketCard Component

**Files:**
- Create: `src/lib/components/shared/BucketCard.svelte`

- [ ] **Step 1: Create BucketCard component**

```svelte
<!-- src/lib/components/shared/BucketCard.svelte -->
<script lang="ts">
  import { formatCurrency } from '$lib/utils/currency';
  import { getBucketStatus } from '$lib/utils/calculations';
  import ProgressBar from './ProgressBar.svelte';
  import type { BucketStatus } from '$lib/types';

  export let status: BucketStatus;
  export let onClick: (() => void) | undefined = undefined;

  $: ({ bucket, allocated, spent, rollover, remaining } = status);
  $: budgetStatus = getBucketStatus(allocated, spent);
  $: remainingColor = {
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
  }[budgetStatus];
</script>

<button
  class="w-full rounded-lg bg-white p-4 text-left shadow transition hover:shadow-md"
  on:click={onClick}
  type="button"
>
  <div class="mb-2 flex items-center gap-2">
    <span
      class="h-3 w-3 rounded-full"
      style="background-color: {bucket.color}"
    />
    <h3 class="font-medium text-gray-800">{bucket.name}</h3>
  </div>

  <ProgressBar {allocated} {spent} showLabel={false} />

  <div class="mt-3 flex justify-between text-sm">
    <div>
      <p class="text-gray-500">Remaining</p>
      <p class="font-semibold {remainingColor}">{formatCurrency(remaining)}</p>
    </div>
    <div class="text-right">
      <p class="text-gray-500">Spent</p>
      <p class="text-gray-700">{formatCurrency(spent)}</p>
    </div>
  </div>

  {#if rollover !== 0}
    <p class="mt-2 text-xs text-gray-400">
      Rollover: {formatCurrency(rollover)}
    </p>
  {/if}
</button>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/shared/BucketCard.svelte
git commit --no-gpg-sign -m "Add BucketCard component"
```

---

## Task 14: QuickEntry Component

**Files:**
- Create: `src/lib/components/shared/QuickEntry.svelte`

- [ ] **Step 1: Create QuickEntry component**

```svelte
<!-- src/lib/components/shared/QuickEntry.svelte -->
<script lang="ts">
  import { buckets, addTransaction } from '$lib/stores/budgetStore';
  import { parseCurrency } from '$lib/utils/currency';

  export let preselectedBucketId: string | undefined = undefined;
  export let onComplete: (() => void) | undefined = undefined;

  let amount = '';
  let bucketId = preselectedBucketId || '';
  let note = '';
  let isSubmitting = false;

  $: if (preselectedBucketId) bucketId = preselectedBucketId;

  async function handleSubmit() {
    if (!amount || !bucketId) return;

    isSubmitting = true;
    try {
      await addTransaction({
        amount: parseCurrency(amount),
        bucketId,
        date: new Date(),
        note: note || undefined,
      });
      amount = '';
      note = '';
      if (!preselectedBucketId) bucketId = '';
      onComplete?.();
    } finally {
      isSubmitting = false;
    }
  }
</script>

<form on:submit|preventDefault={handleSubmit} class="space-y-3">
  <div>
    <label for="amount" class="block text-sm font-medium text-gray-700">Amount</label>
    <div class="relative mt-1">
      <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
      <input
        id="amount"
        type="text"
        inputmode="decimal"
        bind:value={amount}
        placeholder="0.00"
        class="w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        required
      />
    </div>
  </div>

  <div>
    <label for="bucket" class="block text-sm font-medium text-gray-700">Bucket</label>
    <select
      id="bucket"
      bind:value={bucketId}
      class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      required
    >
      <option value="">Select a bucket</option>
      {#each $buckets as bucket}
        <option value={bucket.id}>{bucket.name}</option>
      {/each}
    </select>
  </div>

  <div>
    <label for="note" class="block text-sm font-medium text-gray-700">Note (optional)</label>
    <input
      id="note"
      type="text"
      bind:value={note}
      placeholder="Add a note..."
      class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
    />
  </div>

  <button
    type="submit"
    disabled={isSubmitting || !amount || !bucketId}
    class="w-full rounded-lg bg-primary px-4 py-2 font-medium text-white transition hover:bg-blue-600 disabled:opacity-50"
  >
    {isSubmitting ? 'Adding...' : 'Add Transaction'}
  </button>
</form>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/shared/QuickEntry.svelte
git commit --no-gpg-sign -m "Add QuickEntry component"
```

---

## Task 15: TransactionRow Component

**Files:**
- Create: `src/lib/components/shared/TransactionRow.svelte`

- [ ] **Step 1: Create TransactionRow component**

```svelte
<!-- src/lib/components/shared/TransactionRow.svelte -->
<script lang="ts">
  import { formatCurrency } from '$lib/utils/currency';
  import { formatDate } from '$lib/utils/dates';
  import { buckets, deleteTransaction } from '$lib/stores/budgetStore';
  import type { Transaction } from '$lib/types';

  export let transaction: Transaction;
  export let showBucket = true;

  $: bucket = $buckets.find((b) => b.id === transaction.bucketId);

  let isDeleting = false;

  async function handleDelete() {
    if (!confirm('Delete this transaction?')) return;
    isDeleting = true;
    await deleteTransaction(transaction.id);
  }
</script>

<div class="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm">
  <div class="flex items-center gap-3">
    {#if showBucket && bucket}
      <span
        class="h-2 w-2 rounded-full"
        style="background-color: {bucket.color}"
      />
    {/if}
    <div>
      <p class="font-medium text-gray-800">{formatCurrency(transaction.amount)}</p>
      <p class="text-sm text-gray-500">
        {formatDate(new Date(transaction.date))}
        {#if transaction.note}
          &middot; {transaction.note}
        {/if}
      </p>
    </div>
  </div>

  <div class="flex items-center gap-2">
    {#if showBucket && bucket}
      <span class="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">
        {bucket.name}
      </span>
    {/if}
    <button
      class="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-danger disabled:opacity-50"
      on:click={handleDelete}
      disabled={isDeleting}
      aria-label="Delete transaction"
    >
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    </button>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/shared/TransactionRow.svelte
git commit --no-gpg-sign -m "Add TransactionRow component"
```

---

## Task 16: Nav Component

**Files:**
- Create: `src/lib/components/layout/Nav.svelte`

- [ ] **Step 1: Create Nav component**

```svelte
<!-- src/lib/components/layout/Nav.svelte -->
<script lang="ts">
  import { page } from '$app/stores';

  const navItems = [
    { href: '/', label: 'Dashboard', icon: 'home' },
    { href: '/buckets', label: 'Buckets', icon: 'folder' },
    { href: '/transactions', label: 'Transactions', icon: 'list' },
    { href: '/recurring', label: 'Recurring', icon: 'refresh' },
    { href: '/analytics', label: 'Analytics', icon: 'chart' },
    { href: '/settings', label: 'Settings', icon: 'cog' },
  ];

  $: currentPath = $page.url.pathname;
</script>

<!-- Desktop sidebar -->
<nav class="hidden h-full w-56 flex-shrink-0 border-r bg-white md:block">
  <div class="p-4">
    <h1 class="text-xl font-bold text-primary">Budget</h1>
  </div>
  <ul class="space-y-1 px-2">
    {#each navItems as item}
      <li>
        <a
          href={item.href}
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-gray-700 transition hover:bg-gray-100"
          class:bg-blue-50={currentPath === item.href}
          class:text-primary={currentPath === item.href}
        >
          <span class="h-5 w-5">{item.label.slice(0, 1)}</span>
          <span>{item.label}</span>
        </a>
      </li>
    {/each}
  </ul>
</nav>

<!-- Mobile bottom nav -->
<nav class="fixed bottom-0 left-0 right-0 z-40 border-t bg-white md:hidden">
  <ul class="flex justify-around">
    {#each navItems.slice(0, 5) as item}
      <li class="flex-1">
        <a
          href={item.href}
          class="flex flex-col items-center gap-1 py-2 text-gray-600"
          class:text-primary={currentPath === item.href}
        >
          <span class="text-xs">{item.label.slice(0, 1)}</span>
          <span class="text-xs">{item.label}</span>
        </a>
      </li>
    {/each}
  </ul>
</nav>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/layout/Nav.svelte
git commit --no-gpg-sign -m "Add Nav component with responsive layout"
```

---

## Task 17: Layout Component

**Files:**
- Create: `src/lib/components/layout/Layout.svelte`

- [ ] **Step 1: Create Layout component**

```svelte
<!-- src/lib/components/layout/Layout.svelte -->
<script lang="ts">
  import Nav from './Nav.svelte';
</script>

<div class="flex h-screen bg-background">
  <Nav />
  <main class="flex-1 overflow-auto pb-16 md:pb-0">
    <div class="mx-auto max-w-4xl p-4">
      <slot />
    </div>
  </main>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/layout/Layout.svelte
git commit --no-gpg-sign -m "Add Layout component"
```

---

## Task 18: Root Layout

**Files:**
- Create: `src/routes/+layout.svelte`

- [ ] **Step 1: Create root layout**

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import '../app.css';
  import Layout from '$lib/components/layout/Layout.svelte';
  import { onMount } from 'svelte';
  import { loadData, isLoading } from '$lib/stores/budgetStore';
  import { loadRecurring, processRecurring } from '$lib/stores/recurringStore';

  onMount(async () => {
    await loadData();
    await loadRecurring();
    await processRecurring();
  });
</script>

{#if $isLoading}
  <div class="flex h-screen items-center justify-center bg-background">
    <p class="text-gray-500">Loading...</p>
  </div>
{:else}
  <Layout>
    <slot />
  </Layout>
{/if}
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/+layout.svelte
git commit --no-gpg-sign -m "Add root layout with data loading"
```

---

## Task 19: Dashboard Page

**Files:**
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Create Dashboard page**

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
  import MonthPicker from '$lib/components/shared/MonthPicker.svelte';
  import BucketCard from '$lib/components/shared/BucketCard.svelte';
  import QuickEntry from '$lib/components/shared/QuickEntry.svelte';
  import Modal from '$lib/components/shared/Modal.svelte';
  import { bucketStatuses, currentMonthIncome, unallocated } from '$lib/stores/budgetStore';
  import { openModal, closeModal } from '$lib/stores/uiStore';
  import { formatCurrency } from '$lib/utils/currency';

  let selectedBucketId: string | undefined;

  function handleBucketClick(bucketId: string) {
    selectedBucketId = bucketId;
    openModal('quick-entry');
  }

  function handleEntryComplete() {
    closeModal();
    selectedBucketId = undefined;
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold text-gray-800">Dashboard</h1>
    <MonthPicker />
  </div>

  <!-- Summary Cards -->
  <div class="grid gap-4 sm:grid-cols-3">
    <div class="rounded-lg bg-white p-4 shadow">
      <p class="text-sm text-gray-500">Income</p>
      <p class="text-xl font-bold text-gray-800">{formatCurrency($currentMonthIncome)}</p>
    </div>
    <div class="rounded-lg bg-white p-4 shadow">
      <p class="text-sm text-gray-500">Allocated</p>
      <p class="text-xl font-bold text-gray-800">
        {formatCurrency($currentMonthIncome - $unallocated)}
      </p>
    </div>
    <div class="rounded-lg bg-white p-4 shadow">
      <p class="text-sm text-gray-500">Unallocated</p>
      <p class="text-xl font-bold" class:text-danger={$unallocated < 0} class:text-warning={$unallocated > 0} class:text-success={$unallocated === 0}>
        {formatCurrency($unallocated)}
      </p>
    </div>
  </div>

  {#if $unallocated !== 0}
    <div class="rounded-lg border-l-4 p-4" class:border-warning={$unallocated > 0} class:bg-amber-50={$unallocated > 0} class:border-danger={$unallocated < 0} class:bg-red-50={$unallocated < 0}>
      <p class="text-sm">
        {#if $unallocated > 0}
          You have {formatCurrency($unallocated)} unallocated. Assign it to buckets!
        {:else}
          You're {formatCurrency(Math.abs($unallocated))} over budget.
        {/if}
      </p>
    </div>
  {/if}

  <!-- Quick Add Button -->
  <button
    class="w-full rounded-lg border-2 border-dashed border-gray-300 py-3 text-gray-500 transition hover:border-primary hover:text-primary"
    on:click={() => openModal('quick-entry')}
  >
    + Add Transaction
  </button>

  <!-- Bucket Grid -->
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each $bucketStatuses as status}
      <BucketCard {status} onClick={() => handleBucketClick(status.bucket.id)} />
    {/each}
  </div>
</div>

<Modal id="quick-entry" title="Add Transaction">
  <QuickEntry preselectedBucketId={selectedBucketId} onComplete={handleEntryComplete} />
</Modal>
```

- [ ] **Step 2: Run dev server and verify**

```bash
npm run dev
```

Expected: Dashboard displays with income summary and bucket cards

- [ ] **Step 3: Commit**

```bash
git add src/routes/+page.svelte
git commit --no-gpg-sign -m "Add Dashboard page with bucket grid and quick entry"
```

---

## Task 20: Buckets Page

**Files:**
- Create: `src/routes/buckets/+page.svelte`

- [ ] **Step 1: Create Buckets page**

```svelte
<!-- src/routes/buckets/+page.svelte -->
<script lang="ts">
  import { buckets, bucketStatuses, addBucket, updateBucket, deleteBucket, setAllocation } from '$lib/stores/budgetStore';
  import { formatCurrency, parseCurrency } from '$lib/utils/currency';
  import Modal from '$lib/components/shared/Modal.svelte';
  import { openModal, closeModal } from '$lib/stores/uiStore';

  let editingBucket: { id: string; name: string; color: string } | null = null;
  let newBucketName = '';
  let newBucketColor = '#6366f1';

  function handleAddBucket() {
    editingBucket = null;
    newBucketName = '';
    newBucketColor = '#6366f1';
    openModal('bucket-form');
  }

  function handleEditBucket(bucket: { id: string; name: string; color: string }) {
    editingBucket = bucket;
    newBucketName = bucket.name;
    newBucketColor = bucket.color;
    openModal('bucket-form');
  }

  async function handleSubmit() {
    if (!newBucketName.trim()) return;

    if (editingBucket) {
      await updateBucket(editingBucket.id, {
        name: newBucketName,
        color: newBucketColor,
      });
    } else {
      await addBucket({
        name: newBucketName,
        color: newBucketColor,
        order: $buckets.length,
        isDefault: false,
      });
    }
    closeModal();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this bucket? Transactions will need to be reassigned.')) return;
    await deleteBucket(id);
  }

  async function handleAllocationChange(bucketId: string, value: string) {
    const cents = parseCurrency(value);
    await setAllocation(bucketId, cents);
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold text-gray-800">Buckets</h1>
    <button
      class="rounded-lg bg-primary px-4 py-2 text-white hover:bg-blue-600"
      on:click={handleAddBucket}
    >
      + Add Bucket
    </button>
  </div>

  <div class="space-y-3">
    {#each $bucketStatuses as status}
      <div class="flex items-center gap-4 rounded-lg bg-white p-4 shadow">
        <span
          class="h-4 w-4 rounded-full"
          style="background-color: {status.bucket.color}"
        />
        <div class="flex-1">
          <h3 class="font-medium text-gray-800">{status.bucket.name}</h3>
          {#if status.rollover !== 0}
            <p class="text-xs text-gray-400">Rollover: {formatCurrency(status.rollover)}</p>
          {/if}
        </div>
        <div class="flex items-center gap-2">
          <span class="text-gray-500">$</span>
          <input
            type="text"
            value={(status.allocated / 100).toFixed(2)}
            on:change={(e) => handleAllocationChange(status.bucket.id, e.currentTarget.value)}
            class="w-24 rounded border px-2 py-1 text-right"
            placeholder="0.00"
          />
        </div>
        <div class="flex gap-1">
          <button
            class="rounded p-2 text-gray-500 hover:bg-gray-100"
            on:click={() => handleEditBucket(status.bucket)}
          >
            Edit
          </button>
          {#if !status.bucket.isDefault}
            <button
              class="rounded p-2 text-danger hover:bg-red-50"
              on:click={() => handleDelete(status.bucket.id)}
            >
              Delete
            </button>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>

<Modal id="bucket-form" title={editingBucket ? 'Edit Bucket' : 'Add Bucket'}>
  <form on:submit|preventDefault={handleSubmit} class="space-y-4">
    <div>
      <label for="name" class="block text-sm font-medium text-gray-700">Name</label>
      <input
        id="name"
        type="text"
        bind:value={newBucketName}
        class="mt-1 w-full rounded-lg border px-3 py-2"
        required
      />
    </div>
    <div>
      <label for="color" class="block text-sm font-medium text-gray-700">Color</label>
      <input
        id="color"
        type="color"
        bind:value={newBucketColor}
        class="mt-1 h-10 w-full rounded-lg border"
      />
    </div>
    <button
      type="submit"
      class="w-full rounded-lg bg-primary px-4 py-2 text-white hover:bg-blue-600"
    >
      {editingBucket ? 'Update' : 'Add'} Bucket
    </button>
  </form>
</Modal>
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/buckets/+page.svelte
git commit --no-gpg-sign -m "Add Buckets page with allocation management"
```

---

## Task 21: Transactions Page

**Files:**
- Create: `src/routes/transactions/+page.svelte`

- [ ] **Step 1: Create Transactions page**

```svelte
<!-- src/routes/transactions/+page.svelte -->
<script lang="ts">
  import TransactionRow from '$lib/components/shared/TransactionRow.svelte';
  import QuickEntry from '$lib/components/shared/QuickEntry.svelte';
  import Modal from '$lib/components/shared/Modal.svelte';
  import MonthPicker from '$lib/components/shared/MonthPicker.svelte';
  import { currentMonthTransactions, buckets } from '$lib/stores/budgetStore';
  import { openModal } from '$lib/stores/uiStore';

  let filterBucketId = '';

  $: filteredTransactions = filterBucketId
    ? $currentMonthTransactions.filter((t) => t.bucketId === filterBucketId)
    : $currentMonthTransactions;

  $: sortedTransactions = [...filteredTransactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold text-gray-800">Transactions</h1>
    <MonthPicker />
  </div>

  <div class="flex gap-4">
    <select
      bind:value={filterBucketId}
      class="rounded-lg border px-3 py-2"
    >
      <option value="">All Buckets</option>
      {#each $buckets as bucket}
        <option value={bucket.id}>{bucket.name}</option>
      {/each}
    </select>

    <button
      class="rounded-lg bg-primary px-4 py-2 text-white hover:bg-blue-600"
      on:click={() => openModal('add-transaction')}
    >
      + Add
    </button>
  </div>

  {#if sortedTransactions.length === 0}
    <p class="py-8 text-center text-gray-500">No transactions this month</p>
  {:else}
    <div class="space-y-2">
      {#each sortedTransactions as transaction (transaction.id)}
        <TransactionRow {transaction} />
      {/each}
    </div>
  {/if}
</div>

<Modal id="add-transaction" title="Add Transaction">
  <QuickEntry />
</Modal>
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/transactions/+page.svelte
git commit --no-gpg-sign -m "Add Transactions page with filtering"
```

---

## Task 22: Recurring Page

**Files:**
- Create: `src/routes/recurring/+page.svelte`

- [ ] **Step 1: Create Recurring page**

```svelte
<!-- src/routes/recurring/+page.svelte -->
<script lang="ts">
  import { recurringTransactions, addRecurring, updateRecurring, deleteRecurring, toggleRecurring } from '$lib/stores/recurringStore';
  import { buckets } from '$lib/stores/budgetStore';
  import { formatCurrency, parseCurrency } from '$lib/utils/currency';
  import { formatDate } from '$lib/utils/dates';
  import Modal from '$lib/components/shared/Modal.svelte';
  import { openModal, closeModal } from '$lib/stores/uiStore';
  import type { RecurringTransaction } from '$lib/types';

  let editingId: string | null = null;
  let amount = '';
  let bucketId = '';
  let frequency: RecurringTransaction['frequency'] = 'monthly';
  let nextDueDate = new Date().toISOString().split('T')[0];
  let note = '';

  function resetForm() {
    editingId = null;
    amount = '';
    bucketId = '';
    frequency = 'monthly';
    nextDueDate = new Date().toISOString().split('T')[0];
    note = '';
  }

  function handleAdd() {
    resetForm();
    openModal('recurring-form');
  }

  function handleEdit(rec: RecurringTransaction) {
    editingId = rec.id;
    amount = (rec.amount / 100).toFixed(2);
    bucketId = rec.bucketId;
    frequency = rec.frequency;
    nextDueDate = new Date(rec.nextDueDate).toISOString().split('T')[0];
    note = rec.note || '';
    openModal('recurring-form');
  }

  async function handleSubmit() {
    if (!amount || !bucketId) return;

    const data = {
      amount: parseCurrency(amount),
      bucketId,
      frequency,
      nextDueDate: new Date(nextDueDate),
      note: note || undefined,
      isActive: true,
    };

    if (editingId) {
      await updateRecurring(editingId, data);
    } else {
      await addRecurring(data);
    }
    closeModal();
    resetForm();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this recurring transaction?')) return;
    await deleteRecurring(id);
  }

  $: sortedRecurring = [...$recurringTransactions].sort(
    (a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime()
  );
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold text-gray-800">Recurring</h1>
    <button
      class="rounded-lg bg-primary px-4 py-2 text-white hover:bg-blue-600"
      on:click={handleAdd}
    >
      + Add Recurring
    </button>
  </div>

  {#if sortedRecurring.length === 0}
    <p class="py-8 text-center text-gray-500">No recurring transactions</p>
  {:else}
    <div class="space-y-3">
      {#each sortedRecurring as rec}
        {@const bucket = $buckets.find((b) => b.id === rec.bucketId)}
        <div class="flex items-center gap-4 rounded-lg bg-white p-4 shadow" class:opacity-50={!rec.isActive}>
          <span
            class="h-3 w-3 rounded-full"
            style="background-color: {bucket?.color || '#ccc'}"
          />
          <div class="flex-1">
            <p class="font-medium">{formatCurrency(rec.amount)}</p>
            <p class="text-sm text-gray-500">
              {bucket?.name || 'Unknown'} &middot; {rec.frequency}
              {#if rec.note} &middot; {rec.note}{/if}
            </p>
          </div>
          <div class="text-right">
            <p class="text-sm text-gray-600">Next due</p>
            <p class="text-sm font-medium">{formatDate(new Date(rec.nextDueDate))}</p>
          </div>
          <div class="flex gap-1">
            <button
              class="rounded px-2 py-1 text-sm hover:bg-gray-100"
              on:click={() => toggleRecurring(rec.id)}
            >
              {rec.isActive ? 'Pause' : 'Resume'}
            </button>
            <button
              class="rounded px-2 py-1 text-sm hover:bg-gray-100"
              on:click={() => handleEdit(rec)}
            >
              Edit
            </button>
            <button
              class="rounded px-2 py-1 text-sm text-danger hover:bg-red-50"
              on:click={() => handleDelete(rec.id)}
            >
              Delete
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<Modal id="recurring-form" title={editingId ? 'Edit Recurring' : 'Add Recurring'}>
  <form on:submit|preventDefault={handleSubmit} class="space-y-4">
    <div>
      <label class="block text-sm font-medium text-gray-700">Amount</label>
      <input type="text" bind:value={amount} class="mt-1 w-full rounded-lg border px-3 py-2" required />
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700">Bucket</label>
      <select bind:value={bucketId} class="mt-1 w-full rounded-lg border px-3 py-2" required>
        <option value="">Select bucket</option>
        {#each $buckets as bucket}
          <option value={bucket.id}>{bucket.name}</option>
        {/each}
      </select>
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700">Frequency</label>
      <select bind:value={frequency} class="mt-1 w-full rounded-lg border px-3 py-2">
        <option value="weekly">Weekly</option>
        <option value="biweekly">Bi-weekly</option>
        <option value="monthly">Monthly</option>
      </select>
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700">Next Due Date</label>
      <input type="date" bind:value={nextDueDate} class="mt-1 w-full rounded-lg border px-3 py-2" required />
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700">Note (optional)</label>
      <input type="text" bind:value={note} class="mt-1 w-full rounded-lg border px-3 py-2" />
    </div>
    <button type="submit" class="w-full rounded-lg bg-primary px-4 py-2 text-white hover:bg-blue-600">
      {editingId ? 'Update' : 'Add'} Recurring
    </button>
  </form>
</Modal>
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/recurring/+page.svelte
git commit --no-gpg-sign -m "Add Recurring page with CRUD operations"
```

---

## Task 23: Chart Components

**Files:**
- Create: `src/lib/components/charts/DonutChart.svelte`
- Create: `src/lib/components/charts/BarChart.svelte`
- Create: `src/lib/components/charts/LineChart.svelte`

- [ ] **Step 1: Create DonutChart component**

```svelte
<!-- src/lib/components/charts/DonutChart.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Chart, DoughnutController, ArcElement, Tooltip, Legend } from 'chart.js';

  Chart.register(DoughnutController, ArcElement, Tooltip, Legend);

  export let data: { label: string; value: number; color: string }[];

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  $: if (chart && data) {
    chart.data.labels = data.map((d) => d.label);
    chart.data.datasets[0].data = data.map((d) => d.value);
    chart.data.datasets[0].backgroundColor = data.map((d) => d.color);
    chart.update();
  }

  onMount(() => {
    chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: data.map((d) => d.label),
        datasets: [{
          data: data.map((d) => d.value),
          backgroundColor: data.map((d) => d.color),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom' },
        },
      },
    });

    return () => chart?.destroy();
  });
</script>

<canvas bind:this={canvas}></canvas>
```

- [ ] **Step 2: Create BarChart component**

```svelte
<!-- src/lib/components/charts/BarChart.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';

  Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

  export let labels: string[];
  export let datasets: { label: string; data: number[]; color: string }[];

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  $: if (chart && labels && datasets) {
    chart.data.labels = labels;
    chart.data.datasets = datasets.map((ds) => ({
      label: ds.label,
      data: ds.data,
      backgroundColor: ds.color,
    }));
    chart.update();
  }

  onMount(() => {
    chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: datasets.map((ds) => ({
          label: ds.label,
          data: ds.data,
          backgroundColor: ds.color,
        })),
      },
      options: {
        responsive: true,
        scales: {
          y: { beginAtZero: true },
        },
      },
    });

    return () => chart?.destroy();
  });
</script>

<canvas bind:this={canvas}></canvas>
```

- [ ] **Step 3: Create LineChart component**

```svelte
<!-- src/lib/components/charts/LineChart.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Chart, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';

  Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

  export let labels: string[];
  export let datasets: { label: string; data: number[]; color: string }[];

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  $: if (chart && labels && datasets) {
    chart.data.labels = labels;
    chart.data.datasets = datasets.map((ds) => ({
      label: ds.label,
      data: ds.data,
      borderColor: ds.color,
      backgroundColor: ds.color + '20',
      fill: true,
      tension: 0.3,
    }));
    chart.update();
  }

  onMount(() => {
    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: datasets.map((ds) => ({
          label: ds.label,
          data: ds.data,
          borderColor: ds.color,
          backgroundColor: ds.color + '20',
          fill: true,
          tension: 0.3,
        })),
      },
      options: {
        responsive: true,
        scales: {
          y: { beginAtZero: true },
        },
      },
    });

    return () => chart?.destroy();
  });
</script>

<canvas bind:this={canvas}></canvas>
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/charts/
git commit --no-gpg-sign -m "Add Chart.js chart components"
```

---

## Task 24: Analytics Page

**Files:**
- Create: `src/routes/analytics/+page.svelte`

- [ ] **Step 1: Create Analytics page**

```svelte
<!-- src/routes/analytics/+page.svelte -->
<script lang="ts">
  import DonutChart from '$lib/components/charts/DonutChart.svelte';
  import BarChart from '$lib/components/charts/BarChart.svelte';
  import LineChart from '$lib/components/charts/LineChart.svelte';
  import { bucketStatuses, monthSnapshots, buckets, transactions, incomes } from '$lib/stores/budgetStore';
  import { centsToDollars } from '$lib/utils/currency';
  import { getMonthKey, formatMonthYear, getPreviousMonthKey } from '$lib/utils/dates';

  $: spendingByCategory = $bucketStatuses
    .filter((s) => s.spent > 0)
    .map((s) => ({
      label: s.bucket.name,
      value: centsToDollars(s.spent),
      color: s.bucket.color,
    }));

  $: last6Months = Array.from({ length: 6 }, (_, i) => {
    let month = getMonthKey(new Date());
    for (let j = 0; j < 5 - i; j++) month = getPreviousMonthKey(month);
    return month;
  });

  $: monthlySpending = last6Months.map((month) => {
    const snapshot = $monthSnapshots.find((s) => s.month === month);
    const spent = snapshot ? Object.values(snapshot.spent).reduce((a, b) => a + b, 0) : 0;
    return centsToDollars(spent);
  });

  $: monthlyIncome = last6Months.map((month) => {
    const snapshot = $monthSnapshots.find((s) => s.month === month);
    return centsToDollars(snapshot?.incomeTotal || 0);
  });

  $: monthLabels = last6Months.map((m) => formatMonthYear(m).split(' ')[0]);
</script>

<div class="space-y-8">
  <h1 class="text-2xl font-bold text-gray-800">Analytics</h1>

  <div class="grid gap-6 lg:grid-cols-2">
    <div class="rounded-lg bg-white p-4 shadow">
      <h2 class="mb-4 font-semibold text-gray-800">Spending by Category</h2>
      {#if spendingByCategory.length > 0}
        <DonutChart data={spendingByCategory} />
      {:else}
        <p class="py-8 text-center text-gray-500">No spending data</p>
      {/if}
    </div>

    <div class="rounded-lg bg-white p-4 shadow">
      <h2 class="mb-4 font-semibold text-gray-800">Monthly Spending Trend</h2>
      <BarChart
        labels={monthLabels}
        datasets={[{ label: 'Spending', data: monthlySpending, color: '#ef4444' }]}
      />
    </div>

    <div class="rounded-lg bg-white p-4 shadow lg:col-span-2">
      <h2 class="mb-4 font-semibold text-gray-800">Income vs Spending</h2>
      <LineChart
        labels={monthLabels}
        datasets={[
          { label: 'Income', data: monthlyIncome, color: '#22c55e' },
          { label: 'Spending', data: monthlySpending, color: '#ef4444' },
        ]}
      />
    </div>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/analytics/+page.svelte
git commit --no-gpg-sign -m "Add Analytics page with charts"
```

---

## Task 25: Settings Page with Export/Import

**Files:**
- Create: `src/routes/settings/+page.svelte`
- Create: `src/lib/utils/export.ts`

- [ ] **Step 1: Create export utilities**

```typescript
// src/lib/utils/export.ts
import { db } from '$lib/db';
import { centsToDollars } from './currency';
import { formatDate } from './dates';
import type { ExportData } from '$lib/types';

export async function exportToJson(): Promise<string> {
  const [buckets, transactions, recurringTransactions, incomes, monthSnapshots] = await Promise.all([
    db.buckets.toArray(),
    db.transactions.toArray(),
    db.recurringTransactions.toArray(),
    db.incomes.toArray(),
    db.monthSnapshots.toArray(),
  ]);

  const data: ExportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { buckets, transactions, recurringTransactions, incomes, monthSnapshots },
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

  await db.transaction('rw', [db.buckets, db.transactions, db.recurringTransactions, db.incomes, db.monthSnapshots], async () => {
    await db.buckets.clear();
    await db.transactions.clear();
    await db.recurringTransactions.clear();
    await db.incomes.clear();
    await db.monthSnapshots.clear();

    await db.buckets.bulkAdd(data.data.buckets);
    await db.transactions.bulkAdd(data.data.transactions);
    await db.recurringTransactions.bulkAdd(data.data.recurringTransactions);
    await db.incomes.bulkAdd(data.data.incomes);
    await db.monthSnapshots.bulkAdd(data.data.monthSnapshots);
  });
}

export async function resetAllData(): Promise<void> {
  await db.transaction('rw', [db.buckets, db.transactions, db.recurringTransactions, db.incomes, db.monthSnapshots], async () => {
    await db.buckets.clear();
    await db.transactions.clear();
    await db.recurringTransactions.clear();
    await db.incomes.clear();
    await db.monthSnapshots.clear();
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
```

- [ ] **Step 2: Create Settings page**

```svelte
<!-- src/routes/settings/+page.svelte -->
<script lang="ts">
  import { exportToJson, exportToCsv, importFromJson, resetAllData, downloadFile } from '$lib/utils/export';
  import { loadData } from '$lib/stores/budgetStore';
  import { loadRecurring } from '$lib/stores/recurringStore';

  let fileInput: HTMLInputElement;
  let isExporting = false;
  let isImporting = false;

  async function handleExportJson() {
    isExporting = true;
    try {
      const json = await exportToJson();
      const date = new Date().toISOString().split('T')[0];
      downloadFile(json, `budget-backup-${date}.json`, 'application/json');
    } finally {
      isExporting = false;
    }
  }

  async function handleExportCsv() {
    isExporting = true;
    try {
      const csv = await exportToCsv();
      const date = new Date().toISOString().split('T')[0];
      downloadFile(csv, `transactions-${date}.csv`, 'text/csv');
    } finally {
      isExporting = false;
    }
  }

  async function handleImport() {
    const file = fileInput?.files?.[0];
    if (!file) return;

    if (!confirm('This will replace all existing data. Continue?')) return;

    isImporting = true;
    try {
      const text = await file.text();
      await importFromJson(text);
      await loadData();
      await loadRecurring();
      alert('Data imported successfully!');
    } catch (e) {
      alert('Import failed: ' + (e instanceof Error ? e.message : 'Unknown error'));
    } finally {
      isImporting = false;
      fileInput.value = '';
    }
  }

  async function handleReset() {
    if (!confirm('Delete ALL data? This cannot be undone!')) return;
    if (!confirm('Are you really sure?')) return;

    await resetAllData();
    await loadData();
    await loadRecurring();
    alert('All data has been reset.');
  }
</script>

<div class="space-y-8">
  <h1 class="text-2xl font-bold text-gray-800">Settings</h1>

  <section class="space-y-4">
    <h2 class="text-lg font-semibold text-gray-700">Export Data</h2>
    <div class="flex flex-wrap gap-3">
      <button
        class="rounded-lg bg-primary px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
        on:click={handleExportJson}
        disabled={isExporting}
      >
        Export JSON (Full Backup)
      </button>
      <button
        class="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
        on:click={handleExportCsv}
        disabled={isExporting}
      >
        Export CSV (Transactions)
      </button>
    </div>
  </section>

  <section class="space-y-4">
    <h2 class="text-lg font-semibold text-gray-700">Import Data</h2>
    <div class="flex items-center gap-3">
      <input
        type="file"
        accept=".json"
        bind:this={fileInput}
        on:change={handleImport}
        class="hidden"
      />
      <button
        class="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
        on:click={() => fileInput.click()}
        disabled={isImporting}
      >
        {isImporting ? 'Importing...' : 'Import JSON Backup'}
      </button>
    </div>
    <p class="text-sm text-gray-500">Import a previously exported JSON backup file.</p>
  </section>

  <section class="space-y-4 border-t pt-6">
    <h2 class="text-lg font-semibold text-danger">Danger Zone</h2>
    <button
      class="rounded-lg border border-danger px-4 py-2 text-danger hover:bg-red-50"
      on:click={handleReset}
    >
      Reset All Data
    </button>
    <p class="text-sm text-gray-500">Permanently delete all your data. This cannot be undone.</p>
  </section>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/utils/export.ts src/routes/settings/+page.svelte
git commit --no-gpg-sign -m "Add Settings page with export/import functionality"
```

---

## Task 26: Add Income Functionality

**Files:**
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Add income modal to Dashboard**

Add to the Dashboard page after the existing Modal:

```svelte
<!-- Add this import at the top -->
<script lang="ts">
  // ... existing imports ...
  import { addIncome, currentMonthIncomes, deleteIncome } from '$lib/stores/budgetStore';
  import { parseCurrency } from '$lib/utils/currency';

  // ... existing code ...

  let incomeAmount = '';
  let incomeNote = '';

  async function handleAddIncome() {
    if (!incomeAmount) return;
    await addIncome({
      amount: parseCurrency(incomeAmount),
      date: new Date(),
      note: incomeNote || undefined,
      isRecurring: false,
    });
    incomeAmount = '';
    incomeNote = '';
    closeModal();
  }
</script>

<!-- Add click handler to income card -->
<div class="rounded-lg bg-white p-4 shadow cursor-pointer hover:shadow-md" on:click={() => openModal('income')}>
  <p class="text-sm text-gray-500">Income</p>
  <p class="text-xl font-bold text-gray-800">{formatCurrency($currentMonthIncome)}</p>
</div>

<!-- Add income modal at the bottom -->
<Modal id="income" title="Manage Income">
  <form on:submit|preventDefault={handleAddIncome} class="space-y-4">
    <div>
      <label class="block text-sm font-medium text-gray-700">Amount</label>
      <input
        type="text"
        bind:value={incomeAmount}
        class="mt-1 w-full rounded-lg border px-3 py-2"
        placeholder="0.00"
      />
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700">Note (optional)</label>
      <input
        type="text"
        bind:value={incomeNote}
        class="mt-1 w-full rounded-lg border px-3 py-2"
      />
    </div>
    <button
      type="submit"
      class="w-full rounded-lg bg-primary px-4 py-2 text-white hover:bg-blue-600"
    >
      Add Income
    </button>
  </form>

  {#if $currentMonthIncomes.length > 0}
    <div class="mt-4 border-t pt-4">
      <h3 class="mb-2 font-medium text-gray-700">This Month's Income</h3>
      {#each $currentMonthIncomes as income}
        <div class="flex items-center justify-between py-2">
          <div>
            <p class="font-medium">{formatCurrency(income.amount)}</p>
            {#if income.note}<p class="text-sm text-gray-500">{income.note}</p>{/if}
          </div>
          <button
            class="text-danger hover:underline"
            on:click={() => deleteIncome(income.id)}
          >
            Delete
          </button>
        </div>
      {/each}
    </div>
  {/if}
</Modal>
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/+page.svelte
git commit --no-gpg-sign -m "Add income management to Dashboard"
```

---

## Task 27: Final Testing and Build

**Files:**
- None (verification only)

- [ ] **Step 1: Run all tests**

```bash
npm run test:run
```

Expected: All tests pass

- [ ] **Step 2: Build for production**

```bash
npm run build
```

Expected: Build succeeds, output in `build/` directory

- [ ] **Step 3: Preview production build**

```bash
npm run preview
```

Expected: App works correctly at localhost:4173

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit --no-gpg-sign -m "Final fixes and build verification"
```

---

## Task 28: GitHub Pages Deployment Setup

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create GitHub Actions workflow**

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: build

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy.yml
git commit --no-gpg-sign -m "Add GitHub Pages deployment workflow"
```

---

## Summary

This plan implements a complete zero-based budget app with:

- **27 tasks** covering setup, utilities, components, pages, and deployment
- **TDD approach** for utility functions
- **Incremental commits** after each task
- **Full feature set**: Dashboard, Buckets, Transactions, Recurring, Analytics, Settings
- **Export/Import** in JSON and CSV formats
- **Responsive design** with mobile-first approach
- **GitHub Pages** deployment ready

Total estimated implementation time: 4-6 hours
