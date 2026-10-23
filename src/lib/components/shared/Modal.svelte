<!-- src/lib/components/shared/Modal.svelte -->
<script lang="ts">
  import { activeModal, closeModal } from '$lib/stores/uiStore';
  import { fade } from 'svelte/transition';
  import { cubicIn, quintOut } from 'svelte/easing';
  import { tick, onDestroy } from 'svelte';

  // A bottom sheet on phones (slides up, a handle to drag it down, room for
  // the gesture bar) and a centred dialog on wider screens. Under reduced
  // motion both only fade.

  export let id: string;
  export let title: string;

  let panel: HTMLDivElement | undefined;
  let previouslyFocused: HTMLElement | null = null;
  let wasOpen = false;

  $: isOpen = $activeModal === id;

  const media = (q: string) => typeof matchMedia !== 'undefined' && matchMedia(q).matches;
  const reduced = () => media('(prefers-reduced-motion: reduce)');
  const isSheet = () => !media('(min-width: 768px)');

  // Dragging the sheet down by its handle: past 96px, or a quick flick,
  // closes it; otherwise it springs back.
  let dragY = 0;
  let dragging = false;
  let dragStartY = 0;
  let dragStartT = 0;
  let closedFrom = 0;

  function dragStart(e: PointerEvent) {
    // Capturing the pointer would swallow a tap on the close button.
    if (!isSheet() || (e.target as HTMLElement).closest('button')) return;
    dragging = true;
    dragStartY = e.clientY;
    dragStartT = e.timeStamp;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function dragMove(e: PointerEvent) {
    if (dragging) dragY = Math.max(0, e.clientY - dragStartY);
  }

  function dragEnd(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    const velocity = dragY / Math.max(1, e.timeStamp - dragStartT);
    if (dragY > 96 || (dragY > 24 && velocity > 0.6)) {
      closedFrom = dragY;
      closeModal();
    }
    dragY = 0;
  }

  function panelIn(_node: Element) {
    if (reduced()) return { duration: 150, css: (t: number) => `opacity: ${t}` };
    if (isSheet()) return { duration: 320, easing: quintOut, css: (t: number) => `transform: translateY(${(1 - t) * 100}%)` };
    return { duration: 200, easing: quintOut, css: (t: number) => `opacity: ${t}; transform: scale(${0.96 + 0.04 * t})` };
  }

  function panelOut(_node: Element) {
    const from = closedFrom;
    closedFrom = 0;
    if (reduced()) return { duration: 120, css: (t: number) => `opacity: ${t}` };
    if (isSheet()) return { duration: 200, easing: cubicIn, css: (t: number) => `transform: translateY(calc(${from}px + ${(1 - t) * 100}%))` };
    return { duration: 150, css: (t: number) => `opacity: ${t}; transform: scale(${0.98 + 0.02 * t})` };
  }
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
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center md:p-4 md:backdrop-blur-sm"
    transition:fade={{ duration: 150 }}
    on:click={handleBackdropClick}
  >
    <div
      bind:this={panel}
      class="flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white pb-[var(--safe-bottom)] dark:bg-surface-dark
             md:max-h-[88vh] md:max-w-md md:rounded-2xl md:pb-0"
      style:box-shadow="var(--shadow-float)"
      style:transform={dragY ? `translateY(${dragY}px)` : undefined}
      style:transition={dragging ? 'none' : 'transform 200ms ease-out'}
      in:panelIn
      out:panelOut
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabindex="-1"
    >
      <!-- The handle and title row are the drag area (a pointer target of 44px+). -->
      <div
        class="flex-none touch-none select-none"
        on:pointerdown={dragStart}
        on:pointermove={dragMove}
        on:pointerup={dragEnd}
        on:pointercancel={dragEnd}
      >
        <div class="flex justify-center pt-2.5 md:hidden" aria-hidden="true">
          <span class="h-1 w-9 rounded-full bg-gray-300 dark:bg-white/25"></span>
        </div>
        <div class="flex items-center justify-between gap-3 px-5 pb-1 pt-3 md:px-6 md:pt-5">
          <h2 id={titleId} class="text-[19px] font-semibold tracking-tight text-gray-950 dark:text-white">{title}</h2>
          <button class="btn-icon -mr-2" on:click={closeModal} aria-label="Close">
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 md:px-6">
        <slot />
      </div>
    </div>
  </div>
{/if}
