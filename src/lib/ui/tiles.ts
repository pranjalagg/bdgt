// An envelope's colour as a soft tile (as in the owner's references): the
// colour mixed lightly into the card, with text in the theme's own label
// colour so it reads on any envelope colour.

const LIGHT_CARD: [number, number, number] = [255, 255, 255];
const DARK_CARD: [number, number, number] = [27, 27, 30]; // #1b1b1e
const NEUTRAL = '#8e8e93';

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

export function tileColors(hex: string, dark: boolean): { background: string; text: string } {
  const colour = parseHex(hex) ?? (parseHex(NEUTRAL) as [number, number, number]);
  const card = dark ? DARK_CARD : LIGHT_CARD;
  const amount = dark ? 0.28 : 0.18;
  const mixed = colour.map((c, i) => Math.round(c * amount + card[i] * (1 - amount)));
  return { background: `rgb(${mixed.join(', ')})`, text: 'rgb(var(--c-label))' };
}
