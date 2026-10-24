<script lang="ts">
  import Icon from '$lib/components/ui/Icon.svelte';
  import { formatCurrency } from '$lib/utils/currency';
  import type { Activity } from '$lib/stores/investmentStore';

  // Purchases and sales, newest first.

  export let activities: Activity[];

  const shares = (n: number) => (n % 1 === 0 ? n.toString() : n.toFixed(4));
  const day = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
</script>

<section aria-labelledby="inv-activity">
  <h2 id="inv-activity" class="px-1 pb-1.5 text-[13px] font-medium uppercase tracking-wide text-label-2">Activity</h2>
  {#if activities.length === 0}
    <div class="card px-5 py-8 text-center text-[15px] text-label-2">No activity yet.</div>
  {:else}
    <div class="group">
      {#each activities as a}
        <div class="group-row flex items-center gap-3 px-4 py-3" style="--row-inset: 64px">
          <span class="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] text-white {a.type === 'buy' ? 'bg-[#3b82f6]' : 'bg-[#1d9a4f]'}" aria-hidden="true">
            <Icon name={a.type === 'buy' ? 'arrow-down' : 'arrow-up'} size={19} strokeWidth={2.2} />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[16px] font-medium text-label">{a.type === 'buy' ? 'Bought' : 'Sold'} {shares(a.shares)} {a.symbol}</span>
            <span class="block text-[13px] text-label-2"><span class="amt">{formatCurrency(a.pricePerShare)}</span> each · {day(a.date)}</span>
          </span>
          <span class="money amt flex-none text-[16px] font-semibold {a.type === 'buy' ? 'text-label' : 'text-success'}">{a.type === 'buy' ? '' : '+'}{formatCurrency(a.shares * a.pricePerShare)}</span>
        </div>
      {/each}
    </div>
  {/if}
</section>
