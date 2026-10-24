<script lang="ts">
  import { fitText } from '$lib/ui/fit';
  import { bucketStatuses, currentMonthIncome, unallocated, totalPercentage } from '$lib/stores/budgetStore';
  import { openModal } from '$lib/stores/uiStore';
  import { formatCurrency } from '$lib/utils/currency';
  import Icon from '$lib/components/ui/Icon.svelte';

  // The month's plan at a glance: income, how it is split across envelopes
  // (hatched where nothing is assigned yet) and what is left to assign.

  $: real = $bucketStatuses.filter((s) => !s.bucket.isSystem && s.allocated > 0);
  $: left = $unallocated;
  // The label over the figure, in two weights.
  $: heading =
    $currentMonthIncome === 0
      ? ['Left to', 'assign', 'Add income to start the month']
      : left < 0
        ? ['Assigned', 'beyond income', 'Take some back from an envelope']
        : left === 0
          ? ['Every dollar', 'has a job', '']
          : ['Left to', 'assign', ''];
</script>

<section class="grid gap-4 pt-2" aria-label="This month's plan">
  <div>
    <p class="text-[17px] font-semibold text-label">{heading[0]} <span class="font-medium text-label-2">{heading[1]}</span></p>
    <p class="t-figure amt mt-3 {left < 0 ? 'text-danger' : 'text-label'}" use:fitText={{ text: formatCurrency(Math.abs(left)), max: 52, min: 28 }}>
      {formatCurrency(Math.abs(left))}
    </p>
    {#if heading[2]}<p class="mt-2 text-[15px] text-label-2">{heading[2]}</p>{/if}
  </div>

  <div class="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-fill" aria-hidden="true">
    {#each real as s (s.bucket.id)}
      <span class="h-full" style="flex-grow:{s.allocated}; background:{s.bucket.color}"></span>
    {/each}
    {#if left > 0}<span class="hatched h-full" style="flex-grow:{left}"></span>{/if}
  </div>

  <div class="flex items-center justify-between gap-3">
    <button type="button" class="-mx-2 flex min-w-0 items-center gap-1 rounded-full px-2 py-2 text-left text-[15px] focus:outline-none focus-visible:ring-2 focus-visible:ring-tint" on:click={() => openModal('income')}>
      <span class="text-label-2">Income this month</span>
      <span class="money amt font-semibold text-label">{formatCurrency($currentMonthIncome)}</span>
      <span class="text-label-2" aria-hidden="true"><Icon name="chevron-right" size={16} /></span>
    </button>
    <button type="button" class="btn-primary !min-h-[40px] flex-none" on:click={() => openModal($currentMonthIncome === 0 ? 'income' : 'assign')}>
      {$currentMonthIncome === 0 ? 'Add income' : 'Assign'}
    </button>
  </div>

  {#if $totalPercentage > 100}
    <p class="rounded-2xl bg-danger/10 px-4 py-3 text-[13px] font-medium text-label" role="alert">
      Percentage envelopes add up to {$totalPercentage}% of income, more than all of it.
    </p>
  {/if}
</section>

<style>
  .hatched {
    background: repeating-linear-gradient(-45deg, rgb(var(--c-fill) / var(--fill-alpha)), rgb(var(--c-fill) / var(--fill-alpha)) 3px, transparent 3px, transparent 6px);
  }
</style>
