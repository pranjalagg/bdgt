<script lang="ts">
  import Nav from './Nav.svelte';
  import Modal from '$lib/components/shared/Modal.svelte';
  import LogEntry from '$lib/components/shared/LogEntry.svelte';
  import { openLog, closeModal, logPreselectedBucketId } from '$lib/stores/uiStore';

  function handleLogComplete() {
    closeModal();
    logPreselectedBucketId.set(undefined);
  }
</script>

<div class="flex h-screen bg-background dark:bg-background-dark">
  <Nav />
  <main class="flex-1 overflow-auto pb-20 md:pb-0">
    <div class="mx-auto max-w-5xl p-6">
      <slot />
    </div>
  </main>

  <!-- Persistent action, not a button that only exists on some pages:
       logging a spend is the one thing you do here more than anything
       else, so it's reachable from every screen. -->
  <button
    type="button"
    on:click={() => openLog()}
    class="fixed bottom-20 right-4 z-30 flex items-center gap-2 rounded-full bg-primary px-5 py-3.5
           text-sm font-semibold text-white shadow-lg transition-transform hover:scale-105
           focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
           dark:text-gray-900 md:bottom-6 md:right-6"
  >
    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
    Log
  </button>
</div>

<Modal id="log" title="Add Transaction">
  <LogEntry preselectedBucketId={$logPreselectedBucketId} onComplete={handleLogComplete} />
</Modal>
