<script lang="ts">
  import { base } from '$app/paths';
  import { browser } from '$app/environment';
  import NavBar from '$lib/components/layout/NavBar.svelte';
  import CaptureSection from '$lib/components/capture/CaptureSection.svelte';
  import { isAndroidApp } from '$lib/capture/native';

  // Reading payment notifications works only in the Android app.
  const androidApp = browser && isAndroidApp();
</script>

<NavBar title="Automatic capture" back={{ href: `${base}/settings`, label: 'Settings' }} />

<div class="mx-auto max-w-2xl">
  {#if androidApp}
    <CaptureSection />
  {:else}
    <div class="card px-5 py-10 text-center text-[15px] text-label-2">Automatic capture works in the Android app, where it can read payment notifications.</div>
  {/if}
</div>
