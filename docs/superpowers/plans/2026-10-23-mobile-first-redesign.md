# Mobile-first Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild bdgt's screens around phone use (Home, Budget, Activity, Insights tabs and a Log button) with native-feeling sheets, pages, gestures and motion, without losing any feature.

**Architecture:** Foundations first (UI checks in the repo, tokens and type, motion, sheets, navigation, shell, chart math), then one screen per task, then cleanup. Screens keep reading the existing stores in `src/lib/stores/`; new pure logic lives in small tested modules (`src/lib/ui/`, `src/lib/charts/`, `src/lib/insights/trends.ts`, `src/lib/home/`). Every commit leaves the app working; old routes redirect to new ones.

**Tech Stack:** SvelteKit 2 on Svelte 5 (components in the Svelte 4 syntax), Tailwind 3, Dexie, Vitest (jsdom), Capacitor 8 (`@capacitor/haptics@8.0.2`, `@capacitor/app@8.1.2` added), `@fontsource-variable/inter@5.3.0`, `playwright-core@1.64.1` and `axe-core@4.10.2` for UI checks.

**Spec:** `docs/superpowers/specs/2026-10-23-mobile-first-redesign-design.md` (approved). Visual reference: `docs/superpowers/specs/2026-10-23-mobile-first-concept.html` (open at 390 px wide). The spec's "Where every feature goes" table is the acceptance checklist.

## Global Constraints

- Work on `claude/native-ui`; `git commit --no-gpg-sign`; no attribution lines; push only to `claude/native-ui`. Never touch `claude/intelligent-davinci-7qblqz`, the `android-latest` release or the Pages deploy.
- All money in cents. Existing stores and calculations stay the source of truth; screens read from them.
- Components in the Svelte 4 syntax (`export let`, `$:`), matching the codebase.
- No schema change. Home's layout is one key, `homeLayout` (a JSON string), in the existing synced `settings` table.
- Motion only under `prefers-reduced-motion: no-preference`; under reduce, fades or instant changes only.
- Text contrast at least 4.5:1 in both themes; works at 320 px wide.
- Every swipe or drag has a tap path. No placeholder controls ("Not in this concept") in the app.
- Charts read real history; months with no data show empty, never filled in.
- Light: page `#f2f2f7`, cards `#ffffff`. Dark: page `#000000`, cards `#1c1c1e`, raised `#2c2c2e`. Tint `#5856d6` light / `#5e5ce6` dark, tint text in dark `#9b99ff`. Cards and grouped lists 22 px radius, sheets 30 px top corners.
- Type: `-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif`; tabular figures for amounts; large titles 34 px bold.
- After every task: `npx vitest run`, `npm run check`, `npm run ui:smoke` and `npm run ui:a11y` pass (dev server: `VITE_SUPABASE_URL= npx vite dev --port 5174 --strictPort`).

## Review Focus

1. **No history or no income** (a fresh install, a first month): every chart, the savings rate and the hero render with empty bars or "—", never `NaN`, `Infinity` or a negative bar. Tests: Task 7 (math) and Task 14 (fresh-profile smoke).
2. **Hide amounts on**: every new figure (rolling numbers, chart readouts while scrubbing, toasts, the keypad display, deck cards) is blurred. Test: `assertAmountsHidden` from Task 6, called by Tasks 10 to 15.
3. **A deep link or a vanished record**: opening `/budget/<deleted id>` lands on `/budget`; Android back from a page opened directly goes to its tab root, not out of the app. Tests: Task 4 (`backDecision`), Task 9 (smoke).
4. **Overspent and large amounts**: negative "left" figures, `$999.99` becoming `$1,000.00`, and amounts over a million keep their sign and grouping while rolling, and bars never go below zero. Tests: Task 10 (`rollPlan`), Task 7 (`barCap`, `heightsFrom`).
5. **Foreign-currency payments** (₹ captures that need a rate): the deck shows the original amount and an estimate, and Approve asks for the rate first; Log's "Paid in" still converts. Tests: Task 13 and Task 11 (smoke).

---

### Task 1: UI checks live in the repo

The smoke, screenshot and accessibility scripts were written in a session scratchpad. They move into the repo so every later task can extend them.

**Files:**
- Create: `scripts/ui-check/run.cjs`, `scripts/ui-check/sample-backup.json`, `scripts/ui-check/make-seed.mjs`
- Modify: `package.json` (devDependencies `playwright-core@1.64.1`, `axe-core@4.10.2`; scripts `ui:smoke`, `ui:shots`, `ui:a11y`), `.gitignore` (`scripts/ui-check/out/`)

**Interfaces:**
- Produces: `node scripts/ui-check/run.cjs <smoke|shots|a11y> [outDir]`. Environment: `UI_CHECK_URL` (default `http://localhost:5174`), `UI_CHECK_CHROME` (default `~/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`). Exports for later steps inside the file: `seed(page)`, `step(results, name, fn)`, `assertNoPageErrors()`. Exit code 1 on any failed step or axe violation.

- [ ] **Step 1:** Copy the scratchpad's `ui/check.cjs`, `ui/a11y.cjs`, `ui/make-seed.mjs` and `ui/sample-backup.json` (from `/private/tmp/claude-501/-Users-pranjal-aggarwal-Desktop-pers-bdgt/7662e78a-266a-475d-acdd-fef5c70b8958/scratchpad/ui/`; if that folder is gone, regenerate the seed with `make-seed.mjs` logic: 11 buckets created 2026-09-01, 48 transactions over Sep and Oct 2026, 3 recurring items, incomes, snapshots, one goal, VTI lot and price) into `scripts/ui-check/`, merge the two scripts into `run.cjs` with the three modes, replace the hard-coded Playwright path with `require('playwright-core')` plus `executablePath` from `UI_CHECK_CHROME`.
- [ ] **Step 2:** Add the devDependencies and npm scripts; `npm install`.
- [ ] **Step 3:** Run `npm run ui:smoke` against the dev server. Expected: 19 `ok` lines and "no page errors". Run `npm run ui:a11y`. Expected: "no findings".
- [ ] **Step 4:** Commit: `chore(ui): smoke, screenshot and axe checks in the repo`.

### Task 2: Look: tokens and type

**Files:**
- Modify: `tailwind.config.js` (colours, radii), `src/app.css` (CSS variables for both themes, `.card`, `.group`, buttons, `.glass`, `.ltitle`, `.figure`), `src/routes/+layout.svelte` (font import), `src/lib/components/charts/font.ts` (font stack), `package.json`
- Remove dependencies: `@fontsource-variable/archivo`, `@fontsource-variable/ibm-plex-sans`, `@fontsource/ibm-plex-mono`; add `@fontsource-variable/inter@5.3.0` (import the optical-size build if the package ships one, otherwise the default).

**Interfaces:**
- Produces (Tailwind names every later task uses): `bg-page`, `bg-surface`, `bg-raised`, `bg-fill`, `text-label`, `text-label-2`, `border-sep`, `bg-tint` / `text-tint` (text uses the dark-mode `#9b99ff`), `text-good`, `text-warn`, `text-bad`, `rounded-card` (22 px), `rounded-sheet` (30 px); classes `.card`, `.group` (inset grouped list), `.glass` (translucent blur surface), `.ltitle` (34 px bold, `letter-spacing: -0.022em`), `.figure` (bold, tabular, `letter-spacing: -0.035em`). Existing names (`primary`, `success`, `danger`, `warning`, `muted`, `background`, `surface-dark`) stay as aliases until Task 16 so unconverted screens keep working.
- `font-mono` becomes `ui-monospace, SFMono-Regular, Menlo, monospace` (technical strings only).

- [ ] **Step 1:** Define the variables in `:root` and `:root.dark` with the spec's values; good/warn/bad keep today's measured values (`#2b7a52`/`#8f5f1c`/`#b83a26` light, `#63c592`/`#dba45a`/`#f0836c` dark) or iOS-style ones that measure at least 4.5:1 on page, card and raised in both themes.
- [ ] **Step 2:** Swap fonts and remove the `.display` usages' font-stretch (the class stays as an alias of `.figure` until Task 16).
- [ ] **Step 3:** Run `npm run check`, `npx vitest run`, `npm run ui:smoke`, `npm run ui:a11y`. Expected: all pass; axe reports no contrast findings.
- [ ] **Step 4:** Commit: `feat(ui): iOS system surfaces, indigo tint, one type family`.

### Task 3: Motion, haptics and envelope icons

**Files:**
- Create: `src/lib/ui/motion.ts`, `src/lib/ui/haptics.ts`, `src/lib/ui/icons.ts`, `src/lib/components/ui/Icon.svelte`
- Test: `tests/lib/ui/motion.test.ts`, `tests/lib/ui/haptics.test.ts`, `tests/lib/ui/icons.test.ts`
- Modify: `src/routes/+layout.svelte` (call `installMotion(document.documentElement)` on mount and when the reduced-motion preference changes), `package.json` (`@capacitor/haptics@8.0.2`)

