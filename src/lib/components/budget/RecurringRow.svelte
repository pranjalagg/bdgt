<script lang="ts">
  import { buckets } from '$lib/stores/budgetStore';
  import { formatCurrency } from '$lib/utils/currency';
  import { envelopeIcon } from '$lib/ui/icons';
  import IconMark from '$lib/components/ui/IconMark.svelte';
  import type { RecurringTransaction } from '$lib/types';

  // A bill or subscription: what it is, its envelope and how often, the
  // amount and when it is next due. Paused ones say so.

  export let item: RecurringTransaction;
  export let onClick: (() => void) | null = null;

  const FREQUENCY: Record<RecurringTransaction['frequency'], string> = { weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly' };
  $: bucket = $buckets.find((b) => b.id === item.bucketId);
  $: due = new Date(item.nextDueDate);
  $: dueText = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(due.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) });
</script>

<button
  type="button"
  data-row
  disabled={!onClick}
  class="row row-tap focus:outline-none focus-visible:ring-2 focus-visible:ring-tint disabled:cursor-default disabled:hover:bg-transparent"
  on:click={() => onClick?.()}
>
  <IconMark icon={bucket ? envelopeIcon(bucket.name, bucket.isSystem) : 'tag'} dot={bucket && !bucket.isSystem ? bucket.color : null} />
  <span class="min-w-0 flex-1">
    <span class="flex items-center gap-1.5">
      <span class="t-row truncate">{item.note || bucket?.name || 'Recurring'}</span>
      {#if !item.isActive}<span class="tag flex-none">Paused</span>{/if}
    </span>
    <span class="block truncate text-[13px] text-label-2">{bucket?.name ?? 'Unknown'} · {FREQUENCY[item.frequency] ?? item.frequency}</span>
  </span>
  <span class="flex-none text-right">
    <span class="money amt block text-[16px] font-semibold text-label">{formatCurrency(item.amount)}</span>
    <span class="block text-[12px] text-label-2">{item.isActive ? 'Due' : 'Was due'} {dueText}</span>
  </span>
</button>

<style>
  .tag {
    border-radius: 6px;
    padding: 2px 6px;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    background: rgb(var(--c-fill) / var(--fill-alpha));
    color: rgb(var(--c-label-2));
  }
</style>
