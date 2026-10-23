<!-- src/lib/components/shared/Modal.svelte -->
<script lang="ts">
  import { modalStack, activeModal, closeModal, setScaleBack } from '$lib/stores/uiStore';
  import { fade } from 'svelte/transition';
  import { cubicIn, quintOut } from 'svelte/easing';
  import { tick, onDestroy } from 'svelte';

  // A bottom sheet on phones (slides up, a handle to drag it down, room for
  // the gesture bar) and a centred dialog on wider screens. Under reduced
  // motion both only fade. Sheets stack: one opened over another keeps the
  // lower one, and only the top responds to Escape.

  export let id: string;
  export let title: string;
  // large: nearly full height. scaleBack: the app shrinks behind it, as iOS
  // does for a full sheet. grouped: grey ground for grouped lists; plain: a
  // white ground for a form or keypad.
  export let size: 'auto' | 'large' = 'auto';
  export let scaleBack = false;
  export let surface: 'grouped' | 'plain' = 'grouped';

  $: setScaleBack(id, scaleBack);
  $: index = $modalStack.indexOf(id);
  $: isTop = $activeModal === id;
  $: zIndex = 50 + Math.max(0, index) * 2;

  // Rendered at the end of <body>, so a page's overflow or the app shrinking
  // behind a sheet never clips or moves it.
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
  }

  let panel: HTMLDivElement | undefined;
  let previouslyFocused: HTMLElement | null = null;
  let wasOpen = false;

  $: isOpen = index >= 0;

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
      closeModal(id);
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

  async function onClose() {
    if ($modalStack.length === 0) document.body.style.overflow = '';
    // After the update that lifts `inert` from the app behind.
    const back = previouslyFocused;
    previouslyFocused = null;
    await tick();
    back?.focus?.();
  }

  function focusable(): HTMLElement[] {
    if (!panel) return [];
    return Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
  }

  // A sheet can name where focus starts with data-autofocus (Log starts on
  // its amount, so typing and Enter work at once).
  function focusFirst() {
    const items = focusable();
    (panel?.querySelector<HTMLElement>('[data-autofocus]') ?? items.find((el) => !el.hasAttribute('aria-label')) ?? items[0] ?? panel)?.focus();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isTop) return;
    if (e.key === 'Escape') {
      closeModal(id);
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
    if (e.target === e.currentTarget) closeModal(id);
  }

  onDestroy(() => {
    setScaleBack(id, false);
    if (wasOpen && typeof document !== 'undefined') {
      closeModal(id);
      document.body.style.overflow = '';
    }
  });
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    use:portal
    class="fixed inset-0 flex items-end justify-center bg-black/40 md:items-center md:p-4 md:backdrop-blur-sm"
    style:z-index={zIndex}
    transition:fade={{ duration: 150 }}
    on:click={handleBackdropClick}
  >
    <div
      bind:this={panel}
      class="flex w-full flex-col rounded-t-sheet pb-[var(--safe-bottom)] md:max-h-[88vh] md:max-w-md md:rounded-2xl md:pb-0
             {size === 'large' ? 'h-[calc(100dvh-46px)] md:h-auto' : 'max-h-[calc(100dvh-46px)]'}
             {surface === 'plain' ? 'bg-surface' : 'bg-page dark:bg-surface'}"
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
        <div class="flex justify-center pt-2 md:hidden" aria-hidden="true">
          <span class="h-[5px] w-[38px] rounded-full bg-label-2/40"></span>
        </div>
        {#if $$slots.leading}
          <div class="grid min-h-[3rem] grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 pb-1 pt-1 md:px-4 md:pt-4">
            <div class="justify-self-start"><slot name="leading" /></div>
            <h2 id={titleId} class="text-center text-[17px] font-semibold text-label">{title}</h2>
            <div class="justify-self-end">
              {#if $$slots.trailing}<slot name="trailing" />{/if}
            </div>
          </div>
        {:else}
          <div class="flex items-center justify-between gap-3 px-5 pb-1 pt-3 md:px-6 md:pt-5">
            <h2 id={titleId} class="text-[19px] font-semibold tracking-tight text-label">{title}</h2>
            {#if $$slots.trailing}
              <slot name="trailing" />
            {:else}
              <button class="btn-icon -mr-2" on:click={() => closeModal(id)} aria-label="Close">
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            {/if}
          </div>
        {/if}
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 md:px-6">
        <slot />
      </div>
    </div>
  </div>
{/if}
