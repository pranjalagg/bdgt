<script lang="ts">
  import { onMount } from 'svelte';
  import { isAndroidPlatform } from '$lib/android';
  import { checkForUpdate, type Update } from '$lib/appUpdate';
  import { getCapture } from '$lib/capture/native';

  // Android app only: offers a newer test build when CI has published one.
  // Download opens the APK in the phone's browser; installing it updates the
  // app in place. "Later" hides the offer until an even newer build.

  const DISMISSED = 'bdgt-update-dismissed';
  const RECHECK_MS = 6 * 3600_000;
  let update: Update | null = null;
  let lastCheck = 0;

  function dismissedBuild(): number | null {
    try {
      return Number(localStorage.getItem(DISMISSED)) || null;
    } catch {
      return null;
    }
  }

  async function check() {
    if (Date.now() - lastCheck < RECHECK_MS) return;
    lastCheck = Date.now();
    const capture = await getCapture();
    const version = (await capture?.plugin.getStatus())?.appVersion;
    if (!version) return;
    const found = await checkForUpdate(version);
    update = found && found.build !== dismissedBuild() ? found : null;
  }

  function later() {
    try {
      if (update) localStorage.setItem(DISMISSED, String(update.build));
    } catch {
      // storage unavailable: it just shows again next time
    }
    update = null;
  }

  onMount(() => {
    if (!isAndroidPlatform()) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check().catch(() => {});
    };
    void check().catch(() => {});
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });
</script>

{#if update}
  <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-white px-4 py-3 text-sm dark:border-border-dark dark:bg-surface-dark">
    <p class="text-gray-800 dark:text-gray-100">Build {update.build} of the app is ready.</p>
    <div class="flex gap-2">
      <a class="btn-primary" href={update.url}>Download</a>
      <button type="button" class="btn-secondary" on:click={later}>Later</button>
    </div>
  </div>
{/if}
