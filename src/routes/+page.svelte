<script lang="ts">
  import { base } from '$app/paths';
  import NavBar from '$lib/components/layout/NavBar.svelte';
  import MonthMenu from '$lib/components/layout/MonthMenu.svelte';
  import AvatarButton from '$lib/components/layout/AvatarButton.svelte';
  import PrivacyToggle from '$lib/components/shared/PrivacyToggle.svelte';
  import InfoPopover from '$lib/components/shared/InfoPopover.svelte';
  import TransactionSheet from '$lib/components/activity/TransactionSheet.svelte';
  import HomeHero from '$lib/components/home/HomeHero.svelte';
  import PaceChart from '$lib/components/home/PaceChart.svelte';
  import EditHomeSheet from '$lib/components/home/EditHomeSheet.svelte';
  import ReviewCard from '$lib/components/home/cards/ReviewCard.svelte';
  import EnvelopesCard from '$lib/components/home/cards/EnvelopesCard.svelte';
  import RecentCard from '$lib/components/home/cards/RecentCard.svelte';
  import BillsCard from '$lib/components/home/cards/BillsCard.svelte';
  import GoalsCard from '$lib/components/home/cards/GoalsCard.svelte';
  import SavingsRateCard from '$lib/components/home/cards/SavingsRateCard.svelte';
  import NotesCard from '$lib/components/home/cards/NotesCard.svelte';
  import UnsortedCard from '$lib/components/home/cards/UnsortedCard.svelte';
  import { bucketStatuses, transactions, currentMonthIncome } from '$lib/stores/budgetStore';
  import { safeToSpendWithPending, pendingEverydaySpend } from '$lib/stores/captureStore';
  import { homeLayout } from '$lib/stores/homeLayoutStore';
  import { currentMonthKey, today, openModal } from '$lib/stores/uiStore';
  import { heroMode, planDiff } from '$lib/home/hero';
  import { cumulativeByDay } from '$lib/insights/trends';
  import { formatCurrency } from '$lib/utils/currency';
  import { parseMonthKey, getDaysInMonth } from '$lib/utils/dates';
  import type { Transaction } from '$lib/types';

  // Home answers "can I spend?": today's safe-to-spend figure, everyday
  // spending against the plan, then the cards the person chose.

  $: everydayStatuses = $bucketStatuses.filter((s) => !s.bucket.isSystem && !s.bucket.isSavings && s.bucket.isEveryday);
  $: notCountedStatuses = $bucketStatuses.filter((s) => !s.bucket.isSystem && (s.bucket.isSavings || !s.bucket.isEveryday));
  $: everydayIds = new Set(everydayStatuses.map((s) => s.bucket.id));
  $: everydayRemaining = everydayStatuses.reduce((sum, s) => sum + s.remaining, 0);
  // Pending captured payments are counted already (see captureStore).
  $: everydayLeft = everydayRemaining - $pendingEverydaySpend;
  $: everydayPool = everydayStatuses.reduce((sum, s) => sum + s.allocated + s.rollover, 0);
  // The plan: what was assigned to everyday envelopes, spread evenly.
  $: planTotal = everydayStatuses.reduce((sum, s) => sum + s.allocated, 0);

  $: mode = heroMode($currentMonthKey, $today);
  $: daysInMonth = getDaysInMonth($currentMonthKey);
  $: monthStart = parseMonthKey($currentMonthKey);
  $: monthLong = monthStart.toLocaleDateString('en-US', { month: 'long' });
  $: monthShort = monthStart.toLocaleDateString('en-US', { month: 'short' });
  $: daysLeft = daysInMonth - $today.getDate() + 1;

  $: upto = mode === 'today' ? $today.getDate() : mode === 'past' ? daysInMonth : 0;
  $: cumulative = cumulativeByDay($transactions, everydayIds, $currentMonthKey, upto);

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function pillAt(day: number) {
    if (planTotal <= 0 || day <= 0) return null;
    const diff = planDiff(cumulative[day - 1] ?? 0, planTotal, day, daysInMonth);
    return { good: diff >= 0, text: `${formatCurrency(Math.abs(diff))} ${diff >= 0 ? 'under' : 'over'} plan` };
  }

  // Pressing on the pace chart reads out that day instead.
  let scrubDay = 0;

  let hero: { label: string; amount: number; pill: { good: boolean; text: string } | null; sub: string };
  $: hero = scrubDay
    ? {
        label: `Spent on everyday envelopes by ${monthShort} ${scrubDay}`,
        amount: cumulative[scrubDay - 1] ?? 0,
        pill: pillAt(scrubDay),
        sub: `Plan by then ${formatCurrency(Math.round((planTotal * scrubDay) / daysInMonth))}`,
      }
    : mode === 'today'
      ? {
          label: 'Safe to spend today',
          amount: $safeToSpendWithPending ?? 0,
          pill: pillAt(upto),
          sub: `${formatCurrency(everydayLeft)} left · ${plural(daysLeft, 'day')}`,
        }
      : mode === 'past'
        ? {
            label: `Left in ${monthLong}`,
            amount: everydayRemaining,
            pill: pillAt(upto),
            sub: 'In everyday envelopes when the month ended',
          }
        : {
            label: `Everyday money in ${monthLong}`,
            amount: everydayPool,
            pill: null,
            sub: 'Assigned to everyday envelopes so far',
          };

  $: compactTitle =
    mode === 'today' ? `${formatCurrency($safeToSpendWithPending ?? 0)} today` : mode === 'past' ? `${formatCurrency(everydayRemaining)} left` : null;

  let editing: Transaction | null = null;
  function openTransaction(t: Transaction) {
    editing = t;
    openModal('edit-transaction');
  }
