# Quieter, More Minimal Design Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every screen of bdgt gets the quieter design language of the owner's references, with no feature lost: white space instead of boxes and lines, one big figure per screen, neutral outline icons, colour only where it means something, Manrope type and soft charts.

**Architecture:** First the foundations change: tokens (font, type scale, the dark charcoal palette, spacing, card and shadow), a few shared parts (`IconMark`, `SectionHeading`, `.list`/`.row`, `tileColors`, `highlightIndex`) and the chart look. Then each screen moves onto them in turn: Home, Budget, Activity, Log and Review, Insights, Settings and the chrome. Behaviour, routes, stores and accessible names stay as they are, so the existing smoke and axe checks guard every feature through the restyle.

**Tech Stack:** SvelteKit 2 (Svelte 5 with Svelte 4 syntax in components), Tailwind 3 with CSS-variable tokens, `@fontsource-variable/manrope`, Vitest, Playwright smoke and axe checks (`scripts/ui-check/run.cjs`), Capacitor Android.

**Spec:** `docs/superpowers/specs/2026-10-24-minimal-ui-design.md`

## Global Constraints

- Branch `claude/minimal-ui`; `git commit --no-gpg-sign`; no attribution lines; push only to `claude/minimal-ui`. Never touch `claude/intelligent-davinci-7qblqz`, `claude/native-ui`'s history, the `android-latest` release or the Pages deploy. No PRs.
- Same features and screens. Nothing that works today may be lost. Accessible names, roles and `data-*` hooks that `scripts/ui-check/run.cjs` uses stay the same, or the smoke step changes with them in the same commit.
- Components in Svelte 4 syntax (`export let`, `$:`), matching the codebase. All money in cents. The stores stay the source of truth.
- Type: Manrope via `@fontsource-variable/manrope` (no network fonts). One `--font-sans` token, so the system font can come back by changing one line. Tabular figures for every amount.
- Type scale: figure 52 px/700; large title 30 px/700; section heading 20 px (strong word 700, soft word 500 in label-2); row title 16 px/600; body 15 px; caption 13 px in label-2.
- Dark palette: page `#0f0f11`, surface `#1b1b1e`, raised `#26262a`. Light keeps page `#f2f2f7`-family and white cards. Tint `#5856d6` light / `#5e5ce6` dark, tint text in dark `#9b99ff`.
- Icons: Lucide outlines at 1.75 stroke in 44 px neutral circles (`bg-fill`, label-colour icon). An envelope's colour never fills an icon's background. It appears only on its progress bar, its chart series, soft category tiles and a small dot.
- Spacing: 20 px page gutter, 36 px between sections, 64 px minimum list row; lists sit on the page without hairlines. Cards: 24 px radius, no border, soft shadow in light, none in dark. Sheets keep 30 px tops.
- Text contrast 4.5:1 or more in both themes; works at 320 px; motion only under `prefers-reduced-motion: no-preference`; Hide amounts blurs every figure.
- After every task: `npx vitest run`, `npm run check`, `npm run ui:smoke`, `npm run ui:a11y` pass (dev server `VITE_SUPABASE_URL= npx vite dev --port 5174 --strictPort`, restarted after Tailwind config changes), plus light and dark screenshots of the screens touched.
- Keep `docs/deferred.md` current.

## Review Focus

1. **Secondary text on the new charcoal surfaces and on tinted tiles.** Every label-2 pair, and the text on soft envelope tiles, measures 4.5:1 or more in both themes. Tests: `tileColors` unit test (Task 2), axe in every task.
2. **Long envelope names and large amounts in tiles and open rows.** They truncate or shrink and never overflow, including at 320 px. Tests: the 320 px overflow scan in `ui:a11y` and a smoke step with a long envelope name (Task 4).
3. **Manrope offline (the Android app).** The font loads from the app bundle, with no request to an outside font host. Smoke step (Task 1).
4. **Hide amounts on new figures** (tile amounts, bubble values on charts, open-row amounts): all blurred. Tests: `assertAmountsHidden` steps already on Home, Log, Activity, Review and Insights stay green.
5. **Swipe rows on the open list.** The row's sliding face must cover what is behind it on the page background (no see-through). Smoke swipe steps (Task 5) plus a screenshot mid-swipe.

---

### Task 1: Foundations: font, tokens, chrome and the preview build

**Files:**
- Modify: `package.json` (add `@fontsource-variable/manrope`), `src/app.css` (font import, `--font-sans`, type classes `.t-figure`, `.t-title`, `.t-heading`, `.t-row`, `.t-caption`, dark palette, card radius and shadow, `.ltitle` at 30 px, `.list`/`.row` classes, page gutter), `tailwind.config.js` (font family from the token, `borderRadius.card` 24 px), `src/lib/components/layout/Layout.svelte` (gutter `px-5`), `src/lib/components/layout/TabBar.svelte` and `LogButton.svelte` (slimmer: 56 px bar, 10.5 px labels), `src/lib/components/layout/AvatarButton.svelte` (neutral circle), `.github/workflows/android.yml` (build this branch as the preview)
- Test: smoke step "fonts load from the app, Manrope is used" (`document.fonts.check('16px "Manrope Variable"')`, and no request whose URL contains `fonts.googleapis` or `fonts.gstatic`)

