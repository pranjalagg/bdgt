# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run check        # TypeScript + Svelte type checking
npm run test         # Run tests in watch mode
npm run test:run     # Run tests once
npx vitest run tests/lib/utils/calculations.test.ts  # Run single test file
```

## Architecture

Zero-based budgeting app: SvelteKit 5 + Tailwind CSS + Dexie (IndexedDB). Static build deploys to GitHub Pages.

### Data Model (src/lib/types.ts)

All monetary values stored in **cents** (integers).

- **Bucket**: Budget category with allocation rules (fixed/percentage/hybrid)
- **Transaction**: Expense tied to bucket and date
- **Income**: Monthly income entry (fixed vs one-time)
- **MonthSnapshot**: Historical allocations, spent, rollovers per month
- **RecurringTransaction**: Auto-generated transactions on schedule
- **SavingsGoal**: Target amount/date linked to bucket

### State Management (src/lib/stores/)

- `budgetStore.ts`: Main store with all CRUD operations. Uses derived stores for computed values (currentMonthIncome, bucketStatuses, unallocated).
- `uiStore.ts`: Current month selection, UI state
- Pattern: Write to Dexie first, then update Svelte store to keep in sync

### Key Paths

- `src/lib/db/index.ts`: Dexie schema with migrations
- `src/lib/utils/calculations.ts`: Budget math (allocation, remaining, status)
- `src/routes/+page.svelte`: Dashboard with bucket cards and income management
- `src/routes/buckets/`: Bucket CRUD and allocation editing
- `tests/`: Unit tests for utilities (currency, dates, calculations)

### Important Patterns

- Bucket allocation types: `fixed` (manual amount), `percentage` (of total income), `hybrid` (both)
- Month keys use `YYYY-MM` format
- Static adapter with conditional base path for GitHub Pages vs local dev
