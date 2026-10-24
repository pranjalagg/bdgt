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
</script>

<section class="card grid gap-3 p-4" aria-label="This month's plan">
  <button type="button" class="-mx-1 flex items-center justify-between gap-3 rounded-xl px-1 py-1 text-left hover:bg-fill focus:outline-none focus-visible:ring-2 focus-visible:ring-tint" on:click={() => openModal('income')}>
    <span class="text-[15px] text-label-2">Income this month</span>
    <span class="flex items-center gap-1 text-[15px] font-semibold text-label"><span class="money amt">{formatCurrency($currentMonthIncome)}</span><span class="text-label-2"><Icon name="chevron-right" size={16} /></span></span>
  </button>

  <div class="flex h-3 gap-0.5 overflow-hidden rounded-full bg-fill" aria-hidden="true">
    {#each real as s (s.bucket.id)}
      <span class="h-full" style="flex-grow:{s.allocated}; background:{s.bucket.color}"></span>
    {/each}
    {#if left > 0}<span class="hatched h-full" style="flex-grow:{left}"></span>{/if}
  </div>

  <div class="flex items-end justify-between gap-3">
    <div class="min-w-0 flex-1">
      <p class="figure amt text-[28px] {left < 0 ? 'text-danger' : left === 0 ? 'text-success' : 'text-label'}" use:fitText={{ text: left === 0 && $currentMonthIncome > 0 ? 'All assigned' : formatCurrency(Math.abs(left)), max: 28, min: 18 }}>
        {left === 0 && $currentMonthIncome > 0 ? 'All assigned' : formatCurrency(Math.abs(left))}
      </p>
      <p class="mt-1 text-[13px] text-label-2">
        {#if $currentMonthIncome === 0}add income to start the month{:else if left > 0}left to assign{:else if left < 0}assigned beyond your income{:else}Every dollar has a job{/if}
      </p>
    </div>
    <button type="button" class="btn-primary !min-h-[40px] flex-none" on:click={() => openModal($currentMonthIncome === 0 ? 'income' : 'assign')}>
      {$currentMonthIncome === 0 ? 'Add income' : 'Assign'}
    </button>
  </div>

  {#if $totalPercentage > 100}
    <p class="rounded-xl bg-danger/10 px-3 py-2 text-[13px] font-medium text-label" role="alert">
      Percentage envelopes add up to {$totalPercentage}% of income, more than all of it.
    </p>
  {/if}
</section>

<style>
  .hatched {
    background: repeating-linear-gradient(-45deg, rgb(var(--c-fill) / var(--fill-alpha)), rgb(var(--c-fill) / var(--fill-alpha)) 3px, transparent 3px, transparent 6px);
  }
</style>
