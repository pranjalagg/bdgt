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
- Routes (mobile-first; four tabs plus pages that slide up):
  - `src/routes/+page.svelte`: Home (safe-to-spend hero, pace chart, cards chosen in Edit Home)
  - `src/routes/budget/`: Budget tab, envelope page `budget/[id]`, `budget/bills` (recurring)
  - `src/routes/activity/`: expenses by day, filter chips, swipe actions
  - `src/routes/insights/`: period chart, breakdowns, trend pages `insights/[chart]`, `insights/investments`
  - `src/routes/review/` and `src/routes/settings/` (with `settings/sync|capture|rules`): slide up over the tabs; no tab bar
  - Old addresses (`/buckets`, `/transactions`, `/analytics`, `/recurring`, …) redirect in their `+page.ts`
- `src/lib/components/`: `layout/` (NavBar, TabBar, MonthMenu, Layout), `home/`, `budget/`, `activity/`, `log/`, `review/`, `insights/`, `charts/` (SVG charts), `ui/` (Icon, Switch, RollingNumber, Toast), `shared/Modal.svelte` (stacked sheets)
- `src/lib/ui/`: motion springs, haptics, icons, routes, history, swipe, keypad, edge swipe, Android back button
- `src/lib/charts/`: chart scales, paths and the scrub action; `src/lib/insights/`: trend math and pattern logic
- `src/lib/home/`: Home hero math and the Home layout (`homeLayout` row in the settings table)
- `tests/`: Unit tests for utilities, stores and the pure UI logic above
- Design language: `docs/superpowers/specs/2026-10-24-minimal-ui-design.md` (white space over boxes, one large figure per screen, neutral `IconMark` icons, envelope colour only as dots, bars and soft tiles, two-weight `SectionHeading`s, Manrope via one `--font-sans` token). Shared parts: `src/lib/components/ui/{IconMark,SectionHeading}.svelte`, `src/lib/ui/tiles.ts`, `.list` / `.row` / `.t-*` classes in `src/app.css`
- `scripts/ui-check/run.cjs`: browser checks (`npm run ui:smoke`, `ui:a11y`, `ui:shots`) against the dev server on port 5174

### Important Patterns

- Bucket allocation types: `fixed` (manual amount), `percentage` (of total income), `hybrid` (both)
- Month keys use `YYYY-MM` format
- Static adapter with conditional base path for GitHub Pages vs local dev
