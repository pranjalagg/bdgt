<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import { getSyncApp } from '$lib/sync/browser';
  import { openModal, closeModal } from '$lib/stores/uiStore';

  const app = getSyncApp();
  const { prompt, busy } = app;

  // Ask as soon as sign-in needs an answer. Closing the dialog leaves the
  // question open: the Sync section offers to ask again.
  $: if ($prompt) openModal('sync-choice');

  async function answer(choice: 'useAccount' | 'cancel') {
    closeModal();
    await app.resolvePrompt(choice);
  }
</script>

<Modal id="sync-choice" title="Use your account's data?">
  <div class="space-y-4 pt-4">
    {#if $prompt?.kind === 'otherAccount'}
      <p class="text-sm text-label">
        This device still holds data from a different account. To sync with this one, that data will be replaced with this account's data.
      </p>
    {:else}
      <p class="text-sm text-label">
        This device and your account both have budget data. To sync, this device's data will be replaced with your account's.
      </p>
    {/if}
    <p class="text-sm text-label">A backup file of this device's data is downloaded first, so nothing is lost.</p>
    <div class="flex flex-col gap-2">
      <button type="button" class="btn-primary" disabled={$busy} on:click={() => answer('useAccount')}>Download backup and use account data</button>
      <button type="button" class="btn-secondary" disabled={$busy} on:click={() => answer('cancel')}>Cancel: keep this device's data and don't sync</button>
    </div>
  </div>
</Modal>
