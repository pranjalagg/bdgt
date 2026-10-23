import type { ActionReturn } from 'svelte/action';
import { haptic } from './haptics';

// Swipe actions on a list row, as in iOS Mail: left reveals Delete (a long
// swipe or a flick deletes), right reveals Move (a long swipe or a flick
// moves). Every action is also in the sheet a tap opens.

export type SwipeOutcome = 'delete' | 'move' | 'open-delete' | 'open-move' | 'close';

const OPEN_AT = 60; // px past which a released row rests open
const OPEN_WIDTH = 88; // how far an open row sits
const FLICK = 0.9; // px/ms

// A flick only counts in the direction the row is already pulled, so
// flicking an open row back closes it.
export function swipeOutcome(x: number, width: number, velocity: number): SwipeOutcome {
  if (x < -0.55 * width || (x <= 0 && velocity < -FLICK)) return 'delete';
  if (x > 0.45 * width || (x >= 0 && velocity > FLICK)) return 'move';
  if (x < -OPEN_AT) return 'open-delete';
  if (x > OPEN_AT) return 'open-move';
  return 'close';
}

// Whose drag this is: the row's (sideways) or the list's (scrolling).
// Undecided until the pointer has moved 10 px.
export function swipeDirection(dx: number, dy: number): 'horizontal' | 'vertical' | null {
  if (Math.hypot(dx, dy) < 10) return null;
  return Math.abs(dx) > 1.3 * Math.abs(dy) ? 'horizontal' : 'vertical';
}

export interface SwipeParams {
  onDelete: () => void;
  onMove: () => void;
  // Changing it closes an open row (after one of its buttons is used).
  reset?: number;
}

// One row open at a time: opening or touching another closes it.
let openRow: { close: () => void } | null = null;

const reduced = () =>
  typeof document !== 'undefined' &&
  (document.documentElement.classList.contains('rm') || matchMedia('(prefers-reduced-motion: reduce)').matches);

// The row's sliding face. It reports its offset as a `swipe` event so the
// row can show the action underneath.
export function swipeActions(
  node: HTMLElement,
  params: SwipeParams
): ActionReturn<SwipeParams, { 'on:swipe': (e: CustomEvent<number>) => void }> {
  let p = params;
  let x = 0;
  let base = 0;
  let start: { x: number; y: number; id: number } | null = null;
  let dir: 'horizontal' | 'vertical' | null = null;
  let lastX = 0;
  let lastT = 0;
  let velocity = 0;
  let pastOpen = false;
  let pastFull = false;
  let swallow = false;

  node.style.touchAction = 'pan-y';

  function set(v: number, animate: boolean) {
    x = v;
    node.style.transition = animate && !reduced() ? 'transform var(--ms-snappy, 280ms) var(--ease-snappy, ease-out)' : 'none';
    node.style.transform = v ? `translateX(${v}px)` : '';
    node.dispatchEvent(new CustomEvent('swipe', { detail: v }));
  }

  const self = { close: () => set(0, true) };

  function down(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (openRow && openRow !== self) {
      openRow.close();
      openRow = null;
    }
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    dir = null;
    base = x;
    lastX = e.clientX;
    lastT = e.timeStamp;
    velocity = 0;
    pastOpen = Math.abs(x) > OPEN_AT;
    pastFull = false;
    swallow = false;
  }

  function move(e: PointerEvent) {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    if (!dir) {
      dir = swipeDirection(dx, e.clientY - start.y);
      if (!dir) return;
      if (dir === 'vertical') {
        start = null;
        return;
      }
      node.setPointerCapture?.(e.pointerId);
    }
    e.preventDefault();
    const dt = e.timeStamp - lastT;
    if (dt > 0) velocity = (e.clientX - lastX) / dt;
    lastX = e.clientX;
    lastT = e.timeStamp;
    const w = node.offsetWidth;
    const v = base + dx;
    set(v, false);
    const open = Math.abs(v) > OPEN_AT;
    const full = v < -0.55 * w || v > 0.45 * w;
    if (open && !pastOpen) haptic('light');
    if (full && !pastFull) haptic('medium');
    pastOpen = open;
    pastFull = full;
  }

  function up(e: PointerEvent) {
    if (!start || e.pointerId !== start.id) return;
    start = null;
    if (dir !== 'horizontal') {
      // A tap on an open row closes it instead of opening the row.
      if (dir === null && x !== 0) {
        swallow = true;
        set(0, true);
        openRow = null;
      }
      return;
    }
    swallow = true;
    const w = node.offsetWidth;
    const outcome = e.type === 'pointercancel' ? 'close' : swipeOutcome(x, w, velocity);
    if (outcome === 'delete') {
      set(-w, true);
      openRow = null;
      p.onDelete();
    } else if (outcome === 'move') {
      set(0, true);
      openRow = null;
      p.onMove();
    } else if (outcome === 'open-delete' || outcome === 'open-move') {
      set(outcome === 'open-delete' ? -OPEN_WIDTH : OPEN_WIDTH, true);
      openRow = self;
    } else {
      set(0, true);
      if (openRow === self) openRow = null;
    }
  }

  // The click that ends a swipe is not a tap on the row.
  function click(e: MouseEvent) {
    if (!swallow) return;
    swallow = false;
    e.preventDefault();
    e.stopPropagation();
  }

  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', up);
  node.addEventListener('click', click, true);

  return {
    update(next: SwipeParams) {
      if (next.reset !== p.reset) {
        set(0, true);
        if (openRow === self) openRow = null;
      }
      p = next;
    },
    destroy() {
      if (openRow === self) openRow = null;
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
      node.removeEventListener('click', click, true);
    },
  };
}