**Interfaces:**
- Produces: CSS classes `.t-figure`, `.t-title`, `.t-heading`, `.t-row`, `.t-caption`, `.list` (a vertical stack of `.row`s with no lines), `.row` (flex, gap 14 px, min-height 64 px, 8 px vertical padding), `.card` (24 px radius); token `--font-sans`; the charcoal dark palette.

- [ ] Step 1: Add the smoke step; run it. Expected: FAIL (the system font).
- [ ] Step 2: Install the font and add tokens and classes. Set the dark palette; re-measure label-2 on page, surface and raised in dark (keep `--c-label-2` dark at `#98989f` or lighter until each pair is 4.5:1 or more).
- [ ] Step 3: Slim the tab bar and Log button, make the avatar neutral, set the gutter.
- [ ] Step 4: Workflow: `branches: [claude/intelligent-davinci-7qblqz, claude/native-ui, claude/minimal-ui]`; `PREVIEW` is `'1'` for both `claude/native-ui` and `claude/minimal-ui`.
- [ ] Step 5: All checks plus screenshots. Commit: `feat(ui): Manrope, quieter tokens and a slimmer tab bar`.

### Task 2: Shared parts: icon mark, section heading, tiles and soft charts

**Files:**
- Create: `src/lib/components/ui/IconMark.svelte`, `src/lib/components/ui/SectionHeading.svelte`, `src/lib/ui/tiles.ts`, `src/lib/charts/highlight.ts`
- Modify: `src/lib/components/charts/{ScrubBars,PairedBars,TrendLines,Sparkline,Donut}.svelte`, `src/lib/components/home/PaceChart.svelte`
- Test: `tests/lib/ui/tiles.test.ts`, `tests/lib/charts/highlight.test.ts`

**Interfaces:**
- Produces:
  - `<IconMark icon: IconName size?: number = 44 dot?: string | null>`: a neutral circle with an outline icon, optionally a small dot of an envelope's colour.
  - `<SectionHeading strong: string soft?: string = '' id?: string>` with an `action` slot: the "Spending **October**" pattern, as an `<h2>`.
  - `tileColors(hex: string, dark: boolean): { background: string; text: string }`: the envelope colour mixed into the surface at 18% (light) or 28% over charcoal (dark), with text that is the label colour of that theme.
  - `highlightIndex(count: number, hot: number, futureFrom: number | null): number`: the bar drawn in the accent. It is `hot` while scrubbing; otherwise the last bar before `futureFrom` (or the last bar); -1 when `count` is 0.
- Charts: bars are pale (`label-2` at 18%) with the `highlightIndex` bar in the tint, and a value bubble above the highlighted bar while scrubbing. Lines are 2 px with soft fills. Accessible labels are unchanged.

- [ ] Step 1: Write the failing tests:
  - `tileColors('#5856d6', false).background` is `'rgb(225, 225, 248)'` (18% over white).
  - `tileColors('#5856d6', true).background` is `'rgb(44, 44, 82)'` (28% over `#1b1b1e`).
  - `text` is `'rgb(var(--c-label))'` in both themes.
  - `highlightIndex(31, -1, 23)` is 22; `highlightIndex(6, -1, null)` is 5; `highlightIndex(6, 2, null)` is 2; `highlightIndex(0, -1, null)` is -1.
- [ ] Step 2: Run them. Expected: FAIL (modules missing).
- [ ] Step 3: Implement both helpers, the two components and the chart look.
- [ ] Step 4: Tests pass; all checks; screenshots of Insights and Home charts. Commit: `feat(ui): icon marks, section headings and softer charts`.

### Task 3: Home

**Files:** `src/routes/+page.svelte`, `src/lib/components/home/{HomeHero,PaceChart,EditHomeSheet}.svelte`, `src/lib/components/home/cards/*.svelte`

Hero:
- "Safe to spend **today**" uses the two-weight heading style.
- The figure is `.t-figure` with small, label-2 cents.
- One line under it: the pill (smaller) and "$2,110 left · 9 days".

Cards:
- Envelopes become soft tiles (`tileColors`). Each tile shows the name, the amount left and "of $X". The progress bar uses the envelope colour.
- Recent becomes an open `.list` with `IconMark`.
- Review, Bills, Goals, Savings rate and Notes become quiet cards with `SectionHeading`.
- Edit Home stays.

- [ ] Smoke steps for Home stay green (the hero figure, plan pill, scrub, Edit Home, review card, envelope card, past month, Hide amounts). All checks and screenshots. Commit: `feat(home): quieter Home with soft envelope tiles`.

### Task 4: Budget, envelope page, Bills and the budget sheets

