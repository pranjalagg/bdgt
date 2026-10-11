<script lang="ts">
  // Which everyday buckets trade off or rise together, from monthly totals.
  // Only strong-enough pairs get a row and chart; weak leans are one quiet
  // line, so a few months of data never reads as a finding.
  import { buckets, transactions } from '$lib/stores/budgetStore';
  import { today } from '$lib/stores/uiStore';
  import { findBucketRelations, countComparablePairs } from '$lib/insights';
  import { headline, watchingNote, confidenceLabel, steadierLine } from '$lib/insights/copy';
  import { formatMonthYear } from '$lib/utils/dates';
  import { centsToDollars } from '$lib/utils/currency';
  import BarChart from '$lib/components/charts/BarChart.svelte';
  import InfoPopover from '$lib/components/shared/InfoPopover.svelte';

  const VISIBLE = 3;
  const MAX_WATCHING = 2;

  let showAll = false;

  $: all = findBucketRelations($buckets, $transactions, $today);
  $: signals = all.filter((r) => r.confidence !== 'watching');
  $: watching = all.filter((r) => r.confidence === 'watching').slice(0, MAX_WATCHING);
  $: shown = showAll ? signals : signals.slice(0, VISIBLE);
  $: comparable = countComparablePairs($buckets, $transactions, $today);

  const monthLabel = (m: string) => formatMonthYear(m).split(' ')[0].slice(0, 3);
</script>

<div class="card">
  <div class="flex items-center gap-1.5 border-b border-gray-100 px-5 py-4 dark:border-border-dark">
    <h2 class="section-title">Patterns between buckets</h2>
    <InfoPopover label="How patterns are found">
      <p class="font-medium text-gray-900 dark:text-gray-50">How these are found</p>
      <p>
        Each pair of everyday buckets is compared month by month: do the months where one is high tend to be the
        months where the other is low (or high too)? Rent, subscriptions, savings and one-off buckets are left out.
      </p>
      <p>
        It compares which months were high or low, not by how much, so one unusual month can't create a pattern on
        its own. With only a few months of history, a lean is shown as "watching" and not as a finding.
      </p>
      <p class="text-muted dark:text-muted-dark">It describes what happened. It can't tell you why.</p>
    </InfoPopover>
  </div>

  <div class="space-y-5 p-5">
    {#if signals.length === 0 && watching.length === 0}
      <p class="py-6 text-center text-sm text-muted dark:text-muted-dark">
        {comparable === 0
          ? 'Patterns appear after 4 complete months of spending in at least two everyday buckets.'
          : 'No clear patterns between your buckets yet.'}
      </p>
    {/if}

    {#each shown as r (r.a.id + r.b.id)}
      <div class="space-y-2">
        <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p class="text-[13.5px] font-medium text-gray-900 dark:text-gray-100">{headline(r)}</p>
          <span class="rounded-full border border-border px-2 py-0.5 text-[11.5px] text-muted dark:border-border-dark dark:text-muted-dark">
            {confidenceLabel(r)}
          </span>
        </div>
        {#if r.relation === 'trade-off' && r.steadierBy !== null}
          <p class="text-[12.5px] text-muted dark:text-muted-dark">{steadierLine(r.steadierBy)}</p>
        {/if}
        {#key r.a.id + r.b.id + r.months}
          <BarChart
            labels={r.series.months.map(monthLabel)}
            datasets={[
              { label: r.a.name, data: r.series.a.map(centsToDollars), color: r.a.color },
              { label: r.b.name, data: r.series.b.map(centsToDollars), color: r.b.color },
            ]}
          />
        {/key}
      </div>
    {/each}

    {#if signals.length > VISIBLE}
      <button
        type="button"
        class="rounded text-[13px] font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-expanded={showAll}
        on:click={() => (showAll = !showAll)}
      >
        {showAll ? 'Show less' : `Show ${signals.length - VISIBLE} more`}
      </button>
    {/if}

    {#if watching.length > 0}
      <ul class="space-y-1 border-t border-gray-100 pt-4 dark:border-border-dark">
        {#each watching as r (r.a.id + r.b.id)}
          <li class="text-[12.5px] text-muted dark:text-muted-dark">{watchingNote(r)}</li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
