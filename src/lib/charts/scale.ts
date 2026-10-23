// Small pieces of chart geometry, shared by every chart.

// The top of a bar chart's scale. One bar far bigger than the rest (rent on
// the 1st) would flatten every other day, so it is capped and marked.
export function barCap(values: number[]): number {
  const sorted = values.filter((v) => v > 0).sort((a, b) => b - a);
  if (sorted.length === 0) return 1;
  if (sorted[1] && sorted[0] > sorted[1] * 3) return Math.round(sorted[1] * 1.3);
  return Math.round(sorted[0] * 1.08);
}

// Bar heights as fractions of the scale: never below 0, never past the top.
export function heightsFrom(values: number[], cap: number): number[] {
  return values.map((v) => (v <= 0 ? 0 : Math.min(1, v / cap)));
}

export function linear(domain: [number, number], range: [number, number]): (v: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  return (v) => (d1 === d0 ? r0 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0));
}

const n = (v: number) => String(+v.toFixed(2));

export function linePath(points: [number, number][]): string {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y)}`).join(' ');
}

// Slices of a donut drawn as dashes on a circle: each slice's dash length and
// where it starts. A small gap separates slices when there is more than one.
export function donutSegments(values: number[], circumference: number, gap: number): { length: number; offset: number }[] {
  const positive = values.map((v) => Math.max(0, v));
  const total = positive.reduce((s, v) => s + v, 0);
  const slices = positive.filter((v) => v > 0).length;
  let start = 0;
  return positive.map((v) => {
    const len = total > 0 ? (v / total) * circumference : 0;
    const length = Math.max(0, len - (slices > 1 && len > 0 ? gap : 0));
    const segment = { length: +length.toFixed(4), offset: start === 0 ? 0 : -+start.toFixed(4) };
    start += len;
    return segment;
  });
}
