<script lang="ts">
  import { flip } from 'svelte/animate';
  import Modal from '$lib/components/shared/Modal.svelte';
  import Switch from '$lib/components/ui/Switch.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { homeLayout, saveHomeLayout } from '$lib/stores/homeLayoutStore';
  import { HOME_CARDS, moveCard, type HomeLayout } from '$lib/home/layout';
  import { haptic } from '$lib/ui/haptics';

  // Which cards Home shows and in what order. Every change applies and saves
  // at once. A card moves by dragging its handle, by the arrow keys on the
  // handle, or by tapping the handle for Move up / Move down.

  const NAMES = new Map(HOME_CARDS.map((c) => [c.id, c]));

  $: layout = $homeLayout;

  function save(next: HomeLayout) {
    saveHomeLayout(next);
  }

  function setOn(i: number, on: boolean) {
    save(layout.map((c, j) => (j === i ? { ...c, on } : c)));
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= layout.length || to === from) return;
    save(moveCard(layout, from, to));
    haptic('selection');
  }

  // Dragging: the row follows the finger, and each time it passes half a
  // row the card swaps with its neighbour.
  let dragId: string | null = null;
  let dragOffset = 0;
  let startY = 0;
  let rowHeight = 64;
  let moved = false;

  function dragStart(e: PointerEvent, id: string) {
    if (e.button !== 0) return;
    dragId = id;
    dragOffset = 0;
    startY = e.clientY;
    moved = false;
    rowHeight = (e.currentTarget as HTMLElement).closest('li')?.offsetHeight ?? 64;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function dragMove(e: PointerEvent) {
    if (!dragId) return;
    dragOffset = e.clientY - startY;
    if (Math.abs(dragOffset) > 4) moved = true;
    const i = layout.findIndex((c) => c.id === dragId);
    if (dragOffset > rowHeight / 2 && i < layout.length - 1) {
      move(i, i + 1);
      startY += rowHeight;
      dragOffset -= rowHeight;
    } else if (dragOffset < -rowHeight / 2 && i > 0) {
      move(i, i - 1);
      startY -= rowHeight;
      dragOffset += rowHeight;
    }
  }

  function dragEnd() {
    dragId = null;
    dragOffset = 0;
  }

  let menuFor: string | null = null;

  function onGripClick(id: string) {
    // A drag ends in a click too; only a tap opens the menu.
    if (moved) {
      moved = false;
      return;
    }
    menuFor = menuFor === id ? null : id;
  }

  function onGripKey(e: KeyboardEvent, i: number) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') move(i, i - 1);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') move(i, i + 1);
    else return;
    e.preventDefault();
    menuFor = null;
  }

  function menuMove(i: number, to: number) {
    move(i, to);
    menuFor = null;
  }

  function onMenuKey(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    menuFor = null;
  }
</script>

<Modal id="edit-home" title="Edit Home" size="large" scaleBack>
  <p class="px-1 pb-3 text-[15px] text-label-2">Choose the cards on Home and their order. Changes save as you go.</p>
  <ul class="group" aria-label="Home cards">
    {#each layout as card, i (card.id)}
      {@const info = NAMES.get(card.id)}
      <li
        class="group-row relative flex items-center gap-3 bg-surface py-2.5 pl-4 pr-2 dark:bg-raised"
        class:dragging={dragId === card.id}
        style:transform={dragId === card.id ? `translateY(${dragOffset}px)` : null}
        animate:flip={{ duration: dragId ? 0 : 220 }}
      >
        <span class="min-w-0 flex-1">
          <span id="home-card-{card.id}" class="block text-[16px] text-label">{info?.name}</span>
          <span class="block text-[13px] text-label-2">{info?.description}</span>
        </span>
        <Switch checked={card.on} label="Show {info?.name}" on:change={(e) => setOn(i, e.detail)} />
        <span class="relative">
          <button
            type="button"
            class="grip flex h-11 w-10 cursor-grab touch-none items-center justify-center rounded-[10px] text-label-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-tint"
            aria-label="Move {info?.name}"
            aria-describedby="edit-home-move-hint"
            aria-expanded={menuFor === card.id}
            on:pointerdown={(e) => dragStart(e, card.id)}
            on:pointermove={dragMove}
            on:pointerup={dragEnd}
            on:pointercancel={dragEnd}
            on:click={() => onGripClick(card.id)}
            on:keydown={(e) => onGripKey(e, i)}
          >
            <Icon name="grip" size={20} />
          </button>
          {#if menuFor === card.id}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div class="menu absolute right-0 top-full z-10 mt-1 grid w-40 overflow-hidden rounded-[14px] bg-raised py-1 shadow-lg ring-1 ring-black/5 dark:ring-white/10" on:keydown={onMenuKey}>
              <button type="button" class="px-4 py-2.5 text-left text-[16px] text-label hover:bg-fill disabled:text-label-2/50" disabled={i === 0} on:click={() => menuMove(i, i - 1)}>Move up</button>
              <button type="button" class="px-4 py-2.5 text-left text-[16px] text-label hover:bg-fill disabled:text-label-2/50" disabled={i === layout.length - 1} on:click={() => menuMove(i, i + 1)}>Move down</button>
            </div>
          {/if}
        </span>
      </li>
    {/each}
  </ul>
  <p id="edit-home-move-hint" class="px-1 pt-3 text-[13px] text-label-2">Drag a handle, or use the arrow keys on it, to move a card.</p>
</Modal>

<style>
  li.dragging {
    z-index: 5;
    box-shadow: 0 12px 28px rgb(0 0 0 / 0.18);
    border-radius: 12px;
  }

  li.dragging .grip {
    cursor: grabbing;
  }
</style>
