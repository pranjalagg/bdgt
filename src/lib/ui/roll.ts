// Rolling numbers: when a figure changes, each digit column slides to its
// new digit. Columns are reused only when every position keeps its kind
// (a digit stays a digit, a comma stays that comma); otherwise the figure
// is rebuilt and rolls up from zero.

const isDigit = (c: string) => c >= '0' && c <= '9';

export function rollPlan(prev: string | null, next: string): { chars: string[]; reuse: boolean } {
  const chars = [...next];
  if (prev === null) return { chars, reuse: false };
  const before = [...prev];
  const reuse = before.length === chars.length && chars.every((c, i) => (isDigit(c) && isDigit(before[i])) || c === before[i]);
  return { chars, reuse };
}