**Interfaces:**
- Produces: `springCurve(opts: { duration: number; bounce: number }): { ease: string; ms: number }`; `installMotion(root: HTMLElement): void` sets `--ease-snappy`/`--ms-snappy` (duration 0.42, bounce 0.12), `--ease-smooth`/`--ms-smooth` (0.5, 0), `--ease-bouncy`/`--ms-bouncy` (0.5, 0.28), falling back to `cubic-bezier(0.2, 0.9, 0.2, 1)` / 380 ms when `linear()` is unsupported, and toggles class `rm` on `root` under reduced motion.
- Produces: `type HapticKind = 'selection' | 'light' | 'medium' | 'success' | 'warning'`; `haptic(kind: HapticKind): void` (no-op outside the Android app; uses `loadPlugin('Haptics')` from `$lib/android`).
- Produces: `type IconName` (Lucide names: `house`, `zap`, `cart`, `car`, `utensils`, `film`, `repeat`, `piggy`, `trend`, `shield`, `bag`, `inbox`, `tag`, plus UI icons `plus`, `chevron-left`, `chevron-right`, `chevron-down`, `eye`, `eye-off`, `check`, `x`, `trash`, `move`, `search`, `grip`, `delete`, `calendar`, `arrow-up`, `arrow-down`, `list`, `layers`, `chart`, `wallet`, `info`); `ICONS: Record<IconName, string>` (SVG inner markup); `envelopeIcon(name: string, isSystem?: boolean): IconName`. `Icon.svelte` props: `name: IconName`, `size = 22`, `strokeWidth = 2`; always `aria-hidden`.

- [ ] **Step 1: Write failing tests**

```ts
// motion.test.ts
it('a critically damped spring rises without overshoot and ends at 1', () => {
  const { ease, ms } = springCurve({ duration: 0.5, bounce: 0 });
  const pts = ease.slice(7, -1).split(',').map(Number);
  expect(pts[0]).toBe(0); expect(pts.at(-1)).toBe(1);
  expect(pts.every((v, i) => i === 0 || v >= pts[i - 1] - 1e-9)).toBe(true);
  expect(ms).toBeGreaterThan(300); expect(ms).toBeLessThan(1200);
});
it('a bouncy spring overshoots', () => {
  const pts = springCurve({ duration: 0.5, bounce: 0.28 }).ease.slice(7, -1).split(',').map(Number);
  expect(Math.max(...pts)).toBeGreaterThan(1);
});
// haptics.test.ts (mock $lib/android as tests/lib/systemBars.test.ts does)
it('does nothing in a browser', ...);           // loadPlugin not called
it('maps kinds to the Haptics plugin in the app', ...); // selection→selectionChanged(), light→impact({style:'LIGHT'}), medium→impact({style:'MEDIUM'}), success→notification({type:'SUCCESS'}), warning→notification({type:'WARNING'})
// icons.test.ts
it.each([['Rent/Mortgage','house'],['Grocery','cart'],['Groceries','cart'],['Dining Out','utensils'],['Transportation','car'],['Utilities','zap'],['Subscriptions','repeat'],['Entertainment','film'],['Savings','piggy'],['Investments','trend'],['Emergency Fund','shield'],['Misc','bag'],['Pocket money','tag']])('%s → %s', (n, i) => expect(envelopeIcon(n)).toBe(i));
it('the system Unsorted envelope gets the inbox icon', () => expect(envelopeIcon('Unsorted', true)).toBe('inbox'));
```

- [ ] **Step 2:** Run `npx vitest run tests/lib/ui`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement the three modules and `Icon.svelte`; spring simulation as in the concept (`k = (2π/duration)²`, `c = 4π(1 − bounce)/duration`, 1/2000 s steps, a sample every 1/60 s, stop after 0.2 s once within 0.0008 of 1 and |v| < 0.02, last point forced to 1). Icon matching is case-insensitive keyword lookup in order (`rent|mortgage|home`→house, `grocer`→cart, `dining|restaurant|food|coffee`→utensils, `transport|car|fuel|gas|uber|travel`→car, `util|electric|power|internet`→zap, `subscri`→repeat, `entertain|fun|movie`→film, `emergency`→shield, `invest`→trend, `saving`→piggy, `misc|other|shopping`→bag), fallback `tag`.
- [ ] **Step 4:** Run `npx vitest run tests/lib/ui`. Expected: PASS. Then the full checks.
- [ ] **Step 5:** Commit: `feat(ui): spring curves, haptics and envelope icons`.

### Task 4: Sheets that stack, toasts, Android back button

**Files:**
- Modify: `src/lib/stores/uiStore.ts`, `src/lib/components/shared/Modal.svelte`, `src/lib/components/layout/Layout.svelte`, `src/routes/review/+page.svelte` (its own undo snackbar becomes a toast), `src/routes/+layout.svelte`, `package.json` (`@capacitor/app@8.1.2`)
- Create: `src/lib/stores/toastStore.ts`, `src/lib/components/ui/Toast.svelte`, `src/lib/ui/backButton.ts`
- Test: `tests/lib/stores/uiStore.test.ts`, `tests/lib/stores/toastStore.test.ts`, `tests/lib/ui/backButton.test.ts`

**Interfaces:**
- Produces (uiStore): `modalStack: Writable<string[]>`; `openModal(id: string): void` pushes (no duplicates); `closeModal(id?: string): void` removes `id`, or the top when omitted; `activeModal` stays, derived as the top id (or `null`), so the 18 existing callers keep working. `scaledBack: Readable<boolean>` (true while any open modal was opened with `scaleBack`), fed by `Modal.svelte`.
- Produces (Modal props, added): `size: 'auto' | 'large' = 'auto'`, `scaleBack = false`, `surface: 'grouped' | 'plain' = 'grouped'`; slots `leading` and `trailing` for the header (default trailing stays the Close button). Z-order follows stack position; drag-to-dismiss stays; Escape closes the top only.
- Produces (toast): `showToast(t: { message: string; envelopeId?: string; action?: { label: string; run: () => void }; ms?: number }): void`; `toast: Readable<ToastState | null>`; `dismissToast(): void`. Default 2.2 s, 4.2 s with an action. A new toast replaces the current one.
- Produces (back): `backDecision(s: { openSheets: number; atTabRoot: boolean; canGoBack: boolean }): 'close-sheet' | 'back' | 'to-root' | 'exit'`; `installBackButton(h: { state: () => { openSheets: number; atTabRoot: boolean; canGoBack: boolean }; closeSheet: () => void; back: () => void; toRoot: () => void; exit: () => void }): () => void` (listens through `loadPlugin('App')` for `backButton`; no-op in a browser). `canGoBack` comes from an in-app history depth that Layout keeps (incremented on forward navigations, decremented on `popstate`). Tab roots: `/`, `/budget`, `/activity`, `/insights`.

- [ ] **Step 1: Write failing tests**

```ts
// uiStore.test.ts
it('stacks modals and closes the top first', () => { openModal('a'); openModal('b'); expect(get(activeModal)).toBe('b'); closeModal(); expect(get(activeModal)).toBe('a'); });
it('closes a named modal under another', () => { openModal('a'); openModal('b'); closeModal('a'); expect(get(modalStack)).toEqual(['b']); });
it('does not stack the same modal twice', () => { openModal('a'); openModal('a'); expect(get(modalStack)).toEqual(['a']); });
// toastStore.test.ts (fake timers)
it('replaces the current toast and clears itself', ...); // second showToast wins; after 2200 ms toast is null; with action, still there at 4000 ms, gone at 4300 ms
// backButton.test.ts
expect(backDecision({ openSheets: 1, atTabRoot: true, canGoBack: true })).toBe('close-sheet');
expect(backDecision({ openSheets: 0, atTabRoot: false, canGoBack: true })).toBe('back');
expect(backDecision({ openSheets: 0, atTabRoot: false, canGoBack: false })).toBe('to-root'); // opened directly (Review Focus 3)
expect(backDecision({ openSheets: 0, atTabRoot: true, canGoBack: true })).toBe('exit');
```

- [ ] **Step 2:** Run the three tests. Expected: FAIL.
- [ ] **Step 3:** Implement. `Layout.svelte` applies `#stage.scaled` from `$scaledBack` (transform `translateY(14px) scale(0.92)`, 26 px corners, none under `.rm`) and mounts `Toast.svelte` (glass capsule at the top, `role="status"` region always mounted, envelope icon tile when `envelopeId` is set). `+layout.svelte` installs the back button: `close-sheet` → `closeModal()`, `back` → `history.back()`, `to-root` → `goto` the current tab root, `exit` → `App.exitApp()`.
- [ ] **Step 4:** Run tests and the full checks. Smoke: the review undo step now reads the toast; add step "Escape closes only the top sheet" (open Log, open its "Paid in" currency sheet if present or the Income sheet over Settings, press Escape once, the lower sheet is still open).
- [ ] **Step 5:** Commit: `feat(ui): stacking sheets, toasts, Android back button`.

