// Edit times decide which of two edits to a record wins, so they must be
// strictly increasing on a device and never older than what it already holds.

let last = 0;

// A person's edit. At least the wall clock, one past the last stamp this
// device issued, and one past the version of the record it replaces (a slow
// clock must not make an edit lose to a version it has already seen).
export function editStamp(currentVersion: number | undefined): number {
  const stamp = Math.max(Date.now(), last + 1, (currentVersion ?? 0) + 1);
  last = stamp;
  return stamp;
}

// An automatic write (recurring items, default buckets, repairs). Minimally
// newer than what it replaces, or 1 ms after the epoch for a new record, so
// any person's edit made anywhere beats it, and two devices that make the
// same automatic write produce the same stamp.
export function autoStamp(currentVersion: number | undefined): number {
  return currentVersion === undefined ? 1 : currentVersion + 1;
}

export function resetClockForTests(): void {
  last = 0;
}
