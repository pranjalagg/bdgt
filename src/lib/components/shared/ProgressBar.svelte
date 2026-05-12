<script lang="ts">
  import { getBucketStatus } from '$lib/utils/calculations';

  export let allocated: number;
  export let spent: number;
  export let showLabel = true;

  $: status = getBucketStatus(allocated, spent);
  $: percentage = allocated > 0 && spent > 0
    ? Math.min((spent / allocated) * 100, 100)
    : 0;
  $: colorClass = {
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    credit: '',
  }[status];

  $: labelText = spent < 0
    ? allocated > 0
      ? `${Math.round((Math.abs(spent) / allocated) * 100)}% owed back`
      : 'owed back'
    : `${Math.round(percentage)}% spent`;
</script>

<div class="w-full">
  <div class="h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700/50">
    {#if percentage > 0}
      <div
        class="h-full rounded-full transition-all duration-300 {colorClass}"
        style="width: {percentage}%"
      ></div>
    {/if}
  </div>
  {#if showLabel}
    <p class="mt-1 text-xs text-muted">
      {labelText}
    </p>
  {/if}
</div>
