<!-- src/lib/components/shared/Modal.svelte -->
<script lang="ts">
  import { activeModal, closeModal } from '$lib/stores/uiStore';
  import { fade, fly } from 'svelte/transition';
  import { tick, onDestroy } from 'svelte';

  export let id: string;
  export let title: string;

  let panel: HTMLDivElement | undefined;
  let previouslyFocused: HTMLElement | null = null;
  let wasOpen = false;

  $: isOpen = $activeModal === id;
  $: if (typeof document !== 'undefined' && isOpen !== wasOpen) {
    wasOpen = isOpen;
    if (isOpen) onOpen();
    else onClose();
  }

  const titleId = `modal-title-${id}`;

  async function onOpen() {
    previouslyFocused = (document.activeElement as HTMLElement) ?? null;
    document.body.style.overflow = 'hidden';
    await tick();
    focusFirst();
  }

  function onClose() {
    document.body.style.overflow = '';
    previouslyFocused?.focus?.();
    previouslyFocused = null;
  }

  function focusable(): HTMLElement[] {
    if (!panel) return [];
    return Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
  }

  function focusFirst() {
    const items = focusable();
    (items.find((el) => !el.hasAttribute('aria-label')) ?? items[0] ?? panel)?.focus();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === 'Escape') {
      closeModal();
      return;
    }
    if (e.key === 'Tab') {
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement;
      if (e.shiftKey && (active === first || !panel?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) closeModal();
  }

  onDestroy(() => {
    if (wasOpen && typeof document !== 'undefined') document.body.style.overflow = '';
  });
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    transition:fade={{ duration: 150 }}
    on:click={handleBackdropClick}
  >
    <div
      bind:this={panel}
      class="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-surface-dark"
      transition:fly={{ y: 20, duration: 200 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabindex="-1"
    >
      <div class="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-border-dark">
        <h2 id={titleId} class="text-lg font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
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
