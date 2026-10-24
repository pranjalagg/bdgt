<script lang="ts">
  import { base } from '$app/paths';
  import NavBar from '$lib/components/layout/NavBar.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Figure from '$lib/components/insights/Figure.svelte';
  import ScrubBars from '$lib/components/charts/ScrubBars.svelte';
  import PairedBars from '$lib/components/charts/PairedBars.svelte';
  import TrendLines from '$lib/components/charts/TrendLines.svelte';
  import { buckets, transactions, incomes, savingsRateTrend } from '$lib/stores/budgetStore';
  import { currentMonthKey, today } from '$lib/stores/uiStore';
  import { monthsEnding, spendingByMonth, incomeByMonth, averageOfComplete } from '$lib/insights/trends';
  import { monthlyBucketSpend } from '$lib/utils/calculations';
  import { formatCurrency } from '$lib/utils/currency';
  import { envelopeIcon } from '$lib/ui/icons';
  import { getMonthKey, parseMonthKey } from '$lib/utils/dates';
  import { haptic } from '$lib/ui/haptics';
  import type { TrendChart } from '$lib/insights/charts';

  // One trend over the six months ending at the month being viewed: a
  // figure that follows your finger, the chart, and a list holding the
  // same numbers for anyone who can't scrub.

  export let data: { chart: TrendChart };

  const TITLES: Record<TrendChart, string> = {
    spending: 'Monthly spending',
    income: 'Income and spending',
    envelopes: 'Spending by envelope',
    'savings-rate': 'Savings rate',
  };
  const INCOME_COLOR = '#8e8e93';
  const RATE_COLOR = '#1d9a4f';

  $: kind = data.chart;
  $: savingsIds = new Set($buckets.filter((b) => b.isSavings).map((b) => b.id));
  $: months = monthsEnding($currentMonthKey);
  $: current = getMonthKey($today);
  const longName = (m: string) => parseMonthKey(m).toLocaleDateString('en-US', { month: 'long' });
  $: shortNames = months.map((m) => parseMonthKey(m).toLocaleDateString('en-US', { month: 'short' }));
  $: nameOf = (i: number) => (months[i] === current ? `${longName(months[i])} so far` : longName(months[i]));
  const whole = (c: number) => formatCurrency(c).replace(/\.00$/, '');
  const signed = (c: number) => `${c > 0 ? '+' : c < 0 ? '−' : ''}${whole(Math.abs(c))}`;

  $: spend = spendingByMonth($transactions, savingsIds, months);
  $: income = incomeByMonth($incomes, months);
  $: average = averageOfComplete(spend, months, $today);
  // The months the average covers: over, and with something logged.
  $: complete = months.filter((m, i) => m < current && spend[i] !== 0);
  // A month with nothing logged at all is no data, shown empty.
  $: empty = months.map((_, i) => spend[i] === 0 && income[i] === 0);

  // Spending by envelope: Bills envelopes start hidden (rent would flatten
  // the rest); chips show or hide each one.
  $: envelopeSeries = monthlyBucketSpend($buckets.filter((b) => !b.isSavings && !b.isSystem), $transactions, months);
  let hidden: Set<string> | null = null;
  $: if (hidden === null && $buckets.length) hidden = new Set($buckets.filter((b) => !b.isEveryday && !b.isSavings).map((b) => b.id));
  $: hiddenIds = hidden ?? new Set<string>();
  $: shownSeries = envelopeSeries.filter((s) => !hiddenIds.has(s.bucketId));
  function toggle(id: string) {
    const next = new Set(hiddenIds);
    if (next.has(id)) next.delete(id);
    else if (shownSeries.length > 1) next.add(id);
    hidden = next;
    haptic('selection');
  }
  $: bucketById = new Map($buckets.map((b) => [b.id, b]));

  // Savings rate, as Home and the trend card show it (one decimal).
  $: rates = $savingsRateTrend.map((m) => m.rate);
  $: rateAvg = (() => {
    const done = rates.filter((r, i): r is number => r !== null && months[i] < current);
    return done.length ? Math.round((done.reduce((s, r) => s + r, 0) / done.length) * 10) / 10 : null;
  })();
  const pts = (n: number) => `${Math.abs(Math.round(n * 10) / 10)} pts`;

  let hot = -1;
  $: index = hot >= 0 ? hot : 5;

  type Fig = { label: string; cents?: number; text?: string; pill?: { good: boolean; up: boolean; text: string } | null; sub?: string };
  let fig: Fig;
  $: fig =
    kind === 'spending'
      ? hot >= 0
        ? {
            label: nameOf(hot),
            cents: spend[hot],
            pill: average !== null ? { good: spend[hot] <= average, up: spend[hot] > average, text: `${whole(Math.abs(spend[hot] - average))} ${spend[hot] <= average ? 'below' : 'above'} average` } : null,
          }
        : average !== null
          ? { label: 'Average per month', cents: average, sub: complete.length > 1 ? `${longName(complete[0])} to ${longName(complete[complete.length - 1])}` : longName(complete[0]) }
          : { label: nameOf(5), cents: spend[5] }
      : kind === 'income'
        ? { label: `${nameOf(index)}: ${income[index] - spend[index] >= 0 ? 'kept' : 'short'}`, cents: Math.abs(income[index] - spend[index]), sub: `Income ${whole(income[index])} · Spent ${whole(spend[index])}` }
        : kind === 'envelopes'
          ? {
              label: `${nameOf(index)}, ${shownSeries.length} ${shownSeries.length === 1 ? 'envelope' : 'envelopes'}`,
              cents: shownSeries.reduce((s, x) => s + x.data[index], 0),
              sub: [...shownSeries].sort((a, b) => b.data[index] - a.data[index]).slice(0, 3).filter((s) => s.data[index] > 0).map((s) => `${s.label} ${whole(s.data[index])}`).join(' · '),
            }
          : {
              label: nameOf(index),
              text: rates[index] !== null ? `${rates[index]}%` : '—',
              pill: rates[index] !== null && rateAvg !== null ? { good: rates[index]! >= rateAvg, up: rates[index]! >= rateAvg, text: `${pts(rates[index]! - rateAvg)} ${rates[index]! >= rateAvg ? 'above' : 'below'} your average of ${rateAvg}%` } : null,
              sub: rates[index] === null ? 'No income logged that month' : '',
            };

  const NOTES: Record<TrendChart, string> = {
    spending: 'Everything except money you set aside. The month in progress is not in the average.',
    income: 'Income is what you logged for the month. Money you set aside counts as kept.',
    envelopes: 'Bills start hidden so the smaller envelopes are readable. Tap a name to show or hide it.',
    'savings-rate': 'The share of income you did not spend. Money you set aside counts as kept.',
  };

  $: newestFirst = [5, 4, 3, 2, 1, 0];
  $: envelopeRows = envelopeSeries
    .map((s) => ({ s, now: s.data[5], before: s.data[4] }))
    .sort((a, b) => b.now - a.now);
