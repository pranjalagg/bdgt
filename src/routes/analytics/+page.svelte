<!-- src/routes/analytics/+page.svelte -->
<script lang="ts">
  import DonutChart from '$lib/components/charts/DonutChart.svelte';
  import BarChart from '$lib/components/charts/BarChart.svelte';
  import LineChart from '$lib/components/charts/LineChart.svelte';
  import { bucketStatuses, monthSnapshots, buckets, transactions, incomes } from '$lib/stores/budgetStore';
  import { centsToDollars } from '$lib/utils/currency';
  import { getMonthKey, formatMonthYear, getPreviousMonthKey } from '$lib/utils/dates';

  $: spendingByCategory = $bucketStatuses
    .filter((s) => s.spent > 0)
    .map((s) => ({
      label: s.bucket.name,
      value: centsToDollars(s.spent),
      color: s.bucket.color,
    }));

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

  <div class="grid gap-6 lg:grid-cols-2">
    <div class="rounded-lg bg-white p-4 shadow dark:bg-surface-dark">
      <h2 class="mb-4 font-semibold text-gray-800 dark:text-gray-100">Spending by Category</h2>
      {#if spendingByCategory.length > 0}
        <DonutChart data={spendingByCategory} />
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
