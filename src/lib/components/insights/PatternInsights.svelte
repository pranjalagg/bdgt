<script lang="ts">
  // Which everyday envelopes trade off or rise together, from monthly
  // totals. Only strong-enough pairs get a card and chart; weak leans are
  // one quiet line, so a few months of data never reads as a finding.
  import { buckets, transactions } from '$lib/stores/budgetStore';
  import { today } from '$lib/stores/uiStore';
  import { findBucketRelations, countComparablePairs } from '$lib/insights';
  import { watchingNote } from '$lib/insights/copy';
  import PatternCard from './PatternCard.svelte';

  const VISIBLE = 3;
  const MAX_WATCHING = 2;

  let showAll = false;

  $: all = findBucketRelations($buckets, $transactions, $today);
  $: signals = all.filter((r) => r.confidence !== 'watching');
  $: watching = all.filter((r) => r.confidence === 'watching').slice(0, MAX_WATCHING);
  $: shown = showAll ? signals : signals.slice(0, VISIBLE);
  $: comparable = countComparablePairs($buckets, $transactions, $today);
</script>

<div class="grid gap-2.5" data-patterns>
  {#if signals.length === 0 && watching.length === 0}
    <div class="card px-5 py-8 text-center text-[15px] text-label-2">
      {comparable === 0
        ? 'Patterns appear after 4 complete months of spending in at least two everyday envelopes.'
        : 'No clear patterns between your envelopes yet.'}
    </div>
  {/if}

  {#each shown as r (r.a.id + r.b.id)}
    {#key r.a.id + r.b.id + r.months}<PatternCard relation={r} />{/key}
  {/each}

  {#if signals.length > VISIBLE}
    <button type="button" class="justify-self-start rounded-full px-1 text-[15px] font-medium text-tint focus:outline-none focus-visible:ring-2 focus-visible:ring-tint" aria-expanded={showAll} on:click={() => (showAll = !showAll)}>
      {showAll ? 'Show less' : `Show ${signals.length - VISIBLE} more`}
    </button>
  {/if}

  {#each watching as r (r.a.id + r.b.id)}
    <p class="px-1 text-[13px] text-label-2">{watchingNote(r)}</p>
  {/each}
</div>
