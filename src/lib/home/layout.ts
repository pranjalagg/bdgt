// The cards Home can show under the safe-to-spend figure, which are on and
// in what order. Saved as one JSON string in the synced settings table.

export type HomeCardId = 'review' | 'envelopes' | 'recent' | 'bills' | 'goals' | 'savingsRate' | 'notes';
export type HomeLayout = { id: HomeCardId; on: boolean }[];

export const HOME_CARDS: readonly { id: HomeCardId; name: string; description: string }[] = [
  { id: 'review', name: 'Payments to review', description: 'What your phone noticed, waiting for you' },
  { id: 'envelopes', name: 'Envelopes', description: 'Your everyday envelopes and what is left' },
  { id: 'recent', name: 'Recent activity', description: 'Your last few expenses' },
  { id: 'bills', name: 'Upcoming bills', description: 'Bills and subscriptions due soon' },
  { id: 'goals', name: 'Savings goals', description: 'Progress toward your goals' },
  { id: 'savingsRate', name: 'Savings rate', description: 'How much of this month’s income you kept' },
  { id: 'notes', name: 'Month notes', description: 'Notes you wrote for this month' },
];

const ON_BY_DEFAULT = new Set<HomeCardId>(['review', 'envelopes', 'recent']);
export const DEFAULT_LAYOUT: HomeLayout = HOME_CARDS.map((c) => ({ id: c.id, on: ON_BY_DEFAULT.has(c.id) }));

const KNOWN = new Set<string>(HOME_CARDS.map((c) => c.id));

// Anything unreadable gives the default. A saved list keeps its order;
// unknown or repeated cards are dropped and cards added since are appended
// with their default setting.
export function parseHomeLayout(raw: unknown): HomeLayout {
  let list: unknown;
  try {
    list = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return DEFAULT_LAYOUT.map((c) => ({ ...c }));
  }
  if (!Array.isArray(list)) return DEFAULT_LAYOUT.map((c) => ({ ...c }));
  const seen = new Set<string>();
  const out: HomeLayout = [];
  for (const item of list) {
    const id = item && typeof item === 'object' ? (item as { id?: unknown }).id : undefined;
    if (typeof id !== 'string' || !KNOWN.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id: id as HomeCardId, on: (item as { on?: unknown }).on === true });
  }
  for (const c of DEFAULT_LAYOUT) if (!seen.has(c.id)) out.push({ ...c });
  return out;
}

export function serializeHomeLayout(layout: HomeLayout): string {
  return JSON.stringify(layout.map(({ id, on }) => ({ id, on })));
}

// A copy with the card at `from` moved to `to`, clamped to the list.
export function moveCard(layout: HomeLayout, from: number, to: number): HomeLayout {
  const next = layout.map((c) => ({ ...c }));
  const target = Math.max(0, Math.min(next.length - 1, to));
  const [card] = next.splice(from, 1);
  next.splice(target, 0, card);
  return next;
}
