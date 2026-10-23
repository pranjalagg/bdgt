<script lang="ts">
  import { buckets } from '$lib/stores/budgetStore';
  import { formatCurrency } from '$lib/utils/currency';
  import { envelopeIcon } from '$lib/ui/icons';
  import Icon from '$lib/components/ui/Icon.svelte';
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
  class="group-row flex w-full items-center gap-3 px-4 py-3 text-left transition-colors enabled:hover:bg-fill enabled:active:bg-fill focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tint disabled:cursor-default"
  on:click={() => onClick?.()}
>
  <span class="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] text-white" style="background:{bucket?.color ?? '#8e8e93'}">
    <Icon name={bucket ? envelopeIcon(bucket.name, bucket.isSystem) : 'tag'} size={19} strokeWidth={2.2} />
  </span>
  <span class="min-w-0 flex-1">
    <span class="flex items-center gap-1.5">
      <span class="truncate text-[16px] font-medium text-label">{item.note || bucket?.name || 'Recurring'}</span>
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