</script>

<NavBar title={TITLES[kind]} back={{ href: `${base}/insights`, label: 'Insights' }} />

<div class="space-y-4">
  <Figure label={fig.label} cents={fig.cents ?? null} text={fig.text ?? null} pill={fig.pill ?? null} sub={fig.sub ?? ''} />

  {#if kind === 'envelopes'}
    <div class="scroll-row -mx-4 gap-2 px-4 py-1 sm:-mx-6 sm:px-6 md:flex-wrap md:overflow-visible" role="group" aria-label="Envelopes">
      {#each envelopeSeries as s (s.bucketId)}
        <button type="button" class="chip" aria-pressed={!hiddenIds.has(s.bucketId)} on:click={() => toggle(s.bucketId)}>
          <span class="h-2.5 w-2.5 flex-none rounded-full" style="background:{s.color}" aria-hidden="true"></span>{s.label}
        </button>
      {/each}
    </div>
  {/if}

  <div class="pt-2">
    {#if kind === 'spending'}
      <ScrubBars values={spend} axis={[shortNames[0], shortNames[5]]} avg={average} label="Spending per month, {shortNames[0]} to {shortNames[5]}" height={196} on:scrub={(e) => (hot = e.detail.index)} on:scrubend={() => (hot = -1)} />
    {:else if kind === 'income'}
      <PairedBars a={{ color: INCOME_COLOR, values: income }} b={{ color: 'rgb(var(--c-tint))', values: spend }} months={shortNames} label="Income and spending per month" on:scrub={(e) => (hot = e.detail.index)} on:scrubend={() => (hot = -1)} />
      <div class="mt-3 flex justify-center gap-4 text-[13px] text-label-2">
        <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full" style="background:{INCOME_COLOR}" aria-hidden="true"></span>Income</span>
        <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full bg-tint" aria-hidden="true"></span>Spending</span>
      </div>
    {:else if kind === 'envelopes'}
      <TrendLines series={envelopeSeries.map((s) => ({ id: s.bucketId, color: s.color, values: s.data.map((v, i) => (empty[i] ? null : v)), hidden: hiddenIds.has(s.bucketId) }))} months={shortNames} label="Spending by envelope per month" on:scrub={(e) => (hot = e.detail.index)} on:scrubend={() => (hot = -1)} />
    {:else}
      <TrendLines series={[{ id: 'rate', color: RATE_COLOR, values: rates }]} months={shortNames} avg={rateAvg} label="Savings rate per month" on:scrub={(e) => (hot = e.detail.index)} on:scrubend={() => (hot = -1)} />
    {/if}
  </div>

  <section aria-labelledby="list-h">
    <h2 id="list-h" class="px-1 pb-1.5 pt-3 text-[13px] font-medium uppercase tracking-wide text-label-2">{kind === 'envelopes' ? nameOf(5) : 'By month'}</h2>
    <div class="group">
      {#if kind === 'envelopes'}
        {#each envelopeRows as r (r.s.bucketId)}
          {@const b = bucketById.get(r.s.bucketId)}
          <div class="group-row flex items-center gap-3 px-4 py-2.5" style="--row-inset: 64px">
            <span class="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] text-white" style="background:{r.s.color}" aria-hidden="true"><Icon name={envelopeIcon(r.s.label, b?.isSystem)} size={19} strokeWidth={2.2} /></span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[16px] text-label">{r.s.label}</span>
              <span class="amt block text-[13px] text-label-2">{r.now === r.before ? `Same as ${longName(months[4])}` : `${whole(Math.abs(r.now - r.before))} ${r.now < r.before ? 'less' : 'more'} than ${longName(months[4])}`}</span>
            </span>
            <span class="money amt flex-none text-[16px] font-semibold text-label">{whole(r.now)}</span>
          </div>
        {:else}
          <p class="px-4 py-4 text-[15px] text-label-2">Nothing spent in these months.</p>
        {/each}
      {:else}
        {#each newestFirst as i}
          <div class="group-row flex items-center gap-3 px-4 py-2.5" style="--row-inset: 16px">
            <span class="min-w-0 flex-1">
              <span class="block text-[16px] text-label">{nameOf(i)}</span>
              {#if empty[i]}
                <span class="block text-[13px] text-label-2">Nothing logged</span>
              {:else if kind === 'income'}
                <span class="amt block text-[13px] text-label-2">In {whole(income[i])} · Out {whole(spend[i])}</span>
              {:else if kind === 'savings-rate'}
                <span class="amt block text-[13px] text-label-2">{income[i] > 0 ? `Kept ${whole(income[i] - spend[i])} of ${whole(income[i])}` : 'No income logged'}</span>
              {/if}
            </span>
            <span class="flex-none text-right">
              {#if empty[i]}
                <span class="block text-[16px] font-semibold text-label-2">—</span>
              {:else if kind === 'spending'}
                <span class="money amt block text-[16px] font-semibold text-label">{formatCurrency(spend[i])}</span>
                {#if average !== null && complete.includes(months[i])}
                  <span class="money amt block text-[12px] {spend[i] <= average ? 'text-success' : 'text-danger'}">{signed(spend[i] - average)} vs average</span>
                {/if}
              {:else if kind === 'income'}
                <span class="money amt block text-[16px] font-semibold {income[i] - spend[i] >= 0 ? 'text-success' : 'text-danger'}">{signed(income[i] - spend[i])}</span>
                <span class="block text-[12px] text-label-2">{income[i] - spend[i] >= 0 ? 'kept' : 'short'}</span>
              {:else}
                <span class="money block text-[16px] font-semibold text-label">{rates[i] !== null ? `${rates[i]}%` : '—'}</span>
              {/if}
            </span>
          </div>
        {/each}
      {/if}
    </div>
  </section>

  <p class="px-1 text-[13px] text-label-2">{NOTES[kind]}</p>
</div>
