// The selected segment's background is one pill that slides to the new
// segment instead of jumping. Used on every `.segmented` control.
//
// `key` names a control that lives on several pages (Setup's and Insights'
// tabs): a new page's copy starts where the last page's pill was, then
// slides, so moving between those pages animates too.

const lastPosition = new Map<string, { x: number; width: number }>();

const SELECTED = ':scope > :is([aria-current="page"], [aria-pressed="true"], [aria-selected="true"])';

export function segmentedPill(node: HTMLElement, key?: string) {
  const pill = document.createElement('span');
  pill.className = 'segmented-pill';
  pill.setAttribute('aria-hidden', 'true');
  node.prepend(pill);
  node.classList.add('has-pill');

  function place(animate: boolean) {
    const selected = node.querySelector<HTMLElement>(SELECTED);
    if (!selected) {
      pill.style.opacity = '0';
      return;
    }
    const to = { x: selected.offsetLeft, width: selected.offsetWidth };
    if (!animate) pill.classList.add('no-slide');
    pill.style.opacity = '1';
    pill.style.width = `${to.width}px`;
    pill.style.transform = `translateX(${to.x}px)`;
    if (!animate) {
      void pill.offsetWidth; // apply the jump before transitions return
      pill.classList.remove('no-slide');
    }
    if (key) lastPosition.set(key, to);
  }

  // A copy arriving from another page starts at the old spot, then slides.
  const from = key ? lastPosition.get(key) : undefined;
  if (from) {
    pill.classList.add('no-slide');
    pill.style.width = `${from.width}px`;
    pill.style.transform = `translateX(${from.x}px)`;
    void pill.offsetWidth;
    pill.classList.remove('no-slide');
    requestAnimationFrame(() => place(true));
  } else {
    place(false);
  }

  const selection = new MutationObserver(() => place(true));
  selection.observe(node, { subtree: true, attributes: true, attributeFilter: ['aria-current', 'aria-pressed', 'aria-selected'] });
  // A resize (rotation, font load) moves the segments: follow without
  // sliding. The observer also reports once on start, which must not cut
  // short the slide in from another page.
  let width = node.offsetWidth;
  const size = new ResizeObserver(() => {
    if (node.offsetWidth === width) return;
    width = node.offsetWidth;
    place(false);
  });
  size.observe(node);

  return {
    update(newKey?: string) {
      key = newKey;
    },
    destroy() {
      selection.disconnect();
      size.disconnect();
      pill.remove();
      node.classList.remove('has-pill');
    },
  };
}
