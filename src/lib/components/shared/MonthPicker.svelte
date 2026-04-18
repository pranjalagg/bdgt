<script lang="ts">
  import { currentMonthKey, currentMonthDisplay } from '$lib/stores/uiStore';
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
</script>

<div class="flex items-center gap-2">
  <button
    class="rounded p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
    on:click={goToPrevious}
    aria-label="Previous month"
  >
    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
    </svg>
  </button>

  <button
    class="min-w-[140px] rounded px-3 py-1 text-center font-medium text-gray-800 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800"
    on:click={goToCurrent}
    title="Go to current month"
  >
    {$currentMonthDisplay}
  </button>

  <button
    class="rounded p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
    on:click={goToNext}
    disabled={isCurrentMonth}
    aria-label="Next month"
  >
    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
    </svg>
  </button>
</div>
