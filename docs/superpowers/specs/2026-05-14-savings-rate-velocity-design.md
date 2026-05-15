# Savings Rate & Spending Velocity Design

## Overview

Add two metrics to help users understand their financial health:
1. **Savings Rate** — percentage of income saved (not spent)
2. **Spending Velocity** — projected month-end spending per bucket based on current pace

## Calculation Layer

### New functions in `src/lib/utils/calculations.ts`

```typescript
/**
 * Calculate savings rate as percentage.
 * Returns null if income <= 0 (can't calculate meaningful rate).
 */
export function calculateSavingsRate(income: number, spent: number): number | null {
  if (income <= 0) return null;
  return Math.round(((income - spent) / income) * 1000) / 10; // one decimal
}

/**
 * Project total spend for the month based on current pace.
 * Formula: (spent / dayOfMonth) * daysInMonth
 */
export function calculateProjectedSpend(
  spent: number,
  dayOfMonth: number,
  daysInMonth: number
): number {
  if (dayOfMonth <= 0) return spent;
  return Math.round((spent / dayOfMonth) * daysInMonth);
}

/**
 * Projections are considered reliable after day 7.
 */
export function isProjectionReliable(dayOfMonth: number): boolean {
  return dayOfMonth >= 7;
}
```

### New derived stores in `src/lib/stores/budgetStore.ts`

```typescript
// Current month savings rate
export const savingsRate = derived(
  [currentMonthIncome, bucketStatuses],
  ([$income, $statuses]) => {
    const totalSpent = $statuses.reduce((sum, s) => sum + s.spent, 0);
    return calculateSavingsRate($income, totalSpent);
  }
);

// Last 6 months savings rate for trend chart
export const savingsRateTrend = derived(
  [transactions, incomes],
  ([$transactions, $incomes]) => {
    const months = getLast6Months(); // use existing pattern from analytics
    return months.map(month => {
      const { start, end } = getMonthRange(month);
      const monthIncome = $incomes
        .filter(i => new Date(i.date) >= start && new Date(i.date) <= end)
        .reduce((sum, i) => sum + i.amount, 0);
      const monthSpent = $transactions
        .filter(t => new Date(t.date) >= start && new Date(t.date) <= end)
        .reduce((sum, t) => sum + t.amount, 0);
      return { month, rate: calculateSavingsRate(monthIncome, monthSpent) };
    });
  }
);
```

## UI Changes

### Dashboard (`src/routes/+page.svelte`)

**New 4th summary card** after Income/Allocated/Unallocated:

- Label: "Savings Rate"
- Value: `X%` or "—" if null
- Color coding:
  - Green (`text-success`): rate >= 20%
  - Yellow (`text-warning`): rate 10-20%
  - Red (`text-danger`): rate < 10%

### BucketCard (`src/lib/components/shared/BucketCard.svelte`)

**New line below progress bar:**

- Format: `Projected: $X / $Y` where X = projected spend, Y = allocated
- If `dayOfMonth < 7`: show `~$X / $Y` (tilde prefix indicates estimate)
- If projected > allocated: use `text-danger` color
- Small text size (`text-xs text-muted`)

### Analytics (`src/routes/analytics/+page.svelte`)

**New chart card in 2-column grid:**

- Title: "Savings Rate Trend"
- Subtitle: "Last 6 months"
- LineChart with single dataset showing savings rate %
- Y-axis: percentage (0-100 typical, can exceed)

**New summary section (optional enhancement):**

- "Projected Overspends" listing buckets where projected > allocated
- Shows bucket name + projected overage amount

## Test Coverage

Add tests in `tests/lib/utils/calculations.test.ts`:

- `calculateSavingsRate`: handles zero/negative income, typical cases, edge cases
- `calculateProjectedSpend`: day 1 vs day 15 vs day 30, zero spent
- `isProjectionReliable`: boundary at day 7

## Files Changed

1. `src/lib/utils/calculations.ts` — new functions
2. `src/lib/stores/budgetStore.ts` — new derived stores
3. `src/routes/+page.svelte` — savings rate card
4. `src/lib/components/shared/BucketCard.svelte` — velocity projection
5. `src/routes/analytics/+page.svelte` — trend chart + optional overspend summary
6. `tests/lib/utils/calculations.test.ts` — new tests
