// Which bar a chart draws in the accent (the rest are pale): the one under
// the finger while scrubbing, otherwise the latest one so far that has a
// value (today may have nothing yet). -1 when there is none.
export function highlightIndex(values: number[], hot: number, futureFrom: number | null): number {
  if (hot >= 0 && hot < values.length) return hot;
  const end = futureFrom === null ? values.length : Math.min(values.length, futureFrom);
  for (let i = end - 1; i >= 0; i--) if (values[i] !== 0) return i;
  return -1;
}
