import { describe, it, expect } from 'vitest';
import { springCurve, installMotion } from '$lib/ui/motion';

const points = (ease: string) => ease.slice('linear('.length, -1).split(',').map(Number);

describe('springCurve', () => {
  it('a critically damped spring rises without overshoot and ends at 1', () => {
    const { ease, ms } = springCurve({ duration: 0.5, bounce: 0 });
    const pts = points(ease);
    expect(pts[0]).toBe(0);
    expect(pts.at(-1)).toBe(1);
    expect(pts.every((v, i) => i === 0 || v >= pts[i - 1] - 1e-9)).toBe(true);
    expect(ms).toBeGreaterThan(300);
    expect(ms).toBeLessThan(1200);
  });

  it('a bouncy spring overshoots before settling', () => {
    expect(Math.max(...points(springCurve({ duration: 0.5, bounce: 0.28 }).ease))).toBeGreaterThan(1);
  });
});

describe('installMotion', () => {
  it('sets the three springs as CSS variables', () => {
    const root = document.createElement('div');
    installMotion(root);
    for (const name of ['snappy', 'smooth', 'bouncy']) {
      expect(root.style.getPropertyValue(`--ease-${name}`)).not.toBe('');
      expect(root.style.getPropertyValue(`--ms-${name}`)).toMatch(/^\d+ms$/);
    }
  });
});