### Task 5: Routes and page transitions

**Files:**
- Create: `src/lib/ui/navDirection.ts`, `src/lib/ui/edgeSwipe.ts`, routes `src/routes/budget/+page.svelte` (content moved from `buckets`), `src/routes/budget/bills/+page.svelte` (from `recurring`), `src/routes/activity/+page.svelte` (from `transactions`), `src/routes/insights/+page.svelte` (from `analytics`), `src/routes/insights/investments/+page.svelte` (from `investments`)
- Modify: old routes become redirects: `src/routes/{buckets,recurring,transactions,analytics,investments}/+page.ts` (delete their `+page.svelte`); `src/lib/components/layout/Layout.svelte` (`onNavigate` sets `document.documentElement.dataset.nav`), `src/app.css` (view-transition keyframes per direction), `src/lib/components/layout/Nav.svelte` (links point to new routes), every internal link (`grep -rn "/transactions\|/analytics\|/buckets\|/recurring\|/investments" src`)
- Test: `tests/lib/ui/navDirection.test.ts`, `tests/lib/ui/edgeSwipe.test.ts`

**Interfaces:**
- Produces: `TAB_ROOTS = ['/', '/budget', '/activity', '/insights']`, `MODAL_ROOTS = ['/review', '/settings']`; `tabRootOf(path: string): string`; `navDirection(from: string | null, to: string): 'push' | 'pop' | 'tab' | 'up' | 'down'` (paths without `base`); `edgeSwipeDecision(dx: number, width: number, velocity: number): boolean` (true when `dx > 0.35 * width` or `velocity > 0.6` px/ms); action `edgeSwipeBack(node: HTMLElement, enabled: boolean)` in `edgeSwipe.ts` that follows the finger from within 24 px of the left edge, then calls `history.back()` or springs back.
- Redirects keep the query string: `/transactions?bucket=unsorted` → `/activity?bucket=unsorted`.

- [ ] **Step 1: Write failing tests**

