<script lang="ts">
  import { base } from '$app/paths';
  import { bucketStatuses } from '$lib/stores/budgetStore';
  import { groupEnvelopes } from '$lib/budget/groups';
  import { formatCurrency } from '$lib/utils/currency';
  import { envelopeIcon } from '$lib/ui/icons';
  import Icon from '$lib/components/ui/Icon.svelte';

  // The everyday envelopes in a sideways row: what is left in each.

  $: everyday = groupEnvelopes($bucketStatuses).everyday;
  const whole = (c: number) => formatCurrency(c).replace(/\.00$/, '');
</script>

{#if everyday.length}
  <section aria-labelledby="home-envelopes">
    <div class="flex items-baseline justify-between px-1 pb-2.5 pt-1">
      <h2 id="home-envelopes" class="text-[21px] font-bold tracking-tight text-label">Envelopes</h2>
      <a href="{base}/budget" class="text-[15px] font-medium text-tint">See all</a>
    </div>
    <div class="scroll-row -mx-4 snap-x snap-mandatory px-4 pb-1 sm:-mx-6 sm:px-6" style="scroll-padding: 16px">
      {#each everyday as s (s.bucket.id)}
        {@const available = s.allocated + s.rollover}
        {@const frac = available > 0 ? Math.max(0, Math.min(1, s.remaining / available)) : 0}
        <a href="{base}/budget/{s.bucket.id}" class="card grid w-[148px] flex-none snap-start gap-2.5 p-3.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-tint">
          <span class="flex h-9 w-9 items-center justify-center rounded-[11px] text-white" style="background:{s.bucket.color}"><Icon name={envelopeIcon(s.bucket.name)} size={19} strokeWidth={2.2} /></span>
          <span>
            <span class="block truncate text-[14px] font-medium text-label">{s.bucket.name}</span>
            <span class="figure amt block text-[20px] {s.remaining < 0 ? 'text-danger' : 'text-label'}" style="line-height: 1.2">{s.remaining < 0 ? '−' : ''}{whole(Math.abs(s.remaining))}</span>
            <span class="amt block text-[12px] text-label-2">{s.remaining < 0 ? 'over' : `left of ${whole(available)}`}</span>
          </span>
          <span class="block h-1 overflow-hidden rounded-full bg-fill" aria-hidden="true"><span class="block h-full rounded-full" style="width:{frac * 100}%; background:{s.bucket.color}"></span></span>
        </a>
      {/each}
    </div>
  </section>
{/if}
