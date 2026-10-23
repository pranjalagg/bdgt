<script lang="ts">
  import { goto } from '$app/navigation';
  import NavBar from '$lib/components/layout/NavBar.svelte';
  import MonthMenu from '$lib/components/layout/MonthMenu.svelte';
  import AvatarButton from '$lib/components/layout/AvatarButton.svelte';
  import PrivacyToggle from '$lib/components/shared/PrivacyToggle.svelte';
  import { base } from '$app/paths';
  import EnvelopeLine from '$lib/components/shared/EnvelopeLine.svelte';
  import EnvelopeRow from '$lib/components/shared/EnvelopeRow.svelte';
  import InfoPopover from '$lib/components/shared/InfoPopover.svelte';
  import SafeToSpendRing from '$lib/components/dashboard/SafeToSpendRing.svelte';
  import Tile from '$lib/components/dashboard/Tile.svelte';
  import ReviewBanner from '$lib/components/shared/ReviewBanner.svelte';
  import { upcomingRecurring } from '$lib/stores/recurringStore';
  import { unsortedTransactions, savingsRateTrend, bucketStatuses, currentMonthIncome, currentMonthFixedIncome, currentMonthIncomes, unallocated, addIncome, updateIncome, deleteIncome, buckets, savingsRate } from '$lib/stores/budgetStore';
  import { safeToSpendWithPending as safeToSpendPerDay, pendingEverydaySpend } from '$lib/stores/captureStore';
  import { goalStatuses } from '$lib/stores/goalsStore';
  import { currentMonthKey, today, openLog } from '$lib/stores/uiStore';
  import { formatCurrency } from '$lib/utils/currency';
  import { parseMonthKey, getDaysInMonth, formatMonthYear } from '$lib/utils/dates';
  import { savingsRateDelta } from '$lib/utils/calculations';

  // The same rule calculateSafeToSpendPerDay applies, spelled out for the popover.
  $: everydayStatuses = $bucketStatuses.filter((s) => !s.bucket.isSystem && !s.bucket.isSavings && s.bucket.isEveryday);
  $: notCountedStatuses = $bucketStatuses.filter((s) => !s.bucket.isSystem && (s.bucket.isSavings || !s.bucket.isEveryday));
  // Pending captured payments are counted already (see captureStore).
  $: everydayLeft = everydayStatuses.reduce((sum, s) => sum + s.remaining, 0) - $pendingEverydaySpend;

  $: daysLeftInMonth = getDaysInMonth($currentMonthKey) - $today.getDate() + 1;
  // The ring's whole: this month's everyday money, carry-over included.
  $: everydayPool = everydayStatuses.reduce((sum, s) => sum + s.allocated + s.rollover, 0);

  // Tiles: bills due in the next 7 days, and the first savings goal (or, with
  // no goal, what went into savings buckets this month).
  $: billsTotal = $upcomingRecurring.reduce((sum, r) => sum + r.amount, 0);
  $: firstGoal = $goalStatuses[0];
  $: setAsideThisMonth = $bucketStatuses.reduce((sum, s) => (s.bucket.isSavings ? sum + s.spent : sum), 0);

  function showGoals() {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('goals')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  // Trend is the last 6 months ending at the viewed month, so the one
  // before the last entry is the previous month.
  $: prevSavingsRate = $savingsRateTrend.length >= 2 ? $savingsRateTrend[$savingsRateTrend.length - 2] : null;
  $: prevMonthName = prevSavingsRate ? formatMonthYear(prevSavingsRate.month).split(' ')[0] : '';
  $: savingsDelta = prevSavingsRate ? savingsRateDelta($savingsRate, prevSavingsRate.rate) : null;

  $: savingsRateColor = $savingsRate === null ? 'text-muted dark:text-muted-dark'
    : $savingsRate >= 20 ? 'text-success dark:text-success-light'
    : $savingsRate >= 10 ? 'text-warning'
    : 'text-danger dark:text-danger-light';

  // Money moved into a savings bucket isn't spending — same rule the
  // savings rate and the Analytics page already use.
  $: totalSpent = $bucketStatuses.reduce(
    (sum, s) => (s.bucket.isSavings ? sum : sum + s.spent),
    0
  );

</script>

<NavBar title="Home" large={false}>
  <svelte:fragment slot="leading"><MonthMenu /></svelte:fragment>
  <svelte:fragment slot="trailing"><PrivacyToggle /><AvatarButton /></svelte:fragment>
</NavBar>

<div class="space-y-6">

  {#if $safeToSpendPerDay !== null}
    <!-- The number this app exists to answer: what's actually free to
         spend today, once fixed obligations and savings are set aside. -->
    <SafeToSpendRing perDay={$safeToSpendPerDay} left={everydayLeft} pool={everydayPool} daysLeft={daysLeftInMonth} pending={$pendingEverydaySpend}>
      <InfoPopover slot="info" label="How safe to spend is calculated">
        <p class="font-medium text-gray-900 dark:text-gray-50">How this is worked out</p>
        <p>What is left in your everyday envelopes, spread over the days remaining this month (today included). Payments waiting for review already count. The ring shows how much of this month's everyday money is left.</p>
        <p class="money rounded bg-background px-2 py-1 text-[12px] dark:bg-white/[0.05] amt">
          {formatCurrency(everydayLeft)} left &divide; {daysLeftInMonth} day{daysLeftInMonth === 1 ? '' : 's'} = {formatCurrency($safeToSpendPerDay)}/day
        </p>
        <p>
          <span class="font-medium text-gray-900 dark:text-gray-50">Counted:</span>
          {everydayStatuses.length > 0 ? everydayStatuses.map((s) => s.bucket.name).join(', ') : 'none'}.
          Each one's balance includes what carried over from earlier months.
        </p>
        <p>
          <span class="font-medium text-gray-900 dark:text-gray-50">Not counted:</span>
          {notCountedStatuses.length > 0 ? notCountedStatuses.map((s) => s.bucket.name).join(', ') : 'none'}.
          Those are committed money or savings.
        </p>
        <p class="text-muted dark:text-muted-dark">
          Change this per bucket under Setup &rarr; Buckets &rarr; Edit &rarr; &ldquo;Everyday spending&rdquo;.
        </p>
      </InfoPopover>
    </SafeToSpendRing>

    <div class="grid grid-cols-2 gap-3">
      <Tile
        tone="bills"
        title="Upcoming bills"
        caption={$upcomingRecurring.length === 0 ? 'Nothing due in 7 days' : `${$upcomingRecurring.length} due in 7 days`}
        amount={billsTotal}
        href="{base}/budget/bills"
      >
        <svg slot="icon" class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
      </Tile>
      <Tile
        tone="saved"
        title={firstGoal ? firstGoal.goal.name : 'Set aside'}
        caption={firstGoal ? `${Math.round(Math.min(Math.max(firstGoal.progress, 0), 1) * 100)}% of goal` : 'this month'}
        amount={firstGoal ? firstGoal.currentAmount : setAsideThisMonth}
        onClick={showGoals}
      >
        <svg slot="icon" class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></svg>
      </Tile>
    </div>
  {/if}

  <ReviewBanner />

  <!-- The thesis: one line, the whole month. -->
  <EnvelopeLine
    statuses={$bucketStatuses}
    income={$currentMonthIncome}
    unallocated={$unallocated}
    onAssign={() => goto(`${base}/budget`)}
  />

  {#if $currentMonthIncome === 0}
    <!-- First run reads as an invitation, not eleven negative balances. -->
    <div class="card flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <p class="text-sm text-gray-700 dark:text-gray-200">
        Add this month's income and every bucket has something to hold.
      </p>
      <a class="btn-primary flex-none" href="{base}/budget">Add income</a>
    </div>
  {/if}

  {#if $unsortedTransactions.length > 0}
    <!-- Nothing was deleted: these lost their bucket and need a new one. -->
    <div class="card flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p class="text-sm text-gray-700 dark:text-gray-200">
        <span class="font-medium text-warning">{$unsortedTransactions.length} {$unsortedTransactions.length === 1 ? 'transaction needs' : 'transactions need'} a bucket.</span>
        Their bucket was removed, so they are kept as Unsorted until you move them.
      </p>
      <a href="{base}/activity?bucket=unsorted" class="btn-secondary flex-none">Review</a>
    </div>
  {/if}

  <!-- Supporting figures, subordinate to the line above. -->
  <div class="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border dark:border-border-dark dark:bg-border-dark sm:grid-cols-3">
    <button
      class="flex flex-col items-start bg-white p-4 text-left transition-colors hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary dark:bg-surface-dark dark:hover:bg-white/[0.03]"
      on:click={() => goto(`${base}/budget`)}
    >
      <p class="metric-label">Income</p>
      <p class="metric-value mt-1 text-xl amt">{formatCurrency($currentMonthIncome)}</p>
      {#if $currentMonthFixedIncome > 0 && $currentMonthFixedIncome !== $currentMonthIncome}
        <p class="mt-1 text-[11.5px] text-muted dark:text-muted-dark">
          <span class="money amt">{formatCurrency($currentMonthFixedIncome)}</span> fixed ·
          <span class="money amt">{formatCurrency($currentMonthIncome - $currentMonthFixedIncome)}</span> variable
        </p>
      {/if}
    </button>
    <div class="bg-white p-4 dark:bg-surface-dark">
      <p class="metric-label">Spent</p>
      <p class="metric-value mt-1 text-xl amt">{formatCurrency(totalSpent)}</p>
      <p class="mt-1 text-[11.5px] text-muted dark:text-muted-dark">excludes money set aside</p>
    </div>
    <div class="col-span-2 bg-white p-4 dark:bg-surface-dark sm:col-span-1">
      <p class="metric-label">Savings rate</p>
      <div class="mt-1 flex items-baseline gap-2">
        <p class="metric-value text-xl {savingsRateColor} amt">
          {$savingsRate !== null ? `${$savingsRate}%` : '—'}
        </p>
        {#if savingsDelta !== null}
          <!-- A trend mark on the figure, not a second statistic: the
               comparison month lives in the tooltip and accessible name. -->
          <span
            class="money amt inline-flex items-center gap-0.5 text-[11.5px] font-medium
                   {savingsDelta > 0 ? 'text-success dark:text-success-light' : savingsDelta < 0 ? 'text-danger dark:text-danger-light' : 'text-muted dark:text-muted-dark'}"
            title={savingsDelta === 0 ? `Unchanged from ${prevMonthName}` : `${savingsDelta > 0 ? 'Up' : 'Down'} ${Math.abs(savingsDelta)} points from ${prevMonthName}`}
            aria-label={savingsDelta === 0 ? `Unchanged from ${prevMonthName}` : `${savingsDelta > 0 ? 'Up' : 'Down'} ${Math.abs(savingsDelta)} points from ${prevMonthName}`}
          >
            {#if savingsDelta !== 0}
              <svg class="h-3 w-3 {savingsDelta < 0 ? 'rotate-180' : ''}" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M6 10V2M2.5 5.5 6 2l3.5 3.5" />
              </svg>
              {Math.abs(savingsDelta)} pts
            {:else}
              flat
            {/if}
          </span>
        {/if}
      </div>
      <p class="mt-1 text-[11.5px] text-muted dark:text-muted-dark">
        {$savingsRate !== null ? 'of income kept' : 'add income to see this'}
      </p>
    </div>
  </div>

  <!-- Envelopes -->
  <div>
    <div class="mb-2.5 flex items-center justify-between">
      <h2 class="eyebrow">Envelopes</h2>
      <button
        class="text-[13px] font-medium text-primary hover:underline"
        on:click={() => openLog()}
      >
        Add transaction
      </button>
    </div>
    <div class="grid gap-px overflow-hidden rounded-xl bg-border shadow-[var(--shadow-card)] dark:bg-border-dark lg:grid-cols-2 lg:[&>:last-child:nth-child(odd)]:col-span-2">
      {#each $bucketStatuses.filter((s) => !s.bucket.isSystem) as status (status.bucket.id)}
        <EnvelopeRow {status} onClick={() => openLog(status.bucket.id)} />
      {/each}
    </div>
  </div>

</div>
