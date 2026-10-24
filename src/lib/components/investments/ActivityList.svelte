<script lang="ts">
  import IconMark from '$lib/components/ui/IconMark.svelte';
  import SectionHeading from '$lib/components/ui/SectionHeading.svelte';
  import { formatCurrency } from '$lib/utils/currency';
  import type { Activity } from '$lib/stores/investmentStore';

  // Purchases and sales, newest first.

  export let activities: Activity[];

  const shares = (n: number) => (n % 1 === 0 ? n.toString() : n.toFixed(4));
  const day = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
</script>

<section aria-labelledby="inv-activity">
  <SectionHeading strong="Activity" id="inv-activity" />
  {#if activities.length === 0}
    <p class="py-6 text-center text-[15px] text-label-2">No activity yet.</p>
  {:else}
    <div class="list">
      {#each activities as a}
        <div class="row">
          <IconMark icon={a.type === 'buy' ? 'arrow-down' : 'arrow-up'} />
          <span class="min-w-0 flex-1">
            <span class="t-row block truncate">{a.type === 'buy' ? 'Bought' : 'Sold'} {shares(a.shares)} {a.symbol}</span>
            <span class="block text-[13px] text-label-2"><span class="amt">{formatCurrency(a.pricePerShare)}</span> each · {day(a.date)}</span>
          </span>
          <span class="money amt flex-none text-[16px] font-semibold {a.type === 'buy' ? 'text-label' : 'text-success'}">{a.type === 'buy' ? '' : '+'}{formatCurrency(a.shares * a.pricePerShare)}</span>
        </div>
      {/each}
    </div>
  {/if}
</section>
