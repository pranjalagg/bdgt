<script lang="ts">
  import { base } from '$app/paths';
  import { replaceTo } from '$lib/ui/goBack';
  import { onMount } from 'svelte';
  import NavBar from '$lib/components/layout/NavBar.svelte';
  import SyncSection from '$lib/components/sync/SyncSection.svelte';
  import { syncEnabled } from '$lib/sync/browser';

  // A build without sync has no Sync page.
  onMount(() => {
    if (!syncEnabled) replaceTo('/settings');
  });
</script>

<NavBar title="Sync" back={{ href: `${base}/settings`, label: 'Settings' }} />

<div class="mx-auto max-w-2xl">
  {#if syncEnabled}<SyncSection />{/if}
</div>
