<script lang="ts">
  import { getBucketStatus } from '$lib/utils/calculations';

  export let allocated: number;
  export let spent: number;
  export let showLabel = true;

  $: percentage = allocated > 0 ? Math.min((spent / allocated) * 100, 100) : 0;
  $: status = getBucketStatus(allocated, spent);
  $: colorClass = {
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
  }[status];
</script>

<div class="w-full">
  <div class="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
    <div
      class="h-full transition-all duration-300 {colorClass}"
      style="width: {percentage}%"
    />
  </div>
  {#if showLabel}
    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
      {Math.round(percentage)}% spent
    </p>
  {/if}
</div>