```ts
expect(navDirection('/', '/budget')).toBe('tab');
expect(navDirection('/budget', '/budget/groc')).toBe('push');
expect(navDirection('/budget/groc', '/budget')).toBe('pop');
expect(navDirection('/activity', '/review')).toBe('up');
expect(navDirection('/review', '/activity')).toBe('down');
expect(navDirection('/settings', '/settings/sync')).toBe('push');
expect(navDirection(null, '/budget/groc')).toBe('tab'); // first load: no slide
expect(tabRootOf('/insights/spend')).toBe('/insights');
expect(edgeSwipeDecision(140, 390, 0.1)).toBe(true);
expect(edgeSwipeDecision(80, 390, 0.2)).toBe(false);
expect(edgeSwipeDecision(40, 390, 0.9)).toBe(true);
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement; transitions: `push` new page from `translateX(100%)` while the old drifts to `-28%` under a 14% dim; `pop` the reverse; `tab` the existing fade-through; `up`/`down` slide from or to the bottom. All use `var(--ease-smooth)`/`var(--ms-smooth)`; under `.rm` every direction is the plain fade.
- [ ] **Step 4:** Run tests and checks. Update smoke URLs; add step "old links redirect" (visit `/transactions?bucket=unsorted`, expect pathname `/activity` and the query kept; visit `/recurring`, expect `/budget/bills`).
- [ ] **Step 5:** Commit: `feat(ui): new routes, redirects and directional page transitions`.

### Task 6: Shell: tab bar, Log button, navigation bar, desktop sidebar

**Files:**
- Create: `src/lib/components/layout/TabBar.svelte`, `src/lib/components/layout/LogButton.svelte`, `src/lib/components/layout/NavBar.svelte`, `src/lib/components/layout/AvatarButton.svelte`, `src/lib/components/layout/MonthMenu.svelte`
- Modify: `src/lib/components/layout/Layout.svelte`, `src/lib/components/layout/Nav.svelte` (desktop sidebar only), `scripts/ui-check/run.cjs`
- Delete: `src/lib/components/shared/SectionTabs.svelte` usages (Setup's sub-tabs go)

**Interfaces:**
- Produces: `<TabBar />` (four tabs, sliding lens using `--ease-bouncy`, Activity badge = `$pendingCaptures.length`, `aria-current="page"`; tapping the current tab pops to the tab root, then scrolls to top). `<LogButton />` (64 px tinted circle, `aria-label="Add an expense"`, `aria-keyshortcuts="Meta+K"`). `<NavBar title: string; large?: boolean = true; back?: { href: string; label: string } | null>` with slots `leading`, `trailing`; it renders the large title, watches a sentinel with `IntersectionObserver`, shows the compact title once the large one passes under, and turns `.glass` once content scrolls under it. `<MonthMenu />` (button with the month name and a chevron; a context menu of months that have data plus the current month, newest first, check on the selected; sets `currentMonthKey`; desktop keeps ←, →, T). `<AvatarButton />` (opens `/settings`).
- Produces (smoke helper in `run.cjs`): `assertAmountsHidden(page)`: with hide-amounts on, every visible text node inside `main` and open sheets matching `/[$₹€£]\s?\d/` has an ancestor with class `amt`; throws listing offenders.

- [ ] **Step 1:** Build the components; Layout shows TabBar + LogButton below `md`, the sidebar (Home, Budget, Activity, Insights, Settings, a Log button, currency and sync chips) from `md`.
- [ ] **Step 2:** Run checks. Add smoke steps: "tab bar reaches every tab" (tap each, pathname matches, lens `transform` changes), "Activity badge shows pending count" (badge text equals the number of Approve buttons on `/review`), "tapping the current tab scrolls to top" (scroll `main` to 800, tap the tab, `scrollTop` 0), "navigation bar shows the compact title after scrolling".
- [ ] **Step 3:** Commit: `feat(ui): floating tab bar, Log button, collapsing navigation bar, sidebar`.

### Task 7: Chart and trend math, chart components

**Files:**
- Create: `src/lib/charts/scale.ts`, `src/lib/charts/scrub.ts`, `src/lib/insights/trends.ts`, components `src/lib/components/charts/{ScrubBars,TrendLines,PairedBars,Donut,Sparkline}.svelte`
- Test: `tests/lib/charts/scale.test.ts`, `tests/lib/insights/trends.test.ts`

**Interfaces:**
- Produces (scale): `barCap(values: number[]): number` (ignores values ≤ 0; if the largest is more than 3× the second, returns second × 1.3, else largest × 1.08; 1 when nothing is positive); `heightsFrom(values: number[], cap: number): number[]` (fractions 0..1, negatives → 0, values above cap → 1); `linear(domain: [number, number], range: [number, number]): (v: number) => number`; `linePath(points: [number, number][]): string`; `donutSegments(values: number[], circumference: number, gap: number): { length: number; offset: number }[]` (length = share × C − gap, at least 0; offset = −(sum of earlier shares × C), with 0 rather than −0 for the first; gap 0 when only one value is non-zero).
- Produces (trends): `monthsEnding(monthKey: string, count?: number): string[]` (oldest first; wraps `getLast6Months` for 6); `spendingByMonth(txs: { bucketId: string; amount: number; date: Date }[], savingsIds: Set<string>, months: string[]): number[]`; `incomeByMonth(incomes: Income[], months: string[]): number[]`; `ratesByMonth(income: number[], spent: number[]): (number | null)[]` (null when income ≤ 0); `averageOfComplete(values: number[], months: string[], now: Date): number | null` (months before the current one only; null when none); `bigSmall(spent: { id: string; cents: number }[], thresholdCents: number): { big: typeof spent; small: typeof spent; bigTotal: number; smallTotal: number }` (an envelope is big when its month total ≥ threshold, today's rule); `cumulativeByDay(txs, ids: Set<string>, monthKey: string, uptoDay: number): number[]`; `weekWindow(monthKey: string, today: Date): Date[]` (7 days ending today, or the month's last day for past months).
- Produces (scrub action): `scrub(node, { count: number; onIndex: (i: number) => void; onEnd: () => void })`: pointer down and move map x to an index, `haptic('selection')` per change, `touch-action: pan-y` so vertical scrolling still works, `user-select: none`.
- Produces (components): `ScrubBars { values: number[]; labels: [string, string]; avg?: number | null; futureFrom?: number | null; color?: string }` dispatching `scrub` (`{ index }`) and `scrubend`; `TrendLines { series: { id: string; color: string; values: (number | null)[]; hidden?: boolean }[]; months: string[]; min?: number; max?: number; avg?: number | null }` with the same events; `PairedBars { a: { color: string; values: number[] }; b: { color: string; values: number[] }; months: string[] }` same events; `Donut { slices: { id: string; color: string; value: number; hidden?: boolean }[]; label: string }`; `Sparkline { kind: 'bars' | 'pairs' | 'lines'; data: number[] | [number, number][] | { color: string; values: number[] }[] }`. All draw SVG from theme tokens, mark the newest point, animate in only under no-preference, and expose an `aria-label` summary.

- [ ] **Step 1: Write failing tests** (sample values from `scripts/ui-check/sample-backup.json`)

```ts
expect(barCap([180000, 12410, 9105])).toBe(16133);
expect(barCap([100, 90])).toBe(108);
expect(barCap([0, -500])).toBe(1);
expect(heightsFrom([-50, 54, 200], 108)).toEqual([0, 0.5, 1]);
expect(donutSegments([3, 1], 100, 2)).toEqual([{ length: 73, offset: 0 }, { length: 23, offset: -75 }]);
expect(donutSegments([5, 0], 100, 2)).toEqual([{ length: 100, offset: 0 }, { length: 0, offset: -100 }]);
expect(spendingByMonth(sampleTxs, savingsIds, ['2026-09', '2026-10'])).toEqual([283572, 272665]);
expect(spendingByMonth([], savingsIds, ['2026-10'])).toEqual([0]);
expect(ratesByMonth([520000, 0], [272665, 100])).toEqual([expect.closeTo(0.4756, 4), null]);
expect(averageOfComplete([10, 20, 99], ['2026-08', '2026-09', '2026-10'], new Date(2026, 9, 23))).toBe(15);
expect(averageOfComplete([99], ['2026-10'], new Date(2026, 9, 23))).toBeNull();
const bs = bigSmall(octSpentByEnvelope, 50000);
expect([bs.bigTotal, bs.smallTotal]).toEqual([180000, 92665]);
expect(cumulativeByDay(sampleTxs, everydayIds, '2026-10', 23)[22]).toBe(77997);
expect(weekWindow('2026-09', new Date(2026, 9, 23)).map((d) => d.getDate())).toEqual([24, 25, 26, 27, 28, 29, 30]);
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the math, then the action and components.
- [ ] **Step 4:** Run tests and checks. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(charts): scrubbable SVG charts and tested trend math`.

### Task 8: Budget tab

**Files:**
- Create: `src/lib/budget/groups.ts`, `src/lib/budget/assignDraft.ts`, components `src/lib/components/budget/{BudgetSummary,EnvelopeRow,IncomeSheet,AssignSheet,GoalsSection,GoalSheet,NotesSheet}.svelte`
- Modify: `src/routes/budget/+page.svelte` (rewrite), `src/routes/+page.svelte` (the income, assign, goal and notes markup moves out; the dashboard keeps working by linking to Budget until Task 10)
- Test: `tests/lib/budget/groups.test.ts`, `tests/lib/budget/assignDraft.test.ts`

**Interfaces:**
- Produces: `groupEnvelopes<T extends { bucket: Bucket }>(statuses: T[]): { everyday: T[]; bills: T[]; savings: T[]; unsorted: T | null }` (savings = `isSavings`; everyday = `isEveryday && !isSavings`; bills = the rest; system Unsorted separate; each by `order`).
- Produces: `type AssignDraft = Record<string, string>`; `draftFrom(statuses): AssignDraft` (fixed envelopes only, dollars as text, blank for 0); `draftTotal(draft: AssignDraft, derived: number): number | null` (cents, null if any field is not a valid amount or expression); `leftToAssign(income: number, total: number): number`; `restTarget(buckets: Bucket[]): Bucket | null` (first `isSavings` bucket by `order`, not system).
- Consumes: `bucketStatuses`, `currentMonthIncome`, `currentMonthIncomes`, `unallocated`, `totalPercentage`, `computedAllocations`, `setAllocations`, `addIncome`, `updateIncome`, `deleteIncome`, `goalStatuses`, `addGoal`, `currentMonthNotes` and the note functions (budgetStore, goalsStore); `Icon`, `envelopeIcon`, `RollingNumber` is not needed yet.

Screen per the spec: NavBar "Budget" with MonthMenu; BudgetSummary (income this month → IncomeSheet; stacked bar of envelope allocations plus hatched unassigned; left to assign; Assign button; percentage-over-100 warning); groups with EnvelopeRow (icon tile, name, "spent of assigned" with a meter, left or over; savings rows show set aside in green; each links to `/budget/<id>`; Unsorted row when it holds transactions); "More" group: Bills and subscriptions (`/budget/bills`), Savings goals (GoalsSection inline with Add goal), Month notes (NotesSheet), New envelope (opens the envelope sheet from Task 9; until then the existing bucket form). AssignSheet: Cancel / "Assign money" / Done, rolling-free "left to assign" (red when negative, label "assigned beyond your income"), a `inputmode="decimal"` field per fixed envelope, Enter moves to the next field, derived envelopes read-only, "Put the rest, $X, in {restTarget}" (hidden when `restTarget` is null), Done calls `setAllocations` once. IncomeSheet: segmented Fixed / Variable with the sliding pill, amount (expressions), note, this month's list with edit and delete (delete asks first).

- [ ] **Step 1: Write failing tests**

```ts
expect(groupEnvelopes(sampleStatuses).everyday.map((s) => s.bucket.id)).toEqual(['groc', 'trans', 'dine', 'ent', 'misc']);
expect(groupEnvelopes(sampleStatuses).bills.map((s) => s.bucket.id)).toEqual(['rent', 'util', 'subs']);
expect(groupEnvelopes(sampleStatuses).savings.map((s) => s.bucket.id)).toEqual(['save', 'inv', 'emer']);
expect(draftTotal({ groc: '500', dine: '250+50' }, 0)).toBe(80000);
expect(draftTotal({ groc: 'abc' }, 0)).toBeNull();
expect(leftToAssign(520000, 530000)).toBe(-10000);
expect(restTarget(sampleBuckets)?.id).toBe('save');
expect(restTarget(sampleBuckets.filter((b) => !b.isSavings))).toBeNull();
```


- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement helpers, components and the page.
- [ ] **Step 4:** Run tests and checks. Smoke: replace the old buckets and income steps with "Budget lists envelopes in three groups", "income sheet adds and deletes an income (with confirmation)", "assign: type 650 for Grocery, left to assign drops by $150; type an amount over income, the figure turns red; Put the rest in Savings, figure reads All assigned / Every dollar has a job; Done persists (reload, Grocery shows 650)", "add a savings goal", "month notes add a note".
- [ ] **Step 5:** Commit: `feat(budget): Budget tab with summary, envelope groups, assign, income, goals and notes`.

### Task 9: Envelope page, envelope sheet, bills

**Files:**
- Create: `src/routes/budget/[id]/+page.svelte`, `src/routes/budget/[id]/+page.ts` (unknown id → redirect to `/budget`), components `src/lib/components/budget/{EnvelopeRing,EnvelopeSheet,RecurringRow,RecurringSheet}.svelte`
- Modify: `src/routes/budget/bills/+page.svelte` (rewrite)
- Delete: the bucket form in the old buckets content now living in `budget/+page.svelte`

**Interfaces:**
- Produces: `<EnvelopeSheet envelope: Bucket | null>` (null = new) with name, colour, allocation type (fixed / percentage / hybrid via segmented control), fixed amount, percentage, Counts as savings, Everyday spending (switches), Save, and for non-default envelopes "Delete envelope" (same confirmation text and effects as today: transactions to Unsorted, recurring and linked goals deleted). `<RecurringSheet item: RecurringTransaction | null>` with amount (expressions), envelope, frequency, next due date, note, Save, and for existing items Pause / Resume and Delete (asks first).
- Consumes: `bucketStatuses`, `transactions`, `recurringTransactions`, `upcomingRecurring`, `goalStatuses`, `addBucket`, `updateBucket`, `deleteBucket`, `updateBucketAllocation`, `addRecurring`, `updateRecurring`, `toggleRecurring`, `deleteRecurring`, `openLog(bucketId)`.

Envelope page: NavBar with back "Budget", icon tile 56 px, name, ring (left this month; savings: set aside, full ring), stats Assigned / Spent (or Saved) / Carried in, buttons "Log here" (`openLog(id)`), "Assign more" (AssignSheet focused on this envelope's field), "Edit" (EnvelopeSheet), the linked goal if any, "Coming up" recurring items, "This month" transactions (rows open the transaction sheet from Task 12; until then the existing edit modal). Bills page: rows with next due date and frequency; tap opens RecurringSheet; "Add" in the navigation bar.

- [ ] **Step 1:** Build. Editing a paused item must keep it paused: pass the item's current `isActive` instead of `true` (fixes the bug listed in `docs/deferred.md`; add a test in `tests/lib/stores/recurring.test.ts`: updating a paused item's amount leaves `isActive` false).
- [ ] **Step 2:** Run tests and checks. Smoke: "envelope page shows ring and this month's transactions" (open Grocery from Budget, expect "Trader Joe’s"), "edge swipe returns to Budget", "add an envelope then delete it from its sheet", "default envelope has no Delete", "Netflix pause and resume from the bills page", "`/budget/does-not-exist` lands on `/budget`" (Review Focus 3).
- [ ] **Step 3:** Commit: `feat(budget): envelope page, envelope and recurring sheets, bills page`.

### Task 10: Home

**Files:**
- Create: `src/lib/ui/roll.ts`, `src/lib/home/hero.ts`, `src/lib/home/layout.ts`, `src/lib/stores/homeLayoutStore.ts`, components `src/lib/components/ui/RollingNumber.svelte`, `src/lib/components/home/{HomeHero,PaceChart,EditHomeSheet}.svelte`, `src/lib/components/home/cards/{ReviewCard,EnvelopesCard,RecentCard,BillsCard,GoalsCard,SavingsRateCard,NotesCard,UnsortedCard}.svelte`
- Modify: `src/routes/+page.svelte` (rewrite), `src/lib/stores/budgetStore.ts` `loadData` and `src/lib/stores/reload.ts` (load the layout)
- Delete: `src/lib/components/dashboard/{Tile,SafeToSpendRing}.svelte`, `src/lib/components/shared/ReviewBanner.svelte`
- Test: `tests/lib/ui/roll.test.ts`, `tests/lib/home/hero.test.ts`, `tests/lib/home/layout.test.ts`, `tests/lib/stores/homeLayoutStore.test.ts`

**Interfaces:**
- Produces: `rollPlan(prev: string | null, next: string): { chars: string[]; reuse: boolean }` (`reuse` when lengths match and every position is a digit in both or the same non-digit); `<RollingNumber text: string>` (digit strips, 18 ms stagger from the right, `role="img"` with `aria-label` = text, instant under `.rm`; callers wrap it in `.amt`).
- Produces: `heroMode(monthKey: string, now: Date): 'today' | 'past' | 'future'`; `planDiff(cumulative: number, planTotal: number, day: number, daysInMonth: number): number` (plan by `day` minus spent; positive = under).
- Produces: `type HomeCardId = 'review' | 'envelopes' | 'recent' | 'bills' | 'goals' | 'savingsRate' | 'notes'`; `type HomeLayout = { id: HomeCardId; on: boolean }[]`; `HOME_CARDS: readonly { id: HomeCardId; name: string; description: string }[]`; `DEFAULT_LAYOUT: HomeLayout` (review, envelopes, recent on; bills, goals, savingsRate, notes off, in that order); `parseHomeLayout(raw: unknown): HomeLayout` (unknown ids and duplicates dropped; cards missing from the saved list appended in `DEFAULT_LAYOUT` order with their default on/off; anything unreadable gives `DEFAULT_LAYOUT`); `serializeHomeLayout(l: HomeLayout): string`.
- Produces (store): `homeLayout: Readable<HomeLayout>`, `loadHomeLayout(): Promise<void>`, `saveHomeLayout(l: HomeLayout): Promise<void>` (writes `{ key: 'homeLayout', value: serializeHomeLayout(l) }` to `db.settings`, through the same write path currency settings use so sync picks it up).

Screen per the spec's Home section: NavBar without a large title (MonthMenu leading; eye and AvatarButton trailing; compact title "$X today" after scrolling); HomeHero (today / past modes; info button keeps the existing explanation); PaceChart (`cumulativeByDay`, dashed plan line, pulsing today dot, scrub rewrites the hero to "Spent on everyday envelopes by Oct D" and the plan by then); cards in layout order; UnsortedCard and the update banner shown when relevant regardless of layout; "Edit Home" capsule at the end opening EditHomeSheet (switch per card, drag handles to reorder, changes apply live and save).

- [ ] **Step 1: Write failing tests**

```ts
expect(rollPlan('$234.47', '$211.84').reuse).toBe(true);
expect(rollPlan('$999.99', '$1,000.00').reuse).toBe(false);
expect(rollPlan('$12.40', '-$12.40').reuse).toBe(false);
expect(rollPlan(null, '$1,234,567.89').chars).toHaveLength(13);
expect(heroMode('2026-10', new Date(2026, 9, 23))).toBe('today');
expect(heroMode('2026-09', new Date(2026, 9, 23))).toBe('past');
expect(planDiff(77997, 125000, 23, 31)).toBe(14745); // round(125000*23/31) = 92742, minus 77997
expect(parseHomeLayout('not json')).toEqual(DEFAULT_LAYOUT);
expect(parseHomeLayout(JSON.stringify([{ id: 'goals', on: true }, { id: 'nope', on: true }])).map((c) => c.id)).toEqual(['goals', 'review', 'envelopes', 'recent', 'bills', 'savingsRate', 'notes']);
// homeLayoutStore (fake-indexeddb as other store tests): save then load returns the saved order; the settings row key is 'homeLayout'
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run tests and checks. Smoke: "Home shows safe to spend $234.47 and the plan pill", "scrubbing the pace chart changes the hero label, releasing restores it", "Edit Home: turn on Upcoming bills, it appears; reorder Recent above Envelopes; reload keeps both", "review card opens Review", "envelope card opens its envelope page", "past month shows Left in September" (MonthMenu → September), `assertAmountsHidden` with the eye on (Review Focus 2).
- [ ] **Step 5:** Commit: `feat(home): safe-to-spend hero, pace chart and a Home you can edit`.

