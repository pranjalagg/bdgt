<script lang="ts">
  import { base } from '$app/paths';
  import { bucketStatuses } from '$lib/stores/budgetStore';
  import { groupEnvelopes } from '$lib/budget/groups';
  import { formatCurrency } from '$lib/utils/currency';
  import { tileColors } from '$lib/ui/tiles';
  import { fitText } from '$lib/ui/fit';
  import { resolvedTheme } from '$lib/stores/themeStore';
  import SectionHeading from '$lib/components/ui/SectionHeading.svelte';

  // The everyday envelopes as soft tiles in their own colours (as in the
  // owner's references): what is left in each, of what it holds. Text stays
  // in the label colour (red on a tinted tile can fall below 4.5:1), so an
  // overspent tile says "over" in words.

  $: everyday = groupEnvelopes($bucketStatuses).everyday;
  const whole = (c: number) => formatCurrency(c).replace(/\.00$/, '');
</script>

{#if everyday.length}
  <section aria-labelledby="home-envelopes">
    <SectionHeading strong="Your" soft="envelopes" id="home-envelopes">
      <a slot="action" href="{base}/budget" class="text-[15px] font-medium text-tint">See all</a>
    </SectionHeading>
    <div class="scroll-row -mx-5 snap-x snap-mandatory gap-3 px-5 pb-1 sm:-mx-6 sm:px-6" style="scroll-padding: 20px">
      {#each everyday as s (s.bucket.id)}
        {@const available = s.allocated + s.rollover}
        {@const frac = available > 0 ? Math.max(0, Math.min(1, s.remaining / available)) : 0}
        {@const tile = tileColors(s.bucket.color, $resolvedTheme === 'dark')}
        {@const left = (s.remaining < 0 ? '−' : '') + whole(Math.abs(s.remaining))}
        <a href="{base}/budget/{s.bucket.id}" class="tile grid w-[156px] flex-none snap-start content-between gap-6 rounded-card p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-tint" style:background={tile.background} style:color={tile.text}>
          <span class="truncate text-[15px] font-semibold">{s.bucket.name}</span>
          <span class="grid gap-2">
            <span>
              <span class="figure amt block text-[24px]" use:fitText={{ text: left, max: 24, min: 15 }}>{left}</span>
              <span class="amt block text-[12px] font-medium opacity-80">{s.remaining < 0 ? 'over' : `left of ${whole(available)}`}</span>
            </span>
            <span class="block h-1 overflow-hidden rounded-full bg-[rgb(var(--c-label)/0.12)]" aria-hidden="true"><span class="block h-full rounded-full" style="width:{frac * 100}%; background:{s.bucket.color}"></span></span>
          </span>
        </a>
      {/each}
    </div>
  </section>
{/if}
