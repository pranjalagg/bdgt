<script lang="ts">
  import PairedBars from '$lib/components/charts/PairedBars.svelte';
  import { headline, confidenceLabel, steadierLine } from '$lib/insights/copy';
  import { parseMonthKey } from '$lib/utils/dates';
  import type { BucketRelation } from '$lib/insights';

  // One pattern between two envelopes: how sure, what it is, and the months
  // side by side.

  export let relation: BucketRelation;

  $: months = relation.series.months.map((m) => parseMonthKey(m).toLocaleDateString('en-US', { month: 'short' }));
</script>

<div class="card grid gap-2 p-4">
  <span class="justify-self-start rounded-full bg-fill px-2.5 py-0.5 text-[13px] font-medium text-label-2">{confidenceLabel(relation)}</span>
  <p class="text-[17px] font-semibold leading-snug text-label">{headline(relation)}</p>
  {#if relation.relation === 'trade-off' && relation.steadierBy !== null}
    <p class="text-[15px] text-label-2">{steadierLine(relation.steadierBy)}</p>
  {/if}
  <div class="mt-1">
    <PairedBars
      a={{ color: relation.a.color, values: relation.series.a }}
      b={{ color: relation.b.color, values: relation.series.b }}
      {months}
      height={96}
      interactive={false}
      label="{relation.a.name} and {relation.b.name} by month"
    />
  </div>
  <div class="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-label-2">
    <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full" style="background:{relation.a.color}" aria-hidden="true"></span>{relation.a.name}</span>
    <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full" style="background:{relation.b.color}" aria-hidden="true"></span>{relation.b.name}</span>
  </div>
</div>
