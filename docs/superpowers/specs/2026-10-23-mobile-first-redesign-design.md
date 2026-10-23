# Mobile-first redesign: design

Date: 2026-10-23. Branch: `claude/native-ui`. Approved concept: https://claude.ai/artifact/H6uLcCFmkMkt3cEzNaQjTj (a copy is in this folder as `2026-10-23-mobile-first-concept.html`; open it in a phone-sized browser window).

## Why

bdgt was designed as a laptop web app and is now mostly used as an Android app. The overnight restyle (commits up to `c12ba39` on this branch) changed how screens look but not how the app is used, and the owner judged it not good enough: "the expectation was that the UI/UX becomes mobile friendly and mobile first." This redesign reorganises the app around what someone does on a phone, and makes it look and move like a native iOS app, with Robinhood, CRED and Expensa as references.

The owner reviewed a clickable concept, asked for two changes (number fields when assigning money; keep every existing chart, redesigned), and approved it: "this looks great. Let us move ahead".

## What success looks like

- Opening the app answers "how much can I spend today" without a tap.
- Logging an expense takes a few seconds with one thumb: amount on a keypad, one tap for the envelope.
- Captured payments are cleared by swiping through them.
- Every screen feels native: springy sheets you can drag away, pages that slide in and swipe back, numbers that roll, swipe actions on rows, haptics on Android.
- Nothing the app does today is lost. Section "Where every feature goes" is the checklist.

## Non-goals

- An iOS build. The look is iOS-like; the app ships on Android and the web as today.
- New money features. The only new behaviour is UI: a customisable Home, "put the rest in" one tap when assigning, swipe actions, the review deck.
- Changing the data model or the sync schema. No new tables or columns (see "Data").

## Anti-goals (failure even if it works)

- Any feature from today missing or harder to reach without a reason the owner agreed to.
- Made-up numbers in the real app. (The concept invents May to August; the app shows real history and empty months as empty.)
- A gesture that is the only way to do something. Every swipe or drag has a tap path.
- Desktop broken. It may be plainer than the phone, but every feature works with a mouse and keyboard.
- "Not in this concept" placeholders, or any control that does nothing.
- Touching `claude/intelligent-davinci-7qblqz`, the `android-latest` release or the Pages deploy (rules in `docs/superpowers/plans/2026-10-23-native-ui.md` still apply).

## Constraints

- SvelteKit 2 on Svelte 5, with components written in the Svelte 4 syntax (keep that style), Tailwind 3, Dexie, static adapter (`fallback: 'index.html'`, so client-side routes with parameters work), Capacitor 8 on Android.
- All money in cents. Existing stores and calculations in `src/lib/stores/` and `src/lib/utils/` stay the source of truth; screens read from them.
- 1,001 unit tests, `npm run check`, the smoke script and axe must stay green after every step. New pure logic (spring curves, chart scales and paths, icon choice from a name, Home layout parsing, period windows) gets unit tests. The smoke script lives in the session scratchpad; the builder should move it into the repo (for example `scripts/ui-check.cjs`) so it survives.
- Small commits on `claude/native-ui`, `git commit --no-gpg-sign`, no attribution lines. Every push builds the "bdgt preview" APK (`android-preview` release) for the owner to try.
- Motion only under `prefers-reduced-motion: no-preference`; under reduce, fades only. Text contrast at least 4.5:1 in both themes. Works at 320 px wide.

## Structure

Four tabs and a Log button. The "Setup" tab goes away.

| Tab | Job | Contents |
|---|---|---|
| Home | "Can I spend?" at a glance | Safe-to-spend figure, pace chart, then cards the owner picks (Edit Home) |
| Budget | The plan for the month | Income and money left to assign, envelopes grouped Everyday / Bills / Savings, bills and subscriptions, goals, month notes, new envelope |
| Activity | What happened | Search, filter chips, review entry, transactions by day with swipe actions |
| Insights | How it's going over time | Period chart, summary, where it went, big and small purchases, trend cards, patterns, investments |

- **Log button**: a round tinted "+" beside the floating tab bar, on every tab, opens the Log sheet.
- **Badge**: the Activity tab shows the number of payments to review, as the Activity nav item does today.
- **Settings**: the avatar button at the top right of Home opens Settings as a full-height sheet. On desktop it is also in the sidebar.
- **Review**: reached from the Home card, the Activity row, and the tab badge count; it is a full-height sheet (deck) with its own route so links and the back button work.
- **Month**: a month button in the navigation bar of Home, Budget, Activity and Insights opens a small menu of months (newest first, a check on the current one). It sets the same global month the app uses today (`currentMonthKey`).
- **Hide amounts** (eye) sits in Home's navigation bar and in Settings.

