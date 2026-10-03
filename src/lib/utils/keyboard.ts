// Single-key shortcuts must never fire while the user is typing.
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

export type MonthKeyAction = 'previous' | 'next' | 'current' | null;

// ← / → step between months and T jumps to the current one -- but not
// while typing, with a modifier held (browser/OS shortcuts), or with a
// modal open.
export function monthKeyAction(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'defaultPrevented' | 'target'>,
  modalOpen: boolean
): MonthKeyAction {
  if (modalOpen || e.defaultPrevented) return null;
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return null;
  if (isTypingTarget(e.target)) return null;
  if (e.key === 'ArrowLeft') return 'previous';
  if (e.key === 'ArrowRight') return 'next';
  if (e.key === 't' || e.key === 'T') return 'current';
  return null;
}
