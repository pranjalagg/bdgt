import { haptic } from '$lib/ui/haptics';

// Press and slide across a chart to read one point at a time, with a
// light tick per step. Vertical drags still scroll the page.

export interface ScrubOptions {
  count: number; // points across the chart's width, evenly spaced
  onIndex: (index: number) => void;
  onEnd: () => void;
}

export function scrub(node: HTMLElement, options: ScrubOptions) {
  let opts = options;
  let active = false;
  let index = -1;
  node.style.touchAction = 'pan-y';
  node.style.userSelect = 'none';
  node.style.setProperty('-webkit-user-select', 'none');

  const pick = (e: PointerEvent) => {
    const r = node.getBoundingClientRect();
    const i = Math.min(opts.count - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * opts.count)));
    if (i === index) return;
    index = i;
    haptic('selection');
    opts.onIndex(i);
  };
  const down = (e: PointerEvent) => {
    if (opts.count < 1) return;
    active = true;
    index = -1;
    node.setPointerCapture(e.pointerId);
    node.classList.add('scrubbing');
    pick(e);
  };
  const move = (e: PointerEvent) => {
    if (active) pick(e);
  };
  const end = () => {
    if (!active) return;
    active = false;
    node.classList.remove('scrubbing');
    opts.onEnd();
  };

  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', end);
  node.addEventListener('pointercancel', end);
  return {
    update(next: ScrubOptions) {
      opts = next;
    },
    destroy() {
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', end);
      node.removeEventListener('pointercancel', end);
    },
  };
}
