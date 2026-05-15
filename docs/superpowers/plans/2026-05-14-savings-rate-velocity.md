# Savings Rate & Spending Velocity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add savings rate metric (current + 6-month trend) and per-bucket spending velocity projections.

**Architecture:** Pure calculation functions in `calculations.ts`, derived stores in `budgetStore.ts`, UI updates to dashboard, BucketCard, and analytics page. TDD approach — tests first.

**Tech Stack:** SvelteKit 5, Svelte stores, Vitest, Tailwind CSS

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/utils/dates.ts` | Add `getLast6Months()`, `getDaysInMonth()`, `getDayOfMonth()` |
| `src/lib/utils/calculations.ts` | Add `calculateSavingsRate()`, `calculateProjectedSpend()`, `isProjectionReliable()` |
| `src/lib/stores/budgetStore.ts` | Add `savingsRate`, `savingsRateTrend` derived stores |
| `src/lib/components/shared/BucketCard.svelte` | Add velocity projection line |
| `src/routes/+page.svelte` | Add savings rate summary card |
| `src/routes/analytics/+page.svelte` | Add savings rate trend chart |
| `tests/lib/utils/calculations.test.ts` | Tests for new calculation functions |
| `tests/lib/utils/dates.test.ts` | Tests for new date helpers |

---

### Task 1: Add date helper functions

**Files:**
- Modify: `src/lib/utils/dates.ts`
- Modify: `tests/lib/utils/dates.test.ts`

- [ ] **Step 1: Write failing tests for date helpers**

Add to `tests/lib/utils/dates.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getLast6Months, getDaysInMonth, getDayOfMonth, getMonthKey } from '$lib/utils/dates';