### Task 11: Log sheet with keypad

**Files:**
- Create: `src/lib/ui/keypad.ts`, `src/lib/components/log/{Keypad,EnvelopeChips,DateChip}.svelte`
- Modify: `src/lib/components/shared/LogEntry.svelte` (rewrite on these parts; keeps `preselectedBucketId` and `onComplete`), `src/lib/components/layout/Layout.svelte` (Log modal becomes `size="large" scaleBack surface="plain"`)
- Test: `tests/lib/ui/keypad.test.ts`

**Interfaces:**
- Produces: `type KeypadKey = '0'…'9' | '.' | '+' | '−' | '×' | '÷' | 'back'`; `applyKey(expr: string, key: KeypadKey): { expr: string; rejected: boolean }` (operators replace a trailing operator and need a number first; at most one `.` and two decimals per number; leading `0` replaced; `back` deletes one character); `keyFromKeyboard(e: KeyboardEvent): KeypadKey | null` (digits, `.`, `,`→`.`, `+`, `-`, `*`, `/`, Backspace). The expression string uses `+ - * /` so `evaluateExpression` and `isValidCurrency` from `$lib/utils/currency` evaluate it unchanged.
- Consumes: `ForeignCurrencyField` (inside a "Paid in" sheet opened by a chip), `calculateBucketFit`, `addTransaction`, existing save logic in `LogEntry.svelte`.

Layout per the concept: header Cancel / "New expense" / DateChip (Today, Yesterday, Pick a date… opening a native date input); amount display (expression line above when it has an operator, result big, shrinks with length, shakes and `haptic('warning')` on a rejected key); EnvelopeChips (sideways row, most-used first, each showing "$X left" or, with an amount, "$X left after" in green / "$X over" in red); note field; "Paid in USD" chip; Keypad; Save "Add $X to {envelope}" disabled until valid. Physical keyboard types into the keypad; Enter saves; ←/→ (and ↑/↓) move between envelope chips; Cmd+K still opens Log. On save: sheet closes, `haptic('success')`, toast "Added $X to {envelope}" with Undo (deletes the transaction).

- [ ] **Step 1: Write failing tests**

