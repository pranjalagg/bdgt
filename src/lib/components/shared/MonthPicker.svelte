<script lang="ts">
  import { currentMonthKey, currentMonthDisplay, activeModal } from '$lib/stores/uiStore';
  import PrivacyToggle from './PrivacyToggle.svelte';
  import { monthKeyAction } from '$lib/utils/keyboard';
  import { bucketStatuses, currentMonthIncome, unallocated } from '$lib/stores/budgetStore';
  import EnvelopeLine from './EnvelopeLine.svelte';
  import { getPreviousMonthKey, getNextMonthKey, getCurrentMonthKey } from '$lib/utils/dates';

  function goToPrevious() {
    currentMonthKey.update((m) => getPreviousMonthKey(m));
  }

  function goToNext() {
    currentMonthKey.update((m) => getNextMonthKey(m));
  }

  function goToCurrent() {
    currentMonthKey.set(getCurrentMonthKey());
  }

  $: isCurrentMonth = $currentMonthKey === getCurrentMonthKey();

  // Arrow keys step between months from anywhere on a page that shows the
  // picker; "T" jumps back to the current month.
  function handleKeydown(e: KeyboardEvent) {
    const action = monthKeyAction(e, $activeModal !== null);
    if (action === null) return;
    e.preventDefault();
    if (action === 'previous') goToPrevious();
    else if (action === 'next') { if (!isCurrentMonth) goToNext(); }
    else goToCurrent();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="flex items-center gap-2">
<PrivacyToggle />
<div class="flex items-center gap-0.5 rounded-full border border-transparent bg-white p-1 dark:bg-surface-dark" style="box-shadow: var(--shadow-card)">
  <!-- Announces the new month to screen readers when it changes. -->
  <span class="sr-only" aria-live="polite">{$currentMonthDisplay}</span>
  <button
    class="btn-icon !p-2"
    on:click={goToPrevious}
    aria-label="Previous month"
    aria-keyshortcuts="ArrowLeft"
    title="Previous month (←)"
  >
    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
    </svg>
  </button>

  <button
    class="min-w-[140px] rounded-full px-3 py-1 text-center hover:bg-black/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-white/[0.06]"
    on:click={goToCurrent}
    aria-keyshortcuts="T"
    title="Go to current month (T)"
  >
    <span class="block text-sm font-semibold text-gray-900 dark:text-gray-50">{$currentMonthDisplay}</span>
    <!-- Same object as the dashboard's envelope line, 3px tall: whether
         this month is settled should be legible from any page. -->
    <span class="mt-1 flex justify-center">
      <EnvelopeLine
        compact
        statuses={$bucketStatuses}
        income={$currentMonthIncome}
        unallocated={$unallocated}
      />
    </span>
  </button>

  <button
    class="btn-icon !p-2 disabled:opacity-40"
    on:click={goToNext}
    disabled={isCurrentMonth}
    aria-label="Next month"
    aria-keyshortcuts="ArrowRight"
    title="Next month (→)"
  >
    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
    </svg>
  </button>
</div>
</div>
