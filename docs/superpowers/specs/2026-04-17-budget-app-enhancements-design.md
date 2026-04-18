# Budget App Enhancements — Design Specification

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add dark mode, percentage-based allocation, and savings goals to the existing zero-based budget app.

**Architecture:** Extends existing Svelte stores and Dexie.js database with new fields and tables. Dark mode via Tailwind's class strategy with theme persistence.

**Tech Stack:** Same as base app (SvelteKit, Dexie.js, Tailwind CSS, Chart.js)

---

## Feature 1: Dark Mode

### Requirements

- Default to system preference (`prefers-color-scheme`)
- Manual override in Settings (light/dark/system)
- Persist preference in localStorage
- No flash of wrong theme on page load

### Implementation

**Tailwind configuration:**
- Set `darkMode: 'class'` in `tailwind.config.js`
- Add dark color variants to theme

**Color mapping:**

| Token | Light | Dark |
|-------|-------|------|
| background | #fafafa | #0f0f0f |
| surface | #ffffff | #1a1a1a |
| text-primary | #1f2937 | #f3f4f6 |
| text-secondary | #6b7280 | #9ca3af |
| border | #e5e7eb | #374151 |

**Theme store (`src/lib/stores/themeStore.ts`):**

```typescript
type ThemePreference = 'system' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';

// Exports:
// - themePreference: writable store
// - resolvedTheme: derived store (actual theme in use)
// - setTheme(pref: ThemePreference): void
// - initTheme(): void (call on app mount)
```

**Flash prevention (`src/app.html`):**

Inline script in `<head>` that:
1. Reads localStorage theme preference
2. Checks system preference if set to 'system'
3. Adds/removes `dark` class on `<html>` before page renders

**Files to modify:**

- `tailwind.config.js` — add `darkMode: 'class'`, dark color tokens
- `src/app.html` — inline theme script
- `src/app.css` — dark variant base styles
- `src/lib/stores/themeStore.ts` — new file
- `src/routes/settings/+page.svelte` — theme toggle
- All components — add `dark:` class variants

---

## Feature 2: Hybrid Allocation (Fixed + Percentage)

### Requirements

- Each bucket can use: fixed amount, percentage of income, or both
- Percentage calculated from **total income** (not remaining)
- Computed allocation stored in MonthSnapshot (existing behavior)
- Migration: existing buckets default to fixed type

### Data Model Changes

**Bucket interface additions:**

```typescript
interface Bucket {
  id: string;
  name: string;
  color: string;
  order: number;
  isDefault: boolean;
  // New fields:
  allocationType: 'fixed' | 'percentage' | 'hybrid';
  fixedAmount: number;      // cents, default 0
  percentageAmount: number; // 0-100, default 0
}
```

### Calculation Logic

```typescript
function computeAllocation(bucket: Bucket, totalIncome: number): number {
  const fixed = bucket.fixedAmount || 0;
  const pct = bucket.percentageAmount || 0;
  const fromPercentage = Math.round((pct / 100) * totalIncome);
  
  switch (bucket.allocationType) {
    case 'fixed': return fixed;
    case 'percentage': return fromPercentage;
    case 'hybrid': return fixed + fromPercentage;
  }
}
```

### Allocation Workflow

1. User sets bucket allocation type and amounts in Buckets page
2. When income changes or month starts, recalculate all percentage-based allocations
3. Store computed values in `MonthSnapshot.allocations`
4. Dashboard shows actual allocated amounts (computed)

### UI Changes

**Bucket edit form:**
- Radio group: Fixed / Percentage / Both
- Conditional inputs based on selection
- Show computed amount preview

**BucketCard:**
- Display notation: "$500", "10%", or "$500 + 10%"
- Show computed amount in parentheses for percentage types

**Dashboard warnings:**
- Total percentage exceeds 100%: amber warning
- Total allocation exceeds income: red warning (existing)

### Migration

On database upgrade:
- Add `allocationType: 'fixed'` to all existing buckets
- Copy current `MonthSnapshot.allocations[bucketId]` to `fixedAmount`
- Set `percentageAmount: 0`

---

## Feature 3: Savings Goals

### Requirements

- Goals are separate entities linked to buckets
- Track cumulative allocations to linked bucket since goal creation
- User sets target amount
- User sets EITHER target date OR monthly contribution (not both)
- App calculates the missing value
- Progress tracking with on-track indicator

