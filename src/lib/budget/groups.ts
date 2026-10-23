import type { Bucket } from '$lib/types';

// Budget's three groups: Everyday (counts toward safe to spend), Bills (the
// other spending envelopes) and Savings. The system Unsorted envelope sits
// apart. Each group keeps the envelopes' own order.

export function groupEnvelopes<T extends { bucket: Bucket }>(statuses: T[]) {
  const sorted = [...statuses].sort((a, b) => a.bucket.order - b.bucket.order);
  const real = sorted.filter((s) => !s.bucket.isSystem);
  return {
    everyday: real.filter((s) => s.bucket.isEveryday && !s.bucket.isSavings),
    bills: real.filter((s) => !s.bucket.isEveryday && !s.bucket.isSavings),
    savings: real.filter((s) => s.bucket.isSavings),
    unsorted: sorted.find((s) => s.bucket.isSystem) ?? null,
  };
}