```ts
const typed = (keys: KeypadKey[]) => keys.reduce((e, k) => applyKey(e, k).expr, '');
expect(typed(['1', '2', '+', '8', '.', '5'])).toBe('12+8.5');
expect(typed(['+'])).toBe('');
expect(typed(['5', '+', '×'])).toBe('5*');
expect(typed(['0', '0', '7'])).toBe('7');
expect(applyKey('1.25', '9').rejected).toBe(true);
expect(typed(['.', '5'])).toBe('0.5');
expect(applyKey('12', 'back').expr).toBe('1');
expect(keyFromKeyboard(new KeyboardEvent('keydown', { key: ',' }))).toBe('.');
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run tests and checks. Smoke: replace "log an expense" with "keypad: 12 + 8.5, pick Dining Out, button reads Add $20.50 to Dining Out, save, toast, Activity lists it", "Undo removes it", "keyboard: type 7, press Enter with an envelope chosen", "Paid in: switch to EUR with a rate, saved amount is converted" (Review Focus 5), `assertAmountsHidden` inside the open sheet.
- [ ] **Step 5:** Commit: `feat(log): keypad logging with envelope fit and a date chip`.

### Task 12: Activity

**Files:**
- Create: `src/lib/ui/swipe.ts`, `src/lib/components/activity/{SwipeRow,TransactionRow,TransactionSheet,FilterChips}.svelte`
- Modify: `src/routes/activity/+page.svelte` (rewrite), `src/lib/components/shared/EditTransaction.svelte` (lives inside TransactionSheet)
- Delete: `src/lib/components/shared/TransactionRow.svelte` (old)
- Test: `tests/lib/ui/swipe.test.ts`

**Interfaces:**
- Produces: `swipeOutcome(x: number, width: number, velocity: number): 'delete' | 'move' | 'open-delete' | 'open-move' | 'close'` (`x < −0.55·width` or `velocity < −0.9` → delete; `x > 0.45·width` or `velocity > 0.9` → move; `x < −60` → open-delete; `x > 60` → open-move; else close); action `swipeActions(node, { onDelete: () => void; onMove: () => void })` used by SwipeRow (horizontal drags only after 10 px with |dx| > 1.3·|dy|; `touch-action: pan-y`; haptic at the open and full thresholds; one open row at a time; the click after a swipe is swallowed).
- Produces: `<TransactionSheet transaction: Transaction>`: icon tile, name with Auto / Recurring tag, amount; the existing edit form (amount with expressions, envelope, date, note, foreign currency); "of $X" when recorded differs from paid; "Delete expense" (asks first). `<FilterChips selected: string>`: All, Auto, Unsorted (only when unsorted exist), one per envelope; dispatches `change`.

Screen: NavBar "Activity" with MonthMenu; search field; FilterChips; "N payments to review" row when pending (opens `/review`); day groups (Today, Yesterday, weekday dates) with day totals excluding savings; SwipeRow per transaction: left reveals red Delete (full swipe deletes, row collapses, toast with Undo), right reveals tinted Move (opens the envelope picker sheet, toast with Undo); tap opens TransactionSheet; `?bucket=` preselects a chip, `?bucket=unsorted` shows all months as today.

- [ ] **Step 1: Write failing tests**

```ts
expect(swipeOutcome(-250, 390, 0)).toBe('delete');
expect(swipeOutcome(-90, 390, 0)).toBe('open-delete');
expect(swipeOutcome(-20, 390, -1.2)).toBe('delete');
expect(swipeOutcome(200, 390, 0)).toBe('move');
expect(swipeOutcome(30, 390, 0.1)).toBe('close');
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run tests and checks. Smoke: "chips filter and All restores", "search narrows to Costco-like notes", "swipe left fully deletes, Undo restores", "swipe right moves to Misc, Undo restores", "tap opens the sheet; edit amount to 15, saved", "Delete expense from the sheet", "unsorted link shows the Unsorted chip selected", `assertAmountsHidden`.
- [ ] **Step 5:** Commit: `feat(activity): day groups, filter chips, swipe actions, transaction sheet`.

### Task 13: Review deck

**Files:**
- Create: `src/lib/components/review/{Deck,DeckCard,ReviewList,DismissSheet,ReviewEditSheet}.svelte`
- Modify: `src/routes/review/+page.svelte` (rewrite; presented with the `up` transition, Close in the leading slot)

**Interfaces:**
- Consumes: `pendingCaptures`, `captures`, `suggestions`, `duplicatesOf`, `bulkApprovable`, `approveCapture`, `approveCaptureAs`, `dismissCapture`, `undoCapture`, `notDuplicate`, `approveAllSuggested`, `setRuleIgnore`, `rateFor`, `TransactionForm`. Card decisions: approve when the drag ends past 110 px right or faster than 0.7 px/ms rightward, dismiss for the same to the left, otherwise spring back.
- Produces: `<Deck captures: Capture[]>` (top card draggable with tilt and Approve / Dismiss stamps; three cards visible; buttons Dismiss, Edit, Approve with labels; Approve reads "Choose envelope" when there is no suggestion and "Add rate" when the rate is missing; the envelope pill on the card opens the picker; hints and "Also seen … / Not a duplicate" on the card; "All caught up" state with a drawn check).

Screen: header Close / "To review" / "N left"; segmented To review / Approved / Dismissed (Approved: last 7 days, as today, with "Back to review"); "Approve all suggested (N)" button above the deck; DismissSheet keeps "Always ignore payments to {merchant}"; ReviewEditSheet is today's edit-and-approve form; every decision shows a toast with Undo (`undoCapture`); `haptic('success')` on approve.

- [ ] **Step 1:** Build.
- [ ] **Step 2:** Run checks. Smoke: replace the review steps with "drag the top card right approves it (count drops by 1)", "Dismiss button opens the sheet and dismisses", "Undo after approve brings it back", "card without an envelope: Approve opens the picker first", "₹ card shows ₹250.00 and About $3.00; Approve reads Add rate and asks for a rate" (Review Focus 5), "Approved list shows Back to review", "Approve all suggested approves only suggested ones", `assertAmountsHidden` on the deck.
- [ ] **Step 3:** Commit: `feat(review): swipe deck for captured payments`.

### Task 14: Insights

**Files:**
- Create: `src/routes/insights/[chart]/+page.svelte`, `src/routes/insights/[chart]/+page.ts` (allowed: `spending`, `income`, `envelopes`, `savings-rate`; anything else redirects to `/insights`), components `src/lib/components/insights/{PeriodChart,SummaryStrip,WhereItWent,BigSmallCard,ThresholdSheet,TrendCard,PatternCard,PatternInfoSheet,InvestmentsCard}.svelte`
- Modify: `src/routes/insights/+page.svelte` (rewrite), `src/routes/insights/investments/+page.svelte` (restyle on NavBar, `.group` lists, `.figure`), `src/lib/components/insights/PatternInsights.svelte` (Chart.js BarChart → paired bars)

**Interfaces:**
- Consumes: Task 7 math and components; `bucketStatuses`, `transactions`, `incomes`, `buckets`, `currentMonthIncome`, `currentMonthFixedIncome`, `savingsRateTrend`, `findBucketRelations`, `countComparablePairs` and `src/lib/insights/copy.ts` (wording unchanged), investment stores and components (`HoldingsTable`, `AddLotModal`, `SellModal`, `ActivityList`, `PortfolioSummary`, restyled).

Screen per the spec's Insights section: NavBar "Insights" with MonthMenu; PeriodChart (segmented Week / Month / 6 months with the sliding pill; figure with RollingNumber; ScrubBars with `barCap`; 6 months adds the dashed average of complete months; Month compares with the previous month); SummaryStrip (Income with the fixed / variable split when both exist, Spent, Net in green or red); WhereItWent (envelopes by spent, share bars, %); BigSmallCard (threshold kept in component state for the session, default $500, as today; threshold button "$500 or more" → ThresholdSheet with a number field and presets $50, $100, $250, $500, $1,000; split bar; segmented Big / Small; Donut; legend rows that hide slices; each row shows % of group and % of fixed income as today). The ThresholdSheet copy follows today's rule: "Envelopes whose spending this month reaches this amount count as big." TrendCards → `/insights/spending`, `/insights/income`, `/insights/envelopes`, `/insights/savings-rate`; each page: NavBar with back "Insights", a figure that rolls while scrubbing, the chart, the legend where needed, a by-month (or by-envelope) list with the same numbers, the explanatory note; envelopes page starts with Bills hidden and chips to toggle. Patterns: PatternCard per signal (confidence pill, headline, steadier line, paired bars), "Show N more", watching notes, PatternInfoSheet with today's explanation. InvestmentsCard → `/insights/investments`.

- [ ] **Step 1:** Build.
- [ ] **Step 2:** Run checks. Smoke: "period switches Week / Month / 6 months and the pill slides", "scrubbing the period chart reads a day", "threshold $50 changes the split; legend hides Rent", "each trend page opens, scrubs to August and returns", "envelopes page: Rent hidden, toggling it on redraws", "patterns section renders", "investments page lists VTI and opens Add purchase", "fresh profile: Insights renders with no NaN or Infinity anywhere" (Settings → Reset all data, then Insights; Review Focus 1), `assertAmountsHidden` on Insights and a trend page.
- [ ] **Step 3:** Commit: `feat(insights): every chart rebuilt for the phone`.

### Task 15: Settings

**Files:**
- Modify: `src/routes/settings/+page.svelte` (rewrite as a modal route: Done in the leading slot, grouped lists), `src/lib/components/sync/SyncSection.svelte`, `src/lib/components/capture/{CaptureSection,CaptureRulesSection}.svelte` (render as pages)
- Create: `src/routes/settings/sync/+page.svelte`, `src/routes/settings/capture/+page.svelte`, `src/routes/settings/rules/+page.svelte`

**Interfaces:**
- Consumes: `themePreference`, `setTheme`, `hideAmounts`, `toggleHideAmounts`, `CurrencyChip`/`CurrencyModal`, export / import / reset functions now in the settings page, `homeLayout` (row "Home screen" opens EditHomeSheet).

Screen: account row (sync state; opens `/settings/sync`); Payments: Automatic capture (Android only) and Capture rules rows (push pages); Display: Appearance segmented System / Light / Dark, Hide amounts switch, Home screen (EditHomeSheet), Currency; Data: Export JSON, Export CSV, Import a backup; Reset all data (red, asks first).

- [ ] **Step 1:** Build.
- [ ] **Step 2:** Run checks. Smoke: update "settings switches theme" to the new control; add "export JSON downloads a file", "import the sample backup from Settings" (the seed step uses this path; update `seed()`), "Home screen row opens Edit Home", "back from Capture rules returns to Settings".
- [ ] **Step 3:** Commit: `feat(settings): settings as a sheet-style page with grouped sections`.

