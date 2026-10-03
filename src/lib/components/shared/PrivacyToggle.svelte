<script lang="ts">
  import { hideAmounts, toggleHideAmounts } from '$lib/stores/privacyStore';
</script>

<button
  type="button"
  class="btn-icon rounded-lg border border-gray-200 bg-white p-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
         dark:border-border-dark dark:bg-surface-dark {$hideAmounts ? 'text-gray-900 dark:text-gray-50' : ''}"
  aria-pressed={$hideAmounts}
  aria-label={$hideAmounts ? 'Show amounts' : 'Hide amounts'}
  title={$hideAmounts ? 'Show amounts' : 'Hide amounts'}
  on:click={toggleHideAmounts}
>
  {#if $hideAmounts}
    <!-- eye with a slash: amounts are hidden -->
    <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.3 4 9.5 6a14 14 0 0 1-2.4 3M6.5 7.6A14 14 0 0 0 2.5 12C3.7 14 7 18 12 18c1.4 0 2.6-.3 3.7-.8M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  {:else}
    <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M2.5 12C3.7 10 7 6 12 6s8.3 4 9.5 6c-1.2 2-4.5 6-9.5 6s-8.3-4-9.5-6Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  {/if}
</button>
