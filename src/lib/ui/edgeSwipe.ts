// Swiping from the left edge goes back a page, as on iOS: the page follows
// the finger and either goes back or springs into place.

const EDGE = 24; // px from the left edge where the gesture can start

export function edgeSwipeDecision(dx: number, width: number, velocity: number): boolean {
  return dx > 0.35 * width || velocity > 0.6;
}

// `back` is what going back does here, or false where there is no back.
export function edgeSwipeBack(node: HTMLElement, back: false | (() => void)) {
  let on = back;
  let start: { x: number; y: number; t: number; id: number } | null = null;
  let dx = 0;
  let tracking = false;

  const reset = () => {
    node.style.transition = '';
    node.style.transform = '';
  };
  const down = (e: PointerEvent) => {
    if (!on || e.button !== 0) return;
    if (e.clientX - node.getBoundingClientRect().left > EDGE) return;
    start = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId };
    dx = 0;
    tracking = false;
  };
  const move = (e: PointerEvent) => {
    if (!start || e.pointerId !== start.id) return;
    const ddx = e.clientX - start.x;
    if (!tracking) {
      if (Math.abs(e.clientY - start.y) > 12 && Math.abs(e.clientY - start.y) > ddx) return void (start = null);
      if (ddx < 10) return;
      tracking = true;
      node.setPointerCapture(e.pointerId);
      node.style.transition = 'none';
    }
    dx = Math.max(0, ddx);
    node.style.transform = `translateX(${dx}px)`;
  };
  const up = (e: PointerEvent) => {
    if (!start || e.pointerId !== start.id) return;
    const velocity = dx / Math.max(1, e.timeStamp - start.t);
    const wasTracking = tracking;
    start = null;
    tracking = false;
    if (!wasTracking) return;
    if (edgeSwipeDecision(dx, node.clientWidth, velocity)) {
      reset();
      if (on) on();
    } else {
      node.style.transition = 'transform var(--ms-snappy, 300ms) var(--ease-snappy, ease-out)';
      node.style.transform = '';
      setTimeout(reset, 450);
    }
  };

  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', up);
  return {
    update(next: false | (() => void)) {
      on = next;
    },
    destroy() {
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
    },
  };
}
