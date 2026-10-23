// Native-feeling motion: a damped spring is simulated once and sampled into
// a CSS linear() easing, so transitions overshoot and settle the way iOS
// ones do. Three springs cover the app: snappy for small things, smooth for
// sheets and pages, bouncy for the tab lens, switches and toasts.

export interface Spring {
  duration: number; // seconds, as iOS describes springs
  bounce: number; // 0 settles without overshoot; higher overshoots more
}

const SPRINGS: Record<'snappy' | 'smooth' | 'bouncy', Spring> = {
  snappy: { duration: 0.42, bounce: 0.12 },
  smooth: { duration: 0.5, bounce: 0 },
  bouncy: { duration: 0.5, bounce: 0.28 },
};

const FALLBACK_EASE = 'cubic-bezier(0.2, 0.9, 0.2, 1)';
const FALLBACK_MS = 380;

export function springCurve({ duration, bounce }: Spring): { ease: string; ms: number } {
  const stiffness = Math.pow((2 * Math.PI) / duration, 2);
  const damping = (4 * Math.PI * (1 - bounce)) / duration;
  const dt = 1 / 2000;
  const frame = 1 / 60;
  let x = 0;
  let v = 0;
  let t = 0;
  let next = frame;
  const points = [0];
  while (t < 2) {
    v += (-stiffness * (x - 1) - damping * v) * dt;
    x += v * dt;
    t += dt;
    if (t >= next) {
      points.push(+x.toFixed(4));
      next += frame;
      if (t > 0.2 && Math.abs(1 - x) < 0.0008 && Math.abs(v) < 0.02) break;
    }
  }
  points[points.length - 1] = 1;
  return { ease: `linear(${points.join(', ')})`, ms: Math.round(t * 1000) };
}

// Sets --ease-{name} and --ms-{name} on root, and the `rm` class when the
// person asked for reduced motion (styles then fade instead of moving).
export function installMotion(root: HTMLElement): void {
  const linearOk = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('transition-timing-function', 'linear(0, 1)');
  for (const [name, spring] of Object.entries(SPRINGS)) {
    const curve = springCurve(spring);
    root.style.setProperty(`--ease-${name}`, linearOk ? curve.ease : FALLBACK_EASE);
    root.style.setProperty(`--ms-${name}`, `${linearOk ? curve.ms : FALLBACK_MS}ms`);
  }
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.toggle('rm', reduce);
}
