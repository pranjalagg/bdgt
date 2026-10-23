<script lang="ts">
  import { base } from '$app/paths';
  import { transactions, buckets } from '$lib/stores/budgetStore';
  import { formatCurrency } from '$lib/utils/currency';
  import { envelopeIcon } from '$lib/ui/icons';
  import Icon from '$lib/components/ui/Icon.svelte';
  import type { Transaction } from '$lib/types';

  // The last few expenses; tapping one edits it.

  export let onOpen: (t: Transaction) => void;

  $: recent = [...$transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, 4);
  $: byId = new Map($buckets.map((b) => [b.id, b]));
  const day = (d: Date) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
</script>

{#if recent.length}
  <section aria-labelledby="home-recent">
    <div class="flex items-baseline justify-between px-1 pb-2.5 pt-1">
      <h2 id="home-recent" class="text-[21px] font-bold tracking-tight text-label">Recent</h2>
      <a href="{base}/activity" class="text-[15px] font-medium text-tint">See all</a>
    </div>
    <div class="group">
      {#each recent as t (t.id)}
        {@const b = byId.get(t.bucketId)}
        <button type="button" data-row class="group-row flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-fill focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tint" on:click={() => onOpen(t)}>
          <span class="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] text-white" style="background:{b?.color ?? '#8e8e93'}"><Icon name={b ? envelopeIcon(b.name, b.isSystem) : 'tag'} size={19} strokeWidth={2.2} /></span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[16px] font-medium text-label">{t.note || b?.name || 'Expense'}</span>
            <span class="block truncate text-[13px] text-label-2">{day(t.date)} · {b?.name ?? 'Unknown'}</span>
          </span>
          <span class="money amt flex-none text-[16px] font-semibold {b?.isSavings ? 'text-success' : 'text-label'}">{formatCurrency(t.amount)}</span>
        </button>
      {/each}
    </div>
  </section>
{/if}
