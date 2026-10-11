export type Confidence = 'early' | 'likely' | 'strong' | 'watching';

export const WATCHING_MIN = 0.3;

// Minimum absolute correlation for a finding at this many months.
export function tierCutoff(months: number): number {
  return months >= 8 ? 0.6 : 0.5;
}

// How much to trust a relationship, from how many months it rests on and how
// strong it is. At six data points rank correlation needs about 0.9 to be
// statistically solid, so even the top tier at low month counts is named a
// "signal"; weaker leanings are only "watching".
export function classify(months: number, absRho: number): Confidence | null {
  if (months < 4) return null;
  const tier: Exclude<Confidence, 'watching'> = months >= 12 ? 'strong' : months >= 8 ? 'likely' : 'early';
  const cutoff = tierCutoff(months);
  if (absRho >= cutoff) return tier;
  if (absRho >= WATCHING_MIN) return 'watching';
  return null;
}
