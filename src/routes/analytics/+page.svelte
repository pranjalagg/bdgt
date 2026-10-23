<!-- src/routes/analytics/+page.svelte -->
<script lang="ts">
  import MonthPicker from '$lib/components/shared/MonthPicker.svelte';
  import SectionTabs from '$lib/components/shared/SectionTabs.svelte';
  import DonutChart from '$lib/components/charts/DonutChart.svelte';
  import BarChart from '$lib/components/charts/BarChart.svelte';
  import LineChart from '$lib/components/charts/LineChart.svelte';
  import PatternInsights from '$lib/components/insights/PatternInsights.svelte';
  import { buckets, bucketStatuses, transactions, incomes, currentMonthIncome, currentMonthFixedIncome, savingsRateTrend } from '$lib/stores/budgetStore';
  import { currentMonthKey } from '$lib/stores/uiStore';
  import { spentExcludingSavings, monthlyBucketSpend } from '$lib/utils/calculations';
  import { centsToDollars, formatCurrency, dollarsToCents, currencySymbol, symbolPadding } from '$lib/utils/currency';
  import { getMonthKey, formatMonthYear, getPreviousMonthKey, getMonthRange, getLast6Months } from '$lib/utils/dates';

  let thresholdInput = '500';
  let bigDonutChart: DonutChart;
  let smallDonutChart: DonutChart;
  let hiddenBig: Record<string, boolean> = {};
  let hiddenSmall: Record<string, boolean> = {};

  $: { bigPurchases; hiddenBig = {}; }
  $: { smallPurchases; hiddenSmall = {}; }

  function toggleBig(bucketId: string, index: number) {
    bigDonutChart?.toggleVisibility(index);
    hiddenBig = { ...hiddenBig, [bucketId]: !hiddenBig[bucketId] };
  }

  function toggleSmall(bucketId: string, index: number) {
    smallDonutChart?.toggleVisibility(index);
    hiddenSmall = { ...hiddenSmall, [bucketId]: !hiddenSmall[bucketId] };
  }

  $: thresholdCents = (() => {
    const n = parseFloat(thresholdInput);
    return dollarsToCents(Number.isFinite(n) ? n : 500);
  })();

  $: savingsBucketIds = new Set($buckets.filter((b) => b.isSavings).map((b) => b.id));

  // Money moved into a savings/investment bucket is saved, not spent --
  // it must not count toward any "spend" figure on this page.
  $: allSpendingByCategory = $bucketStatuses
    .filter((s) => s.spent > 0 && !s.bucket.isSavings)
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

  $: last6Months = getLast6Months($currentMonthKey);

  $: monthlySpending = last6Months.map((month) => {
    const { start, end } = getMonthRange(month);
    const monthTransactions = $transactions.filter((t) => {
      const date = new Date(t.date);
      return date >= start && date <= end;
    });
    return centsToDollars(spentExcludingSavings(monthTransactions, savingsBucketIds));
  });

  $: bucketSpendSeries = monthlyBucketSpend($buckets.filter((b) => !b.isSavings), $transactions, last6Months).map((s) => ({
    label: s.label,
    color: s.color,
    data: s.data.map(centsToDollars),
  }));

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

  $: savingsRateData = $savingsRateTrend.map(m => m.rate ?? 0);
  $: savingsRateLabels = $savingsRateTrend.map(m => formatMonthYear(m.month).split(' ')[0]);
</script>

