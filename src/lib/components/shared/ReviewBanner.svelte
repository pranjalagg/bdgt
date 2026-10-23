<script lang="ts">
  import { base } from '$app/paths';
  import { pendingCaptures, pendingTotal } from '$lib/stores/captureStore';
  import { formatCurrency } from '$lib/utils/currency';

  // Payments the phone noticed and nobody has approved yet. Shown wherever
  // spending is summed, so a total never looks finished while some wait.
</script>

{#if $pendingCaptures.length > 0}
  <a href="{base}/review" class="card pressable flex items-center gap-3.5 p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
    <span class="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-gray-950 text-white dark:bg-white dark:text-gray-950" aria-hidden="true">
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>
    </span>
    <span class="min-w-0 flex-1">
      <span class="block text-[15px] font-semibold text-gray-950 dark:text-white">{$pendingCaptures.length} {$pendingCaptures.length === 1 ? 'payment' : 'payments'} to review</span>
      <span class="block text-[13px] text-muted dark:text-muted-dark"><span class="money amt">{formatCurrency($pendingTotal)}</span> noticed on your phone</span>
    </span>
    <svg class="h-5 w-5 flex-none text-muted dark:text-muted-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
  </a>
{/if}