Routes (builder may rename, but each screen needs a URL so Android's back button and deep links work): `/` Home, `/budget`, `/budget/[envelope]`, `/budget/bills`, `/activity`, `/review`, `/insights`, `/insights/[chart]`, `/insights/investments`, `/settings` (also openable as a sheet). Today's `/transactions`, `/analytics`, `/buckets`, `/recurring`, `/investments` redirect to their new homes.

## Screen details

### Home

- **Hero**: "Safe to spend today" and the per-day figure (today's calculation, pending payments included), a pill saying how far under or over plan everyday spending is, and "$X left · N days". For a month other than the current one there is no "today": the hero shows "Left in September" with the everyday money left at the end of that month.
- **Pace chart**: cumulative everyday spending day by day for the month (solid line, filled under, a pulsing dot on today) against the plan (everyday envelopes' assigned amount spread evenly over the month, dashed). Press and slide to read "Spent on everyday envelopes by Oct 14" in the hero, with the plan by then.
- **Cards**, chosen and ordered in Edit Home (a sheet with a switch and a drag handle per card): Payments to review, Envelopes (everyday envelopes as a sideways row of cards, each opening its envelope page), Recent activity (last four), Upcoming bills, Savings goals, Savings rate, Month notes. On by default: the first three. Two cards appear on their own when relevant and are not in Edit Home: "Needs an envelope" (unsorted transactions) and the Android update banner.
- **Navigation bar**: month button (left), eye and avatar (right); once scrolled, the title shows "$234.47 today".

### Budget

- **Groups**: Savings = envelopes with `isSavings`; Everyday = `isEveryday` and not savings; Bills = everything else; each group in `order`. The system Unsorted envelope shows as its own row when it holds transactions.
- **Rows**: Everyday and Bills show spent of assigned with a meter and the amount left (or over, in red); Savings rows show the amount set aside this month in green.

### Insights

- **Spending** means everything except savings envelopes, as today.
- **Period chart**: Week (the 7 days ending today, or the month's last day for past months), Month (each day of the selected month; days after today drawn empty), 6 months (the selected month and the five before it, with a dashed average of the complete months). A day far larger than the rest (rent) is capped at the second-largest bar times 1.3 and marked, so the others stay readable.
- **Trend cards** (6 months ending at the selected month): Monthly spending (average of complete months), Income and spending (net this month), Spending by envelope (the biggest everyday envelope this month), Savings rate (this month, change on last month). Each opens its page: a figure that changes while you scrub, the chart, and a by-month (or by-envelope) list under it that holds the same numbers for anyone who can't scrub.
- **Spending by envelope** starts with Bills envelopes hidden (rent would flatten the rest); chips show or hide each envelope.

## Where every feature goes

| Today | New home |
|---|---|
| Safe to spend per day, its explanation popover, pending payments counted | Home hero (rolling figure; info button keeps the explanation) |
| Upcoming bills tile, savings goal tile | Home cards "Upcoming bills" and "Savings goals", **off by default** (owner: not helpful at the top) |
| Review banner | Home card "Payments to review" (stacked look, count badge) and Activity's first row |
| Assigned-this-month bar, "Assign the rest" | Budget summary card (stacked bar of envelopes, amount left to assign, Assign button) |
| Assign panel (all fixed envelopes at once, draft until saved) | Assign sheet: a number field per fixed envelope, percentage and hybrid envelopes shown with their computed amount (read-only, as today), live "left to assign" that turns red when over, "Put the rest in {first savings envelope}" (hidden if there is none). Cancel discards, Done saves (keeps today's draft-then-commit behaviour) |
| Income: add, edit, delete, fixed or variable | Budget summary card "Income this month" opens the Income sheet (segmented Fixed / Variable, list of this month's income with edit and delete, delete asks first) |
| Unsorted transactions warning | Budget shows an "Unsorted" envelope row when it has transactions; Activity has an "Unsorted" chip; Home shows a card when there are any (always, not a toggle) |
| Savings rate with change vs last month | Insights "Savings rate" trend card and page; optional Home card |
| Month notes | Budget, "Month notes" row opening a sheet; optional Home card |
| Envelope rows (left, spent of assigned, carried over, on/over plan) | Budget rows (icon tile, spent of assigned with a meter, left or over); envelope page shows the ring, Assigned / Spent / Carried in, coming-up recurring items, the month's transactions, "Assign more", "Edit" |
| Tap an envelope row to log into it | Envelope page has a "Log here" action (the Log sheet opens with that envelope picked) |
| Savings goals: list, add (name, linked envelope, target, starting balance, target date or monthly contribution) | Budget "Savings goals" section with progress rows and "Add goal" sheet; the linked envelope's page shows its goal |
| Buckets page: add, edit (name, colour, allocation fixed / percentage / hybrid, savings, everyday), delete (not defaults; moves transactions to Unsorted, deletes recurring and goals, asks first), per-month amount | Budget: "New envelope" row and each envelope page's "Edit" open the envelope sheet with the same fields; Delete lives at the bottom of that sheet; the month's amount is set through Assign |
| Percentage over 100% warning | Budget summary card shows it |
| Recurring: list, add, edit, pause / resume, delete | Budget, "Bills and subscriptions" page (rows with next due date); tap a row for its sheet with Pause / Resume and Delete |
| Transactions: search, filter by bucket, day groups, AUTO and RECURRING tags, recorded-vs-paid ("of $X"), foreign amount note, edit, delete | Activity: search field, chips (All, Auto, Unsorted when present, each envelope), day groups (Today, Yesterday, dates) with day totals, swipe left to delete (undo toast), swipe right to move to another envelope, tap for the detail sheet (the existing edit form: amount with expressions, envelope, date, note, foreign currency; Delete) |
| Log: amount expressions, foreign currency and rate, envelope list with fits / breaks, note, Enter to save, arrows to pick, Cmd+K, preselected bucket | Log sheet: keypad with + − × ÷ (physical keys work on desktop), envelope chips showing what is left after this spend (green fits, red over), note, date chip (Today, Yesterday, pick a date), "Paid in" chip for foreign currency and rate, Save; Cmd+K and Enter keep working |
| Review: to review / approved / dismissed, approve, edit and approve, dismiss with "always ignore payments to X", approve all suggested, duplicates ("Also seen", "Not a duplicate"), rate needed, hints, undo | Review sheet: a card deck for "To review" (swipe right approve, left dismiss; buttons for both plus Edit; envelope pill on the card to change it; cards with no envelope ask for one before approving; hints and duplicate notes on the card; "Approve all suggested" in the header); segmented To review / Approved / Dismissed, where the last two are lists with "Back to review"; undo toast after each decision |
| Analytics: income / spent / net | Insights summary strip under the period chart |
| Spending breakdown (threshold, big vs small split, two donuts, legends with % and % of income, click to hide) | Insights card: threshold button opens a sheet (number field and presets), split bar, segmented Big / Small, one donut, legend rows that hide slices |
| Monthly spending trend (6 months) | Insights period chart's "6 months" view and the "Monthly spending" trend card and page |
| Income vs spending (6 months) | "Income and spending" trend card and page |
| Monthly spend by bucket (legend toggles) | "Spending by envelope" trend card and page (envelope chips; Rent hidden at first) |
| Savings rate trend | "Savings rate" trend card and page |
| Patterns between buckets (signals, confidence, steadier line, show more, watching notes, explanation) | Insights "Patterns" section with the same logic and wording (`src/lib/insights`), "How these work" sheet |
| Investments: summary, holdings (expand, update price), add purchase, sell, activity | Insights investments card opens the Investments page with the same features as today |
| Settings: theme, currency, sync, automatic capture (Android), capture rules, export JSON / CSV, import, reset | Settings sheet, grouped iOS-style; long sections (Sync, Automatic capture, Capture rules) open as pages inside the sheet |
| Update banner (Android) | Stays, restyled as a top banner |
| Currency confirmation, sync choice dialogs | Stay, as sheets |
| Privacy toggle | Home navigation bar and Settings |
| Month picker (previous / next, T for this month) | Month menu in each tab's navigation bar; arrow keys and T keep working on desktop |

## Look

- **Surfaces**: iOS system colours. Light: page `#f2f2f7`, cards `#ffffff`. Dark: page `#000000`, cards `#1c1c1e`, raised `#2c2c2e`. Cards and grouped lists 22 px radius, sheets 30 px top corners.
- **One tint for actions**: indigo, `#5856d6` light / `#5e5ce6` dark (text in dark mode `#9b99ff` for contrast). Envelope colours appear only on envelope icons, dots and their own chart series.
- **Meaning colours**: green for fits, set aside and kept; red for over, overspent and negative; amber for warnings. Each passes 4.5:1 in both themes.
- **Envelope icons**: a coloured rounded square with a white glyph (Lucide), chosen from the envelope's name (rent or home: house; grocery: cart; and so on) with a neutral fallback. No stored icon field.
- **Type**: one family. `-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif`: San Francisco on Apple devices, Inter elsewhere (self-hosted, variable, with optical sizes). Tabular figures for amounts. Large titles 34 px bold, figures up to 62 px. Archivo and IBM Plex are removed.
- **Glass**: the tab bar, Log button surround, navigation bars once content scrolls under them, menus and toasts use a translucent blurred surface.

## Motion and feel

- **Springs**: transitions use spring curves (CSS `linear()` generated from stiffness and damping at startup, with a cubic-bezier fallback): "snappy" for small things, "smooth" for sheets and pages, "bouncy" for the tab lens, switches and toasts.
- **Sheets**: slide up; large ones shrink the app behind them; drag the handle down or flick to dismiss; nested sheets stack.
- **Pages**: pushed pages slide in from the right with the previous page drifting left; swipe from the left edge to go back. Tapping the current tab pops to its root, then scrolls to top.
- **Large titles** collapse into the navigation bar title as you scroll.
- **Numbers** that change (safe to spend, chart figures, left to assign) roll digit by digit.
- **Swipe rows** reveal Delete (left) and Move (right); a long swipe completes the action.
- **Charts** press-and-slide to read a day or month, with a haptic tick per step.
- **Haptics** on Android through `@capacitor/haptics` (selection on picks, light impact on thresholds, success on approve and save); nothing on the web.
- **Android back button** closes the top sheet first, then goes back a page, then leaves the app from a tab root. This may need `@capacitor/app` (not installed yet) or sheets that push a history entry; builder's choice.
- **Reduced motion**: everything above becomes a fade or an instant change.

## Data

- No schema change. Home's card choice and order is one new key in the existing synced `settings` table (for example `homeLayout`, a JSON string), so it follows the owner across devices and goes into backups.
- The big-purchase threshold stays a local, per-session setting as today.
- Charts read real history. Months with no data show as empty, never filled in.

## Desktop

From the `md` breakpoint: the left sidebar returns with the four destinations plus Settings, the Log button sits in the sidebar (Cmd+K still opens it), sheets become centred dialogs, pushed pages are ordinary pages, and content has a readable maximum width. Gestures have mouse equivalents (buttons, hover actions on rows).

## Already on the branch and kept

Safe areas and edge-to-edge drawing, the view-transition page fade, per-page scroll restore, theme-aware status colours and muted text, page titles, the status bar following the theme, the sliding segmented pill, the transition pause on theme switch, and the preview APK pipeline. The overnight tiles, ring and type choices are replaced by this design.

## Left to the builder

- Component structure, file layout and naming; whether sheets, pages and tabs share one navigation layer.
- Whether to keep Chart.js during the transition. The end state uses the app's own SVG chart components (scrubbing, springs and theme tokens are hard to get from Chart.js); the dependency is removed once nothing uses it.
- The order screens are rebuilt in, as long as the app works after each commit.
- Exact spring values, sizes and spacing within the look above.
- How the smoke and axe checks are organised in the repo.

## Calls made without the owner (flag any to change)

1. Work continues on `claude/native-ui`, so the preview APK keeps updating.
2. Fonts change to San Francisco / Inter (the owner didn't object in the concept).
3. Home's layout syncs across devices through `settings`.
4. Charts move to the app's own SVG components; Chart.js goes.
5. `@capacitor/haptics` is added (new Android dependency, built by CI).
6. "Put the rest in" targets the first savings envelope and hides when there is none.
7. Envelope icons are derived from names, not stored.
8. Settings becomes a sheet behind the avatar instead of a tab.
9. For past months, Home shows what was left at the month's end instead of a per-day figure.
10. Spending by envelope starts with Bills hidden (the concept hid only Rent).