<div class="space-y-6">
  <SectionTabs tabs={[{ href: '/analytics', label: 'Analytics' }, { href: '/investments', label: 'Investments' }]} />

  <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
    <h1 class="page-title">Analytics</h1>
    <MonthPicker />
  </div>

  <!-- Monthly summary: a statement on phones (label left, figure right),
       three figures side by side on wider screens. Income and spending are
       ink; only the net takes a colour, green when positive, red when not. -->
  <div class="card grid divide-y divide-border dark:divide-border-dark sm:grid-cols-3 sm:divide-x sm:divide-y-0">
    <div class="flex items-baseline justify-between gap-3 px-5 py-3.5 sm:block sm:py-5">
      <p class="metric-label">Income</p>
      <div class="text-right sm:text-left">
        <p class="money amt text-[17px] font-semibold text-gray-950 dark:text-white sm:display sm:text-2xl">{formatCurrency($currentMonthIncome)}</p>
        {#if $currentMonthFixedIncome > 0 && $currentMonthFixedIncome !== $currentMonthIncome}
          <p class="mt-0.5 text-xs text-muted dark:text-muted-dark">
            <span class="money amt">{formatCurrency($currentMonthFixedIncome)}</span> fixed &middot;
            <span class="money amt">{formatCurrency($currentMonthIncome - $currentMonthFixedIncome)}</span> variable
          </p>
        {/if}
      </div>
    </div>
    <div class="flex items-baseline justify-between gap-3 px-5 py-3.5 sm:block sm:py-5">
      <p class="metric-label">Spent</p>
      <p class="money amt text-[17px] font-semibold text-gray-950 dark:text-white sm:display sm:text-2xl">{formatCurrency(totalSpending)}</p>
    </div>
    <div class="flex items-baseline justify-between gap-3 px-5 py-3.5 sm:block sm:py-5">
      <p class="metric-label">Net</p>
      <p
        class="money amt text-[17px] font-semibold sm:display sm:text-2xl
               {netIncome > 0 ? 'text-success dark:text-success-light' : netIncome < 0 ? 'text-danger dark:text-danger-light' : 'text-gray-950 dark:text-white'}"
      >
        {formatCurrency(netIncome)}
      </p>
    </div>
  </div>

  <!-- Spending Split -->
  {#if allSpendingByCategory.length > 0}
    <div class="card">
      <div class="flex flex-wrap items-center justify-between gap-3 px-5 pb-1 pt-5">
        <h2 class="section-title">Spending Breakdown</h2>
        <label class="flex items-center gap-2 text-sm text-muted">
          Threshold:
          <div class="relative">
            <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted dark:text-muted-dark">{currencySymbol()}</span>
            <input
              type="text"
              inputmode="decimal"
              bind:value={thresholdInput}
              style:padding-left={symbolPadding(1.5)}
              class="input-base money !w-28 !min-h-[2.5rem] !py-1.5 pl-6"
            />
          </div>
        </label>
      </div>

      <div class="p-5">
        <!-- Percentage Split Bar -->
        {#if totalSpending > 0}
          <div class="mb-6">
            <div class="mb-2 flex justify-between text-sm">
              <span class="flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-200"><span class="h-2.5 w-2.5 flex-none rounded-full bg-primary" aria-hidden="true"></span><span>Big: {bigPct}% (<span class="amt">{formatCurrency(bigTotal)}</span>)</span></span>
              <span class="flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-200"><span class="h-2.5 w-2.5 flex-none rounded-full bg-gray-400 dark:bg-gray-500" aria-hidden="true"></span><span>Small: {smallPct}% (<span class="amt">{formatCurrency(smallTotal)}</span>)</span></span>
            </div>
            <div class="flex h-3 gap-0.5 overflow-hidden rounded-full bg-raised dark:bg-raised-dark">
              {#if bigTotal > 0}
                <div class="bg-primary" style="width: {bigPct}%"></div>
              {/if}
              {#if smallTotal > 0}
                <div class="bg-gray-400 dark:bg-gray-500" style="width: {smallPct}%"></div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Two Donut Charts -->
        <div class="grid gap-6 sm:grid-cols-2 [&>*]:min-w-0">
          <div>
            <h3 class="mb-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">
              Big Purchases (&ge; ${thresholdInput || '500'})
            </h3>
            {#if bigChartData.length > 0}
              <DonutChart bind:this={bigDonutChart} data={bigChartData} showLegend={false} />
              <div class="mt-3 space-y-1">
                {#each bigPurchases as cat, i (cat.bucketId)}
                  {@const pct = bigTotal > 0 ? ((cat.cents / bigTotal) * 100).toFixed(1) : '0.0'}
                  {@const incomePct = $currentMonthFixedIncome > 0 ? ((cat.cents / $currentMonthFixedIncome) * 100).toFixed(1) : null}
                  <button
                    class="flex min-h-[2.5rem] w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                    class:opacity-40={hiddenBig[cat.bucketId]}
                    on:click={() => toggleBig(cat.bucketId, i)}
                  >
                    <span class="h-2.5 w-2.5 flex-shrink-0 rounded-full" style="background-color: {cat.color}" class:opacity-30={hiddenBig[cat.bucketId]}></span>
                    <span class="flex-1 text-sm text-gray-700 dark:text-gray-200" class:line-through={hiddenBig[cat.bucketId]}>{cat.label}</span>
                    <span class="amt text-right text-sm tabular-nums text-muted">
                      {formatCurrency(cat.cents)} ({pct}%){#if incomePct} <span class="text-xs text-primary">{incomePct}% inc</span>{/if}
                    </span>
                  </button>
                {/each}
              </div>
            {:else}
              <p class="py-8 text-center text-sm text-muted">No big purchases</p>
            {/if}
          </div>

          <div>
            <h3 class="mb-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">
              Small Purchases (&lt; ${thresholdInput || '500'})
            </h3>
            {#if smallChartData.length > 0}
              <DonutChart bind:this={smallDonutChart} data={smallChartData} showLegend={false} />
              <div class="mt-3 space-y-1">
                {#each smallPurchases as cat, i (cat.bucketId)}
                  {@const pct = smallTotal > 0 ? ((cat.cents / smallTotal) * 100).toFixed(1) : '0.0'}
                  {@const incomePct = $currentMonthFixedIncome > 0 ? ((cat.cents / $currentMonthFixedIncome) * 100).toFixed(1) : null}
                  <button
                    class="flex min-h-[2.5rem] w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                    class:opacity-40={hiddenSmall[cat.bucketId]}
                    on:click={() => toggleSmall(cat.bucketId, i)}
                  >
                    <span class="h-2.5 w-2.5 flex-shrink-0 rounded-full" style="background-color: {cat.color}" class:opacity-30={hiddenSmall[cat.bucketId]}></span>
                    <span class="flex-1 text-sm text-gray-700 dark:text-gray-200" class:line-through={hiddenSmall[cat.bucketId]}>{cat.label}</span>
                    <span class="amt text-right text-sm tabular-nums text-muted">
                      {formatCurrency(cat.cents)} ({pct}%){#if incomePct} <span class="text-xs text-primary">{incomePct}% inc</span>{/if}
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
      <div class="px-5 pb-1 pt-5">
        <h2 class="section-title">Spending Breakdown</h2>
      </div>
      <p class="py-12 text-center text-muted">No spending data</p>
    </div>
  {/if}

  <div class="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
    <div class="card">
      <div class="px-5 pb-1 pt-5">
        <h2 class="section-title">Monthly Spending Trend</h2>
        <p class="mt-0.5 text-xs text-muted">Last 6 months</p>
      </div>
      <div class="p-5">
        {#if monthlySpending.some((v) => v !== 0)}
          <BarChart
            labels={monthLabels}
            datasets={[{ label: 'Spending', data: monthlySpending, color: '#ef4444' }]}
          />
        {:else}
          <p class="py-12 text-center text-sm text-muted">No spending in the last 6 months</p>
        {/if}
      </div>
    </div>

    <div class="card">
      <div class="px-5 pb-1 pt-5">
        <h2 class="section-title">Income vs Spending</h2>
        <p class="mt-0.5 text-xs text-muted">Last 6 months</p>
      </div>
      <div class="p-5">
        {#if monthlyIncome.some((v) => v !== 0) || monthlySpending.some((v) => v !== 0)}
          <LineChart
            labels={monthLabels}
            datasets={[
              { label: 'Income', data: monthlyIncome, color: '#22c55e' },
              { label: 'Spending', data: monthlySpending, color: '#ef4444' },
            ]}
          />
        {:else}
          <p class="py-12 text-center text-sm text-muted">No income or spending in the last 6 months</p>
        {/if}
      </div>
    </div>
  </div>

  {#if bucketSpendSeries.length > 0}
    <div class="card">
      <div class="px-5 pb-1 pt-5">
        <h2 class="section-title">Monthly Spend by Bucket</h2>
        <p class="mt-0.5 text-xs text-muted">Last 6 months &middot; click a legend item to hide it</p>
      </div>
      <div class="p-5">
        <LineChart labels={monthLabels} datasets={bucketSpendSeries} />
      </div>
    </div>
  {/if}

  <div class="card">
    <div class="px-5 pb-1 pt-5">
      <h2 class="section-title">Savings Rate Trend</h2>
      <p class="mt-0.5 text-xs text-muted">Last 6 months</p>
    </div>
    <div class="p-5">
      {#if $savingsRateTrend.some((m) => m.rate !== null)}
        <LineChart
          labels={savingsRateLabels}
          datasets={[
            { label: 'Savings Rate', data: savingsRateData, color: '#22c55e' },
          ]}
        />
      {:else}
        <p class="py-12 text-center text-sm text-muted">Add income to see your savings rate</p>
      {/if}
    </div>
  </div>

  <PatternInsights />
</div>
