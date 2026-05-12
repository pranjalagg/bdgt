<!-- src/routes/analytics/+page.svelte -->
<script lang="ts">
  import DonutChart from '$lib/components/charts/DonutChart.svelte';
  import BarChart from '$lib/components/charts/BarChart.svelte';
  import LineChart from '$lib/components/charts/LineChart.svelte';
  import { bucketStatuses, monthSnapshots, buckets, transactions, incomes, currentMonthIncome } from '$lib/stores/budgetStore';
  import { centsToDollars, formatCurrency, dollarsToCents } from '$lib/utils/currency';
  import { getMonthKey, formatMonthYear, getPreviousMonthKey } from '$lib/utils/dates';

  let thresholdInput = '500';

  $: thresholdCents = dollarsToCents(parseFloat(thresholdInput) || 500);

  $: allSpendingByCategory = $bucketStatuses
    .filter((s) => s.spent > 0)
    .map((s) => ({
      bucketId: s.bucket.id,
      label: s.bucket.name,
      value: centsToDollars(s.spent),
      cents: s.spent,
      color: s.bucket.color,
    }));

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
    const snapshot = $monthSnapshots.find((s) => s.month === month);
    const spent = snapshot ? Object.values(snapshot.spent).reduce((a, b) => a + b, 0) : 0;
    return centsToDollars(spent);
  });

  $: monthlyIncome = last6Months.map((month) => {
    const snapshot = $monthSnapshots.find((s) => s.month === month);
    return centsToDollars(snapshot?.incomeTotal || 0);
  });

  $: monthLabels = last6Months.map((m) => formatMonthYear(m).split(' ')[0]);
</script>

<div class="space-y-8">
  <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100">Analytics</h1>

  <!-- Monthly Summary -->
  <div class="grid gap-4 sm:grid-cols-3">
    <div class="rounded-lg bg-white p-4 shadow dark:bg-surface-dark">
      <p class="text-sm text-gray-500 dark:text-gray-400">Income</p>
      <p class="text-xl font-bold text-success">{formatCurrency($currentMonthIncome)}</p>
    </div>
    <div class="rounded-lg bg-white p-4 shadow dark:bg-surface-dark">
      <p class="text-sm text-gray-500 dark:text-gray-400">Total Spent</p>
      <p class="text-xl font-bold text-danger">{formatCurrency(totalSpending)}</p>
    </div>
    <div class="rounded-lg bg-white p-4 shadow dark:bg-surface-dark">
      <p class="text-sm text-gray-500 dark:text-gray-400">Net</p>
      <p class="text-xl font-bold" class:text-success={netIncome >= 0} class:text-danger={netIncome < 0}>
        {formatCurrency(netIncome)}
      </p>
    </div>
  </div>

  <!-- Spending Split -->
  {#if allSpendingByCategory.length > 0}
    <div class="rounded-lg bg-white p-4 shadow dark:bg-surface-dark">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 class="font-semibold text-gray-800 dark:text-gray-100">Spending Breakdown</h2>
        <label class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          Threshold:
          <div class="relative">
            <span class="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">$</span>
            <input
              type="text"
              inputmode="numeric"
              bind:value={thresholdInput}
              class="w-24 rounded border border-gray-300 bg-white py-1 pl-6 pr-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-border-dark dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
        </label>
      </div>

      <!-- Percentage Split Bar -->
      {#if totalSpending > 0}
        <div class="mb-6">
          <div class="mb-2 flex justify-between text-sm">
            <span class="font-medium text-gray-700 dark:text-gray-200">Big: {bigPct}% ({formatCurrency(bigTotal)})</span>
            <span class="font-medium text-gray-700 dark:text-gray-200">Small: {smallPct}% ({formatCurrency(smallTotal)})</span>
          </div>
          <div class="flex h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            {#if bigTotal > 0}
              <div class="bg-indigo-500 transition-all" style="width: {bigPct}%" />
            {/if}
            {#if smallTotal > 0}
              <div class="bg-emerald-500 transition-all" style="width: {smallPct}%" />
            {/if}
          </div>
        </div>
      {/if}

      <!-- Two Donut Charts -->
      <div class="grid gap-6 sm:grid-cols-2">
        <!-- Big Purchases -->
        <div>
          <h3 class="mb-3 text-center text-sm font-medium text-indigo-600 dark:text-indigo-400">
            Big Purchases (&ge; ${thresholdInput || '500'})
          </h3>
          {#if bigChartData.length > 0}
            <DonutChart data={bigChartData} showLegend={false} />
            <div class="mt-3 space-y-1">
              {#each bigPurchases as cat (cat.bucketId)}
                {@const pct = bigTotal > 0 ? ((cat.cents / bigTotal) * 100).toFixed(1) : '0.0'}
                <div class="flex items-center gap-2 px-2 py-0.5">
                  <span class="h-2.5 w-2.5 flex-shrink-0 rounded-full" style="background-color: {cat.color}" />
                  <span class="flex-1 text-sm text-gray-700 dark:text-gray-200">{cat.label}</span>
                  <span class="text-sm tabular-nums text-gray-600 dark:text-gray-300">
                    {formatCurrency(cat.cents)} ({pct}%)
                  </span>
                </div>
              {/each}
            </div>
          {:else}
            <p class="py-8 text-center text-sm text-gray-500 dark:text-gray-400">No big purchases</p>
          {/if}
        </div>

        <!-- Small Purchases -->
        <div>
          <h3 class="mb-3 text-center text-sm font-medium text-emerald-600 dark:text-emerald-400">
            Small Purchases (&lt; ${thresholdInput || '500'})
          </h3>
          {#if smallChartData.length > 0}
            <DonutChart data={smallChartData} showLegend={false} />
            <div class="mt-3 space-y-1">
              {#each smallPurchases as cat (cat.bucketId)}
                {@const pct = smallTotal > 0 ? ((cat.cents / smallTotal) * 100).toFixed(1) : '0.0'}
                <div class="flex items-center gap-2 px-2 py-0.5">
                  <span class="h-2.5 w-2.5 flex-shrink-0 rounded-full" style="background-color: {cat.color}" />
                  <span class="flex-1 text-sm text-gray-700 dark:text-gray-200">{cat.label}</span>
                  <span class="text-sm tabular-nums text-gray-600 dark:text-gray-300">
                    {formatCurrency(cat.cents)} ({pct}%)
                  </span>
                </div>
              {/each}
            </div>
          {:else}
            <p class="py-8 text-center text-sm text-gray-500 dark:text-gray-400">No small purchases</p>
          {/if}
        </div>
      </div>
    </div>
  {:else}
    <div class="rounded-lg bg-white p-4 shadow dark:bg-surface-dark">
      <h2 class="mb-4 font-semibold text-gray-800 dark:text-gray-100">Spending Breakdown</h2>
      <p class="py-8 text-center text-gray-500 dark:text-gray-400">No spending data</p>
    </div>
  {/if}

  <div class="grid gap-6 lg:grid-cols-2">
    <div class="rounded-lg bg-white p-4 shadow dark:bg-surface-dark">
      <h2 class="mb-4 font-semibold text-gray-800 dark:text-gray-100">Monthly Spending Trend</h2>
      <BarChart
        labels={monthLabels}
        datasets={[{ label: 'Spending', data: monthlySpending, color: '#ef4444' }]}
      />
    </div>

    <div class="rounded-lg bg-white p-4 shadow dark:bg-surface-dark">
      <h2 class="mb-4 font-semibold text-gray-800 dark:text-gray-100">Income vs Spending</h2>
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
