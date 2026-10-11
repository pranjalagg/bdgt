import type { BucketRelation } from './index';

// Wording rules: "tends to", never "causes"; always name the months; no
// dollar amounts, so hide-amounts has nothing to leak.

export function headline(r: BucketRelation): string {
  return r.relation === 'trade-off'
    ? `When ${r.a.name} is high, ${r.b.name} tends to be low.`
    : `${r.a.name} and ${r.b.name} tend to rise together.`;
}

export function watchingNote(r: BucketRelation): string {
  const lean = r.relation === 'trade-off' ? 'opposite' : 'the same way';
  return `${r.a.name} and ${r.b.name} lean ${lean}, but ${r.months} months isn't enough to be sure.`;
}

export function confidenceLabel(r: BucketRelation): string {
  const name = r.confidence === 'early' ? 'Early signal' : r.confidence === 'likely' ? 'Likely' : 'Strong';
  return `${name} · ${r.months} months`;
}

export function steadierLine(percent: number): string {
  return `Together they vary ${percent}% less than separately. A combined budget may fit better than two separate ones.`;
}
