// Sizing a figure so it stays inside its space (a donut's hole, a ring, a
// card): the width of tabular figures in em, and the largest font size
// between a minimum and a maximum at which the text fits.

const NARROW = new Set([',', '.', ' ', ' ', ' ']);

export function textWidthEm(text: string): number {
  let em = 0;
  for (const ch of text) em += NARROW.has(ch) ? 0.3 : 0.62;
  return em;
}

export function fitFontSize(text: string, widthPx: number, maxPx: number, minPx: number): number {
  const em = textWidthEm(text);
  if (em === 0) return maxPx;
  return Math.max(minPx, Math.min(maxPx, Math.floor(widthPx / em)));
}

export interface FitOptions {
  text: string;
  max: number;
  min: number;
  // The space to fit, when the element itself does not span it (an inline
  // figure in the middle of a ring). Otherwise the element's own width.
  width?: number;
}

// Sets the element's font size so `text` fits, again whenever the text or
// the element's width changes.
export function fitText(node: HTMLElement, options: FitOptions) {
  let opts = options;
  const apply = () => {
    const width = opts.width ?? node.clientWidth;
    if (width > 0) node.style.fontSize = `${fitFontSize(opts.text, width, opts.max, opts.min)}px`;
  };
  const observer = typeof ResizeObserver !== 'undefined' && opts.width === undefined ? new ResizeObserver(apply) : null;
  observer?.observe(node);
  apply();
  return {
    update(next: FitOptions) {
      opts = next;
      apply();
    },
    destroy() {
      observer?.disconnect();
    },
  };
}
