<script lang="ts">
  import { availableUpdate, dismissUpdate } from '$lib/stores/updateStore';

  // The offer of a newer test build, at the top of every page under the
  // navigation bar's row (the check itself runs from the layout). Download
  // opens the APK in the phone's browser; installing it updates the app.
</script>

{#if $availableUpdate}
  {@const update = $availableUpdate}
  <div class="mx-2.5 mb-2 flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-surface px-4 py-3 text-[15px] shadow-[var(--shadow-card)] sm:mx-4">
    <p class="text-label">Build {update.build} of the app is ready.</p>
    <div class="flex gap-2">
      <a class="btn-primary !min-h-[36px] !px-4" href={update.url}>Download</a>
      <button type="button" class="btn-secondary !min-h-[36px] !px-4" on:click={() => dismissUpdate(update)}>Later</button>
    </div>
  </div>
{/if}
