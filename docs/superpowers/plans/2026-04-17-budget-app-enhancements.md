# Budget App Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dark mode, percentage-based allocation, and savings goals to the existing zero-based budget app.

**Architecture:** Extends existing Svelte stores and Dexie.js database. Dark mode via Tailwind class strategy. Bucket model extended with allocation type fields. New SavingsGoal entity with dedicated store.

**Tech Stack:** SvelteKit, Dexie.js, Tailwind CSS, Vitest

---

## File Structure

**New files:**
- `src/lib/stores/themeStore.ts` — theme preference management
- `src/lib/stores/goalsStore.ts` — savings goals CRUD and derived statuses
- `src/lib/utils/goals.ts` — goal calculation helpers
- `src/lib/components/shared/GoalCard.svelte` — goal progress display
- `src/tests/goals.test.ts` — goal calculation tests
- `src/tests/allocation.test.ts` — percentage allocation tests

**Modified files:**
- `tailwind.config.js` — dark mode config and dark color tokens
- `src/app.html` — inline theme script for flash prevention
- `src/app.css` — dark variant base styles
- `src/lib/types.ts` — Bucket fields, SavingsGoal type
- `src/lib/db/index.ts` — schema v2 with savingsGoals table and migration
- `src/lib/utils/calculations.ts` — computeAllocation function
- `src/lib/stores/budgetStore.ts` — percentage allocation recalculation
- `src/routes/+page.svelte` — goals section, dark classes
- `src/routes/buckets/+page.svelte` — allocation type UI, dark classes
- `src/routes/settings/+page.svelte` — theme toggle, dark classes
- All components — dark: class variants

---

## Part 1: Dark Mode

### Task 1: Tailwind Dark Mode Configuration

**Files:**
- Modify: `tailwind.config.js`
- Modify: `src/app.css`

- [ ] **Step 1: Update tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: '#ffffff',
        'surface-dark': '#1a1a1a',
        background: '#fafafa',
        'background-dark': '#0f0f0f',
        primary: '#3b82f6',
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444',
        border: '#e5e7eb',
        'border-dark': '#374151',
      }
    },
  },
  plugins: [],
}
```

- [ ] **Step 2: Update src/app.css with dark variants**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-background text-gray-800;
}

:root.dark body {
  @apply bg-background-dark text-gray-100;
}
```

- [ ] **Step 3: Verify build succeeds**

Run: `npm run build`
Expected: Build completes without errors

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.js src/app.css
git commit --no-gpg-sign -m "Configure Tailwind dark mode with color tokens"
```

---

### Task 2: Theme Store

**Files:**
- Create: `src/lib/stores/themeStore.ts`

- [ ] **Step 1: Create theme store**

```typescript
// src/lib/stores/themeStore.ts
import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'theme-preference';

function getStoredPreference(): ThemePreference {
  if (!browser) return 'system';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
}

