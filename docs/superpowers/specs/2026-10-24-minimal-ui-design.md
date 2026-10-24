# Quieter, more minimal design language: design

Date: 2026-10-24. Branch: `claude/minimal-ui`, from `claude/native-ui` at `fbac752`.

## Why

The owner tested the mobile-first redesign and liked it. It still feels cluttered and less minimalist than they want: the coloured rounded icon squares on almost every row, many boxed lists, pills and chips. They shared three reference designs (two dark finance apps, one light) and named what they like in them: **white space used well**. They also asked for a look at current app design. Reviews of 2026 apps praise Copilot Money, and the patterns that recur are whitespace as structure, a large confident figure first, and calm card-based layouts.

## Decisions taken with the owner (2026-10-24)

- **Themes:** light and dark are equal and follow the phone.
- **Font:** Manrope, bundled with the app. The owner half agreed and may go back to the system font later, so the font is one token that is easy to swap.
- **Tab bar:** keeps its labels and becomes slimmer.
- **Preview app:** the Android workflow also builds this branch into the `android-preview` release (the "bdgt preview" app). `android-latest` is never touched.
- **Scope:** same features and screens. Nothing that works today may be lost. What changes is visual density, icons, spacing and type.

## What the references teach (the design language)

1. **Space separates, lines do not.** Wider page margins (20 px), and more room between sections (about 36 px) and between rows. Lists sit on the page instead of inside boxed grouped lists, with no hairlines between rows.
2. **One large figure per screen.** The figure is in heavy weight. The cents are half size and in the secondary colour ("$8,822.89"). Everything else on the screen is quieter.
3. **Colour is rare and means something.** Icons are plain outlines in neutral circles. Colour stays for:
   - the one accent: indigo, for actions and the selected state;
   - an envelope's own colour on its progress bar, its chart series and soft-tinted category tiles;
   - green for good and red for over.
4. **Quiet type with two weights in a heading.** Section headings pair a strong word with a soft one: "Spending **October**", "Everyday **envelopes**". Labels are secondary colour. Fewer pills, badges and chips.
5. **Soft charts.** Bars are pale; the bar that matters (today, the current month, the one under your finger) is the accent, with its value in a small bubble above it. Spending this month shows as one segmented bar.
6. **Few things per screen.** Each screen does one job, and the rest is one tap away. Cards are used sparingly, for things that are one object: a Review payment, an envelope tile, a chart.

## The look, concretely

- **Type:** Manrope (variable, self-hosted through `@fontsource-variable/manrope`), with tabular figures for every amount. Scale:
  - figure: 52 px, weight 700;
  - large title: 30 px, weight 700;
  - section heading: 20 px, strong word at 700 and soft word at 500 in the secondary colour;
  - row title: 16 px at 600;
  - body: 15 px;
  - caption: 13 px in the secondary colour.
- **Colour:** the existing tokens (`--c-*`), with the same tint and meaning colours.
  - Dark mode moves from true black to a soft charcoal, as in the references: page `#0f0f11`, surface `#1b1b1e`, raised `#26262a`.
  - Light mode keeps a near-white grey page with white cards.
  - Every text pair is re-measured at 4.5:1 or more.
- **Icons:** Lucide outlines at 1.75 stroke, in 44 px neutral circles (`fill` background, label-colour icon). Envelope colour is never the icon's background.
- **Surfaces:** cards have a 24 px radius, no border, a very soft shadow in light mode and none in dark mode. Sheets keep 30 px corners.
- **Spacing:** 20 px page gutter, 36 px between sections, 64 px minimum list row.
- **Motion:** unchanged (springs, reduced-motion fades).

## Screens

- **Home:**
  - Hero: "Safe to spend **today**", the figure, then one quiet line with the plan pill and "$2,110 left · 9 days".
  - Pace chart: softer.
  - Cards:
    - Envelopes become soft-tinted category tiles (envelope colour at low strength, dark text), as in reference 1.
    - Recent becomes open rows.
    - Review becomes one quiet card.
- **Budget:**
  - Summary: the "left to assign" figure, a segmented bar of the month's assignments, and Assign.
  - Envelope groups: open rows with a neutral icon, "spent of assigned" and a thin bar in the envelope's colour, with the amount left on the right.
  - Envelope page and Bills follow the same language.
- **Activity:** a quiet search field, and text-only filter chips (the selected one filled). Day headings are small and grey, over open rows. Swipe actions are kept.
- **Log:** the number pad stays. Envelope chips become neutral pills that show the envelope's colour as a dot.
- **Review:** the deck stays; the cards become quieter, with neutral icon marks.
- **Insights:**
  - The period figure with soft bars and a value bubble.
  - The summary as three plain figures (no card).
  - Where it went as open rows with thin bars.
  - The big/small card and the trend cards quieter.
  - Patterns and Investments in the same language.
- **Settings:** still grouped (the iOS convention for settings), but with neutral icons instead of coloured squares.
- **Tab bar and navigation bar:** a slimmer floating tab bar with small labels. The navigation bar keeps today's fixed behaviour; its round avatar button becomes neutral.

## Must stay true

- Every feature and every test that guards one.
- Hide amounts blurs every figure.
- Text contrast is 4.5:1 or more in both themes.
- Works at 320 px wide.
- Reduced motion fades only.
- The bar and history fixes from 2026-10-24 stay.
- After every step: `npx vitest run`, `npm run check`, `npm run ui:smoke`, `npm run ui:a11y` (and `ui:shots` for a look).

## Left to the builder

Exact paddings, which hero lines move behind a tap, chart colours within the rules above, and whether a screen uses a card or open rows where the references do not say. Each call goes in the plan's ledger as a ruling.