describe('getLast6Months', () => {
  it('returns 6 month keys ending with current month', () => {
    const months = getLast6Months('2026-05');
    expect(months).toHaveLength(6);
    expect(months[5]).toBe('2026-05');
    expect(months[0]).toBe('2025-12');
  });

  it('handles year boundary', () => {
    const months = getLast6Months('2026-02');
    expect(months).toEqual(['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

describe('getDaysInMonth', () => {
  it('returns 31 for January', () => {
    expect(getDaysInMonth('2026-01')).toBe(31);
  });

  it('returns 28 for non-leap February', () => {
    expect(getDaysInMonth('2026-02')).toBe(28);
  });

  it('returns 29 for leap year February', () => {
    expect(getDaysInMonth('2024-02')).toBe(29);
  });

  it('returns 30 for April', () => {
    expect(getDaysInMonth('2026-04')).toBe(30);
  });
});

describe('getDayOfMonth', () => {
  it('returns day number from date', () => {
    expect(getDayOfMonth(new Date(2026, 4, 14))).toBe(14);
  });

  it('returns 1 for first of month', () => {
    expect(getDayOfMonth(new Date(2026, 0, 1))).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- tests/lib/utils/dates.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement date helper functions**

Add to `src/lib/utils/dates.ts`:

```typescript
export function getLast6Months(currentMonth?: string): string[] {
  let month = currentMonth || getMonthKey(new Date());
  const months: string[] = [];
  for (let i = 0; i < 6; i++) {
    months.unshift(month);
    month = getPreviousMonthKey(month);
  }
  return months;
}

export function getDaysInMonth(monthKey: string): number {
  const date = parseMonthKey(monthKey);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export function getDayOfMonth(date: Date): number {
  return date.getDate();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- tests/lib/utils/dates.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/dates.ts tests/lib/utils/dates.test.ts
git commit --no-gpg-sign -m "feat: add date helpers for savings rate trend"
```

---

### Task 2: Add savings rate calculation function

**Files:**
- Modify: `src/lib/utils/calculations.ts`
- Modify: `tests/lib/utils/calculations.test.ts`

- [ ] **Step 1: Write failing tests for calculateSavingsRate**

Add to `tests/lib/utils/calculations.test.ts`:

```typescript
describe('calculateSavingsRate', () => {
  it('calculates percentage saved', () => {
    expect(calculateSavingsRate(100000, 70000)).toBe(30);
  });

  it('returns one decimal precision', () => {
    expect(calculateSavingsRate(100000, 66666)).toBe(33.3);
  });

  it('returns null for zero income', () => {
    expect(calculateSavingsRate(0, 5000)).toBeNull();
  });

  it('returns null for negative income', () => {
    expect(calculateSavingsRate(-10000, 5000)).toBeNull();
  });

  it('handles overspending (negative rate)', () => {
    expect(calculateSavingsRate(100000, 120000)).toBe(-20);
  });

  it('handles zero spending', () => {
    expect(calculateSavingsRate(100000, 0)).toBe(100);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- tests/lib/utils/calculations.test.ts`
Expected: FAIL — calculateSavingsRate not defined

- [ ] **Step 3: Implement calculateSavingsRate**

Add to `src/lib/utils/calculations.ts`:

```typescript
export function calculateSavingsRate(income: number, spent: number): number | null {
  if (income <= 0) return null;
  return Math.round(((income - spent) / income) * 1000) / 10;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- tests/lib/utils/calculations.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/calculations.ts tests/lib/utils/calculations.test.ts
git commit --no-gpg-sign -m "feat: add calculateSavingsRate function"
```

---

### Task 3: Add spending velocity calculation functions

**Files:**
- Modify: `src/lib/utils/calculations.ts`
- Modify: `tests/lib/utils/calculations.test.ts`

- [ ] **Step 1: Write failing tests for velocity functions**

Add to `tests/lib/utils/calculations.test.ts`:

```typescript
describe('calculateProjectedSpend', () => {
  it('projects full month spend from current pace', () => {
    // $300 spent by day 15 of 30 -> $600 projected
    expect(calculateProjectedSpend(30000, 15, 30)).toBe(60000);
  });

  it('handles day 1', () => {
    // $100 spent on day 1 of 31 -> $3100 projected
    expect(calculateProjectedSpend(10000, 1, 31)).toBe(310000);
  });

  it('returns spent amount if dayOfMonth is 0 or negative', () => {
    expect(calculateProjectedSpend(10000, 0, 30)).toBe(10000);
    expect(calculateProjectedSpend(10000, -1, 30)).toBe(10000);
  });

  it('handles zero spending', () => {
    expect(calculateProjectedSpend(0, 15, 30)).toBe(0);
  });

  it('rounds to nearest cent', () => {
    // $333 spent by day 10 of 30 -> $999 projected
    expect(calculateProjectedSpend(33300, 10, 30)).toBe(99900);
  });
});

describe('isProjectionReliable', () => {
  it('returns false for days 1-6', () => {
    expect(isProjectionReliable(1)).toBe(false);
    expect(isProjectionReliable(6)).toBe(false);
  });

  it('returns true for day 7+', () => {
    expect(isProjectionReliable(7)).toBe(true);
    expect(isProjectionReliable(15)).toBe(true);
    expect(isProjectionReliable(30)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- tests/lib/utils/calculations.test.ts`
Expected: FAIL — functions not defined

- [ ] **Step 3: Implement velocity functions**

Add to `src/lib/utils/calculations.ts`:

```typescript
export function calculateProjectedSpend(
  spent: number,
  dayOfMonth: number,
  daysInMonth: number
): number {
  if (dayOfMonth <= 0) return spent;
  return Math.round((spent / dayOfMonth) * daysInMonth);
}

export function isProjectionReliable(dayOfMonth: number): boolean {
  return dayOfMonth >= 7;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- tests/lib/utils/calculations.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/calculations.ts tests/lib/utils/calculations.test.ts
git commit --no-gpg-sign -m "feat: add spending velocity calculation functions"
```

---

### Task 4: Add derived stores for savings rate

**Files:**
- Modify: `src/lib/stores/budgetStore.ts`

- [ ] **Step 1: Add imports**

Add to imports at top of `src/lib/stores/budgetStore.ts`:

```typescript
import { calculateSavingsRate } from '$lib/utils/calculations';
import { getLast6Months, getMonthRange } from '$lib/utils/dates';
```

- [ ] **Step 2: Add savingsRate derived store**

Add after `unallocated` derived store:

```typescript
export const savingsRate = derived(
  [currentMonthIncome, bucketStatuses],
  ([$income, $statuses]) => {
    const totalSpent = $statuses.reduce((sum, s) => sum + s.spent, 0);
    return calculateSavingsRate($income, totalSpent);
  }
);
```

- [ ] **Step 3: Add savingsRateTrend derived store**

Add after `savingsRate`:

```typescript
export const savingsRateTrend = derived(
  [transactions, incomes, currentMonthKey],
  ([$transactions, $incomes, $currentMonth]) => {
    const months = getLast6Months($currentMonth);
    return months.map(month => {
      const { start, end } = getMonthRange(month);
      const monthIncome = $incomes
        .filter(i => {
          const date = new Date(i.date);
          return date >= start && date <= end;
        })
        .reduce((sum, i) => sum + i.amount, 0);
      const monthSpent = $transactions
        .filter(t => {
          const date = new Date(t.date);
          return date >= start && date <= end;
        })
        .reduce((sum, t) => sum + t.amount, 0);
      return { month, rate: calculateSavingsRate(monthIncome, monthSpent) };
    });
  }
);
```

- [ ] **Step 4: Run type check**

Run: `npm run check`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/budgetStore.ts
git commit --no-gpg-sign -m "feat: add savingsRate and savingsRateTrend derived stores"
```

---

### Task 5: Add savings rate card to dashboard

**Files:**
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Add import for savingsRate store**

Update imports in script section:

```typescript
import { bucketStatuses, currentMonthIncome, currentMonthFixedIncome, currentMonthIncomes, unallocated, addIncome, updateIncome, deleteIncome, buckets, savingsRate } from '$lib/stores/budgetStore';
```

- [ ] **Step 2: Add reactive color variable**

Add after existing reactive declarations in script:

```typescript
$: savingsRateColor = $savingsRate === null ? 'text-muted'
  : $savingsRate >= 20 ? 'text-success'
  : $savingsRate >= 10 ? 'text-warning'
  : 'text-danger';

$: savingsRateIconBg = $savingsRate === null ? 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
  : $savingsRate >= 20 ? 'bg-success/10 text-success'
  : $savingsRate >= 10 ? 'bg-warning/10 text-warning'
  : 'bg-danger/10 text-danger';
```

- [ ] **Step 3: Change grid to 4 columns and add savings rate card**

Replace the summary cards grid:

```svelte
<!-- Summary Cards -->
<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
```

Add new card after the Unallocated card (before the closing `</div>` of the grid):

```svelte
<div class="card p-5">
  <div class="mb-1 flex items-center gap-2">
    <span class="flex h-6 w-6 items-center justify-center rounded-md {savingsRateIconBg}">
      <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0016.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 002 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
    </span>
    <p class="metric-label">Savings Rate</p>
  </div>
  <p class="metric-value {savingsRateColor}">
    {$savingsRate !== null ? `${$savingsRate}%` : '—'}
  </p>
</div>
```

- [ ] **Step 4: Run dev server and verify**

Run: `npm run dev`
Open: http://localhost:5173/
Expected: 4 summary cards with Savings Rate showing percentage and color coding

- [ ] **Step 5: Commit**

```bash
git add src/routes/+page.svelte
git commit --no-gpg-sign -m "feat: add savings rate card to dashboard"
```

---

### Task 6: Add velocity projection to BucketCard

**Files:**
- Modify: `src/lib/components/shared/BucketCard.svelte`

- [ ] **Step 1: Add imports and props**

Update script section:

```typescript
import { formatCurrency } from '$lib/utils/currency';
import { getBucketStatus, calculateProjectedSpend, isProjectionReliable } from '$lib/utils/calculations';
import { getDaysInMonth, getDayOfMonth, getMonthKey } from '$lib/utils/dates';
import ProgressBar from './ProgressBar.svelte';
import type { BucketStatus } from '$lib/types';

export let status: BucketStatus;
export let onClick: (() => void) | undefined = undefined;
export let fixedIncome: number = 0;
export let currentMonth: string = getMonthKey(new Date());
```

- [ ] **Step 2: Add velocity reactive calculations**

Add after existing reactive declarations:

```typescript
$: today = new Date();
$: dayOfMonth = getDayOfMonth(today);
$: daysInMonth = getDaysInMonth(currentMonth);
$: projectedSpend = spent > 0 ? calculateProjectedSpend(spent, dayOfMonth, daysInMonth) : 0;
$: isReliable = isProjectionReliable(dayOfMonth);
$: projectedOverBudget = projectedSpend > allocated;
```

- [ ] **Step 3: Add velocity display in template**

Add after the ProgressBar line (line 38), before the `{#if spent < 0}` block:

```svelte
{#if spent > 0 && allocated > 0}
  <p class="mt-1.5 text-xs {projectedOverBudget ? 'text-danger' : 'text-muted'}">
    Projected: {isReliable ? '' : '~'}{formatCurrency(projectedSpend)} / {formatCurrency(allocated)}
  </p>
{/if}
```

- [ ] **Step 4: Run dev server and verify**

Run: `npm run dev`
Open: http://localhost:5173/
Expected: Each bucket card shows "Projected: $X / $Y" below progress bar (with ~ prefix if day < 7)

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/shared/BucketCard.svelte
git commit --no-gpg-sign -m "feat: add spending velocity projection to BucketCard"
```

---

### Task 7: Pass currentMonth to BucketCard

**Files:**
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Update BucketCard usage**

Find the BucketCard in the template:

```svelte
<BucketCard {status} fixedIncome={$currentMonthFixedIncome} onClick={() => handleBucketClick(status.bucket.id)} />
```

Replace with:

```svelte
<BucketCard {status} fixedIncome={$currentMonthFixedIncome} currentMonth={$currentMonthKey} onClick={() => handleBucketClick(status.bucket.id)} />
```

- [ ] **Step 2: Run type check**

Run: `npm run check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/routes/+page.svelte
git commit --no-gpg-sign -m "feat: pass currentMonth to BucketCard for velocity calculation"
```

---

### Task 8: Add savings rate trend chart to analytics

**Files:**
- Modify: `src/routes/analytics/+page.svelte`

- [ ] **Step 1: Add import for savingsRateTrend**

Update imports:

```typescript
import { bucketStatuses, transactions, incomes, currentMonthIncome, currentMonthFixedIncome, savingsRateTrend } from '$lib/stores/budgetStore';
```

- [ ] **Step 2: Add reactive data for trend chart**

Add after existing reactive declarations:

```typescript
$: savingsRateData = $savingsRateTrend.map(m => m.rate ?? 0);
$: savingsRateLabels = $savingsRateTrend.map(m => formatMonthYear(m.month).split(' ')[0]);
```

- [ ] **Step 3: Add trend chart card**

Find the 2-column grid with "Monthly Spending Trend" and "Income vs Spending". After the closing `</div>` of that grid, add a new card:

```svelte
<div class="card">
  <div class="border-b border-gray-100 px-5 py-4 dark:border-border-dark">
    <h2 class="section-title">Savings Rate Trend</h2>
    <p class="mt-0.5 text-xs text-muted">Last 6 months</p>
  </div>
  <div class="p-5">
    <LineChart
      labels={savingsRateLabels}
      datasets={[
        { label: 'Savings Rate', data: savingsRateData, color: '#22c55e' },
      ]}
    />
  </div>
</div>
```

- [ ] **Step 4: Run dev server and verify**

Run: `npm run dev`
Open: http://localhost:5173/analytics
Expected: New "Savings Rate Trend" chart showing 6-month trend

- [ ] **Step 5: Commit**

```bash
git add src/routes/analytics/+page.svelte
git commit --no-gpg-sign -m "feat: add savings rate trend chart to analytics"
```

---

### Task 9: Add projected overspends summary to analytics

**Files:**
- Modify: `src/routes/analytics/+page.svelte`

- [ ] **Step 1: Add imports for velocity calculation**

Update imports:

```typescript
import { calculateProjectedSpend, isProjectionReliable } from '$lib/utils/calculations';
import { getDaysInMonth, getDayOfMonth, getMonthKey } from '$lib/utils/dates';
```

- [ ] **Step 2: Add reactive calculations for overspends**

Add after existing reactive declarations:

```typescript
$: today = new Date();
$: currentMonthKeyNow = getMonthKey(today);
$: dayOfMonth = getDayOfMonth(today);
$: daysInMonth = getDaysInMonth(currentMonthKeyNow);
$: isReliable = isProjectionReliable(dayOfMonth);

$: projectedOverspends = $bucketStatuses
  .filter(s => s.spent > 0 && s.allocated > 0)
  .map(s => {
    const projected = calculateProjectedSpend(s.spent, dayOfMonth, daysInMonth);
    const overage = projected - s.allocated;
    return { bucket: s.bucket, projected, overage };
  })
  .filter(p => p.overage > 0)
  .sort((a, b) => b.overage - a.overage);
```

- [ ] **Step 3: Add projected overspends card**

Add after the savings rate trend chart:

```svelte
{#if projectedOverspends.length > 0}
  <div class="card">
    <div class="border-b border-gray-100 px-5 py-4 dark:border-border-dark">
      <h2 class="section-title">Projected Overspends</h2>
      <p class="mt-0.5 text-xs text-muted">
        {isReliable ? 'Based on current pace' : 'Early estimate — may change'}
      </p>
    </div>
    <div class="divide-y divide-gray-100 dark:divide-border-dark">
      {#each projectedOverspends as { bucket, projected, overage }}
        <div class="flex items-center justify-between px-5 py-3">
          <div class="flex items-center gap-2.5">
            <span class="h-3 w-3 rounded-full" style="background-color: {bucket.color}"></span>
            <span class="text-sm font-medium text-gray-700 dark:text-gray-200">{bucket.name}</span>
          </div>
          <span class="text-sm font-medium text-danger">
            {isReliable ? '' : '~'}+{formatCurrency(overage)}
          </span>
        </div>
      {/each}
    </div>
  </div>
{/if}
```

- [ ] **Step 4: Run dev server and verify**

Run: `npm run dev`
Open: http://localhost:5173/analytics
Expected: "Projected Overspends" card appears if any buckets are on track to exceed budget

- [ ] **Step 5: Commit**

```bash
git add src/routes/analytics/+page.svelte
git commit --no-gpg-sign -m "feat: add projected overspends summary to analytics"
```

---

### Task 10: Final verification and cleanup

- [ ] **Step 1: Run full test suite**

Run: `npm run test:run`
Expected: All tests pass

- [ ] **Step 2: Run type check**

Run: `npm run check`
Expected: No errors

- [ ] **Step 3: Manual verification**

Open: http://localhost:5173/
Verify:
1. Dashboard shows 4 summary cards including Savings Rate with correct color coding
2. Each BucketCard shows velocity projection
3. Analytics page shows savings rate trend chart
4. Analytics page shows projected overspends (if applicable)

- [ ] **Step 4: Final commit if any cleanup needed**

```bash
git status
# If clean, done. If changes, commit them.
```