function getSystemTheme(): ResolvedTheme {
  if (!browser) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const themePreference = writable<ThemePreference>(getStoredPreference());

export const resolvedTheme = derived(themePreference, ($pref): ResolvedTheme => {
  if ($pref === 'system') {
    return getSystemTheme();
  }
  return $pref;
});

export function setTheme(pref: ThemePreference): void {
  themePreference.set(pref);
  if (browser) {
    localStorage.setItem(STORAGE_KEY, pref);
    applyTheme(pref === 'system' ? getSystemTheme() : pref);
  }
}

function applyTheme(theme: ResolvedTheme): void {
  if (!browser) return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function initTheme(): void {
  if (!browser) return;
  const pref = getStoredPreference();
  const resolved = pref === 'system' ? getSystemTheme() : pref;
  applyTheme(resolved);

  // Listen for system preference changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const currentPref = localStorage.getItem(STORAGE_KEY) || 'system';
    if (currentPref === 'system') {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/stores/themeStore.ts
git commit --no-gpg-sign -m "Add theme store with system preference detection"
```

---

### Task 3: Flash Prevention Script

**Files:**
- Modify: `src/app.html`

- [ ] **Step 1: Add inline theme script to app.html**

```html
<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<meta name="text-scale" content="scale" />
		<script>
			(function() {
				const stored = localStorage.getItem('theme-preference');
				const pref = stored === 'light' || stored === 'dark' ? stored : 'system';
				const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
				if (dark) document.documentElement.classList.add('dark');
			})();
		</script>
		%sveltekit.head%
	</head>
	<body data-sveltekit-preload-data="hover">
		<div style="display: contents">%sveltekit.body%</div>
	</body>
</html>
```

- [ ] **Step 2: Verify no flash on page load**

Run: `npm run dev`
Test: Set dark mode in browser DevTools localStorage, refresh page
Expected: No white flash before dark theme applies

- [ ] **Step 3: Commit**

```bash
git add src/app.html
git commit --no-gpg-sign -m "Add inline script to prevent theme flash on load"
```

---

### Task 4: Theme Toggle in Settings and Dark Mode Classes

**Files:**
- Modify: `src/routes/settings/+page.svelte`
- Modify: `src/routes/+layout.svelte`
- Modify: `src/lib/components/layout/Layout.svelte`
- Modify: `src/lib/components/layout/Nav.svelte`
- Modify: `src/lib/components/shared/Modal.svelte`
- Modify: `src/lib/components/shared/BucketCard.svelte`
- Modify: `src/lib/components/shared/ProgressBar.svelte`
- Modify: `src/lib/components/shared/MonthPicker.svelte`
- Modify: `src/lib/components/shared/QuickEntry.svelte`
- Modify: `src/lib/components/shared/TransactionRow.svelte`
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/buckets/+page.svelte`
- Modify: `src/routes/transactions/+page.svelte`
- Modify: `src/routes/recurring/+page.svelte`
- Modify: `src/routes/analytics/+page.svelte`

- [ ] **Step 1: Initialize theme in root layout**

In `src/routes/+layout.svelte`, add:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { initTheme } from '$lib/stores/themeStore';
  import Layout from '$lib/components/layout/Layout.svelte';
  import { loadData } from '$lib/stores/budgetStore';
  import { loadRecurring, processRecurring } from '$lib/stores/recurringStore';

  onMount(async () => {
    initTheme();
    await loadData();
    await loadRecurring();
    await processRecurring();
  });
</script>

<Layout>
  <slot />
</Layout>
```

- [ ] **Step 2: Add theme toggle to Settings page**

Replace `src/routes/settings/+page.svelte`:

```svelte
<script lang="ts">
  import { exportToJson, exportToCsv, importFromJson, resetAllData, downloadFile } from '$lib/utils/export';
  import { loadData } from '$lib/stores/budgetStore';
  import { loadRecurring } from '$lib/stores/recurringStore';
  import { themePreference, setTheme, type ThemePreference } from '$lib/stores/themeStore';

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

  function handleThemeChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value as ThemePreference;
    setTheme(value);
  }
</script>

<div class="space-y-8">
  <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100">Settings</h1>

  <section class="space-y-4">
    <h2 class="text-lg font-semibold text-gray-700 dark:text-gray-200">Appearance</h2>
    <div class="flex items-center gap-4">
      <label for="theme" class="text-gray-600 dark:text-gray-300">Theme</label>
      <select
        id="theme"
        value={$themePreference}
        on:change={handleThemeChange}
        class="rounded-lg border border-gray-300 dark:border-border-dark bg-white dark:bg-surface-dark px-3 py-2 dark:text-gray-100"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </div>
  </section>

  <section class="space-y-4">
    <h2 class="text-lg font-semibold text-gray-700 dark:text-gray-200">Export Data</h2>
    <div class="flex flex-wrap gap-3">
      <button
        class="rounded-lg bg-primary px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
        on:click={handleExportJson}
        disabled={isExporting}
      >
        Export JSON (Full Backup)
      </button>
      <button
        class="rounded-lg border border-gray-300 dark:border-border-dark px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-100 disabled:opacity-50"
        on:click={handleExportCsv}
        disabled={isExporting}
      >
        Export CSV (Transactions)
      </button>
    </div>
  </section>

  <section class="space-y-4">
    <h2 class="text-lg font-semibold text-gray-700 dark:text-gray-200">Import Data</h2>
    <div class="flex items-center gap-3">
      <input
        type="file"
        accept=".json"
        bind:this={fileInput}
        on:change={handleImport}
        class="hidden"
      />
      <button
        class="rounded-lg border border-gray-300 dark:border-border-dark px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-100 disabled:opacity-50"
        on:click={() => fileInput.click()}
        disabled={isImporting}
      >
        {isImporting ? 'Importing...' : 'Import JSON Backup'}
      </button>
    </div>
    <p class="text-sm text-gray-500 dark:text-gray-400">Import a previously exported JSON backup file.</p>
  </section>

  <section class="space-y-4 border-t border-gray-200 dark:border-border-dark pt-6">
    <h2 class="text-lg font-semibold text-danger">Danger Zone</h2>
    <button
      class="rounded-lg border border-danger px-4 py-2 text-danger hover:bg-red-50 dark:hover:bg-red-900/20"
      on:click={handleReset}
    >
      Reset All Data
    </button>
    <p class="text-sm text-gray-500 dark:text-gray-400">Permanently delete all your data. This cannot be undone.</p>
  </section>
</div>
```

- [ ] **Step 3: Add dark classes to Layout.svelte**

Update `src/lib/components/layout/Layout.svelte` to include dark mode classes on the main container and all text/background elements. Add `dark:bg-background-dark` to main wrapper, `dark:text-gray-100` to text elements.

- [ ] **Step 4: Add dark classes to Nav.svelte**

Update navigation background to `dark:bg-surface-dark`, text to `dark:text-gray-100`, active states to `dark:bg-gray-800`.

- [ ] **Step 5: Add dark classes to Modal.svelte**

Update modal backdrop and content: `dark:bg-surface-dark dark:text-gray-100`, close button `dark:hover:bg-gray-800`.

- [ ] **Step 6: Add dark classes to BucketCard.svelte**

Change `bg-white` to `bg-white dark:bg-surface-dark`, text colors to include dark variants.

- [ ] **Step 7: Add dark classes to remaining shared components**

Update ProgressBar, MonthPicker, QuickEntry, TransactionRow with appropriate dark: variants for backgrounds, borders, and text.

- [ ] **Step 8: Add dark classes to all page components**

Update Dashboard (+page.svelte), Buckets, Transactions, Recurring, Analytics pages with dark mode classes.

- [ ] **Step 9: Test dark mode toggle**

Run: `npm run dev`
Test: Toggle theme in Settings, verify all pages render correctly in both modes
Expected: Consistent dark theme across all pages

- [ ] **Step 10: Commit**

```bash
git add -A
git commit --no-gpg-sign -m "Add dark mode toggle and dark classes to all components"
```

---

## Part 2: Percentage-Based Allocation

### Task 5: Update Types and Database Schema

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/db/index.ts`

- [ ] **Step 1: Update Bucket type in types.ts**

```typescript
// Add to src/lib/types.ts

export type AllocationType = 'fixed' | 'percentage' | 'hybrid';

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
```

- [ ] **Step 2: Update database schema with migration**

```typescript
// Update src/lib/db/index.ts

import Dexie, { type Table } from 'dexie';
import type { Bucket, Transaction, RecurringTransaction, Income, MonthSnapshot, SavingsGoal } from '$lib/types';

export class BudgetDatabase extends Dexie {
  buckets!: Table<Bucket, string>;
  transactions!: Table<Transaction, string>;
  recurringTransactions!: Table<RecurringTransaction, string>;
  incomes!: Table<Income, string>;
  monthSnapshots!: Table<MonthSnapshot, string>;
  savingsGoals!: Table<SavingsGoal, string>;

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
  }
}

export const db = new BudgetDatabase();

export const DEFAULT_BUCKETS: Omit<Bucket, 'id'>[] = [
  { name: 'Rent/Mortgage', color: '#6366f1', order: 0, isDefault: true, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0 },
  { name: 'Utilities', color: '#8b5cf6', order: 1, isDefault: true, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0 },
  { name: 'Grocery', color: '#10b981', order: 2, isDefault: true, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0 },
  { name: 'Transportation', color: '#f59e0b', order: 3, isDefault: true, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0 },
  { name: 'Dining Out', color: '#ef4444', order: 4, isDefault: true, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0 },
  { name: 'Entertainment', color: '#ec4899', order: 5, isDefault: true, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0 },
  { name: 'Subscriptions', color: '#06b6d4', order: 6, isDefault: true, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0 },
  { name: 'Savings', color: '#22c55e', order: 7, isDefault: true, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0 },
  { name: 'Investments', color: '#3b82f6', order: 8, isDefault: true, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0 },
  { name: 'Emergency Fund', color: '#f97316', order: 9, isDefault: true, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0 },
  { name: 'Misc', color: '#6b7280', order: 10, isDefault: true, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0 },
];

export async function initializeDefaultBuckets(): Promise<void> {
  const count = await db.buckets.count();
  if (count === 0) {
    const bucketsWithIds = DEFAULT_BUCKETS.map((b) => ({
      ...b,
      id: crypto.randomUUID(),
    }));
    await db.buckets.bulkAdd(bucketsWithIds);
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/db/index.ts
git commit --no-gpg-sign -m "Add allocation type fields to Bucket and database migration"
```

---

### Task 6: Allocation Calculation Utilities

**Files:**
- Modify: `src/lib/utils/calculations.ts`
- Create: `src/tests/allocation.test.ts`

- [ ] **Step 1: Write failing tests for computeAllocation**

```typescript
// src/tests/allocation.test.ts
import { describe, it, expect } from 'vitest';
import { computeAllocation, computeAllAllocations, getTotalPercentage } from '$lib/utils/calculations';
import type { Bucket } from '$lib/types';

const makeBucket = (overrides: Partial<Bucket>): Bucket => ({
  id: 'test',
  name: 'Test',
  color: '#000',
  order: 0,
  isDefault: false,
  allocationType: 'fixed',
  fixedAmount: 0,
  percentageAmount: 0,
  ...overrides,
});

describe('computeAllocation', () => {
  it('returns fixedAmount for fixed type', () => {
    const bucket = makeBucket({ allocationType: 'fixed', fixedAmount: 50000 });
    expect(computeAllocation(bucket, 100000)).toBe(50000);
  });

  it('calculates percentage of total income', () => {
    const bucket = makeBucket({ allocationType: 'percentage', percentageAmount: 10 });
    expect(computeAllocation(bucket, 100000)).toBe(10000);
  });

  it('combines fixed and percentage for hybrid', () => {
    const bucket = makeBucket({ allocationType: 'hybrid', fixedAmount: 20000, percentageAmount: 5 });
    expect(computeAllocation(bucket, 100000)).toBe(25000); // 200 + 5% of 1000
  });

  it('rounds percentage calculation', () => {
    const bucket = makeBucket({ allocationType: 'percentage', percentageAmount: 33 });
    expect(computeAllocation(bucket, 10000)).toBe(3300);
  });
});

describe('getTotalPercentage', () => {
  it('sums all percentageAmounts', () => {
    const buckets = [
      makeBucket({ percentageAmount: 10 }),
      makeBucket({ percentageAmount: 25 }),
      makeBucket({ percentageAmount: 15 }),
    ];
    expect(getTotalPercentage(buckets)).toBe(50);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: Tests fail with "computeAllocation is not defined"

- [ ] **Step 3: Implement computeAllocation**

Add to `src/lib/utils/calculations.ts`:

```typescript
import type { Bucket } from '$lib/types';

export function computeAllocation(bucket: Bucket, totalIncome: number): number {
  const fixed = bucket.fixedAmount || 0;
  const pct = bucket.percentageAmount || 0;
  const fromPercentage = Math.round((pct / 100) * totalIncome);

  switch (bucket.allocationType) {
    case 'fixed':
      return fixed;
    case 'percentage':
      return fromPercentage;
    case 'hybrid':
      return fixed + fromPercentage;
    default:
      return fixed;
  }
}

export function computeAllAllocations(
  buckets: Bucket[],
  totalIncome: number
): Record<string, number> {
  const allocations: Record<string, number> = {};
  for (const bucket of buckets) {
    allocations[bucket.id] = computeAllocation(bucket, totalIncome);
  }
  return allocations;
}

export function getTotalPercentage(buckets: Bucket[]): number {
  return buckets.reduce((sum, b) => sum + (b.percentageAmount || 0), 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: All allocation tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/calculations.ts src/tests/allocation.test.ts
git commit --no-gpg-sign -m "Add allocation calculation utilities with tests"
```

---

### Task 7: Update Budget Store for Auto-Recalculation

**Files:**
- Modify: `src/lib/stores/budgetStore.ts`

- [ ] **Step 1: Add derived store for computed allocations**

Update `src/lib/stores/budgetStore.ts`:

```typescript
import { computeAllocation, getTotalPercentage } from '$lib/utils/calculations';

// Add after existing derived stores:

export const computedAllocations = derived(
  [buckets, currentMonthIncome],
  ([$buckets, $income]) => {
    const allocations: Record<string, number> = {};
    for (const bucket of $buckets) {
      allocations[bucket.id] = computeAllocation(bucket, $income);
    }
    return allocations;
  }
);

export const totalPercentage = derived(buckets, ($buckets) => getTotalPercentage($buckets));

// Update bucketStatuses to use computedAllocations for percentage buckets:
export const bucketStatuses = derived(
  [buckets, currentSnapshot, currentMonthTransactions, computedAllocations],
  ([$buckets, $snapshot, $transactions, $computed]) => {
    const spent: Record<string, number> = {};
    for (const t of $transactions) {
      spent[t.bucketId] = (spent[t.bucketId] || 0) + t.amount;
    }

    return $buckets.map((bucket): BucketStatus => {
      // Use computed allocation for percentage/hybrid, snapshot for fixed
      const allocated = bucket.allocationType === 'fixed'
        ? ($snapshot.allocations[bucket.id] || 0)
        : $computed[bucket.id];
      const bucketSpent = spent[bucket.id] || 0;
      const rollover = $snapshot.rollovers[bucket.id] || 0;
      const remaining = calculateBucketRemaining(allocated, bucketSpent, rollover);

      return { bucket, allocated, spent: bucketSpent, rollover, remaining };
    });
  }
);

// Update unallocated to use computed allocations
export const unallocated = derived(
  [currentMonthIncome, bucketStatuses],
  ([$income, $statuses]) => {
    const totalAllocated = $statuses.reduce((sum, s) => sum + s.allocated, 0);
    return $income - totalAllocated;
  }
);
```

- [ ] **Step 2: Add updateBucketAllocation action**

```typescript
export async function updateBucketAllocation(
  id: string,
  allocationType: 'fixed' | 'percentage' | 'hybrid',
  fixedAmount: number,
  percentageAmount: number
): Promise<void> {
  await db.buckets.update(id, { allocationType, fixedAmount, percentageAmount });
  buckets.update((b) =>
    b.map((bucket) =>
      bucket.id === id
        ? { ...bucket, allocationType, fixedAmount, percentageAmount }
        : bucket
    )
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/stores/budgetStore.ts
git commit --no-gpg-sign -m "Add computed allocations and auto-recalculation to budget store"
```

---

### Task 8: Update Buckets Page UI for Allocation Types

**Files:**
- Modify: `src/routes/buckets/+page.svelte`

- [ ] **Step 1: Update Buckets page with allocation type UI**

Replace `src/routes/buckets/+page.svelte`:

```svelte
<script lang="ts">
  import { buckets, bucketStatuses, addBucket, updateBucket, deleteBucket, updateBucketAllocation, totalPercentage } from '$lib/stores/budgetStore';
  import { formatCurrency, parseCurrency } from '$lib/utils/currency';
  import Modal from '$lib/components/shared/Modal.svelte';
  import { openModal, closeModal } from '$lib/stores/uiStore';
  import type { AllocationType } from '$lib/types';

  let editingBucket: { id: string; name: string; color: string; allocationType: AllocationType; fixedAmount: number; percentageAmount: number } | null = null;
  let newBucketName = '';
  let newBucketColor = '#6366f1';
  let newAllocationType: AllocationType = 'fixed';
  let newFixedAmount = '';
  let newPercentageAmount = '';

  function handleAddBucket() {
    editingBucket = null;
    newBucketName = '';
    newBucketColor = '#6366f1';
    newAllocationType = 'fixed';
    newFixedAmount = '';
    newPercentageAmount = '';
    openModal('bucket-form');
  }

  function handleEditBucket(bucket: typeof editingBucket) {
    if (!bucket) return;
    editingBucket = bucket;
    newBucketName = bucket.name;
    newBucketColor = bucket.color;
    newAllocationType = bucket.allocationType;
    newFixedAmount = bucket.fixedAmount ? (bucket.fixedAmount / 100).toFixed(2) : '';
    newPercentageAmount = bucket.percentageAmount ? bucket.percentageAmount.toString() : '';
    openModal('bucket-form');
  }

  async function handleSubmit() {
    if (!newBucketName.trim()) return;

    const fixedCents = parseCurrency(newFixedAmount);
    const pct = parseFloat(newPercentageAmount) || 0;

    if (editingBucket) {
      await updateBucket(editingBucket.id, {
        name: newBucketName,
        color: newBucketColor,
      });
      await updateBucketAllocation(editingBucket.id, newAllocationType, fixedCents, pct);
    } else {
      await addBucket({
        name: newBucketName,
        color: newBucketColor,
        order: $buckets.length,
        isDefault: false,
        allocationType: newAllocationType,
        fixedAmount: fixedCents,
        percentageAmount: pct,
      });
    }
    closeModal();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this bucket? Transactions will need to be reassigned.')) return;
    await deleteBucket(id);
  }

  function formatAllocation(bucket: { allocationType: AllocationType; fixedAmount: number; percentageAmount: number }): string {
    if (bucket.allocationType === 'fixed') {
      return formatCurrency(bucket.fixedAmount);
    } else if (bucket.allocationType === 'percentage') {
      return `${bucket.percentageAmount}%`;
    } else {
      return `${formatCurrency(bucket.fixedAmount)} + ${bucket.percentageAmount}%`;
    }
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100">Buckets</h1>
    <button
      class="rounded-lg bg-primary px-4 py-2 text-white hover:bg-blue-600"
      on:click={handleAddBucket}
    >
      + Add Bucket
    </button>
  </div>

  {#if $totalPercentage > 100}
    <div class="rounded-lg border-l-4 border-warning bg-amber-50 dark:bg-amber-900/20 p-4">
      <p class="text-sm text-amber-800 dark:text-amber-200">
        Total percentage allocation is {$totalPercentage}% (exceeds 100%)
      </p>
    </div>
  {/if}

  <div class="space-y-3">
    {#each $bucketStatuses as status}
      <div class="flex items-center gap-4 rounded-lg bg-white dark:bg-surface-dark p-4 shadow">
        <span
          class="h-4 w-4 rounded-full"
          style="background-color: {status.bucket.color}"
        />
        <div class="flex-1">
          <h3 class="font-medium text-gray-800 dark:text-gray-100">{status.bucket.name}</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {formatAllocation(status.bucket)}
            {#if status.bucket.allocationType !== 'fixed'}
              <span class="text-gray-400 dark:text-gray-500">= {formatCurrency(status.allocated)}</span>
            {/if}
          </p>
          {#if status.rollover !== 0}
            <p class="text-xs text-gray-400 dark:text-gray-500">Rollover: {formatCurrency(status.rollover)}</p>
          {/if}
        </div>
        <div class="flex gap-1">
          <button
            class="rounded p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            on:click={() => handleEditBucket(status.bucket)}
          >
            Edit
          </button>
          {#if !status.bucket.isDefault}
            <button
              class="rounded p-2 text-danger hover:bg-red-50 dark:hover:bg-red-900/20"
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
      <label for="name" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
      <input id="name" type="text" bind:value={newBucketName} class="mt-1 w-full rounded-lg border border-gray-300 dark:border-border-dark bg-white dark:bg-surface-dark px-3 py-2 dark:text-gray-100" required />
    </div>
    <div>
      <label for="color" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Color</label>
      <input id="color" type="color" bind:value={newBucketColor} class="mt-1 h-10 w-full rounded-lg border border-gray-300 dark:border-border-dark" />
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Allocation Type</label>
      <div class="flex gap-4">
        <label class="flex items-center gap-2">
          <input type="radio" bind:group={newAllocationType} value="fixed" />
          <span class="text-gray-700 dark:text-gray-300">Fixed</span>
        </label>
        <label class="flex items-center gap-2">
          <input type="radio" bind:group={newAllocationType} value="percentage" />
          <span class="text-gray-700 dark:text-gray-300">Percentage</span>
        </label>
        <label class="flex items-center gap-2">
          <input type="radio" bind:group={newAllocationType} value="hybrid" />
          <span class="text-gray-700 dark:text-gray-300">Both</span>
        </label>
      </div>
    </div>
    {#if newAllocationType === 'fixed' || newAllocationType === 'hybrid'}
      <div>
        <label for="fixed" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Fixed Amount ($)</label>
        <input id="fixed" type="text" bind:value={newFixedAmount} class="mt-1 w-full rounded-lg border border-gray-300 dark:border-border-dark bg-white dark:bg-surface-dark px-3 py-2 dark:text-gray-100" placeholder="0.00" />
      </div>
    {/if}
    {#if newAllocationType === 'percentage' || newAllocationType === 'hybrid'}
      <div>
        <label for="percentage" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Percentage of Income (%)</label>
        <input id="percentage" type="number" min="0" max="100" step="1" bind:value={newPercentageAmount} class="mt-1 w-full rounded-lg border border-gray-300 dark:border-border-dark bg-white dark:bg-surface-dark px-3 py-2 dark:text-gray-100" placeholder="0" />
      </div>
    {/if}
    <button type="submit" class="w-full rounded-lg bg-primary px-4 py-2 text-white hover:bg-blue-600">
      {editingBucket ? 'Update' : 'Add'} Bucket
    </button>
  </form>
</Modal>
```

- [ ] **Step 2: Test allocation type UI**

Run: `npm run dev`
Test: Create buckets with each allocation type, verify computed amounts display correctly
Expected: Fixed shows "$X", percentage shows "Y%", hybrid shows "$X + Y%", computed value in parentheses

- [ ] **Step 3: Commit**

```bash
git add src/routes/buckets/+page.svelte
git commit --no-gpg-sign -m "Add allocation type UI to Buckets page"
```

---

## Part 3: Savings Goals

### Task 9: Add SavingsGoal Type

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add SavingsGoal interface**

Add to `src/lib/types.ts`:

```typescript
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

// Update ExportData to include savingsGoals
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit --no-gpg-sign -m "Add SavingsGoal type"
```

---

### Task 10: Goal Calculation Utilities

**Files:**
- Create: `src/lib/utils/goals.ts`
- Create: `src/tests/goals.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/tests/goals.test.ts
import { describe, it, expect } from 'vitest';
import { calculateGoalProgress, calculateMonthlyNeeded, calculateProjectedDate, getGoalStatus } from '$lib/utils/goals';
import type { SavingsGoal, MonthSnapshot } from '$lib/types';

const makeGoal = (overrides: Partial<SavingsGoal>): SavingsGoal => ({
  id: 'goal-1',
  name: 'Emergency Fund',
  bucketId: 'bucket-1',
  targetAmount: 1000000, // $10,000
  createdAt: new Date('2026-01-01'),
  startingBalance: 0,
  ...overrides,
});

const makeSnapshot = (month: string, allocation: number): MonthSnapshot => ({
  month,
  incomeTotal: 500000,
  allocations: { 'bucket-1': allocation },
  spent: {},
  rollovers: {},
});

describe('calculateGoalProgress', () => {
  it('sums allocations from createdAt month onward', () => {
    const goal = makeGoal({ createdAt: new Date('2026-02-01'), startingBalance: 50000 });
    const snapshots = [
      makeSnapshot('2026-01', 10000), // before createdAt, ignored
      makeSnapshot('2026-02', 20000),
      makeSnapshot('2026-03', 30000),
    ];
    expect(calculateGoalProgress(goal, snapshots)).toBe(100000); // 50000 + 20000 + 30000
  });
});

describe('calculateMonthlyNeeded', () => {
  it('divides remaining by months left', () => {
    const goal = makeGoal({
      targetAmount: 100000,
      targetDate: new Date('2026-06-01'),
    });
    // Assuming today is 2026-04-17, 2 months left (May, June)
    const current = 20000;
    const result = calculateMonthlyNeeded(goal, current, new Date('2026-04-17'));
    expect(result).toBe(40000); // (100000 - 20000) / 2
  });

  it('returns remaining if deadline passed', () => {
    const goal = makeGoal({
      targetAmount: 100000,
      targetDate: new Date('2026-01-01'),
    });
    const result = calculateMonthlyNeeded(goal, 20000, new Date('2026-04-17'));
    expect(result).toBe(80000);
  });
});

describe('getGoalStatus', () => {
  it('returns completed when current >= target', () => {
    expect(getGoalStatus(100000, 100000, 0)).toBe('completed');
    expect(getGoalStatus(110000, 100000, 0)).toBe('completed');
  });

  it('returns on-track when monthly allocation meets needed', () => {
    expect(getGoalStatus(50000, 100000, 25000, 25000)).toBe('on-track');
  });

  it('returns behind when monthly allocation below needed', () => {
    expect(getGoalStatus(50000, 100000, 30000, 20000)).toBe('behind');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: Tests fail with functions not defined

- [ ] **Step 3: Implement goal utilities**

```typescript
// src/lib/utils/goals.ts
import type { SavingsGoal, MonthSnapshot } from '$lib/types';
import { getMonthKey } from './dates';

export function calculateGoalProgress(
  goal: SavingsGoal,
  monthSnapshots: MonthSnapshot[]
): number {
  const startMonth = getMonthKey(goal.createdAt);
  const allocations = monthSnapshots
    .filter((s) => s.month >= startMonth)
    .reduce((sum, s) => sum + (s.allocations[goal.bucketId] || 0), 0);
  return goal.startingBalance + allocations;
}

export function monthsBetween(from: Date, to: Date): number {
  const fromYear = from.getFullYear();
  const fromMonth = from.getMonth();
  const toYear = to.getFullYear();
  const toMonth = to.getMonth();
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

export function calculateMonthlyNeeded(
  goal: SavingsGoal,
  currentAmount: number,
  today: Date = new Date()
): number {
  if (!goal.targetDate) return 0;
  const remaining = goal.targetAmount - currentAmount;
  if (remaining <= 0) return 0;
  const monthsLeft = monthsBetween(today, goal.targetDate);
  if (monthsLeft <= 0) return remaining;
  return Math.ceil(remaining / monthsLeft);
}

export function calculateProjectedDate(
  goal: SavingsGoal,
  currentAmount: number,
  today: Date = new Date()
): Date | null {
  if (!goal.monthlyContribution || goal.monthlyContribution <= 0) return null;
  const remaining = goal.targetAmount - currentAmount;
  if (remaining <= 0) return today;
  const monthsNeeded = Math.ceil(remaining / goal.monthlyContribution);
  const projected = new Date(today);
  projected.setMonth(projected.getMonth() + monthsNeeded);
  return projected;
}

export type GoalStatus = 'completed' | 'on-track' | 'behind';

export function getGoalStatus(
  currentAmount: number,
  targetAmount: number,
  monthlyNeeded: number,
  currentMonthAllocation: number = 0
): GoalStatus {
  if (currentAmount >= targetAmount) return 'completed';
  if (monthlyNeeded <= 0 || currentMonthAllocation >= monthlyNeeded) return 'on-track';
  return 'behind';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: All goal tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/goals.ts src/tests/goals.test.ts
git commit --no-gpg-sign -m "Add goal calculation utilities with tests"
```

---

### Task 11: Goals Store

**Files:**
- Create: `src/lib/stores/goalsStore.ts`

- [ ] **Step 1: Create goals store**

```typescript
// src/lib/stores/goalsStore.ts
import { writable, derived, get } from 'svelte/store';
import { db } from '$lib/db';
import { monthSnapshots, currentSnapshot, buckets } from './budgetStore';
import { calculateGoalProgress, calculateMonthlyNeeded, calculateProjectedDate, getGoalStatus, type GoalStatus } from '$lib/utils/goals';
import type { SavingsGoal, Bucket } from '$lib/types';

export const savingsGoals = writable<SavingsGoal[]>([]);

export async function loadGoals(): Promise<void> {
  const goals = await db.savingsGoals.toArray();
  savingsGoals.set(goals);
}

export async function addGoal(goal: Omit<SavingsGoal, 'id'>): Promise<string> {
  const id = crypto.randomUUID();
  const newGoal = { ...goal, id };
  await db.savingsGoals.add(newGoal);
  savingsGoals.update((g) => [...g, newGoal]);
  return id;
}

export async function updateGoal(id: string, updates: Partial<SavingsGoal>): Promise<void> {
  await db.savingsGoals.update(id, updates);
  savingsGoals.update((g) => g.map((goal) => (goal.id === id ? { ...goal, ...updates } : goal)));
}

export async function deleteGoal(id: string): Promise<void> {
  await db.savingsGoals.delete(id);
  savingsGoals.update((g) => g.filter((goal) => goal.id !== id));
}

export interface GoalStatusInfo {
  goal: SavingsGoal;
  bucket: Bucket | undefined;
  currentAmount: number;
  progress: number; // 0-1
  monthlyNeeded: number;
  projectedDate: Date | null;
  status: GoalStatus;
  currentMonthAllocation: number;
}

export const goalStatuses = derived(
  [savingsGoals, monthSnapshots, currentSnapshot, buckets],
  ([$goals, $snapshots, $currentSnapshot, $buckets]): GoalStatusInfo[] => {
    return $goals.map((goal) => {
      const bucket = $buckets.find((b) => b.id === goal.bucketId);
      const currentAmount = calculateGoalProgress(goal, $snapshots);
      const progress = Math.min(currentAmount / goal.targetAmount, 1);
      const currentMonthAllocation = $currentSnapshot.allocations[goal.bucketId] || 0;

      let monthlyNeeded = 0;
      let projectedDate: Date | null = null;

      if (goal.targetDate) {
        monthlyNeeded = calculateMonthlyNeeded(goal, currentAmount);
      } else if (goal.monthlyContribution) {
        monthlyNeeded = goal.monthlyContribution;
        projectedDate = calculateProjectedDate(goal, currentAmount);
      }

      const status = getGoalStatus(currentAmount, goal.targetAmount, monthlyNeeded, currentMonthAllocation);

      return {
        goal,
        bucket,
        currentAmount,
        progress,
        monthlyNeeded,
        projectedDate,
        status,
        currentMonthAllocation,
      };
    });
  }
);
```

- [ ] **Step 2: Update export utility to include goals**

In `src/lib/utils/export.ts`, update `exportToJson` and `importFromJson` to handle savingsGoals table.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/stores/goalsStore.ts src/lib/utils/export.ts
git commit --no-gpg-sign -m "Add goals store with derived status calculations"
```

---

### Task 12: GoalCard Component

**Files:**
- Create: `src/lib/components/shared/GoalCard.svelte`

- [ ] **Step 1: Create GoalCard component**

```svelte
<!-- src/lib/components/shared/GoalCard.svelte -->
<script lang="ts">
  import { formatCurrency } from '$lib/utils/currency';
  import ProgressBar from './ProgressBar.svelte';
  import type { GoalStatusInfo } from '$lib/stores/goalsStore';

  export let status: GoalStatusInfo;
  export let onClick: (() => void) | undefined = undefined;

  $: statusColor = {
    completed: 'text-success',
    'on-track': 'text-success',
    behind: 'text-warning',
  }[status.status];

  $: statusLabel = {
    completed: 'Completed!',
    'on-track': 'On track',
    behind: 'Behind',
  }[status.status];

  function formatDate(date: Date | null): string {
    if (!date) return '';
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
</script>

<button
  class="w-full rounded-lg bg-white dark:bg-surface-dark p-4 text-left shadow transition hover:shadow-md"
  on:click={onClick}
  type="button"
>
  <div class="mb-2 flex items-center justify-between">
    <div class="flex items-center gap-2">
      {#if status.bucket}
        <span class="h-3 w-3 rounded-full" style="background-color: {status.bucket.color}" />
      {/if}
      <h3 class="font-medium text-gray-800 dark:text-gray-100">{status.goal.name}</h3>
    </div>
    <span class="text-sm font-medium {statusColor}">{statusLabel}</span>
  </div>

  <div class="mb-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
    <div
      class="h-full rounded-full bg-primary transition-all"
      style="width: {status.progress * 100}%"
    />
  </div>

  <div class="flex justify-between text-sm">
    <div>
      <p class="text-gray-500 dark:text-gray-400">Saved</p>
      <p class="font-semibold text-gray-800 dark:text-gray-100">{formatCurrency(status.currentAmount)}</p>
    </div>
    <div class="text-right">
      <p class="text-gray-500 dark:text-gray-400">Target</p>
      <p class="text-gray-700 dark:text-gray-300">{formatCurrency(status.goal.targetAmount)}</p>
    </div>
  </div>

  {#if status.status !== 'completed'}
    <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
      {#if status.goal.targetDate}
        Need {formatCurrency(status.monthlyNeeded)}/month to reach goal by {formatDate(status.goal.targetDate)}
      {:else if status.projectedDate}
        At {formatCurrency(status.goal.monthlyContribution || 0)}/month, goal reached by {formatDate(status.projectedDate)}
      {/if}
    </div>
  {/if}
</button>
```

- [ ] **Step 2: Verify component compiles**

Run: `npm run check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/shared/GoalCard.svelte
git commit --no-gpg-sign -m "Add GoalCard component for displaying goal progress"
```

---

### Task 13: Goals Section on Dashboard

**Files:**
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/+layout.svelte`

- [ ] **Step 1: Load goals in layout**

Update `src/routes/+layout.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { initTheme } from '$lib/stores/themeStore';
  import Layout from '$lib/components/layout/Layout.svelte';
  import { loadData } from '$lib/stores/budgetStore';
  import { loadRecurring, processRecurring } from '$lib/stores/recurringStore';
  import { loadGoals } from '$lib/stores/goalsStore';

  onMount(async () => {
    initTheme();
    await loadData();
    await loadRecurring();
    await loadGoals();
    await processRecurring();
  });
</script>

<Layout>
  <slot />
</Layout>
```

- [ ] **Step 2: Add goals section to Dashboard**

Update `src/routes/+page.svelte` to include goals section after bucket grid:

```svelte
<script lang="ts">
  // Add imports
  import GoalCard from '$lib/components/shared/GoalCard.svelte';
  import { goalStatuses, addGoal } from '$lib/stores/goalsStore';
  import { formatCurrency, parseCurrency } from '$lib/utils/currency';

  // Add goal form state
  let goalName = '';
  let goalBucketId = '';
  let goalTargetAmount = '';
  let goalStartingBalance = '';
  let goalMode: 'deadline' | 'monthly' = 'deadline';
  let goalTargetDate = '';
  let goalMonthlyContribution = '';

  async function handleAddGoal() {
    if (!goalName || !goalBucketId || !goalTargetAmount) return;

    await addGoal({
      name: goalName,
      bucketId: goalBucketId,
      targetAmount: parseCurrency(goalTargetAmount),
      startingBalance: parseCurrency(goalStartingBalance),
      targetDate: goalMode === 'deadline' && goalTargetDate ? new Date(goalTargetDate) : undefined,
      monthlyContribution: goalMode === 'monthly' ? parseCurrency(goalMonthlyContribution) : undefined,
      createdAt: new Date(),
    });

    // Reset form
    goalName = '';
    goalBucketId = '';
    goalTargetAmount = '';
    goalStartingBalance = '';
    goalTargetDate = '';
    goalMonthlyContribution = '';
    closeModal();
  }
</script>

<!-- Add after bucket grid, before closing </div> -->

{#if $goalStatuses.length > 0}
  <div class="mt-8">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">Savings Goals</h2>
      <button
        class="text-sm text-primary hover:underline"
        on:click={() => openModal('add-goal')}
      >
        + Add Goal
      </button>
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      {#each $goalStatuses as status}
        <GoalCard {status} />
      {/each}
    </div>
  </div>
{:else}
  <button
    class="mt-8 w-full rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 py-6 text-gray-500 dark:text-gray-400 transition hover:border-primary hover:text-primary"
    on:click={() => openModal('add-goal')}
  >
    + Create Your First Savings Goal
  </button>
{/if}

<!-- Add Goal Modal -->
<Modal id="add-goal" title="Add Savings Goal">
  <form on:submit|preventDefault={handleAddGoal} class="space-y-4">
    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Goal Name</label>
      <input
        type="text"
        bind:value={goalName}
        class="mt-1 w-full rounded-lg border border-gray-300 dark:border-border-dark bg-white dark:bg-surface-dark px-3 py-2 dark:text-gray-100"
        placeholder="Emergency Fund"
        required
      />
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Linked Bucket</label>
      <select
        bind:value={goalBucketId}
        class="mt-1 w-full rounded-lg border border-gray-300 dark:border-border-dark bg-white dark:bg-surface-dark px-3 py-2 dark:text-gray-100"
        required
      >
        <option value="">Select bucket...</option>
        {#each $buckets as bucket}
          <option value={bucket.id}>{bucket.name}</option>
        {/each}
      </select>
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Target Amount ($)</label>
      <input
        type="text"
        bind:value={goalTargetAmount}
        class="mt-1 w-full rounded-lg border border-gray-300 dark:border-border-dark bg-white dark:bg-surface-dark px-3 py-2 dark:text-gray-100"
        placeholder="10000.00"
        required
      />
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Already Saved ($)</label>
      <input
        type="text"
        bind:value={goalStartingBalance}
        class="mt-1 w-full rounded-lg border border-gray-300 dark:border-border-dark bg-white dark:bg-surface-dark px-3 py-2 dark:text-gray-100"
        placeholder="0.00"
      />
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Track By</label>
      <div class="flex gap-4">
        <label class="flex items-center gap-2">
          <input type="radio" bind:group={goalMode} value="deadline" />
          <span class="text-gray-700 dark:text-gray-300">Target Date</span>
        </label>
        <label class="flex items-center gap-2">
          <input type="radio" bind:group={goalMode} value="monthly" />
          <span class="text-gray-700 dark:text-gray-300">Monthly Amount</span>
        </label>
      </div>
    </div>
    {#if goalMode === 'deadline'}
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Target Date</label>
        <input
          type="date"
          bind:value={goalTargetDate}
          class="mt-1 w-full rounded-lg border border-gray-300 dark:border-border-dark bg-white dark:bg-surface-dark px-3 py-2 dark:text-gray-100"
          required
        />
      </div>
    {:else}
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Monthly Contribution ($)</label>
        <input
          type="text"
          bind:value={goalMonthlyContribution}
          class="mt-1 w-full rounded-lg border border-gray-300 dark:border-border-dark bg-white dark:bg-surface-dark px-3 py-2 dark:text-gray-100"
          placeholder="500.00"
          required
        />
      </div>
    {/if}
    <button type="submit" class="w-full rounded-lg bg-primary px-4 py-2 text-white hover:bg-blue-600">
      Create Goal
    </button>
  </form>
</Modal>
```

- [ ] **Step 3: Test goals feature**

Run: `npm run dev`
Test: Create a goal linked to Emergency Fund bucket, verify progress displays
Expected: Goal card shows progress bar, monthly needed calculation

- [ ] **Step 4: Commit**

```bash
git add src/routes/+page.svelte src/routes/+layout.svelte
git commit --no-gpg-sign -m "Add goals section to Dashboard with add goal modal"
```

---

### Task 14: Final Testing and Build

**Files:**
- All

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Run type check**

Run: `npm run check`
Expected: No errors

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Test all features manually**

Run: `npm run preview`
Test checklist:
- [ ] Dark mode toggle works in Settings
- [ ] No flash on page load with dark mode set
- [ ] System preference detection works
- [ ] Percentage allocation calculates correctly
- [ ] Hybrid allocation (fixed + %) works
- [ ] Over-100% percentage warning shows
- [ ] Goals can be created with deadline mode
- [ ] Goals can be created with monthly mode
- [ ] Goal progress tracks allocations correctly
- [ ] On-track/behind status displays correctly

- [ ] **Step 5: Commit**

```bash
git add -A
git commit --no-gpg-sign -m "Complete dark mode, percentage allocation, and savings goals features"
```

---

## Summary

| Task | Feature | Description |
|------|---------|-------------|
| 1 | Dark Mode | Tailwind dark mode configuration |
| 2 | Dark Mode | Theme store with preference persistence |
| 3 | Dark Mode | Flash prevention script |
| 4 | Dark Mode | Theme toggle and dark classes |
| 5 | Allocation | Type and database schema updates |
| 6 | Allocation | Calculation utilities with tests |
| 7 | Allocation | Budget store auto-recalculation |
| 8 | Allocation | Buckets page UI |
| 9 | Goals | SavingsGoal type definition |
| 10 | Goals | Calculation utilities with tests |
| 11 | Goals | Goals store |
| 12 | Goals | GoalCard component |
| 13 | Goals | Dashboard integration |
| 14 | All | Final testing and build |
