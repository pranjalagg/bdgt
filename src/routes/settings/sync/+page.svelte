<script lang="ts">
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import NavBar from '$lib/components/layout/NavBar.svelte';
  import SyncSection from '$lib/components/sync/SyncSection.svelte';
  import { syncEnabled } from '$lib/sync/browser';

  // A build without sync has no Sync page.
  onMount(() => {
    if (!syncEnabled) void goto(`${base}/settings`, { replaceState: true });
  });
</script>

<NavBar title="Sync" back={{ href: `${base}/settings`, label: 'Settings' }} />

<div class="mx-auto max-w-2xl">
  {#if syncEnabled}<SyncSection />{/if}
</div>
