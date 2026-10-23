// The months the month menu offers: the current one plus any month that
// has something in it, newest first. Month keys are YYYY-MM, so they sort
// as strings.
export function monthsWithData(keys: string[], current: string, limit = 24): string[] {
  const set = new Set(keys.filter((k) => k <= current));
  set.add(current);
  return [...set].sort().reverse().slice(0, limit);
}
