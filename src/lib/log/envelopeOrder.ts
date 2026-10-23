// Envelope ids with the most-used first (by number of expenses); ties keep
// the order given.
export function orderByUse(ids: string[], txs: { bucketId: string }[]): string[] {
  const uses = new Map<string, number>();
  for (const t of txs) uses.set(t.bucketId, (uses.get(t.bucketId) ?? 0) + 1);
  return ids
    .map((id, i) => ({ id, i, n: uses.get(id) ?? 0 }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.id);
}
