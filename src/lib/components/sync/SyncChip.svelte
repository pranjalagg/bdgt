<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { syncEnabled, getSyncApp } from '$lib/sync/browser';
  import { describeSync } from '$lib/sync/statusText';

  const status = syncEnabled ? getSyncApp().status : null;

  // Relative times ("2 min ago") age even when nothing else changes.
  let now = Date.now();
  onMount(() => {
    const timer = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(timer);
  });

  $: shown = status && $status ? describeSync($status, now) : null;

  const dot: Record<string, string> = {
    ok: 'bg-success',
    quiet: 'bg-gray-400',
    warn: 'bg-warning',
    bad: 'bg-danger',
  };
</script>

{#if shown && shown.label}
  <a
    href="{base}/settings"
    class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors
           hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-200"
    aria-label="Sync status: {shown.label}. Open settings"
  >
    <span class="h-2 w-2 flex-none rounded-full {dot[shown.tone]}" aria-hidden="true"></span>
    <span class="min-w-0 truncate">{shown.label}</span>
  </a>
{/if}