### Task 16: Cleanup, desktop pass, final checks

**Files:**
- Delete: `src/lib/components/charts/{BarChart,LineChart,DonutChart,font}.{svelte,ts}`, `chart.js` from `package.json`, unused components (`grep` each of `BucketCard`, `EnvelopeLine`, `ProgressBar`, `SectionTabs`, `TransactionRow` old, `AssignPanel`, `MonthPicker`, `PrivacyToggle` for imports first), Tailwind aliases from Task 2 once nothing uses them, `.display`
- Modify: `docs/deferred.md` (new section for this work; move the recurring-pause item to Resolved), `docs/superpowers/plans/2026-10-23-native-ui.md` (point to this plan), `CLAUDE.md` (Key Paths: new routes and `src/lib/ui`, `src/lib/charts`)

- [ ] **Step 1:** Remove dead code and aliases; `npm run check` and `npx vitest run` clean.
- [ ] **Step 2:** Desktop pass at 1280 × 800 in both themes: sidebar, centred sheets, pages readable, hover actions on Activity rows, keyboard: Cmd+K, Enter, arrows in Log, ←/→/T for months, Escape closes the top sheet. Fix what fails.
- [ ] **Step 3:** Run `npm run ui:smoke`, `npm run ui:a11y` (both themes, 390 and 320 wide, reduced motion: only opacity animates), `npm run ui:shots`. Expected: all pass; axe "no findings".
- [ ] **Step 4:** Walk the spec's "Where every feature goes" table row by row against the running app; note anything missing and fix it before finishing.
- [ ] **Step 5:** Commit: `chore(ui): remove Chart.js and dead components; docs`. Push; confirm the `android-preview` release updates and `android-latest` is unchanged.

---

## Execution record

Copied from the executor's ledger when the plan finished (2026-10-24). Every decision made on the owner's behalf, with what it costs if wrong, then the task results and the final review.

### Rulings