### Data Model

**New SavingsGoal interface:**

```typescript
interface SavingsGoal {
  id: string;
  name: string;
  bucketId: string;              // linked bucket
  targetAmount: number;          // cents
  targetDate?: Date;             // optional: user-set deadline
  monthlyContribution?: number;  // optional: user-set monthly (cents)
  createdAt: Date;
  startingBalance: number;       // initial amount already saved (cents)
}
```

**Constraints:**
- Either `targetDate` or `monthlyContribution` must be set, not both
- `bucketId` must reference existing bucket

### Calculation Logic

**Current progress:**
```typescript
function calculateGoalProgress(goal: SavingsGoal, monthSnapshots: MonthSnapshot[]): number {
  const allocations = monthSnapshots
    .filter(s => s.month >= getMonthKey(goal.createdAt))
    .reduce((sum, s) => sum + (s.allocations[goal.bucketId] || 0), 0);
  return goal.startingBalance + allocations;
}
```

**Projections:**
```typescript
// If targetDate is set:
function monthlyNeeded(goal: SavingsGoal, currentAmount: number): number {
  const remaining = goal.targetAmount - currentAmount;
  const monthsLeft = monthsBetween(new Date(), goal.targetDate);
  return monthsLeft > 0 ? Math.ceil(remaining / monthsLeft) : remaining;
}

// If monthlyContribution is set:
function projectedDate(goal: SavingsGoal, currentAmount: number): Date {
  const remaining = goal.targetAmount - currentAmount;
  const monthsNeeded = Math.ceil(remaining / goal.monthlyContribution);
  return addMonths(new Date(), monthsNeeded);
}
```

**On-track status:**
- `targetDate` mode: on-track if current allocation >= monthlyNeeded
- `monthlyContribution` mode: on-track if current month allocation >= monthlyContribution

### Database

Add `savingsGoals` table to Dexie schema:

```typescript
savingsGoals: '&id, bucketId'
```

### Store (`src/lib/stores/goalsStore.ts`)

```typescript
// Exports:
// - savingsGoals: writable<SavingsGoal[]>
// - addGoal(goal: Omit<SavingsGoal, 'id'>): Promise<string>
// - updateGoal(id: string, updates: Partial<SavingsGoal>): Promise<void>
// - deleteGoal(id: string): Promise<void>
// - goalStatuses: derived store with progress/projections
```

### UI Components

**GoalCard (`src/lib/components/shared/GoalCard.svelte`):**
- Name and linked bucket
- Progress bar (current / target)
- Current amount / target amount
- Monthly needed OR projected date
- On-track badge (green) or behind (amber/red)

**Goals section on Dashboard:**
- Below bucket cards or in sidebar
- List of GoalCards
- "Add Goal" button

**Goal management (Settings or dedicated page):**
- Form: name, linked bucket, target amount, deadline OR monthly
- Edit/delete existing goals
- Starting balance input for existing savings

### Edge Cases

- Bucket deleted with linked goal: prompt to delete goal or reassign
- Goal reached: show celebration, option to archive
- Negative progress (spending from savings bucket): show warning

---

## File Structure Summary

**New files:**
- `src/lib/stores/themeStore.ts`
- `src/lib/stores/goalsStore.ts`
- `src/lib/components/shared/GoalCard.svelte`
- `src/lib/utils/goals.ts` (calculation helpers)

**Modified files:**
- `tailwind.config.js`
- `src/app.html`
- `src/app.css`
- `src/lib/types.ts`
- `src/lib/db/index.ts`
- `src/lib/stores/budgetStore.ts`
- `src/lib/utils/calculations.ts`
- `src/routes/+page.svelte` (Dashboard)
- `src/routes/buckets/+page.svelte`
- `src/routes/settings/+page.svelte`
- All components (dark mode classes)

---

## Testing

**Dark mode:**
- Theme toggle persists across refresh
- System preference detection works
- No flash on page load
- All components readable in both modes

**Percentage allocation:**
- Fixed, percentage, hybrid calculations correct
- Recalculates when income changes
- Migration preserves existing allocations
- Over-100% warning displays

**Savings goals:**
- Progress calculation correct
- Monthly needed / projected date accurate
- On-track status correct
- Goal CRUD operations work
- Bucket deletion handles linked goals
