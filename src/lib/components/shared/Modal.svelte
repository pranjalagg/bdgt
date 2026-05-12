<!-- src/lib/components/shared/Modal.svelte -->
<script lang="ts">
  import { activeModal, closeModal } from '$lib/stores/uiStore';
  import { fade, fly } from 'svelte/transition';

  export let id: string;
  export let title: string;

  $: isOpen = $activeModal === id;

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') closeModal();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) closeModal();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    transition:fade={{ duration: 150 }}
    on:click={handleBackdropClick}
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
  >
    <div
      class="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-surface-dark"
      transition:fly={{ y: 20, duration: 200 }}
    >
      <div class="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-border-dark">
        <h2 id="modal-title" class="text-lg font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
        <button
          class="btn-icon rounded-lg"
          on:click={closeModal}
          aria-label="Close modal"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="px-6 pb-6">
        <slot />
      </div>
    </div>
  </div>
{/if}
