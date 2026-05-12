<!-- src/routes/analytics/+page.svelte -->
<script lang="ts">
  import DonutChart from '$lib/components/charts/DonutChart.svelte';
  import BarChart from '$lib/components/charts/BarChart.svelte';
  import LineChart from '$lib/components/charts/LineChart.svelte';
  import { bucketStatuses, monthSnapshots, buckets, transactions, incomes, currentMonthIncome } from '$lib/stores/budgetStore';
  import { centsToDollars, formatCurrency } from '$lib/utils/currency';
  import { getMonthKey, formatMonthYear, getPreviousMonthKey } from '$lib/utils/dates';

  let excludedBucketIds: Set<string> = new Set();
  let defaultsInitialized = false;

  $: if (!defaultsInitialized && $buckets.length > 0) {
    const rentBucket = $buckets.find(b => b.name === 'Rent/Mortgage');
    if (rentBucket) {
      excludedBucketIds = new Set([rentBucket.id]);
    }
    defaultsInitialized = true;
  }

  function toggleCategory(bucketId: string) {
    const next = new Set(excludedBucketIds);
    if (next.has(bucketId)) {
      next.delete(bucketId);
    } else {
      next.add(bucketId);
    }
    excludedBucketIds = next;
  }

  $: allSpendingByCategory = $bucketStatuses
    .filter((s) => s.spent > 0)
    .map((s) => ({
      bucketId: s.bucket.id,
      label: s.bucket.name,
      value: centsToDollars(s.spent),
      cents: s.spent,
      color: s.bucket.color,
    }));

  $: spendingByCategory = allSpendingByCategory
    .filter((s) => !excludedBucketIds.has(s.bucketId))
    .map(({ label, value, color }) => ({ label, value, color }));

  $: totalSpending = allSpendingByCategory.reduce((sum, s) => sum + s.cents, 0);

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

  <div class="grid gap-6 lg:grid-cols-2">
    <div class="rounded-lg bg-white p-4 shadow dark:bg-surface-dark">
      <h2 class="mb-4 font-semibold text-gray-800 dark:text-gray-100">Spending by Category</h2>
      {#if allSpendingByCategory.length > 0}
        {#if spendingByCategory.length > 0}
          <DonutChart data={spendingByCategory} showLegend={false} />
        {:else}
          <p class="py-8 text-center text-gray-500 dark:text-gray-400">All categories excluded</p>
        {/if}
        <div class="mt-4 space-y-1.5">
          {#each allSpendingByCategory as cat (cat.bucketId)}
            {@const pct = totalSpending > 0 ? ((cat.cents / totalSpending) * 100).toFixed(1) : '0.0'}
            {@const excluded = excludedBucketIds.has(cat.bucketId)}
            <label
              class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 transition hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <input
                type="checkbox"
                checked={!excluded}
                on:change={() => toggleCategory(cat.bucketId)}
                class="sr-only"
              />
              <span
                class="h-3 w-3 flex-shrink-0 rounded-full border-2 transition {excluded ? 'border-gray-300 bg-transparent dark:border-gray-600' : ''}"
                style={excluded ? '' : `background-color: ${cat.color}; border-color: ${cat.color}`}
              />
              <span class="flex-1 text-sm {excluded ? 'text-gray-400 line-through dark:text-gray-500' : 'text-gray-700 dark:text-gray-200'}">
                {cat.label}
              </span>
              <span class="text-sm tabular-nums {excluded ? 'text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-300'}">
                {formatCurrency(cat.cents)} ({pct}%)
              </span>
            </label>
          {/each}
        </div>
      {:else}
        <p class="py-8 text-center text-gray-500 dark:text-gray-400">No spending data</p>
      {/if}
    </div>

    <div class="rounded-lg bg-white p-4 shadow dark:bg-surface-dark">
      <h2 class="mb-4 font-semibold text-gray-800 dark:text-gray-100">Monthly Spending Trend</h2>
      <BarChart
        labels={monthLabels}
        datasets={[{ label: 'Spending', data: monthlySpending, color: '#ef4444' }]}
      />
    </div>

    <div class="rounded-lg bg-white p-4 shadow dark:bg-surface-dark lg:col-span-2">
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
