<script lang="ts">
  import { segmentedPill } from '$lib/actions/segmentedPill';
  import ScrubBars from '$lib/components/charts/ScrubBars.svelte';
  import Figure from './Figure.svelte';
  import { transactions, buckets } from '$lib/stores/budgetStore';
  import { currentMonthKey, today } from '$lib/stores/uiStore';
  import { dailySpending, weekWindow, monthsEnding, spendingByMonth, averageOfComplete } from '$lib/insights/trends';
  import { formatCurrency } from '$lib/utils/currency';
  import { getDaysInMonth, getMonthKey, getPreviousMonthKey, parseMonthKey } from '$lib/utils/dates';
  import { haptic } from '$lib/ui/haptics';

  // What was spent (savings left out) over a week, a month or six months.
  // Press and slide across the bars to read one day or month.

  type Period = 'week' | 'month' | 'six';
  let period: Period = 'month';

  $: savingsIds = new Set($buckets.filter((b) => b.isSavings).map((b) => b.id));
  $: monthKey = $currentMonthKey;
  $: isCurrent = getMonthKey($today) === monthKey;
  $: first = parseMonthKey(monthKey);
  $: dim = getDaysInMonth(monthKey);
  $: monthLong = first.toLocaleDateString('en-US', { month: 'long' });
  $: monthShort = first.toLocaleDateString('en-US', { month: 'short' });
  const dayName = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const monthName = (m: string) => parseMonthKey(m).toLocaleDateString('en-US', { month: 'long' });
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
  // "June to September", or just "September".
  const span = (ms: string[]) => (ms.length > 1 ? `${monthName(ms[0])} to ${monthName(ms[ms.length - 1])}` : monthName(ms[0]));
  const pillFor = (diff: number, word: [string, string]) => ({ good: diff <= 0, up: diff > 0, text: `${formatCurrency(Math.abs(diff))} ${diff <= 0 ? word[0] : word[1]}` });

  // Week: the seven days ending today (or the month's last day).
  $: weekDays = weekWindow(monthKey, $today);
  $: weekValues = dailySpending($transactions, savingsIds, weekDays);

  // Month: every day; days after today are drawn empty.
  $: monthDays = Array.from({ length: dim }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1));
  $: monthValues = dailySpending($transactions, savingsIds, monthDays);
  $: upto = isCurrent ? $today.getDate() : dim;
  // Against the month before, up to the same day.
  $: prevKey = getPreviousMonthKey(monthKey);
  $: prevFirst = parseMonthKey(prevKey);
  $: prevDays = Array.from({ length: Math.min(upto, getDaysInMonth(prevKey)) }, (_, i) => new Date(prevFirst.getFullYear(), prevFirst.getMonth(), i + 1));
  $: prevSpent = sum(dailySpending($transactions, savingsIds, prevDays));

  // Six months: this one and the five before, with the average of the
  // months that are over.
  $: months = monthsEnding(monthKey);
  $: sixValues = spendingByMonth($transactions, savingsIds, months);
  $: average = averageOfComplete(sixValues, months, $today);
  // The months the average covers: over, and with something logged.
  $: completeMonths = months.filter((m, i) => m < getMonthKey($today) && sixValues[i] !== 0);

  let hot = -1;
  $: if (period) hot = -1;

  type View = { values: number[]; axis: [string, string]; avg: number | null; futureFrom: number | null; label: string; cents: number; pill: ReturnType<typeof pillFor> | null; sub: string; chartLabel: string };
  let view: View;
  $: view =
    period === 'week'
      ? {
          values: weekValues,
          axis: [weekDays[0].toLocaleDateString('en-US', { weekday: 'short' }), isCurrent ? 'Today' : weekDays[6].toLocaleDateString('en-US', { weekday: 'short' })],
          avg: null,
          futureFrom: null,
          label: hot >= 0 ? dayName(weekDays[hot]) : isCurrent ? 'Spent in the last 7 days' : `Spent ${dayName(weekDays[0])} to ${dayName(weekDays[6])}`,
          cents: hot >= 0 ? weekValues[hot] : sum(weekValues),
          pill: null,
          sub: '',
          chartLabel: `Spending on each of the last 7 days, ${formatCurrency(sum(weekValues))} in all`,
        }
      : period === 'month'
        ? {
            values: monthValues,
            axis: [`${monthShort} 1`, `${monthShort} ${dim}`],
            avg: null,
            futureFrom: isCurrent ? upto : null,
            label: hot >= 0 ? dayName(monthDays[hot]) : `Spent in ${monthLong}`,
            cents: hot >= 0 ? monthValues[hot] : sum(monthValues),
            pill: hot >= 0 ? null : pillFor(sum(monthValues) - prevSpent, ['less', 'more']),
            sub: hot >= 0 ? '' : `than ${monthName(prevKey)}${isCurrent ? ' by this day' : ''}`,
            chartLabel: `Spending on each day of ${monthLong}, ${formatCurrency(sum(monthValues))} in all`,
          }
        : {
            values: sixValues,
            axis: [monthName(months[0]).slice(0, 3), monthName(months[5]).slice(0, 3)],
            avg: average,
            futureFrom: null,
            label: hot >= 0 ? monthName(months[hot]) : average !== null ? 'Average per month' : `Spent in ${monthLong}`,
            cents: hot >= 0 ? sixValues[hot] : average ?? sixValues[5],
            pill: hot >= 0 && average !== null ? pillFor(sixValues[hot] - average, ['below average', 'above average']) : null,
            sub: hot >= 0 || !completeMonths.length ? '' : `${span(completeMonths)}, the complete months`,
            chartLabel: `Spending in each of the last 6 months${average !== null ? `, ${formatCurrency(average)} on average` : ''}`,
          };

  const PERIODS: [Period, string][] = [['week', 'Week'], ['month', 'Month'], ['six', '6 months']];
</script>

<div class="space-y-4">
  <div class="segmented" role="tablist" aria-label="Period" use:segmentedPill>
    {#each PERIODS as [key, name]}
      <button type="button" role="tab" aria-selected={period === key} class="segment" on:click={() => { period = key; haptic('selection'); }}>{name}</button>
    {/each}
  </div>
  <Figure label={view.label} cents={view.cents} pill={view.pill} sub={view.sub} />
  <ScrubBars values={view.values} axis={view.axis} avg={view.avg} futureFrom={view.futureFrom} label={view.chartLabel} format={(v) => formatCurrency(Math.round(v / 100) * 100).replace(/\.00$/, '')} on:scrub={(e) => (hot = e.detail.index)} on:scrubend={() => (hot = -1)} />
</div>
