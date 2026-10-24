<script lang="ts">
  import { base } from '$app/paths';
  import { transactions, buckets } from '$lib/stores/budgetStore';
  import { formatCurrency } from '$lib/utils/currency';
  import { envelopeIcon } from '$lib/ui/icons';
  import IconMark from '$lib/components/ui/IconMark.svelte';
  import SectionHeading from '$lib/components/ui/SectionHeading.svelte';
  import type { Transaction } from '$lib/types';

  // The last few expenses as open rows; tapping one edits it.

  export let onOpen: (t: Transaction) => void;

  $: recent = [...$transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, 4);
  $: byId = new Map($buckets.map((b) => [b.id, b]));
  const day = (d: Date) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
</script>

{#if recent.length}
  <section aria-labelledby="home-recent">
    <SectionHeading strong="Recent" soft="activity" id="home-recent">
      <a slot="action" href="{base}/activity" class="text-[15px] font-medium text-tint">See all</a>
    </SectionHeading>
    <div class="list">
      {#each recent as t (t.id)}
        {@const b = byId.get(t.bucketId)}
        <button type="button" data-row class="row row-tap w-[calc(100%+20px)] focus:outline-none focus-visible:ring-2 focus-visible:ring-tint" on:click={() => onOpen(t)}>
          <IconMark icon={b ? envelopeIcon(b.name, b.isSystem) : 'tag'} />
          <span class="min-w-0 flex-1">
            <span class="t-row block truncate">{t.note || b?.name || 'Expense'}</span>
            <span class="block truncate text-[13px] text-label-2">{b?.name ?? 'Unknown'} · {day(t.date)}</span>
          </span>
          <span class="money amt flex-none text-[16px] font-semibold {b?.isSavings ? 'text-success' : 'text-label'}">{formatCurrency(t.amount)}</span>
        </button>
      {/each}
    </div>
  </section>
{/if}
