<script lang="ts">
  import { base } from '$app/paths';
  import NavBar from '$lib/components/layout/NavBar.svelte';
  import SectionHeading from '$lib/components/ui/SectionHeading.svelte';
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

<div class="space-y-9">
  <PeriodChart />

  <SummaryStrip {spent} />

  <section aria-labelledby="where-h">
    <SectionHeading strong="Where it" soft="went" id="where-h">
      <span slot="action" class="text-[13px] text-label-2">{soFar}</span>
    </SectionHeading>
    <WhereItWent {rows} />
  </section>

  <section aria-labelledby="bigsmall-h">
    <SectionHeading strong="Big and small" soft="purchases" id="bigsmall-h" />
    <BigSmallCard {rows} />
  </section>

  <section aria-labelledby="trends-h">
    <SectionHeading strong="Trends" id="trends-h">
      <span slot="action" class="text-[13px] text-label-2">Last 6 months</span>
    </SectionHeading>
    <div class="grid gap-3 md:grid-cols-2">
      <TrendCard href="{base}/insights/spending" icon="chart" title="Monthly spending" value={whole(average ?? spendTotals[5])} sub={average !== null ? 'average a month' : soFar}>
        {#if hasSpending}<Sparkline kind="bars" bars={spendTotals} />{/if}
      </TrendCard>
      <TrendCard href="{base}/insights/income" icon="wallet" title="Income and spending" value="{net > 0 ? '+' : net < 0 ? '−' : ''}{whole(Math.abs(net))}" sub="{net >= 0 ? 'kept' : 'short'} in {soFar}">
        {#if hasSpending || hasIncome}<Sparkline kind="pairs" pairs={incomeTotals.map((v, i) => [v, spendTotals[i]])} />{/if}
      </TrendCard>
      <TrendCard href="{base}/insights/envelopes" icon="layers" title="Spending by envelope" value={whole(biggest?.spent ?? 0)} sub={biggest ? `${biggest.bucket.name}, your biggest everyday envelope` : 'No everyday spending yet'}>
        {#if everydaySeries.length}<Sparkline kind="lines" lines={everydaySeries.map((s) => ({ color: s.color, values: s.data }))} />{/if}
      </TrendCard>
      <TrendCard href="{base}/insights/savings-rate" icon="trend" title="Savings rate" value={$savingsRate !== null ? `${$savingsRate}%` : '—'} sub={$savingsRate === null ? 'Add income to see this' : rateDelta === null ? 'of income kept' : rateDelta === 0 ? `Same as ${monthName(months[4])}` : `${Math.abs(rateDelta)} pts ${rateDelta > 0 ? 'up' : 'down'} on ${monthName(months[4])}`}>
        {#if rates.some((r) => r !== null)}<Sparkline kind="lines" lines={[{ color: '#1d9a4f', values: rates }]} />{/if}
      </TrendCard>
    </div>
  </section>

  <section aria-labelledby="patterns-h">
    <SectionHeading strong="Patterns" id="patterns-h">
      <button slot="action" type="button" class="text-[15px] font-medium text-tint focus:outline-none focus-visible:ring-2 focus-visible:ring-tint" on:click={() => openModal('patterns-info')}>How these work</button>
    </SectionHeading>
    <PatternInsights />
  </section>

  <section aria-labelledby="investments-h">
    <SectionHeading strong="Investments" id="investments-h" />
    <InvestmentsCard />
  </section>
</div>

<PatternInfoSheet />