**Files:**
- `src/routes/budget/+page.svelte`, `src/routes/budget/[id]/+page.svelte`, `src/routes/budget/bills/+page.svelte`
- `src/lib/components/budget/*.svelte`
- `src/lib/components/shared/{GoalCard,MonthNotes,EnvelopePicker}.svelte`

Budget:
- Summary: the left-to-assign figure, the segmented assignments bar and Assign.
- Groups use `SectionHeading` ("Everyday **envelopes**" with its note).
- Rows are open `.row`s with `IconMark`: name, "$364 of $500 spent", a thin bar in the envelope colour, and the amount left on the right.

Envelope page: the ring keeps its envelope colour; the actions are quiet buttons; open lists.

Sheets: replace coloured squares with `IconMark`.

- [ ] Smoke step: add the envelope "Groceries and household supplies", then check its Budget row and its page title do not overflow (`scrollWidth <= clientWidth` on the row). Run it. Expected: PASS before and after (a guard); it fails if the new row overflows.
- [ ] Budget smoke steps stay green. All checks and screenshots. Commit: `feat(budget): open envelope rows and quieter Budget`.

### Task 5: Activity, the transaction sheet and the move sheet

**Files:**
- `src/routes/activity/+page.svelte`
- `src/lib/components/activity/{TransactionRow,SwipeRow,FilterChips,TransactionSheet,MoveSheet}.svelte`

Changes:
- A quiet search field.
- Text-only chips (the selected one filled with `label`, the rest `fill`), with an envelope dot only in the envelope chips.
- Day headings in `.t-caption` style with the day total.
- Open rows with `IconMark`.
- The swipe face covers with the page colour.
- The sheet header uses `IconMark`.

- [ ] Activity smoke steps stay green (chips, search, swipe delete and move with Undo, short swipe rests open, sheet edit and delete, Unsorted chip, Hide amounts), plus a screenshot mid-swipe. All checks. Commit: `feat(activity): open rows and quiet chips`.

### Task 6: Log sheet and Review deck

**Files:**
- `src/lib/components/log/EnvelopeChips.svelte`
- `src/lib/components/shared/LogEntry.svelte`
- `src/lib/components/review/*.svelte`

Log:
- Envelope chips become neutral pills: name, the envelope dot, and "left" or "left after" in green or red.
- The number pad stays.

Review:
- Deck cards quieter: `IconMark` for the source, the figure `.t-figure`, the envelope pill neutral with a dot.
- The lists are open rows.

- [ ] Log and Review smoke steps stay green. All checks and screenshots. Commit: `feat(log, review): quieter chips and deck cards`.

### Task 7: Insights, trend pages and Investments

**Files:**
- `src/routes/insights/+page.svelte`, `src/routes/insights/[chart]/+page.svelte`, `src/routes/insights/investments/+page.svelte`
- `src/lib/components/insights/*.svelte`, `src/lib/components/investments/*.svelte`

Changes:
- The summary as three plain figures (no card).
- Where it went as open rows with thin bars.
- Trend cards quieter (no coloured icon squares).
- Big/small and Patterns use `SectionHeading`.
- Investments: open rows and `IconMark`.

- [ ] Insights smoke steps stay green (period switch and pill, scrub, threshold, legend, donut fit, trend pages scrub to August, envelope chips, patterns, investments, fresh profile with no NaN). All checks and screenshots. Commit: `feat(insights): quieter Insights`.

### Task 8: Settings, sheets and the remaining chrome

**Files:**
- `src/routes/settings/**`
- `src/lib/components/ui/Toast.svelte`
- `src/lib/components/shared/{Modal,TransactionForm,ForeignCurrencyField,CurrencyModal,InfoPopover}.svelte`
- `src/lib/components/sync/*.svelte`, `src/lib/components/capture/*.svelte`
- `src/lib/components/layout/{NavBar,UpdateBanner,MonthMenu}.svelte`

Changes:
- Settings keeps its groups but uses `IconMark`-style neutral icons.
- Sheet titles in the quieter type.
- Form fields: soft filled fields with the 3:1 outline kept for findability.
- The Toast loses its coloured square.

- [ ] Settings and sheet smoke steps stay green. All checks and screenshots. Commit: `feat(ui): quieter Settings, sheets and chrome`.

### Task 9: Sweep, desktop pass, docs, final checks

**Files:**
- Grep for any remaining `text-white" style="background:` icon squares and `.group` lists outside Settings, and remove each.
- `docs/deferred.md`, `CLAUDE.md` (fonts and the design note), `docs/superpowers/plans/2026-10-24-minimal-ui.md` (execution record)

- [ ] Desktop pass at 1280 × 800 in both themes. Fix what fails.
- [ ] `npm run ui:smoke`, `npm run ui:a11y` (including the reduced-motion pass), `npm run ui:shots`, `npx vitest run`, `npm run check`, `npm run build`: all pass.
- [ ] Commit: `chore(ui): sweep, docs`. Push. Confirm the preview build publishes `android-preview` from this branch and `android-latest` is unchanged.
