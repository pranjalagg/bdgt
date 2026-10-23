<script lang="ts">
  import { base } from '$app/paths';
  import { unsortedTransactions } from '$lib/stores/budgetStore';
  import Icon from '$lib/components/ui/Icon.svelte';

  // Shown whenever something lost its envelope (its envelope was deleted).
</script>

{#if $unsortedTransactions.length > 0}
  <a href="{base}/activity?bucket=unsorted" class="card flex items-center gap-3 p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-tint">
    <span class="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] bg-warning text-white"><Icon name="inbox" size={19} /></span>
    <span class="min-w-0 flex-1">
      <span class="block text-[16px] font-semibold text-label">{$unsortedTransactions.length} {$unsortedTransactions.length === 1 ? 'expense needs' : 'expenses need'} an envelope</span>
      <span class="block text-[13px] text-label-2">Their envelope was deleted. Tap to file them.</span>
    </span>
    <span class="text-label-2/60"><Icon name="chevron-right" size={18} /></span>
  </a>
{/if}
