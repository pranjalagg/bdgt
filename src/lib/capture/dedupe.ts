import type { Capture } from '$lib/types';

// One payment often shows up twice: Google Wallet and the bank's SMS, or a
// UPI app and the bank's SMS. The later capture becomes a duplicate of the
// earlier one, which is never changed.

export const DUPLICATE_WINDOW_MS = 15 * 60_000;

export interface Candidate {
  capture: Capture;
  reference?: string; // UPI reference, known only on the phone that captured it
}

// Two captures from the same source are never merged (two ₹50 rides are two
// payments). A UPI reference on both sides decides; otherwise only a single
// match is trusted.
export function findDuplicate(capture: Capture, reference: string | undefined, candidates: Candidate[]): string | null {
  const near = candidates.filter(
    ({ capture: c }) =>
      c.id !== capture.id &&
      c.status !== 'duplicate' &&
      c.source !== capture.source &&
      c.currency === capture.currency &&
      c.amount === capture.amount &&
      Math.abs(c.postedAt - capture.postedAt) <= DUPLICATE_WINDOW_MS
  );
  if (reference) {
    const same = near.find((c) => c.reference === reference);
    if (same) return same.capture.id;
  }
  const open = near.filter((c) => !reference || !c.reference);
  return open.length === 1 ? open[0].capture.id : null;
}