- T4 backButton (tab roots inline) vs T5 navDirection (TAB_ROOTS): duplicate list. Ruling: T4 creates src/lib/ui/routes.ts with TAB_ROOTS, MODAL_ROOTS, tabRootOf; T5's navDirection imports them — one source of truth — cost if wrong: one import move.
- T9 "AssignSheet focused on this envelope" vs T8 AssignSheet interface (no focus input). Ruling: AssignSheet takes prop `focusEnvelopeId: string | null = null` and focuses that field on open — spec asks for "Assign more" from the envelope page — cost if wrong: a prop rename.
- Task 2: Ruling: light good #2b7a52 measures 4.33:1 on the new raised #e9e9ee — use #27744d (4.70 raised, 5.10 page, 5.69 card) — cost if wrong: one hex.
- Task 2: Ruling: brief's `text-tint` must differ from `bg-tint` in dark (#9b99ff vs #5e5ce6) — `colors.tint` is the fill, `extend.textColor.tint` reads --c-tint-text — cost if wrong: one config key.
- Task 2: Ruling: button hover tint in dark #5452dc (white 5.81:1); light hover #4b49c9 (6.78:1); white text on tint in both themes (5.65 / 5.06) — cost if wrong: two hexes.
- Task 2: Ruling: older screens' text-primary measured 3.36:1 in dark (fill indigo as text) — textColor.primary also reads --c-tint-text — cost if wrong: none, alias goes in Task 16.
- Task 4: Ruling: tabRootOf maps modal routes to the tab they open from — /review → /activity, /settings → / — Android back from a directly opened Review lands on Activity — cost if wrong: one map entry.
- Task 4: Ruling: the smoke step 'Escape closes only the top sheet' needs a sheet that opens over another; none exists until Task 11 (Paid in over Log) — the step moves to Task 11; the stack itself is unit-tested here — cost if wrong: a late-found Escape bug in stacked sheets.
- Task 4: Ruling: .btn-danger's red tint measured 4.44:1 on the new grey sheets (any tint fails on raised) — destructive buttons become red text on a plain cell (surface; raised in dark: 5.72 / 5.42) — cost if wrong: one class.
- Task 7: Ruling: chart component props refined for typing and screen readers — ScrubBars takes `axis: [string, string]` (plan: `labels`) plus `label` (aria summary); every chart takes `label`; Sparkline takes `bars` / `pairs` / `lines` props instead of one union `data`; Donut takes its centre figure as a slot; PairedBars has `interactive` (patterns use it non-scrubbable) — later tasks use these names — cost if wrong: prop renames at call sites.
- Task 8: Ruling: the plan's AssignSheet omitted two features of today's AssignPanel — 'Copy last month's assignments' and a '+ rest' per envelope — both kept alongside the new 'Put the rest in {first savings envelope}' (anti-goal: no feature lost) — cost if wrong: two extra buttons.
- Task 9: Ruling: the plan put the paused-recurring test in the store, but the bug lives in the form (it always sent isActive: true) — the form's data shaping becomes recurringFormData() in src/lib/budget/recurringForm.ts and is tested there — cost if wrong: none; the store's merge was never the problem.
- Task 9: Ruling: '/budget/<id> with an unknown id lands on /budget' is done in the page once data has loaded, not in +page.ts (load runs before the stores have data) — cost if wrong: a brief flash of an empty page before the redirect.
- Task 10: Ruling: ReviewBanner stays until Task 12 — Activity still uses it; the plan deleted it here — cost if wrong: one file lives two tasks longer.
- Task 10: Ruling: Edit Home reorders by drag on the handle, by ←/↑/↓ keys on it, and by tapping it for Move up / Move down — the anti-goal forbids drag as the only way — cost if wrong: a small menu nobody uses.
- Task 10: Ruling: NavBar gains `compactTitle` so Home's bar can read "$234.47 today" (blurred with Hide amounts) while its heading stays "Home" — cost if wrong: one prop.
- Task 10: Ruling: the layout loads from +layout's init and reload.ts right after loadData, not inside budgetStore.loadData — keeps budgetStore free of a Home concern; the reload test pins the order — cost if wrong: one call moves.
- Task 10: Ruling: added moveCard(layout, from, to) to src/lib/home/layout.ts (tested) and a `change` event on Switch — Edit Home needs both; neither was in the brief — cost if wrong: none.
- Task 10: Ruling: a future month's hero reads "Everyday money in November" (assigned plus carried over), no pill, no chart — spec covers today and past only — cost if wrong: one label.
- Task 10: Ruling: the Android update banner stays global in Layout (every page), which satisfies "shown regardless of layout" — cost if wrong: none.
- Task 10: Ruling: axe now also runs on the Edit Home sheet with its tap menu open — cost if wrong: none.
- Task 11: Ruling: "most-used first" needs a rule — orderByUse(ids, txs) in src/lib/log/envelopeOrder.ts counts expenses per envelope, ties keep budget order (tested) — cost if wrong: chip order.
- Task 11: Ruling: a preselected envelope (Log here) is selected among all chips rather than the only chip — the person can still change it — cost if wrong: one filter.
- Task 11: Ruling: operators need a number first, so a refund is typed 0 − 5 on the keypad; Edit still takes a negative amount directly — cost if wrong: two extra keys for a refund.
- Task 11: Ruling: Modal honours [data-autofocus]; Log starts focus on its amount (an <output>) so typing and Enter work at once and Enter never lands on Cancel — cost if wrong: none.
- Task 11: Ruling: axe flagged the hero pill seen through the dimmed, scaled-back app behind the Log sheet — #stage is now inert while any sheet is open, and Modal restores focus after the update that lifts it — cost if wrong: a sheet rendered inside #stage would be unusable (all sheets portal to body today).
- Task 11: Ruling: Paid in converts in LogEntry (parseRate / convertToBase) because ForeignCurrencyField lives in the Paid in sheet and unmounts when it closes — cost if wrong: three duplicated lines.
- Task 11: Ruling: keypad numbers cap at nine whole digits; 'x' types × — cost if wrong: none.
- Task 12: Ruling: a flick only counts toward the side the row is already pulled (swipeOutcome(50, w, −1.2) closes) — the brief's rule alone would delete a row flicked back from Move — cost if wrong: one guard.
- Task 12: Ruling: Undo after a swipe delete needs the same id (Review links and sync use it) — added restoreTransaction(t) to budgetStore, and updateTransaction recreates Unsorted when a move is undone into it (both tested) — cost if wrong: none.
- Task 12: Ruling: the envelope picker for swipe-right is its own MoveSheet.svelte (not in the brief's file list) — cost if wrong: one file.
- Task 12: Ruling: the Auto chip means approved from Review (the rows tagged Auto); recurring rows keep their Recurring tag — cost if wrong: one filter rule.
- Task 12: Ruling: the Unsorted chip also shows while a link has chosen it, so ?bucket=unsorted always shows a selected chip — cost if wrong: an empty Unsorted chip.
- Task 12: Ruling: Home and the envelope page use TransactionSheet too (one expense sheet everywhere); the form's "Bucket" label reads "Envelope" — cost if wrong: none.
- Task 12: Ruling: the month summary stays on Activity as one line (count, spent, set aside) — it had the only "set aside" total — cost if wrong: one line.
- Task 12: Ruling: hairlines in grouped lists sit above row backgrounds (z-index 1) so swipe rows keep them — cost if wrong: none.
- Task 13: Ruling: task-start printed BASE b31e2fc, which the Task 12 amend replaced — BASE is 5f27990 — cost if wrong: none.
- Task 13: Ruling: the brief's smoke line has a ₹ card showing "About $3.00" while Approve reads "Add rate" — impossible together (an estimate needs a rate). With no rate the card reads "Rate needed" and Approve reads "Add rate"; once a rate is used, the next ₹ card reads "About $150.01" — both are smoke steps — cost if wrong: one label.
- Task 13: Ruling: a swipe left dismisses at once (with Undo); the Dismiss button opens the sheet with "Always ignore payments to …" — cost if wrong: the ignore option is one tap further for swipers.
- Task 13: Ruling: the envelope pill and "Choose envelope" open a shared EnvelopePicker (MoveSheet now uses it too); picking approves into it, or opens the edit form with it chosen when a rate is still needed — cost if wrong: none.
- Task 13: Ruling: Close needs the app's history depth — moved from +layout into a store (src/lib/ui/history.ts, closeTarget tested) and CloseButton.svelte; NavBar gains pinTitle so "To review" always shows — cost if wrong: none; Task 15 reuses both.
- Task 13: Ruling: pages inside Review and Settings hide the tab bar and Log button (inModal), and edge-swipe back is off on Review and Settings themselves (isModalRoot) — a slide-up page covers the tabs, and an edge swipe would fight the deck — cost if wrong: no tab bar on Settings sub-pages.
- Task 13: Ruling: cards under the top one are solid (only the next carries content) — translucent cards bled through each other mid-drag — cost if wrong: none.
- Task 14: Ruling: months with nothing logged are not data — averageOfComplete now skips zero months (tested), lists show them as "—, Nothing logged", envelope lines break there — the sample's empty May–August dragged the average to a third of real spending — cost if wrong: a genuinely zero-spend month leaves the average.
- Task 14: Ruling: the Week and Month views needed per-day spending — dailySpending(txs, savingsIds, days) added to trends.ts (tested); trend page names validated by isTrendChart in src/lib/insights/charts.ts (tested) — cost if wrong: none.
- Task 14: Ruling: the period figure, trend figures and the investments hero share Figure.svelte (label, rolling number, pill, sub) — cost if wrong: none.
- Task 14: Ruling: axe measured the green/red pills at 4.1–4.2:1 on the grey page — one .pill / .pill-good / .pill-bad in app.css: 12% tint, light-mode text a step darker (#1f6340 / #9a2f1f, 5.1:1 at worst); Home's hero and savings-rate pills use it too — cost if wrong: two hexes.
- Task 14: Ruling: the summary strip shows whole dollars (three figures share a phone's width; Net was cut off) — cost if wrong: cents only on the trend pages.
- Task 14: Ruling: trend cards drop their small chart below 360 px (they overflowed at 320) — cost if wrong: no sparkline on the smallest phones.
- Task 14: Ruling: the fresh-profile smoke step resets the main profile at the very end of the run (then confirms the currency prompt) and also checks SVG attributes for NaN; trend pages joined the axe and 320 px routes — cost if wrong: none.
- Task 14: Ruling: Sparkline guarded against an all-empty line series (Math.min of nothing gave Infinity) — cost if wrong: none.
- Task 15: Ruling: Capture rules is always a row (with "None yet" and an empty page) instead of appearing only once a rule exists — a row that comes and goes is hard to find — cost if wrong: one row.
- Task 15: Ruling: /settings/capture outside the Android app shows a short note instead of the capture controls, and /settings/sync in a build without sync goes back to /settings — both pages are reachable by URL — cost if wrong: none.
- Task 15: Ruling: CloseButton takes a label ("Done" on Settings); page titles added for the trend pages and Settings sub-pages (the fallback named them "bdgt") — cost if wrong: none.
- Task 15: Ruling: import and reset on Settings also reload the Home layout — the layout lives in the same settings table they replace — cost if wrong: none.
- Task 16: Ruling: success / warning / danger stay as the meaning colour names (used everywhere, including new code); the unused good / warn / bad duplicates and every other older name (primary, muted, *-dark, border, rule, tile-*, font-display, .display, unused title classes) are gone — a production build fails on any @apply that names a removed colour, and it passed — cost if wrong: none.
- Task 16: Ruling: the spec's "hover actions on rows" for desktop — Activity rows show Move and Delete buttons on hover or keyboard focus, hidden on touch (hover: none) — cost if wrong: two buttons per row on desktop.
- Task 16: Ruling: the a11y run gained a reduced-motion pass (sheet, page push, deck approve, period switch) that allows fades of opacity or colour only; it found the deck's card sliding under reduced motion, now a fade — cost if wrong: none.
- Task 16: Ruling: feature table walk — every row is present; "Approve all suggested" sits above the deck rather than in the header (the header holds Close, the title and the count), and the update banner kept its layout with the new colours — cost if wrong: one button's position.
- Task 16: Ruling: ui:shots opened the Income sheet from Home (it moved to Budget in Task 8) — now from Budget, plus the Edit Home sheet — cost if wrong: none.

### Task results

- Task 1: complete (commits 34a0677..5d5ddb3, tests: npm run ui:smoke → no page errors)
- Task 2: complete (commits 5d5ddb3..058eb06, tests: npm run ui:smoke → no page errors)
- Task 3: complete (commits 058eb06..ce1b27b, tests: npx vitest run →    Duration  6.82s (transform 5.05s, setup 0ms, import 9.10s, tests 16.10s, environment 47.21s))
- Task 4: complete (commits ce1b27b..943d096, tests: npx vitest run →    Duration  6.76s (transform 4.64s, setup 0ms, import 8.63s, tests 17.26s, environment 45.81s))
- Task 5: complete (commits 943d096..88535be, tests: npx vitest run tests/lib/ui →    Duration  700ms (transform 135ms, setup 0ms, import 194ms, tests 64ms, environment 2.42s))
- Task 6: complete (commits 88535be..49275a9, tests: npm run ui:smoke → no page errors)
- Task 7: complete (commits 49275a9..a3bcb5f, tests: npx vitest run tests/lib/charts tests/lib/insights →    Duration  718ms (transform 244ms, setup 0ms, import 357ms, tests 26ms, environment 3.17s))
- Task 8: complete (commits a3bcb5f..979bcb2, tests: npx vitest run →    Duration  7.36s (transform 4.41s, setup 0ms, import 8.69s, tests 20.02s, environment 49.62s))
- Task 9: complete (commits 979bcb2..336e2a4, tests: npm run ui:smoke → no page errors)
- Task 10: complete (commits 336e2a4..25cbe0a, tests: npm run ui:smoke → no page errors)
- Task 11: complete (commits 25cbe0a..9afab2d, tests: npx vitest run →    Duration  7.31s (transform 4.92s, setup 0ms, import 9.41s, tests 17.44s, environment 50.59s))
- Task 12: complete (commits 9afab2d..5f27990, tests: npx vitest run →    Duration  8.07s (transform 4.70s, setup 0ms, import 9.57s, tests 21.10s, environment 55.98s))
- Task 13: complete (commits 5f27990..e4b39f0, tests: npx vitest run →    Duration  8.86s (transform 5.52s, setup 0ms, import 10.66s, tests 18.11s, environment 65.65s))
- Task 14: complete (commits e4b39f0..efba3f1, tests: npx vitest run →    Duration  8.22s (transform 5.12s, setup 0ms, import 10.68s, tests 19.99s, environment 57.16s))
- Task 15: complete (commits efba3f1..558b01d, tests: npm run ui:smoke → no page errors)
- Task 16: complete (commits 558b01d..681a7e5, tests: npx vitest run →    Duration  8.95s (transform 4.79s, setup 0ms, import 9.26s, tests 19.75s, environment 65.01s))

### Final review

- Final review: self-review (agents are spawned only on the owner's request). Passes: data paths (undo of delete / move / approve, Unsorted recreation, Home layout sync through the settings table), Log keyboard routing, modal ids against mounted sheets (inert stage), Android back and Close on direct opens, Review Focus 1–5. No Critical or Important findings.
- Final: minor (deferred): the deck resets a flown card one tick after dispatch; a very slow save could let it start sliding back before it disappears (not reproduced at 8× CPU).
- Final: minor (deferred): Edit Home drag that ends without a click leaves `moved` set; the next tap on that handle is ignored once.
- Final: minor (deferred): Settings' Sync row status time is read once per render.
- Final: pushed 681a7e5; android-preview rebuilt at 681a7e5 (2026-10-24T00:50Z); android-latest unchanged at ced24f0.
