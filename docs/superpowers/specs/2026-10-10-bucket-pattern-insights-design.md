# Bucket pattern insights: design

Date: 2026-10-10
Status: awaiting review
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
| Not enough data | fewer than 4 | any (no insight shown) |
| Early signal | 4 to 7 | at least 0.5 |
| Likely | 8 to 11 | at least 0.6 |
| Strong | 12 or more | at least 0.6 |

Pairs below the strength threshold for their tier are not returned. At 6 data
points, rank correlation only reaches conventional significance near 0.9, which
is why the lower tiers are named as signals and not findings.

### Output

```
{
  a: BucketRef, b: BucketRef,
  months: number,
  rho: number,
  relation: 'trade-off' | 'move-together',
  steadierBy: number | null,   // percent, only when relation is trade-off
  confidence: 'early' | 'likely' | 'strong',
  series: { months: string[], a: number[], b: number[] }  // cents, for the chart
}
```

Results are ranked by absolute correlation, then by months of data.

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

The strongest 3 show by default with a "Show more" control. Empty states:

- Fewer than 4 complete months, or fewer than two eligible buckets: "Patterns
  appear after 4 complete months of spending in at least two everyday buckets."
- Enough data but nothing clear: "No clear patterns between your buckets yet."

Copy rules: "tends to", never "causes"; always name the number of months.

## Out of scope

Combined limits, bucket groups, notifications, anything that changes a budget,
and the other three insight types. Suggested limits belong to the "better
budgets" slice.

## Testing

Unit tests on fixed data for: a clear trade-off pair, a clear move-together
pair, an unrelated pair, constant spending, tied months, fewer than 4 months, a
bucket added late, refunds, and the tier boundaries. A regression test uses
anonymised monthly numbers shaped like the user's six months and expects
Groceries and Eating Out to come out as an early-signal trade-off with
correlation near -0.57. Then check in the running app at desktop and phone
widths with hide-amounts on and off.

## Build order

1. Engine functions with tests.
2. Insights card and empty states.
3. Info popover and the in-app check.
