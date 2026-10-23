<script lang="ts">
  import { savingsRate, savingsRateTrend } from '$lib/stores/budgetStore';
  import { savingsRateDelta } from '$lib/utils/calculations';
  import { formatMonthYear } from '$lib/utils/dates';
  import Icon from '$lib/components/ui/Icon.svelte';

  // How much of this month's income was kept, against last month.

  $: prev = $savingsRateTrend.length >= 2 ? $savingsRateTrend[$savingsRateTrend.length - 2] : null;
  $: delta = prev ? savingsRateDelta($savingsRate, prev.rate) : null;
  $: prevName = prev ? formatMonthYear(prev.month).split(' ')[0] : '';
</script>

<section aria-labelledby="home-rate" class="card grid gap-1 p-4">
  <h2 id="home-rate" class="text-[15px] font-semibold text-label-2">Savings rate</h2>
  <p class="flex items-baseline gap-2">
    <span class="figure amt text-[32px] text-label">{$savingsRate !== null ? `${$savingsRate}%` : '—'}</span>
    {#if delta !== null && delta !== 0}
      <span class="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[13px] font-semibold {delta > 0 ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}">
        <Icon name={delta > 0 ? 'arrow-up' : 'arrow-down'} size={13} strokeWidth={2.4} />{Math.abs(delta)} pts
      </span>
    {/if}
  </p>
  <p class="text-[13px] text-label-2">{$savingsRate !== null ? `of income kept${prevName ? `, against ${prevName}` : ''}` : 'Add income to see this.'}</p>
</section>
