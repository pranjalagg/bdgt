# Bucket pattern insights: design

Date: 2026-10-10
Status: approved; amended 2026-10-10 to add the Watching tier after the worked example showed the original example was below the cutoff
Branch: `feat/bucket-pattern-insights`

## Purpose

The app should tell the user things about their spending that they did not
tell it. First case: two buckets trade off. A month heavy on Eating Out tends
to be light on Groceries, so judging each bucket alone is misleading.

Insights are for four jobs, built one slice at a time:

1. Patterns between buckets (**this spec**)
2. Understanding past months (why a savings rate or spend looked odd)
3. Steering the current month (pacing, related buckets together)
4. Better budgets (suggested amounts)

All four share a foundation: an insights engine that runs only on the
user's own history, on their device, and states how much it can trust each
finding. This spec covers the foundation plus slice 1.

## Constraints

- Local only. No server, nothing leaves the browser. Nothing is stored; results
  are recomputed when the page opens.
- Little data (about 6 months at time of writing). The engine must say "early
  signal" instead of presenting noise as a finding.
- The user batch-logs, and past months default to the 1st of the month, so dates
  inside a month carry no information. Only monthly totals are used.
- Money is integer cents everywhere. Month keys are `YYYY-MM`.
- The hide-amounts rule must keep working: insight text uses percentages and
  bucket names, not dollar amounts; charts are blurred by the existing rule.

## Engine

New folder `src/lib/insights/` of pure functions with no database or UI
dependencies.

| File | Responsibility |
|---|---|
| `monthlySeries.ts` | Build bucket x month totals from transactions |
| `relations.ts` | Rank correlation and the steadier-together measure for a pair |
| `confidence.ts` | Map (months, strength) to a confidence tier |
| `index.ts` | `findBucketRelations(buckets, transactions, now)` returning ranked results |

### Input

- Monthly totals per bucket (cents, refunds negative) over the last 12
  complete months. The current partial month is excluded.
- Eligible buckets: not savings (`isSavings`), not system (`isSystem`), and
  everyday (`isEveryday`). A bucket needs spend in at least 4 months of the
  window.
- A bucket with 3 or more empty complete months in a row at the end of the
  window is treated as no longer in use, and the pair ends where it did. A
  shorter gap counts as real zero-spend months.
- For a pair, the window starts at the first month in which both buckets could
  have spent (the later of their first months with activity), so a bucket added
  late is compared only over the months it existed.

### Measures per pair

- **Rank correlation (Spearman)** of the two monthly series. Ties get averaged
  ranks. Negative means trade-off, positive means they move together. A series
  with no variation is skipped (no result).
- **Steadiness:** `combinedSd / sqrt(sdA^2 + sdB^2)`. Below 1 means the two
  offset each other. Reported as "X% steadier than if independent" when below 1.

### Confidence tiers

| Tier | Months | Strength (absolute correlation) |
|---|---|---|
| Not enough data | fewer than 4 | any (nothing shown) |
| Early signal | 4 to 7 | at least 0.5 |
| Likely | 8 to 11 | at least 0.6 |
| Strong | 12 or more | at least 0.6 |
| Watching | 4 or more | at least 0.3 but below the tier's cutoff above |

A pair is only shown as early, likely or strong if it is also stable: with any
single month left out, the correlation keeps its sign and still meets the
tier's cutoff. Rank correlation ignores how big a spike is, but a month that
changes rank can still create or flip a relation, so an unstable pair is
shown as Watching instead.

Pairs below 0.3 are not returned. At 6 data points, rank correlation only
reaches conventional significance near 0.9, which is why even the top tiers at
low month counts are named as signals and not findings. "Watching" pairs lean
one way but are not reliable; they are shown only as a quiet one-line note and
become a real insight automatically if more data strengthens them.

Worked example (the author's first six months, rank correlation): Groceries
against Eating Out is -0.37, so it is **Watching**, not an early signal. The
plain correlation of -0.57 quoted during design is not what the engine uses,
and dropping September alone erases the pattern, which is exactly the fragility
the Watching tier is for.

### Output

```
{
  a: BucketRef, b: BucketRef,
  months: number,
  rho: number,
  relation: 'trade-off' | 'move-together',
  steadierBy: number | null,   // percent, only when relation is trade-off
  confidence: 'early' | 'likely' | 'strong' | 'watching',
  series: { months: string[], a: number[], b: number[] }  // cents, for the chart
}
```

Results are ranked by absolute correlation, then by months of data. `steadierBy`
is computed for every trade-off, including Watching ones, but the UI only shows
it for early, likely and strong.

## Presentation

A "Patterns between buckets" card on the Insights page, below the existing
charts. The dashboard is unchanged in this slice.

Each result is a row:

- A sentence that does not claim cause: "When Eating Out is high, Groceries
  tends to be low." For positive relations: "Eating Out and Fun tend to rise
  together."
- A confidence chip: "Early signal, 6 months".
- A side-by-side bar chart of the two buckets by month, using the existing
  chart component.
- For trade-offs with `steadierBy`: "Together they vary 18% less than
  separately. A combined budget may fit better than two separate ones."
- An info popover (existing `InfoPopover`) explaining how it was worked out.

The strongest 3 (early, likely and strong only) show by default with a "Show
more" control. Watching pairs appear below them as quiet one-line notes with no
chart, at most 2: "Eating Out and Groceries lean opposite, but 6 months isn't
enough to be sure." Empty states:

- Fewer than 4 complete months, or fewer than two eligible buckets: "Patterns
  appear after 4 complete months of spending in at least two everyday buckets."
- Enough data but nothing clear (and no Watching pairs): "No clear patterns
  between your buckets yet."

Copy rules: "tends to", never "causes"; always name the number of months.

## Out of scope

Combined limits, bucket groups, notifications, anything that changes a budget,
and the other three insight types. Suggested limits belong to the "better
budgets" slice.

## Testing

Unit tests on fixed data for: a clear trade-off pair, a clear move-together
pair, an unrelated pair, constant spending, tied months, fewer than 4 months, a
bucket added late, refunds, the tier boundaries, and the Watching band edges (0.3 and each tier's cutoff). A regression test uses
anonymised monthly numbers shaped like the user's six months and expects
Groceries and Eating Out to come out as a Watching trade-off with rank
correlation near -0.37, and a second test shows the fragility: with September
removed the same pair has no pattern at all. Then check in the running app at desktop and phone
widths with hide-amounts on and off.

## Build order

1. Engine functions with tests.
2. Insights card and empty states.
3. Info popover and the in-app check.
