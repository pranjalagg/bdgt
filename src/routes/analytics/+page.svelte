<!-- src/routes/analytics/+page.svelte -->
<script lang="ts">
  import MonthPicker from '$lib/components/shared/MonthPicker.svelte';
  import DonutChart from '$lib/components/charts/DonutChart.svelte';
  import BarChart from '$lib/components/charts/BarChart.svelte';
  import LineChart from '$lib/components/charts/LineChart.svelte';
  import { bucketStatuses, transactions, incomes, currentMonthIncome } from '$lib/stores/budgetStore';
  import { centsToDollars, formatCurrency, dollarsToCents } from '$lib/utils/currency';
  import { getMonthKey, formatMonthYear, getPreviousMonthKey, getMonthRange } from '$lib/utils/dates';

  let thresholdInput = '500';
  let bigDonutChart: DonutChart;
  let smallDonutChart: DonutChart;
  let hiddenBig: Record<number, boolean> = {};
  let hiddenSmall: Record<number, boolean> = {};

  function toggleBig(index: number) {
    bigDonutChart?.toggleVisibility(index);
    hiddenBig[index] = !hiddenBig[index];
    hiddenBig = hiddenBig;
  }

  function toggleSmall(index: number) {
    smallDonutChart?.toggleVisibility(index);
    hiddenSmall[index] = !hiddenSmall[index];
    hiddenSmall = hiddenSmall;
  }

  $: thresholdCents = (() => {
    const n = parseFloat(thresholdInput);
    return dollarsToCents(Number.isFinite(n) ? n : 500);
  })();

  $: allSpendingByCategory = $bucketStatuses
    .filter((s) => s.spent > 0)
    .map((s) => ({
      bucketId: s.bucket.id,
      label: s.bucket.name,
      value: centsToDollars(s.spent),
      cents: s.spent,
      color: s.bucket.color,
    }))
    .sort((a, b) => b.cents - a.cents);

  $: bigPurchases = allSpendingByCategory.filter((s) => s.cents >= thresholdCents);
  $: smallPurchases = allSpendingByCategory.filter((s) => s.cents < thresholdCents);

  $: bigChartData = bigPurchases.map(({ label, value, color }) => ({ label, value, color }));
  $: smallChartData = smallPurchases.map(({ label, value, color }) => ({ label, value, color }));

  $: bigTotal = bigPurchases.reduce((sum, s) => sum + s.cents, 0);
  $: smallTotal = smallPurchases.reduce((sum, s) => sum + s.cents, 0);
  $: totalSpending = bigTotal + smallTotal;

  $: bigPct = totalSpending > 0 ? ((bigTotal / totalSpending) * 100).toFixed(1) : '0.0';
  $: smallPct = totalSpending > 0 ? ((smallTotal / totalSpending) * 100).toFixed(1) : '0.0';

  $: netIncome = $currentMonthIncome - totalSpending;

  $: last6Months = Array.from({ length: 6 }, (_, i) => {
    let month = getMonthKey(new Date());
    for (let j = 0; j < 5 - i; j++) month = getPreviousMonthKey(month);
    return month;
  });

  $: monthlySpending = last6Months.map((month) => {
    const { start, end } = getMonthRange(month);
    const spent = $transactions
      .filter((t) => {
        const date = new Date(t.date);
        return date >= start && date <= end;
      })
      .reduce((sum, t) => sum + t.amount, 0);
    return centsToDollars(spent);
  });

  $: monthlyIncome = last6Months.map((month) => {
    const { start, end } = getMonthRange(month);
    return centsToDollars(
      $incomes
        .filter((i) => {
          const date = new Date(i.date);
          return date >= start && date <= end;
        })
        .reduce((sum, i) => sum + i.amount, 0)
    );
  });

  $: monthLabels = last6Months.map((m) => formatMonthYear(m).split(' ')[0]);
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="page-title">Analytics</h1>
    <MonthPicker />
  </div>

  <!-- Monthly Summary -->
  <div class="grid gap-4 sm:grid-cols-3">
    <div class="card p-5">
      <p class="metric-label">Income</p>
      <p class="metric-value text-success">{formatCurrency($currentMonthIncome)}</p>
    </div>
    <div class="card p-5">
      <p class="metric-label">Total Spent</p>
      <p class="metric-value text-danger">{formatCurrency(totalSpending)}</p>
    </div>
    <div class="card p-5">
      <p class="metric-label">Net</p>
      <p class="metric-value" class:text-success={netIncome >= 0} class:text-danger={netIncome < 0}>
        {formatCurrency(netIncome)}
      </p>
    </div>
  </div>

  <!-- Spending Split -->
  {#if allSpendingByCategory.length > 0}
    <div class="card">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-border-dark">
        <h2 class="section-title">Spending Breakdown</h2>
        <label class="flex items-center gap-2 text-sm text-muted">
          Threshold:
          <div class="relative">
            <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">$</span>
            <input
              type="text"
              inputmode="decimal"
              bind:value={thresholdInput}
              class="w-24 rounded-lg border border-gray-300 bg-white py-1.5 pl-6 pr-2 text-sm transition-shadow focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-border-dark dark:bg-gray-800/50 dark:text-gray-100"
            />
          </div>
        </label>
      </div>

      <div class="p-5">
        <!-- Percentage Split Bar -->
        {#if totalSpending > 0}
          <div class="mb-6">
            <div class="mb-2 flex justify-between text-sm">
              <span class="font-medium text-gray-700 dark:text-gray-200">Big: {bigPct}% ({formatCurrency(bigTotal)})</span>
              <span class="font-medium text-gray-700 dark:text-gray-200">Small: {smallPct}% ({formatCurrency(smallTotal)})</span>
            </div>
            <div class="flex h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700/50">
              {#if bigTotal > 0}
                <div class="bg-indigo-500 transition-all" style="width: {bigPct}%"></div>
              {/if}
              {#if smallTotal > 0}
                <div class="bg-emerald-500 transition-all" style="width: {smallPct}%"></div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Two Donut Charts -->
        <div class="grid gap-6 sm:grid-cols-2">
          <div>
            <h3 class="mb-3 text-center text-sm font-semibold text-indigo-600 dark:text-indigo-400">
              Big Purchases (&ge; ${thresholdInput || '500'})
            </h3>
            {#if bigChartData.length > 0}
              <DonutChart bind:this={bigDonutChart} data={bigChartData} showLegend={false} />
              <div class="mt-3 space-y-1">
                {#each bigPurchases as cat, i (cat.bucketId)}
                  {@const pct = bigTotal > 0 ? ((cat.cents / bigTotal) * 100).toFixed(1) : '0.0'}
                  <button
                    class="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    class:opacity-40={hiddenBig[i]}
                    on:click={() => toggleBig(i)}
                  >
                    <span class="h-2.5 w-2.5 flex-shrink-0 rounded-full" style="background-color: {cat.color}" class:opacity-30={hiddenBig[i]}></span>
                    <span class="flex-1 text-sm text-gray-700 dark:text-gray-200" class:line-through={hiddenBig[i]}>{cat.label}</span>
                    <span class="text-sm tabular-nums text-muted">
                      {formatCurrency(cat.cents)} ({pct}%)
                    </span>
                  </button>
                {/each}
              </div>
            {:else}
              <p class="py-8 text-center text-sm text-muted">No big purchases</p>
            {/if}
          </div>

          <div>
            <h3 class="mb-3 text-center text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              Small Purchases (&lt; ${thresholdInput || '500'})
            </h3>
            {#if smallChartData.length > 0}
              <DonutChart bind:this={smallDonutChart} data={smallChartData} showLegend={false} />
              <div class="mt-3 space-y-1">
                {#each smallPurchases as cat, i (cat.bucketId)}
                  {@const pct = smallTotal > 0 ? ((cat.cents / smallTotal) * 100).toFixed(1) : '0.0'}
                  <button
                    class="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    class:opacity-40={hiddenSmall[i]}
                    on:click={() => toggleSmall(i)}
                  >
                    <span class="h-2.5 w-2.5 flex-shrink-0 rounded-full" style="background-color: {cat.color}" class:opacity-30={hiddenSmall[i]}></span>
                    <span class="flex-1 text-sm text-gray-700 dark:text-gray-200" class:line-through={hiddenSmall[i]}>{cat.label}</span>
                    <span class="text-sm tabular-nums text-muted">
                      {formatCurrency(cat.cents)} ({pct}%)
                    </span>
                  </button>
                {/each}
              </div>
            {:else}
              <p class="py-8 text-center text-sm text-muted">No small purchases</p>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {:else}
    <div class="card">
      <div class="border-b border-gray-100 px-5 py-4 dark:border-border-dark">
        <h2 class="section-title">Spending Breakdown</h2>
      </div>
      <p class="py-12 text-center text-muted">No spending data</p>
    </div>
  {/if}

  <div class="grid gap-6 lg:grid-cols-2">
    <div class="card">
      <div class="border-b border-gray-100 px-5 py-4 dark:border-border-dark">
        <h2 class="section-title">Monthly Spending Trend</h2>
        <p class="mt-0.5 text-xs text-muted">Last 6 months</p>
      </div>
      <div class="p-5">
        <BarChart
          labels={monthLabels}
          datasets={[{ label: 'Spending', data: monthlySpending, color: '#ef4444' }]}
        />
      </div>
    </div>

    <div class="card">
      <div class="border-b border-gray-100 px-5 py-4 dark:border-border-dark">
        <h2 class="section-title">Income vs Spending</h2>
        <p class="mt-0.5 text-xs text-muted">Last 6 months</p>
      </div>
      <div class="p-5">
        <LineChart
          labels={monthLabels}
          datasets={[
            { label: 'Income', data: monthlyIncome, color: '#22c55e' },
            { label: 'Spending', data: monthlySpending, color: '#ef4444' },
          ]}
        />
      </div>
    </div>
  </div>
</div>