</script>

<NavBar title="Home" large={false} {compactTitle}>
  <svelte:fragment slot="leading"><MonthMenu /></svelte:fragment>
  <svelte:fragment slot="trailing"><PrivacyToggle /><AvatarButton /></svelte:fragment>
</NavBar>

<div class="space-y-6">
  <div>
    <HomeHero label={hero.label} amount={hero.amount} pill={hero.pill} sub={hero.sub}>
      <svelte:fragment slot="info">
        {#if !scrubDay && mode === 'today'}
          <InfoPopover label="How safe to spend is calculated">
            <p class="font-medium text-label">How this is worked out</p>
            <p>What is left in your everyday envelopes, spread over the days remaining this month (today included). Payments waiting for review already count.</p>
            <p class="money amt rounded bg-fill px-2 py-1 text-[12px]">
              {formatCurrency(everydayLeft)} left &divide; {plural(daysLeft, 'day')} = {formatCurrency($safeToSpendWithPending ?? 0)}/day
            </p>
            <p>
              <span class="font-medium text-label">Counted:</span>
              {everydayStatuses.length > 0 ? everydayStatuses.map((s) => s.bucket.name).join(', ') : 'none'}.
              Each one's balance includes what carried over from earlier months.
            </p>
            <p>
              <span class="font-medium text-label">Not counted:</span>
              {notCountedStatuses.length > 0 ? notCountedStatuses.map((s) => s.bucket.name).join(', ') : 'none'}.
              Those are committed money or savings.
            </p>
            <p>Change this per envelope under Budget &rarr; envelope &rarr; Edit &rarr; &ldquo;Everyday spending&rdquo;.</p>
          </InfoPopover>
        {/if}
      </svelte:fragment>
    </HomeHero>

    {#if upto > 0}
      <div class="mt-4">
        <PaceChart
          {cumulative}
          {planTotal}
          {daysInMonth}
          showToday={mode === 'today'}
          on:scrub={(e) => (scrubDay = e.detail.day)}
          on:scrubend={() => (scrubDay = 0)}
        />
      </div>
    {/if}
  </div>

  {#if $currentMonthIncome === 0 && mode !== 'past'}
    <!-- First run reads as an invitation, not a row of empty envelopes. -->
    <a href="{base}/budget" class="card flex items-center gap-3 p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-tint">
      <span class="min-w-0 flex-1 text-[15px] text-label">Add this month's income and every envelope has something to hold.</span>
      <span class="flex-none text-[15px] font-semibold text-tint">Add income</span>
    </a>
  {/if}

  <UnsortedCard />

  {#each $homeLayout.filter((c) => c.on) as card (card.id)}
    {#if card.id === 'review'}<ReviewCard />
    {:else if card.id === 'envelopes'}<EnvelopesCard />
    {:else if card.id === 'recent'}<RecentCard onOpen={openTransaction} />
    {:else if card.id === 'bills'}<BillsCard />
    {:else if card.id === 'goals'}<GoalsCard />
    {:else if card.id === 'savingsRate'}<SavingsRateCard />
    {:else if card.id === 'notes'}<NotesCard />
    {/if}
  {/each}

  <div class="flex justify-center pb-2">
    <button type="button" class="rounded-full bg-fill px-5 py-2.5 text-[15px] font-semibold text-label focus:outline-none focus-visible:ring-2 focus-visible:ring-tint" on:click={() => openModal('edit-home')}>
      Edit Home
    </button>
  </div>
</div>

<EditHomeSheet />

<TransactionSheet transaction={editing} />
