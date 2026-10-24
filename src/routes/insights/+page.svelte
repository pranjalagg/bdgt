<script lang="ts">
  import { base } from '$app/paths';
  import NavBar from '$lib/components/layout/NavBar.svelte';
  import MonthMenu from '$lib/components/layout/MonthMenu.svelte';
  import PeriodChart from '$lib/components/insights/PeriodChart.svelte';
  import SummaryStrip from '$lib/components/insights/SummaryStrip.svelte';
  import WhereItWent from '$lib/components/insights/WhereItWent.svelte';
  import BigSmallCard from '$lib/components/insights/BigSmallCard.svelte';
  import TrendCard from '$lib/components/insights/TrendCard.svelte';
  import PatternInsights from '$lib/components/insights/PatternInsights.svelte';
  import PatternInfoSheet from '$lib/components/insights/PatternInfoSheet.svelte';
  import InvestmentsCard from '$lib/components/insights/InvestmentsCard.svelte';
  import Sparkline from '$lib/components/charts/Sparkline.svelte';
  import { buckets, bucketStatuses, transactions, incomes, savingsRate, savingsRateTrend } from '$lib/stores/budgetStore';
  import { currentMonthKey, today, openModal } from '$lib/stores/uiStore';
  import { monthsEnding, spendingByMonth, incomeByMonth, averageOfComplete } from '$lib/insights/trends';
  import { groupEnvelopes } from '$lib/budget/groups';
  import { monthlyBucketSpend, savingsRateDelta } from '$lib/utils/calculations';
  import { formatCurrency } from '$lib/utils/currency';
  import { getMonthKey, parseMonthKey } from '$lib/utils/dates';

  // How it's going over time: the period chart, this month's summary and
  // where the money went, big and small purchases, trends over six months,
  // patterns between envelopes, and investments.

  $: savingsIds = new Set($buckets.filter((b) => b.isSavings).map((b) => b.id));
  // Spending means everything except savings envelopes.
  $: rows = $bucketStatuses
    .filter((s) => s.spent > 0 && !s.bucket.isSavings)
    .map((s) => ({ bucket: s.bucket, cents: s.spent }))
    .sort((a, b) => b.cents - a.cents);
  $: spent = rows.reduce((s, r) => s + r.cents, 0);

  $: isCurrent = getMonthKey($today) === $currentMonthKey;
  const monthName = (m: string) => parseMonthKey(m).toLocaleDateString('en-US', { month: 'long' });
  $: monthLong = monthName($currentMonthKey);
  $: soFar = isCurrent ? `${monthLong} so far` : monthLong;
  const whole = (c: number) => formatCurrency(c).replace(/\.00$/, '');

  // Trend cards: six months ending at the month being viewed.
  $: months = monthsEnding($currentMonthKey);
  $: spendTotals = spendingByMonth($transactions, savingsIds, months);
  $: average = averageOfComplete(spendTotals, months, $today);
  $: incomeTotals = incomeByMonth($incomes, months);
  $: net = incomeTotals[5] - spendTotals[5];
  $: everyday = groupEnvelopes($bucketStatuses).everyday;
  $: biggest = [...everyday].sort((a, b) => b.spent - a.spent).find((s) => s.spent > 0);
  $: everydaySeries = monthlyBucketSpend(everyday.map((s) => s.bucket), $transactions, months)
    .sort((a, b) => b.data[5] - a.data[5])
    .slice(0, 4);
  $: rates = $savingsRateTrend.map((m) => m.rate);
  $: rateDelta = savingsRateDelta($savingsRate, rates[rates.length - 2] ?? null);
  $: hasSpending = spendTotals.some((v) => v > 0);
  $: hasIncome = incomeTotals.some((v) => v > 0);
</script>

<NavBar title="Insights">
  <svelte:fragment slot="leading"><MonthMenu /></svelte:fragment>
</NavBar>

<div class="space-y-6">
  <PeriodChart />

  <SummaryStrip {spent} />

  <section aria-labelledby="where-h">
    <div class="flex items-baseline justify-between px-1 pb-2.5">
      <h2 id="where-h" class="text-[21px] font-bold tracking-tight text-label">Where it went</h2>
      <span class="text-[15px] text-label-2">{soFar}</span>
    </div>
    <WhereItWent {rows} />
  </section>

  <section aria-labelledby="bigsmall-h">
    <h2 id="bigsmall-h" class="px-1 pb-2.5 text-[21px] font-bold tracking-tight text-label">Big and small purchases</h2>
    <BigSmallCard {rows} />
  </section>

  <section aria-labelledby="trends-h">
    <div class="flex items-baseline justify-between px-1 pb-2.5">
      <h2 id="trends-h" class="text-[21px] font-bold tracking-tight text-label">Trends</h2>
      <span class="text-[15px] text-label-2">Last 6 months</span>
    </div>
    <div class="grid gap-2.5 md:grid-cols-2">
      <TrendCard href="{base}/insights/spending" icon="chart" color="rgb(var(--c-tint))" title="Monthly spending" value={whole(average ?? spendTotals[5])} sub={average !== null ? 'average a month' : soFar}>
        {#if hasSpending}<Sparkline kind="bars" bars={spendTotals} />{/if}
      </TrendCard>
      <TrendCard href="{base}/insights/income" icon="wallet" color="#8e8e93" title="Income and spending" value="{net > 0 ? '+' : net < 0 ? '−' : ''}{whole(Math.abs(net))}" sub="{net >= 0 ? 'kept' : 'short'} in {soFar}">
        {#if hasSpending || hasIncome}<Sparkline kind="pairs" pairs={incomeTotals.map((v, i) => [v, spendTotals[i]])} />{/if}
      </TrendCard>
      <TrendCard href="{base}/insights/envelopes" icon="layers" color={biggest?.bucket.color ?? '#8e8e93'} title="Spending by envelope" value={whole(biggest?.spent ?? 0)} sub={biggest ? `${biggest.bucket.name}, your biggest everyday envelope` : 'No everyday spending yet'}>
        {#if everydaySeries.length}<Sparkline kind="lines" lines={everydaySeries.map((s) => ({ color: s.color, values: s.data }))} />{/if}
      </TrendCard>
      <TrendCard href="{base}/insights/savings-rate" icon="trend" color="#1d9a4f" title="Savings rate" value={$savingsRate !== null ? `${$savingsRate}%` : '—'} sub={$savingsRate === null ? 'Add income to see this' : rateDelta === null ? 'of income kept' : rateDelta === 0 ? `Same as ${monthName(months[4])}` : `${Math.abs(rateDelta)} pts ${rateDelta > 0 ? 'up' : 'down'} on ${monthName(months[4])}`}>
        {#if rates.some((r) => r !== null)}<Sparkline kind="lines" lines={[{ color: '#1d9a4f', values: rates }]} />{/if}
      </TrendCard>
    </div>
  </section>

  <section aria-labelledby="patterns-h">
    <div class="flex items-baseline justify-between px-1 pb-2.5">
      <h2 id="patterns-h" class="text-[21px] font-bold tracking-tight text-label">Patterns</h2>
      <button type="button" class="text-[15px] font-medium text-tint focus:outline-none focus-visible:ring-2 focus-visible:ring-tint" on:click={() => openModal('patterns-info')}>How these work</button>
    </div>
    <PatternInsights />
  </section>

  <section aria-labelledby="investments-h">
    <h2 id="investments-h" class="px-1 pb-2.5 text-[21px] font-bold tracking-tight text-label">Investments</h2>
    <InvestmentsCard />
  </section>
</div>

<PatternInfoSheet />
