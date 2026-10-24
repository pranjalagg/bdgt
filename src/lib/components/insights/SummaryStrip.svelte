<script lang="ts">
  import { currentMonthIncome, currentMonthFixedIncome } from '$lib/stores/budgetStore';
  import { formatCurrency } from '$lib/utils/currency';

  // This month in three numbers. Only the net takes a colour.

  export let spent: number;

  $: net = $currentMonthIncome - spent;
  $: split = $currentMonthFixedIncome > 0 && $currentMonthFixedIncome !== $currentMonthIncome;
  // Whole dollars: three figures share a phone's width.
  const whole = (c: number) => formatCurrency(Math.round(c / 100) * 100).replace(/\.00$/, '');
</script>

<div class="card grid grid-cols-3 divide-x divide-sep py-3.5" aria-label="This month">
  <div class="min-w-0 px-3.5">
    <p class="text-[13px] font-medium text-label-2">Income</p>
    <p class="money amt mt-0.5 truncate text-[17px] font-semibold text-label">{whole($currentMonthIncome)}</p>
    <p class="amt text-[11.5px] leading-snug text-label-2">
      {#if split}{whole($currentMonthFixedIncome)} fixed · {whole($currentMonthIncome - $currentMonthFixedIncome)} variable{:else if $currentMonthIncome > 0}{$currentMonthFixedIncome > 0 ? 'all fixed' : 'all variable'}{:else}none yet{/if}
    </p>
  </div>
  <div class="min-w-0 px-3.5">
    <p class="text-[13px] font-medium text-label-2">Spent</p>
    <p class="money amt mt-0.5 truncate text-[17px] font-semibold text-label">{whole(spent)}</p>
    <p class="text-[11.5px] text-label-2">savings left out</p>
  </div>
  <div class="min-w-0 px-3.5">
    <p class="text-[13px] font-medium text-label-2">Net</p>
    <p class="money amt mt-0.5 truncate text-[17px] font-semibold {net > 0 ? 'text-success' : net < 0 ? 'text-danger' : 'text-label'}">{net > 0 ? '+' : net < 0 ? '−' : ''}{whole(Math.abs(net))}</p>
    <p class="text-[11.5px] text-label-2">{net >= 0 ? 'kept' : 'short'}</p>
  </div>
</div>
