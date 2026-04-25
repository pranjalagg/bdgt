<script lang="ts">
  import { getBucketStatus } from '$lib/utils/calculations';

  export let allocated: number;
  export let spent: number;
  export let showLabel = true;

  $: status = getBucketStatus(allocated, spent);

  $: spentPct = allocated > 0 && spent > 0
    ? Math.min((spent / allocated) * 50, 50)
    : 0;

  $: creditPct = allocated > 0 && spent < 0
    ? Math.min((Math.abs(spent) / allocated) * 50, 50)
    : 0;

  $: spentColorClass = {
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    credit: '',
  }[status];

  $: labelText = spent < 0
    ? `${Math.round((Math.abs(spent) / allocated) * 100)}% owed back`
    : `${Math.round(allocated > 0 ? (spent / allocated) * 100 : 0)}% spent`;
</script>

<div class="w-full">
  <div class="relative h-2 rounded-full bg-gray-200 dark:bg-gray-700">
    <!-- Center marker -->
    <div class="absolute left-1/2 top-0 z-10 h-full w-0.5 -translate-x-1/2 rounded-full bg-gray-400 dark:bg-gray-500" />

    <!-- Credit fill (left of center, grows leftward) -->
    {#if creditPct > 0}
      <div
        class="absolute top-0 h-full rounded-l-full bg-primary transition-all duration-300"
        style="right: 50%; width: {creditPct}%"
      />
    {/if}

    <!-- Spending fill (right of center, grows rightward) -->
    {#if spentPct > 0}
      <div
        class="absolute left-1/2 top-0 h-full rounded-r-full transition-all duration-300 {spentColorClass}"
        style="width: {spentPct}%"
      />
    {/if}
  </div>
  {#if showLabel}
    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
      {labelText}
    </p>
  {/if}
</div>
